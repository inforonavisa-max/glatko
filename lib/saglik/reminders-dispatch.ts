import "server-only";

import type { ReactElement } from "react";
import { createAdminClient } from "@/supabase/server";
import { sendSms } from "@/lib/sms/infobip";
import { sendEmail } from "@/lib/email/send-email";
import { glatkoCaptureException } from "@/lib/sentry/glatko-capture";
import { HealthReminderEmail } from "@/lib/email/templates/health-reminder";
import { HealthCancelledEmail } from "@/lib/email/templates/health-cancelled";
import { HealthProviderNewBookingEmail } from "@/lib/email/templates/health-provider-new-booking";
import { HealthFollowupEmail } from "@/lib/email/templates/health-followup";
import { HealthRescheduleEmail } from "@/lib/email/templates/health-reschedule";
import { HealthRescheduleProviderEmail } from "@/lib/email/templates/health-reschedule-provider";
import { coerceEmailLocale } from "@/lib/email/templates/translations";
import {
  formatAppointmentDateTime,
  formatDoctor,
  manageUrl,
} from "@/lib/saglik/reminder-format";
import {
  HEALTH_CONFIRM_SMS,
  HEALTH_CONFIRM_EMAIL_SUBJECT,
  HEALTH_T24_SMS,
  HEALTH_T2_SMS,
  HEALTH_T24_EMAIL_SUBJECT,
  HEALTH_T2_EMAIL_SUBJECT,
  HEALTH_CANCELLED_SMS,
  HEALTH_CANCELLED_EMAIL_SUBJECT,
  HEALTH_PROVIDER_NEW_BOOKING_SMS,
  HEALTH_PROVIDER_NEW_BOOKING_EMAIL_SUBJECT,
  HEALTH_FOLLOWUP_SMS,
  HEALTH_FOLLOWUP_EMAIL_SUBJECT,
  HEALTH_RESCHEDULE_SMS,
  HEALTH_RESCHEDULE_EMAIL_SUBJECT,
  HEALTH_RESCHEDULE_PROVIDER_SMS,
  HEALTH_RESCHEDULE_PROVIDER_EMAIL_SUBJECT,
} from "@/lib/saglik/reminder-templates";
import { HealthBookingConfirmEmail } from "@/lib/email/templates/health-booking-confirm";
import { locales, type Locale } from "@/i18n/routing";

/**
 * H6 — cron-driven dispatch of due health reminders (server-only orchestration).
 *
 * The booking route already fires the immediate `confirm`; H6 drains everything
 * else that has come due: t24, t2, any `confirm` whose immediate send failed, and
 * the cancelled / provider_new_booking / followup rows enqueued additively by
 * migration 073. health.* is not exposed over PostgREST, so all DB access goes
 * through the public SECURITY DEFINER RPCs called with the service-role client:
 *   - public.health_claim_due_reminders(limit)  — atomic FOR UPDATE SKIP LOCKED claim
 *     + decrypted PII payload (parallel cron runs never double-send the locked window)
 *   - public.health_mark_reminder(id,status,msgId,bumpRetry)  — retry-aware mark
 *   - public.health_enqueue_followups(lookaheadMin)  — self-seed T+24h follow-ups
 *
 * Two-layer & never-throw: every send and every mark is wrapped; a failure marks
 * the row (with retry) and the cron continues. PII (phone/email/name) is NEVER
 * logged — only stable codes + reminder ids. At-least-once delivery (see 073 header).
 */

const MAX_RETRY = 3;
const CLAIM_LIMIT = 25;
const FOLLOWUP_LOOKAHEAD_MIN = 60;

/** One claimed row, exactly as health_claim_due_reminders returns it. */
export type ClaimedReminder = {
  reminderId: string;
  appointmentId: string;
  channel: "sms" | "whatsapp" | "email";
  template: string;
  sendAt: string;
  retryCount: number;
  appointmentStatus: string;
  slotStart: string;
  slotEnd: string;
  /** H9: for reschedule rows, the OLD appointment's slot start ("from" time); null otherwise. */
  oldSlotStart: string | null;
  manageToken: string;
  patientLocale: string;
  providerLocale: string;
  phoneE164: string;
  email: string | null;
  patientName: string;
  providerName: string;
  providerTitle: string | null;
  providerSlug: string;
  providerUserId: string | null;
  /** Service name resolved in the PATIENT's locale (patient SMS/email). */
  serviceName: string | null;
  /** Service name resolved in the PROVIDER's locale (provider_new_booking email). */
  serviceNameProvider: string | null;
  locationLabel: string;
  locationAddress: string;
  locationCity: string;
};

export type DispatchSummary = {
  enqueuedFollowups: number;
  scanned: number;
  sent: number;
  failed: number;
  exhausted: number;
  skipped: number;
};

type SendResult = { ok: true; messageId: string | null } | { ok: false };

/** A single SMS send (no PII logged). Channel='whatsapp' falls back to SMS in v1. */
export type SmsSender = (to: string, text: string) => Promise<SendResult>;
/** A single email send (no PII logged). */
export type EmailSender = (args: {
  to: string;
  subject: string;
  react: ReactElement;
}) => Promise<SendResult>;
/**
 * Marks a reminder row's terminal/transient status, optionally bumping retry_count.
 *   - 'sent'    : delivered.
 *   - 'failed'  : terminal failure (retry budget exhausted) → no longer re-claimed.
 *   - 'pending' : retryable failure — left re-claimable; pair with bumpRetry=true so
 *                 the claim's `retry_count < 3` filter eventually stops a poison row.
 *   - 'skipped' : nothing to deliver (no recipient / no template) — truthful no-op close.
 */
export type ReminderStatus = "sent" | "failed" | "pending" | "skipped";
export type MarkReminder = (
  reminderId: string,
  status: ReminderStatus,
  providerMsgId: string | null,
  bumpRetry: boolean,
) => Promise<void>;
/** Resolves a provider's contact email from their auth user (providers carry no contact column). */
export type ProviderEmailResolver = (userId: string | null) => Promise<string | null>;

export type DispatchDeps = {
  claim: (limit: number) => Promise<ClaimedReminder[]>;
  enqueueFollowups: (lookaheadMin: number) => Promise<number>;
  sendSmsFn: SmsSender;
  sendEmailFn: EmailSender;
  mark: MarkReminder;
  resolveProviderEmail: ProviderEmailResolver;
};

function coerceLocale(raw: string): Locale {
  return (locales as readonly string[]).includes(raw) ? (raw as Locale) : "en";
}

/**
 * Renders the SMS body for a reminder, or null if this template/audience has no
 * SMS variant for the row (e.g. an email-only enqueue). Pure.
 */
export function renderSmsBody(r: ClaimedReminder): string | null {
  const providerFacing = r.template === "provider_new_booking" || r.template === "reschedule_provider";
  const locale = coerceLocale(providerFacing ? r.providerLocale : r.patientLocale);
  const dt = formatAppointmentDateTime(r.slotStart, locale);
  const doctor = formatDoctor(r.providerTitle, r.providerName);
  const url = manageUrl(r.manageToken, locale);
  switch (r.template) {
    case "confirm":
      return HEALTH_CONFIRM_SMS[locale](dt, doctor, url);
    case "t24":
      return HEALTH_T24_SMS[locale](dt, doctor, url);
    case "t2":
      return HEALTH_T2_SMS[locale](dt, doctor, url);
    case "cancelled":
      return HEALTH_CANCELLED_SMS[locale](dt, doctor, url);
    case "followup":
      return HEALTH_FOLLOWUP_SMS[locale](dt, doctor, url);
    case "provider_new_booking":
      return HEALTH_PROVIDER_NEW_BOOKING_SMS[locale](dt, firstName(r.patientName), url);
    case "reschedule": {
      // Patient move notice: "{oldDt} → {newDt}". If the old slot is missing (data
      // gap) fall back to the plain confirm copy so the patient still gets a notice.
      if (!r.oldSlotStart) return HEALTH_CONFIRM_SMS[locale](dt, doctor, url);
      const oldDt = formatAppointmentDateTime(r.oldSlotStart, locale);
      return HEALTH_RESCHEDULE_SMS[locale](oldDt, dt, doctor, url);
    }
    case "reschedule_provider": {
      const oldDt = r.oldSlotStart ? formatAppointmentDateTime(r.oldSlotStart, locale) : dt;
      return HEALTH_RESCHEDULE_PROVIDER_SMS[locale](oldDt, dt, firstName(r.patientName));
    }
    default:
      return null;
  }
}

/** Renders the email {subject, react} for a reminder, or null if no email variant. Pure. */
export function renderEmail(
  r: ClaimedReminder,
): { subject: string; react: ReactElement } | null {
  const patientLocale = coerceLocale(r.patientLocale);
  const emailLocale = coerceEmailLocale(patientLocale);
  const dt = formatAppointmentDateTime(r.slotStart, patientLocale);
  const doctor = formatDoctor(r.providerTitle, r.providerName);
  const url = manageUrl(r.manageToken, patientLocale);
  const serviceName = r.serviceName ?? "";

  switch (r.template) {
    case "confirm":
      return {
        subject: HEALTH_CONFIRM_EMAIL_SUBJECT[patientLocale],
        react: HealthBookingConfirmEmail({
          locale: emailLocale,
          patientName: r.patientName,
          doctor,
          dateTime: dt,
          serviceName,
          locationLabel: r.locationLabel,
          locationAddress: r.locationAddress,
          locationCity: r.locationCity,
          manageUrl: url,
        }),
      };
    case "t24":
    case "t2":
      return {
        subject:
          r.template === "t24"
            ? HEALTH_T24_EMAIL_SUBJECT[patientLocale]
            : HEALTH_T2_EMAIL_SUBJECT[patientLocale],
        react: HealthReminderEmail({
          locale: emailLocale,
          variant: r.template,
          patientName: r.patientName,
          doctor,
          dateTime: dt,
          serviceName,
          locationLabel: r.locationLabel,
          locationAddress: r.locationAddress,
          locationCity: r.locationCity,
          manageUrl: url,
        }),
      };
    case "cancelled":
      return {
        subject: HEALTH_CANCELLED_EMAIL_SUBJECT[patientLocale],
        react: HealthCancelledEmail({
          locale: emailLocale,
          patientName: r.patientName,
          doctor,
          dateTime: dt,
          serviceName,
          rebookUrl: url,
        }),
      };
    case "followup":
      return {
        subject: HEALTH_FOLLOWUP_EMAIL_SUBJECT[patientLocale],
        react: HealthFollowupEmail({
          locale: emailLocale,
          patientName: r.patientName,
          doctor,
          feedbackUrl: url,
        }),
      };
    case "reschedule": {
      // Patient move email. Old time → new time + new manage url. Falls back to a
      // confirm email when the old slot is missing (so the patient still gets a notice).
      if (!r.oldSlotStart) {
        return {
          subject: HEALTH_CONFIRM_EMAIL_SUBJECT[patientLocale],
          react: HealthBookingConfirmEmail({
            locale: emailLocale,
            patientName: r.patientName,
            doctor,
            dateTime: dt,
            serviceName,
            locationLabel: r.locationLabel,
            locationAddress: r.locationAddress,
            locationCity: r.locationCity,
            manageUrl: url,
          }),
        };
      }
      const oldDt = formatAppointmentDateTime(r.oldSlotStart, patientLocale);
      return {
        subject: HEALTH_RESCHEDULE_EMAIL_SUBJECT[patientLocale],
        react: HealthRescheduleEmail({
          locale: emailLocale,
          patientName: r.patientName,
          doctor,
          oldDateTime: oldDt,
          newDateTime: dt,
          serviceName,
          manageUrl: url,
        }),
      };
    }
    case "provider_new_booking": {
      const providerLocale = coerceLocale(r.providerLocale);
      const providerEmailLocale = coerceEmailLocale(providerLocale);
      const pDt = formatAppointmentDateTime(r.slotStart, providerLocale);
      return {
        subject: HEALTH_PROVIDER_NEW_BOOKING_EMAIL_SUBJECT[providerLocale],
        react: HealthProviderNewBookingEmail({
          locale: providerEmailLocale,
          providerName: formatDoctor(r.providerTitle, r.providerName),
          patientFirstName: firstName(r.patientName),
          dateTime: pDt,
          // Service name in the PROVIDER's locale (not the patient's).
          serviceName: r.serviceNameProvider ?? "",
          locationLabel: r.locationLabel,
          // Intentionally NO detailsUrl: the only link we have is the patient's
          // manage_token (their cancel credential) — never send it to the provider.
        }),
      };
    }
    case "reschedule_provider": {
      const providerLocale = coerceLocale(r.providerLocale);
      const providerEmailLocale = coerceEmailLocale(providerLocale);
      const pNewDt = formatAppointmentDateTime(r.slotStart, providerLocale);
      const pOldDt = r.oldSlotStart ? formatAppointmentDateTime(r.oldSlotStart, providerLocale) : pNewDt;
      return {
        subject: HEALTH_RESCHEDULE_PROVIDER_EMAIL_SUBJECT[providerLocale],
        react: HealthRescheduleProviderEmail({
          locale: providerEmailLocale,
          providerName: formatDoctor(r.providerTitle, r.providerName),
          patientFirstName: firstName(r.patientName),
          oldDateTime: pOldDt,
          newDateTime: pNewDt,
          // Service name in the PROVIDER's locale (not the patient's).
          serviceName: r.serviceNameProvider ?? "",
          locationLabel: r.locationLabel,
        }),
      };
    }
    default:
      return null;
  }
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

/**
 * Records a send failure on a row, bumping retry_count.
 *
 * Retry semantics (069/073 status CHECK has no transient state, ALTER forbidden):
 *   - While still retryable (attempts = retryCount+1 < MAX_RETRY) the row is left
 *     'pending' with retry_count++ so the NEXT cron re-claims it (the claim filters
 *     `retry_count < 3`). This delivers the spec's "retry cap (max 3 → failed)".
 *   - Once attempts reach MAX_RETRY the row is marked terminal 'failed' + reported to
 *     Sentry; the claim's `retry_count < 3` filter then permanently excludes it (poison).
 * Content is idempotent so a re-send after a transient outage is safe.
 */
async function recordFailure(
  r: ClaimedReminder,
  mark: MarkReminder,
): Promise<"failed" | "exhausted"> {
  const attempts = r.retryCount + 1;
  const exhausted = attempts >= MAX_RETRY;
  // Retryable → leave 'pending' (re-claimable next run); exhausted → terminal 'failed'.
  await mark(r.reminderId, exhausted ? "failed" : "pending", null, true);
  if (exhausted) {
    glatkoCaptureException(
      new Error(`health reminder exhausted: template=${r.template} channel=${r.channel}`),
      { module: "health-reminders", template: r.template, channel: r.channel },
    );
  }
  return exhausted ? "exhausted" : "failed";
}

/** Appointment-time templates whose relevance depends on the slot still being ahead. */
const SLOT_RELATIVE_TEMPLATES = new Set(["t24", "t2", "followup"]);

/**
 * Defense-in-depth relevance guard (findings: past-slot staleness + cancelled race).
 * Returns true when a claimed row is no longer worth sending and should be closed
 * 'skipped' instead of delivered. Uses the payload already carried by the claim:
 *   - t24/t2: the whole point is a heads-up BEFORE the visit — once the slot has
 *     started, a "your appointment is in 2 hours" SMS is wrong, so skip it. (Under
 *     cron downtime a long-overdue t24/t2 could otherwise fire after the visit.)
 *   - any slot-relative template on a non-confirmed appointment: the 071 cancel RPC
 *     already flips pending t24/t2 to 'skipped', but if a row ever coexists with a
 *     cancelled/no-show appointment (race / manual op), don't deliver it.
 * cancelled / provider_new_booking are unaffected (they SHOULD fire post-cancel / pre-slot).
 */
export function isStaleOrIrrelevant(r: ClaimedReminder, now: number = Date.now()): boolean {
  if (!SLOT_RELATIVE_TEMPLATES.has(r.template)) return false;
  if (r.appointmentStatus !== "confirmed") return true;
  if (r.template === "t24" || r.template === "t2") {
    const slotStartMs = Date.parse(r.slotStart);
    if (Number.isFinite(slotStartMs) && slotStartMs <= now) return true;
  }
  return false;
}

/**
 * Sends one claimed reminder and records the outcome. Never throws. Returns the
 * bucket the row landed in so the caller can tally the summary. PII is never logged.
 */
export async function dispatchOne(
  r: ClaimedReminder,
  deps: DispatchDeps,
): Promise<"sent" | "failed" | "exhausted" | "skipped"> {
  try {
    // Relevance guard: a stale t24/t2 (slot already started) or a slot-relative row on
    // a no-longer-confirmed appointment is closed 'skipped' rather than delivered.
    if (isStaleOrIrrelevant(r)) {
      await deps.mark(r.reminderId, "skipped", null, false);
      return "skipped";
    }

    // provider_new_booking + reschedule_provider are delivered to the provider, never
    // the patient. The provider has no contact column (066) → resolve from auth.users;
    // skip if absent.
    if (r.template === "provider_new_booking" || r.template === "reschedule_provider") {
      const providerEmail = await deps.resolveProviderEmail(r.providerUserId);
      if (!providerEmail) {
        await deps.mark(r.reminderId, "skipped", null, false); // nothing to deliver to → close the row
        return "skipped";
      }
      const email = renderEmail(r);
      if (!email) {
        await deps.mark(r.reminderId, "skipped", null, false);
        return "skipped";
      }
      const res = await deps.sendEmailFn({ to: providerEmail, subject: email.subject, react: email.react });
      if (res.ok) {
        await deps.mark(r.reminderId, "sent", res.messageId, false);
        return "sent";
      }
      return recordFailure(r, deps.mark);
    }

    if (r.channel === "email") {
      if (!r.email) {
        await deps.mark(r.reminderId, "skipped", null, false); // no patient email → close the row
        return "skipped";
      }
      const email = renderEmail(r);
      if (!email) {
        await deps.mark(r.reminderId, "skipped", null, false);
        return "skipped";
      }
      const res = await deps.sendEmailFn({ to: r.email, subject: email.subject, react: email.react });
      if (res.ok) {
        await deps.mark(r.reminderId, "sent", res.messageId, false);
        return "sent";
      }
      return recordFailure(r, deps.mark);
    }

    // channel === 'sms' (or 'whatsapp' → SMS fallback in v1; health patients have no
    // WhatsApp opt-in and the Infobip omnichannel endpoint 404s on this account).
    const body = renderSmsBody(r);
    if (!body) {
      await deps.mark(r.reminderId, "skipped", null, false);
      return "skipped";
    }
    const res = await deps.sendSmsFn(r.phoneE164, body);
    if (res.ok) {
      await deps.mark(r.reminderId, "sent", res.messageId, false);
      return "sent";
    }
    return recordFailure(r, deps.mark);
  } catch {
    // Two-layer: any unexpected error in render/send/mark must not crash the cron.
    try {
      return await recordFailure(r, deps.mark);
    } catch {
      return "failed";
    }
  }
}

/**
 * Pure core: drain a batch of already-claimed rows through the injected senders +
 * mark function, tallying a summary. Unit-testable with fakes (no DB, no real I/O).
 * Sequential to keep per-recipient ordering + avoid burst-throttling the providers.
 */
export async function dispatchClaimed(
  rows: ClaimedReminder[],
  deps: DispatchDeps,
): Promise<Omit<DispatchSummary, "enqueuedFollowups">> {
  let sent = 0;
  let failed = 0;
  let exhausted = 0;
  let skipped = 0;
  for (const r of rows) {
    const outcome = await dispatchOne(r, deps);
    if (outcome === "sent") sent++;
    else if (outcome === "exhausted") {
      exhausted++;
      failed++;
    } else if (outcome === "failed") failed++;
    else skipped++;
  }
  return { scanned: rows.length, sent, failed, exhausted, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Real (server-only) dependency wiring — service-role client + Infobip/Resend.
// ─────────────────────────────────────────────────────────────────────────────

function realDeps(): DispatchDeps {
  const admin = createAdminClient();
  return {
    claim: async (limit) => {
      const { data, error } = await admin.rpc("health_claim_due_reminders", { p_limit: limit });
      if (error) throw new Error(`health_claim_due_reminders: ${error.message}`);
      return (data as ClaimedReminder[] | null) ?? [];
    },
    enqueueFollowups: async (lookaheadMin) => {
      const { data, error } = await admin.rpc("health_enqueue_followups", {
        p_lookahead_min: lookaheadMin,
      });
      if (error) {
        // Non-fatal: a self-seed failure must not block draining the existing queue.
        console.error("[health-reminders] enqueue_followups failed:", error.message);
        return 0;
      }
      return typeof data === "number" ? data : 0;
    },
    sendSmsFn: async (to, text) => {
      const res = await sendSms({ to, text });
      return res.ok ? { ok: true, messageId: res.messageId } : { ok: false };
    },
    sendEmailFn: async ({ to, subject, react }) => {
      const res = await sendEmail({ to, subject, react });
      return res.success ? { ok: true, messageId: res.messageId ?? null } : { ok: false };
    },
    mark: async (reminderId, status, providerMsgId, bumpRetry) => {
      const { error } = await admin.rpc("health_mark_reminder", {
        p_reminder_id: reminderId,
        p_status: status,
        p_provider_msg_id: providerMsgId,
        p_bump_retry: bumpRetry,
      });
      if (error) console.error("[health-reminders] mark_reminder failed:", error.message);
    },
    resolveProviderEmail: async (userId) => {
      if (!userId) return null;
      try {
        const { data, error } = await admin.auth.admin.getUserById(userId);
        if (error) return null;
        return data.user?.email ?? null;
      } catch {
        return null;
      }
    },
  };
}

/**
 * Entry point for the cron route. Self-seeds due follow-ups, claims a batch, drains
 * it. Never throws into the route — top-level errors are caught + reported (no PII).
 */
export async function dispatchDueReminders(
  deps: DispatchDeps = realDeps(),
): Promise<DispatchSummary> {
  let enqueuedFollowups = 0;
  try {
    enqueuedFollowups = await deps.enqueueFollowups(FOLLOWUP_LOOKAHEAD_MIN);
  } catch (err) {
    glatkoCaptureException(err, { module: "health-reminders", phase: "enqueue-followups" });
  }

  let rows: ClaimedReminder[] = [];
  try {
    rows = await deps.claim(CLAIM_LIMIT);
  } catch (err) {
    glatkoCaptureException(err, { module: "health-reminders", phase: "claim" });
    return { enqueuedFollowups, scanned: 0, sent: 0, failed: 0, exhausted: 0, skipped: 0 };
  }

  const tally = await dispatchClaimed(rows, deps);
  return { enqueuedFollowups, ...tally };
}
