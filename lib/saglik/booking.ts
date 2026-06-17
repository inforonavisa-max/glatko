import "server-only";

import { createAdminClient } from "@/supabase/server";
import { sendSms } from "@/lib/sms/infobip";
import { sendEmail } from "@/lib/email/send-email";
import { HealthBookingConfirmEmail } from "@/lib/email/templates/health-booking-confirm";
import {
  formatAppointmentDateTime,
  formatDoctor,
  manageUrl,
} from "@/lib/saglik/reminder-format";
import { HEALTH_CONFIRM_SMS, HEALTH_CONFIRM_EMAIL_SUBJECT } from "@/lib/saglik/reminder-templates";
import { HealthRescheduleEmail } from "@/lib/email/templates/health-reschedule";
import { HEALTH_RESCHEDULE_SMS, HEALTH_RESCHEDULE_EMAIL_SUBJECT } from "@/lib/saglik/reminder-templates";
import { coerceEmailLocale } from "@/lib/email/templates/translations";
import type { Locale } from "@/i18n/routing";

/**
 * Glatko Sağlık — H5a booking write/read data-access (server-only).
 *
 * Symmetric with lib/saglik/queries.ts (reads): the health schema is NOT exposed
 * to PostgREST, so every hold/OTP/patient operation goes through the public
 * SECURITY DEFINER RPCs from migration 070, called with the service-role client.
 * H5a does NOT book — health.book_appointment is H5b. Here: 5-min hold + OTP
 * issue/verify + (on verify) the encrypted patient row.
 *
 * RPC-raised business errors surface as PostgREST errors whose message IS the
 * raised code (e.g. "SLOT_HELD"); parseHoldError maps them to a stable union.
 */

export type HoldErrorCode =
  | "SLOT_TAKEN"
  | "SLOT_HELD"
  | "SLOT_PAST"
  | "SLOT_INVALID"
  | "PROVIDER_UNAVAILABLE"
  | "SERVICE_INVALID"
  | "LOCATION_INVALID"
  | "SESSION_INVALID"
  | "ERROR";

const HOLD_ERROR_CODES: HoldErrorCode[] = [
  "SLOT_TAKEN",
  "SLOT_HELD",
  "SLOT_PAST",
  "SLOT_INVALID",
  "PROVIDER_UNAVAILABLE",
  "SERVICE_INVALID",
  "LOCATION_INVALID",
  "SESSION_INVALID",
];

function parseHoldError(message: string): HoldErrorCode {
  const hit = HOLD_ERROR_CODES.find((c) => message.includes(c));
  return hit ?? "ERROR";
}

export type CreateHoldResult =
  | { ok: true; holdId: string; expiresAt: string }
  | { ok: false; code: HoldErrorCode };

export async function createHold(args: {
  providerId: string;
  serviceId: string;
  locationId: string;
  slotStart: string; // ISO UTC
  slotEnd: string; // ISO UTC
  sessionKey: string;
}): Promise<CreateHoldResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_create_hold", {
    p_provider_id: args.providerId,
    p_service_id: args.serviceId,
    p_location_id: args.locationId,
    p_slot_start: args.slotStart,
    p_slot_end: args.slotEnd,
    p_session_key: args.sessionKey,
  });
  if (error) {
    return { ok: false, code: parseHoldError(error.message) };
  }
  const d = data as { holdId: string; expiresAt: string };
  return { ok: true, holdId: d.holdId, expiresAt: d.expiresAt };
}

export async function releaseHold(holdId: string, sessionKey: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_release_hold", {
    p_hold_id: holdId,
    p_session_key: sessionKey,
  });
  if (error) {
    console.error("[health-booking] release_hold failed:", error.message);
    return false;
  }
  return data === true;
}

export type HoldSummary = {
  holdId: string;
  expiresAt: string;
  slotStart: string;
  slotEnd: string;
  providerSlug: string;
  providerName: string;
  providerTitle: string | null;
  serviceName: string;
  serviceDurationMin: number;
  servicePriceEur: number | null;
  locationLabel: string;
  locationAddress: string;
  locationCity: string;
};

/** Hold summary for the booking page. null = expired / not found / wrong session. */
export async function getHold(
  holdId: string,
  sessionKey: string,
  locale: Locale,
): Promise<HoldSummary | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_get_hold", {
    p_hold_id: holdId,
    p_session_key: sessionKey,
    p_locale: locale,
  });
  if (error) {
    throw new Error(`health_get_hold failed: ${error.message}`);
  }
  return (data as HoldSummary | null) ?? null;
}

export async function createOtp(phoneHashHex: string, codeHashHex: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("health_create_otp", {
    p_phone_hash: phoneHashHex,
    p_code_hash: codeHashHex,
  });
  if (error) {
    console.error("[health-booking] create_otp failed:", error.message);
    return false;
  }
  return true;
}

export type VerifyOtpResult =
  | { ok: true; patientId: string }
  | { ok: false; reason: "WRONG_CODE" | "TOO_MANY_ATTEMPTS" | "OTP_EXPIRED" | "CONSENT_REQUIRED" | "ERROR"; attemptsLeft?: number };

export async function verifyOtp(args: {
  phoneHashHex: string;
  codeHashHex: string;
  fullName: string;
  phoneE164: string;
  email: string | null;
  consentHealth: boolean;
  consentMarketing: boolean;
  /**
   * H9: when an authenticated Supabase session exists at verify time, the OTP route
   * passes the user's id so the encrypted patient row is stamped with user_id (enables
   * "Randevularım"). Guests (no session) pass null and the row stays user_id NULL.
   * Always sent → the 8-arg migration-075 overload is selected.
   */
  userId: string | null;
}): Promise<VerifyOtpResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_verify_otp", {
    p_phone_hash: args.phoneHashHex,
    p_code_hash: args.codeHashHex,
    p_full_name: args.fullName,
    p_phone_e164: args.phoneE164,
    p_email: args.email,
    p_consent_health: args.consentHealth,
    p_consent_marketing: args.consentMarketing,
    p_user_id: args.userId,
  });
  if (error) {
    // No PII in logs (phone/email/name never logged).
    console.error("[health-booking] verify_otp failed:", error.message);
    return { ok: false, reason: "ERROR" };
  }
  const d = data as
    | { ok: true; patientId: string }
    | { ok: false; reason: string; attemptsLeft?: number };
  if (d.ok) return { ok: true, patientId: d.patientId };
  const known = ["WRONG_CODE", "TOO_MANY_ATTEMPTS", "OTP_EXPIRED", "CONSENT_REQUIRED"] as const;
  const reason = (known as readonly string[]).includes(d.reason)
    ? (d.reason as (typeof known)[number])
    : "ERROR";
  return { ok: false, reason, attemptsLeft: d.attemptsLeft };
}

// ─────────────────────────────────────────────────────────────────────────────
// H5b — atomic booking + confirm dispatch + onay/cancel (server-only).
//
// All writes go through the migration-071 public SECURITY DEFINER wrappers
// (health.book_appointment is health-schema/service-role-only; the wrapper bridges
// the un-exposed schema + adds session-ownership + verified checks). The confirm
// SMS/email are dispatched here immediately; t24/t2 reminders stay 'pending' for H6.
// ─────────────────────────────────────────────────────────────────────────────

export type BookErrorCode =
  | "SLOT_TAKEN"
  | "HOLD_EXPIRED"
  | "HOLD_NOT_OWNED"
  | "PATIENT_NOT_VERIFIED"
  | "PATIENT_INVALID"
  | "ERROR";

const BOOK_ERROR_CODES: BookErrorCode[] = [
  "SLOT_TAKEN",
  "HOLD_EXPIRED",
  "HOLD_NOT_OWNED",
  "PATIENT_NOT_VERIFIED",
  "PATIENT_INVALID",
];

function parseBookError(message: string): BookErrorCode {
  return BOOK_ERROR_CODES.find((c) => message.includes(c)) ?? "ERROR";
}

type BookDispatch = {
  phoneE164: string;
  email: string | null;
  patientName: string;
  confirmSmsReminderId: string;
  confirmEmailReminderId: string | null;
};
type BookSummary = {
  providerName: string;
  providerTitle: string | null;
  providerSlug: string;
  serviceName: string;
  serviceDurationMin: number;
  servicePriceEur: number | null;
  locationLabel: string;
  locationAddress: string;
  locationCity: string;
};

export type BookResult =
  | {
      ok: true;
      appointmentId: string;
      manageToken: string;
      slotStart: string;
      slotEnd: string;
      dispatch: BookDispatch;
      summary: BookSummary;
    }
  | { ok: false; code: BookErrorCode };

export async function bookAppointment(args: {
  holdId: string;
  patientId: string;
  note: string | null;
  sessionKey: string;
  locale: Locale;
}): Promise<BookResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_book_appointment", {
    p_hold_id: args.holdId,
    p_patient_id: args.patientId,
    p_note: args.note,
    p_session_key: args.sessionKey,
    p_locale: args.locale,
  });
  if (error) {
    return { ok: false, code: parseBookError(error.message) };
  }
  const d = data as Omit<Extract<BookResult, { ok: true }>, "ok">;
  return { ok: true, ...d };
}

/**
 * H6: persist the patient's UI locale so t24/t2/followup reminders render in their
 * language (health.patients/reminders_outbox carry no locale column; the claim RPC LEFT
 * JOINs this sidecar). Migration-073 RPC, best-effort & never-throw — no PII logged.
 * Extracted so the manual-book path can set the locale WITHOUT also self-notifying the
 * provider (who is the booking actor there).
 */
export async function setReminderLocale(appointmentId: string, locale: Locale): Promise<void> {
  const supabase = createAdminClient();
  try {
    const { error: locErr } = await supabase.rpc("health_set_reminder_locale", {
      p_appointment_id: appointmentId,
      p_locale: locale,
    });
    if (locErr) console.error("[health-booking] set_reminder_locale failed:", locErr.message);
  } catch (e) {
    console.error("[health-booking] set_reminder_locale threw:", e instanceof Error ? e.message : "unknown");
  }
}

/**
 * H6: persist the patient's UI locale + enqueue the provider's new-booking notice.
 * Both go through additive migration-073 RPCs (the 071 book RPC is frozen). Best-effort
 * & never-throw: a sidecar/enqueue hiccup must not fail the booking. No PII logged.
 *  - setReminderLocale: claim RPC LEFT JOINs this so t24/t2/followup render in the
 *    patient's locale (health.patients/reminders_outbox carry no locale column).
 *  - health_enqueue_provider_new_booking: queues a provider email row the cron delivers.
 */
export async function enqueueBookingFollowups(appointmentId: string, locale: Locale): Promise<void> {
  await setReminderLocale(appointmentId, locale);
  const supabase = createAdminClient();
  try {
    const { error: pnbErr } = await supabase.rpc("health_enqueue_provider_new_booking", {
      p_appointment_id: appointmentId,
    });
    if (pnbErr) console.error("[health-booking] enqueue_provider_new_booking failed:", pnbErr.message);
  } catch (e) {
    console.error("[health-booking] enqueue_provider_new_booking threw:", e instanceof Error ? e.message : "unknown");
  }
}

/**
 * H6: enqueue the patient's 'cancelled' notice after a cancel. The 071 cancel RPC only
 * marks pending t24/t2 'skipped'; it does not queue a cancelled row. Idempotent + only
 * for cancelled appointments (enforced in the RPC). Best-effort & never-throw.
 */
export async function enqueueCancelledNotice(manageToken: string): Promise<void> {
  const supabase = createAdminClient();
  try {
    const { error } = await supabase.rpc("health_enqueue_cancelled", {
      p_manage_token: manageToken,
    });
    if (error) console.error("[health-booking] enqueue_cancelled failed:", error.message);
  } catch (e) {
    console.error("[health-booking] enqueue_cancelled threw:", e instanceof Error ? e.message : "unknown");
  }
}

async function markReminder(
  reminderId: string,
  status: "sent" | "failed",
  providerMsgId: string | null,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("health_mark_reminder", {
    p_reminder_id: reminderId,
    p_status: status,
    p_provider_msg_id: providerMsgId,
  });
  if (error) console.error("[health-booking] mark_reminder failed:", error.message);
}

/**
 * Sends the confirm SMS (always) + confirm email (if the patient gave one), then
 * marks each confirm reminder sent/failed. Best-effort & two-layer: failures are
 * logged (no PII) and never throw — a notification hiccup must not fail the booking.
 * t24/t2 reminders are left 'pending' for the H6 cron dispatcher.
 *
 * Date/doctor/URL formatting + the confirm copy are shared with the H6 cron via
 * lib/saglik/reminder-format + reminder-templates so the two send paths never drift.
 */
export async function dispatchConfirm(result: Extract<BookResult, { ok: true }>, locale: Locale): Promise<void> {
  const dateTime = formatAppointmentDateTime(result.slotStart, locale);
  const doctor = formatDoctor(result.summary.providerTitle, result.summary.providerName);
  const url = manageUrl(result.manageToken, locale);

  // SMS confirm (PII: phone/name not logged)
  try {
    const sms = await sendSms({
      to: result.dispatch.phoneE164,
      text: HEALTH_CONFIRM_SMS[locale](dateTime, doctor, url),
    });
    await markReminder(result.dispatch.confirmSmsReminderId, sms.ok ? "sent" : "failed", sms.ok ? sms.messageId : null);
  } catch (e) {
    console.error("[health-booking] confirm sms failed:", e instanceof Error ? e.message : "unknown");
    await markReminder(result.dispatch.confirmSmsReminderId, "failed", null);
  }

  // Email confirm (only when the patient provided an email)
  if (result.dispatch.email && result.dispatch.confirmEmailReminderId) {
    try {
      const sent = await sendEmail({
        to: result.dispatch.email,
        subject: HEALTH_CONFIRM_EMAIL_SUBJECT[locale],
        react: HealthBookingConfirmEmail({
          locale,
          patientName: result.dispatch.patientName,
          doctor,
          dateTime,
          serviceName: result.summary.serviceName,
          locationLabel: result.summary.locationLabel,
          locationAddress: result.summary.locationAddress,
          locationCity: result.summary.locationCity,
          manageUrl: url,
        }),
      });
      await markReminder(
        result.dispatch.confirmEmailReminderId,
        sent.success ? "sent" : "failed",
        sent.success ? sent.messageId ?? null : null,
      );
    } catch (e) {
      console.error("[health-booking] confirm email failed:", e instanceof Error ? e.message : "unknown");
      await markReminder(result.dispatch.confirmEmailReminderId, "failed", null);
    }
  }
}

/**
 * H7b: dispatch the confirm SMS/email for a PROVIDER manual booking. The migration-078
 * manual-book RPC returns the SAME dispatch/summary shape as the patient book RPC (071),
 * so this is a thin reuse of dispatchConfirm — the provider-vouched patient gets the
 * identical confirm copy + manage link, and the t24/t2 rows stay 'pending' for the H6
 * cron. Best-effort & two-layer (dispatchConfirm itself never throws). The structural
 * `ok:true` wrapper lets us pass the manual-book payload straight through without
 * duplicating the SMS/email/markReminder logic.
 */
export async function dispatchManualConfirm(
  result: {
    appointmentId: string;
    manageToken: string;
    slotStart: string;
    slotEnd: string;
    dispatch: BookDispatch;
    summary: BookSummary;
  },
  locale: Locale,
): Promise<void> {
  await dispatchConfirm({ ok: true, ...result }, locale);
}

export type AppointmentSummary = {
  status: "confirmed" | "cancelled" | "completed" | "no_show";
  slotStart: string;
  slotEnd: string;
  providerName: string;
  providerTitle: string | null;
  providerSlug: string;
  serviceName: string;
  serviceDurationMin: number;
  servicePriceEur: number | null;
  locationLabel: string;
  locationAddress: string;
  locationCity: string;
  manageToken: string;
  /** H9: original service/location ids so the reschedule widget can pre-select them. */
  serviceId: string;
  locationId: string;
  /** H9: when this appointment was rescheduled, the NEW appointment's manage_token (else null). */
  rescheduledTo: string | null;
};

/** Appointment summary by manage_token (onay + manage pages). PII-free. null = not found. */
export async function getAppointment(
  manageToken: string,
  locale: Locale,
): Promise<AppointmentSummary | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_get_appointment", {
    p_manage_token: manageToken,
    p_locale: locale,
  });
  if (error) {
    throw new Error(`health_get_appointment failed: ${error.message}`);
  }
  return (data as AppointmentSummary | null) ?? null;
}

export type CancelResult =
  | { ok: true; status: "cancelled" }
  | { ok: false; reason: "NOT_FOUND" | "NOT_CANCELLABLE" | "ERROR" };

export async function cancelAppointment(manageToken: string): Promise<CancelResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_cancel_appointment", {
    p_manage_token: manageToken,
  });
  if (error) {
    console.error("[health-booking] cancel failed:", error.message);
    return { ok: false, reason: "ERROR" };
  }
  const d = data as { ok: boolean; status?: string; reason?: string };
  if (d.ok) return { ok: true, status: "cancelled" };
  const reason = d.reason === "NOT_FOUND" || d.reason === "NOT_CANCELLABLE" ? d.reason : "ERROR";
  return { ok: false, reason };
}

// ─────────────────────────────────────────────────────────────────────────────
// H10 — data-subject rights request intake (PDPL 15-day SLA). Keyed on the
// appointment manage_token (the patient's only credential); the RPC resolves the
// patient itself (never trusts a client-supplied id) and records a queue row +
// audit. The token is the only secret → it NEVER appears in logs.
// ─────────────────────────────────────────────────────────────────────────────

export type DataRequestType = "delete" | "export";

export type DataActionResult =
  | { ok: true; requestId: string }
  | { ok: false; reason: "NOT_FOUND" | "INVALID_TYPE" | "ERROR" };

export async function requestDataAction(
  manageToken: string,
  type: DataRequestType,
): Promise<DataActionResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_request_data_action", {
    p_manage_token: manageToken,
    p_type: type,
  });
  if (error) {
    // No token/PII in logs — error.message is the raised code (NOT_FOUND / INVALID_TYPE).
    console.error("[health-data-request] failed:", error.message);
    const reason =
      error.message.includes("NOT_FOUND")
        ? "NOT_FOUND"
        : error.message.includes("INVALID_TYPE")
          ? "INVALID_TYPE"
          : "ERROR";
    return { ok: false, reason };
  }
  const d = data as { ok: boolean; requestId?: string };
  if (d.ok && d.requestId) return { ok: true, requestId: d.requestId };
  return { ok: false, reason: "ERROR" };
}

// ─────────────────────────────────────────────────────────────────────────────
// H9 — atomic reschedule (book-new-then-cancel-old) + the single patient move
// notice + the provider move notice. The reschedule RPC (migration 075) reuses
// health.book_appointment for the NEW appointment (atomicity not duplicated) and
// sets the OLD appointment's cancel_reason='reschedule', so the standalone
// 'cancelled' patient notice is NEVER queued — the patient gets ONE coherent
// "moved from X to Y" message, the provider gets a distinct change notice.
// ─────────────────────────────────────────────────────────────────────────────

/** Reschedule failure codes = the book codes ∪ the reschedule-specific ones. */
export type RescheduleErrorCode =
  | BookErrorCode
  | "OLD_NOT_CANCELLABLE"
  | "OLD_SLOT_PASSED"
  | "RESCHEDULE_SCOPE_MISMATCH"
  | "RESCHEDULE_IDENTITY_MISMATCH"
  | "NOT_FOUND";

const RESCHEDULE_ERROR_CODES: RescheduleErrorCode[] = [
  "SLOT_TAKEN",
  "HOLD_EXPIRED",
  "HOLD_NOT_OWNED",
  "PATIENT_NOT_VERIFIED",
  "PATIENT_INVALID",
  "OLD_NOT_CANCELLABLE",
  "OLD_SLOT_PASSED",
  "RESCHEDULE_SCOPE_MISMATCH",
  "RESCHEDULE_IDENTITY_MISMATCH",
  "NOT_FOUND",
];

function parseRescheduleReason(reason: string): RescheduleErrorCode {
  return RESCHEDULE_ERROR_CODES.find((c) => reason.includes(c)) ?? "ERROR";
}

export type RescheduleResult =
  | {
      ok: true;
      /**
       * false on a first, real move: dispatch/summary are present and the route sends
       * the move notice. true on an idempotent replay (the old appointment was already
       * cancelled+rescheduled — a double-submit / network retry): the move already
       * happened on the first call, so the RPC returns ONLY the new token (no
       * dispatch/summary) and the route MUST short-circuit — redirect to newManageToken
       * WITHOUT re-dispatching (the notice already went out). See migration 075/076.
       */
      idempotent: false;
      oldAppointmentId: string;
      newAppointmentId: string;
      newManageToken: string;
      slotStart: string; // new
      slotEnd: string; // new
      oldSlotStart: string;
      dispatch: BookDispatch;
      summary: BookSummary;
    }
  | { ok: true; idempotent: true; newManageToken: string }
  | { ok: false; code: RescheduleErrorCode };

/**
 * Atomic reschedule via the migration-075 RPC. The new slot is held first (the
 * caller passes a fresh hold id) and booked BEFORE the old one is cancelled, so a
 * SLOT_TAKEN aborts the whole tx and the old appointment stays confirmed (no data
 * loss). Maps the RPC's {ok:false,reason} graceful payload to the discriminated
 * union. The RPC raises nothing on a business failure (it returns a payload), but a
 * genuine PostgREST/transport error maps to ERROR.
 */
export async function rescheduleAppointment(args: {
  oldManageToken: string;
  newHoldId: string;
  sessionKey: string;
  patientId: string;
  note: string | null;
  locale: Locale;
}): Promise<RescheduleResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_reschedule_appointment", {
    p_old_manage_token: args.oldManageToken,
    p_new_hold_id: args.newHoldId,
    p_session_key: args.sessionKey,
    p_patient_id: args.patientId,
    p_note: args.note,
    p_locale: args.locale,
  });
  if (error) {
    // No token/PII in logs — the token is the appointment's only credential.
    console.error("[health-booking] reschedule failed:", error.message);
    return { ok: false, code: "ERROR" };
  }
  const d = data as
    | ({ ok: true; idempotent?: boolean } & Partial<
        Omit<Extract<RescheduleResult, { ok: true; idempotent: false }>, "ok" | "idempotent">
      >)
    | { ok: false; reason: string };
  if (d.ok) {
    // Idempotent replay (double-submit / retry): the RPC returns ONLY the new token
    // (no dispatch/summary), because the move + its notice already happened on the
    // first call. Map to the distinct variant so the route short-circuits instead of
    // dereferencing the absent dispatch/summary (which would 500 the retry).
    if (d.idempotent === true && d.newManageToken) {
      return { ok: true, idempotent: true, newManageToken: d.newManageToken };
    }
    return {
      ok: true,
      idempotent: false,
      oldAppointmentId: d.oldAppointmentId!,
      newAppointmentId: d.newAppointmentId!,
      newManageToken: d.newManageToken!,
      slotStart: d.slotStart!,
      slotEnd: d.slotEnd!,
      oldSlotStart: d.oldSlotStart!,
      dispatch: d.dispatch!,
      summary: d.summary!,
    };
  }
  return { ok: false, code: parseRescheduleReason(d.reason) };
}

/**
 * Sends the SINGLE patient move notice immediately (SMS always, email if present),
 * then marks the new appointment's confirm reminder rows sent/failed — exactly like
 * dispatchConfirm, but with the explicit "moved from {old} to {new}" copy (option B).
 * The RPC inserted plain 'confirm' rows for the new appointment, so reusing their ids
 * keeps the outbox truthful; we just render the reschedule body instead of confirm.
 * Best-effort & two-layer: a notification hiccup never fails the reschedule.
 */
export async function dispatchRescheduleConfirm(
  result: Extract<RescheduleResult, { ok: true; idempotent: false }>,
  locale: Locale,
): Promise<void> {
  const newDateTime = formatAppointmentDateTime(result.slotStart, locale);
  const oldDateTime = formatAppointmentDateTime(result.oldSlotStart, locale);
  const doctor = formatDoctor(result.summary.providerTitle, result.summary.providerName);
  const url = manageUrl(result.newManageToken, locale);

  // SMS move notice (PII: phone/name not logged).
  try {
    const sms = await sendSms({
      to: result.dispatch.phoneE164,
      text: HEALTH_RESCHEDULE_SMS[locale](oldDateTime, newDateTime, doctor, url),
    });
    await markReminder(result.dispatch.confirmSmsReminderId, sms.ok ? "sent" : "failed", sms.ok ? sms.messageId : null);
  } catch (e) {
    console.error("[health-booking] reschedule sms failed:", e instanceof Error ? e.message : "unknown");
    await markReminder(result.dispatch.confirmSmsReminderId, "failed", null);
  }

  // Email move notice (only when the patient provided an email).
  if (result.dispatch.email && result.dispatch.confirmEmailReminderId) {
    try {
      const sent = await sendEmail({
        to: result.dispatch.email,
        subject: HEALTH_RESCHEDULE_EMAIL_SUBJECT[locale],
        react: HealthRescheduleEmail({
          locale: coerceEmailLocale(locale),
          patientName: result.dispatch.patientName,
          doctor,
          oldDateTime,
          newDateTime,
          serviceName: result.summary.serviceName,
          manageUrl: url,
        }),
      });
      await markReminder(
        result.dispatch.confirmEmailReminderId,
        sent.success ? "sent" : "failed",
        sent.success ? sent.messageId ?? null : null,
      );
    } catch (e) {
      console.error("[health-booking] reschedule email failed:", e instanceof Error ? e.message : "unknown");
      await markReminder(result.dispatch.confirmEmailReminderId, "failed", null);
    }
  }
}

/**
 * H9: queue the provider's reschedule notice (one channel='email' 'reschedule_provider'
 * row carrying the move). The RPC already inserts this row in the same tx, so this is a
 * defensive idempotent re-enqueue for callers that book then enqueue separately. Mirrors
 * enqueueBookingFollowups: best-effort & never-throw — a queue hiccup never fails the move.
 */
export async function enqueueRescheduleProviderNotice(
  newAppointmentId: string,
  oldAppointmentId: string,
): Promise<void> {
  const supabase = createAdminClient();
  try {
    const { error } = await supabase.rpc("health_enqueue_reschedule_provider", {
      p_new_appointment_id: newAppointmentId,
      p_old_appointment_id: oldAppointmentId,
    });
    if (error) console.error("[health-booking] enqueue_reschedule_provider failed:", error.message);
  } catch (e) {
    console.error("[health-booking] enqueue_reschedule_provider threw:", e instanceof Error ? e.message : "unknown");
  }
}

export type UserAppointment = {
  manageToken: string;
  status: "confirmed" | "cancelled" | "completed" | "no_show";
  slotStart: string;
  slotEnd: string;
  providerName: string;
  providerTitle: string | null;
  providerSlug: string;
  serviceName: string;
  serviceDurationMin: number;
  servicePriceEur: number | null;
  locationLabel: string;
  locationCity: string;
};

/**
 * H9 "Randevularım": PII-free upcoming+past appointment summaries for a logged-in
 * user, via the migration-075 read-RPC filtered STRICTLY on patients.user_id. The
 * caller MUST pass the server-verified getUser().id (never a client value), so one
 * patient can never list another's appointments. Returns [] when nothing is linked.
 */
export async function listUserAppointments(
  userId: string,
  locale: Locale,
): Promise<UserAppointment[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_list_user_appointments", {
    p_user_id: userId,
    p_locale: locale,
  });
  if (error) {
    throw new Error(`health_list_user_appointments failed: ${error.message}`);
  }
  return (data as UserAppointment[] | null) ?? [];
}
