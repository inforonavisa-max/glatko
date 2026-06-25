import { createAdminClient } from "@/supabase/server";
import { glatkoCaptureException } from "@/lib/sentry/glatko-capture";
import { sendSms } from "@/lib/sms/infobip";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/infobip";
import { buildWhatsAppTemplateMessage } from "@/lib/notifications/whatsapp-templates";
import { resolveExternalLink } from "@/lib/notifications/external-link";
import { getDictionary, type LanguageCode } from "@/dictionaries";
import { locales } from "@/i18n/routing";

/**
 * Faz 2-A — external-channel (SMS / Viber / WhatsApp) notification dispatch.
 *
 * Called fire-and-forget from createNotification AFTER the in-app row is written,
 * so it never blocks or breaks in-app. It NEVER routes through
 * notificationDispatcher's ResendEmailProvider (which calls createNotification) —
 * that would recurse; it talks to Infobip directly via the proven sendSms.
 *
 * NOTE: the Infobip omnichannel Messages API (/messages/1/messages) is NOT
 * available on this account (returns 404; auth OK), so SMS goes through the live
 * SMS API (lib/sms/infobip.ts sendSms, POST /sms/3/messages). Faz 3 decides the
 * multi-channel failover transport (activate Messages API vs per-channel APIs +
 * sendCascade); the channel `order` below is computed now for forward-compat.
 *
 * Target number = auth.users.phone (NOT profiles.phone, which is NULL for
 * phone-OTP signups). Channel preference = profiles.notification_channel.
 *
 * SAFETY: off unless EXTERNAL_NOTIFICATIONS_ENABLED === "true" — the code can
 * ship live with ZERO real sends until we flip it (controlled rollout). When
 * EXTERNAL_NOTIFICATIONS_TEST_PHONES is set, ONLY those numbers receive.
 *
 * Faz 3-B: the WhatsApp template is tried FIRST for users who explicitly chose
 * the WhatsApp channel AND consented (profiles.messaging_opt_in); ANY failure
 * (not configured / rejected / missing data) falls through to the proven SMS
 * path, unchanged. SMS is NOT gated by messaging_opt_in. Chat messages
 * (message/thread_message) are deferred to the unread-gated cron (Faz 2-C),
 * not sent instantly here.
 */

const DEFAULT_USER_TIMEZONE = "Europe/Podgorica";
const DEFAULT_DAILY_EXTERNAL_CAP = 10;

/** Critical types bypass quiet hours + the daily cap (mirror lib/email/dispatch.ts). */
const CRITICAL_TYPES = new Set<string>([
  "bid_accepted",
  "verification_approved",
  "verification_rejected",
]);

/** Chat-message types: external delivery deferred to the cron (Faz 2-C). */
const DEFERRED_TO_CRON = new Set<string>(["message", "thread_message"]);

export type ChannelPref = "whatsapp" | "viber" | null;
export type FailoverChannel = "viber" | "whatsapp" | "sms";

/**
 * Forward-compat failover order from the user's stored preference. NULL (not
 * chosen) → full failover. Faz 3 uses this to build the multi-channel Infobip
 * body; Faz 2-A computes + logs it but sends SMS only (templates pending).
 */
export function channelOrder(pref: ChannelPref): FailoverChannel[] {
  if (pref === "viber") return ["viber", "sms"];
  if (pref === "whatsapp") return ["whatsapp", "sms"];
  return ["viber", "whatsapp", "sms"];
}

function dailyCap(): number {
  const n = Number(process.env.DAILY_EXTERNAL_NOTIFICATION_CAP);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAILY_EXTERNAL_CAP;
}

function isQuietHours(timezone: string = DEFAULT_USER_TIMEZONE): boolean {
  const hourStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  const hour = parseInt(hourStr, 10);
  if (Number.isNaN(hour)) return false;
  return hour >= 22 || hour < 8;
}

function normalizeE164(phone: string): string {
  const t = phone.trim();
  return t.startsWith("+") ? t : `+${t}`;
}

/** Coerce a stored preferred_locale to a valid app locale. Fallback "en" — the
 *  DB default and the language whose WhatsApp/email templates always exist. */
const FALLBACK_LOCALE: LanguageCode = "en";
function coerceLocale(raw: unknown): LanguageCode {
  return typeof raw === "string" && (locales as readonly string[]).includes(raw)
    ? (raw as LanguageCode)
    : FALLBACK_LOCALE;
}

function testPhoneAllowlist(): string[] | null {
  const raw = process.env.EXTERNAL_NOTIFICATIONS_TEST_PHONES;
  if (!raw) return null;
  const list = raw
    .split(",")
    .map((s) => normalizeE164(s))
    .filter((s) => s.length > 3);
  return list.length > 0 ? list : null;
}

export type ExternalDecision =
  | {
      send: true;
      phone: string;
      order: FailoverChannel[];
      critical: boolean;
      /** Recipient UI locale (coerced) — drives template language + deep link. */
      locale: LanguageCode;
      /** WhatsApp allowed: pref === "whatsapp" AND messaging_opt_in === true. */
      whatsappEligible: boolean;
    }
  | { send: false; reason: string };

/**
 * Pure decision (no message send) — testable in isolation and reused by the
 * Faz 2-C cron. Order of gates is deliberate: cheap/safety gates first so we
 * never call Infobip (or even getUserById) when disabled.
 */
export async function shouldSendExternal(params: {
  user_id: string;
  type: string;
  /** Faz 2-C: the unread-gated cron path. Bypasses ONLY the chat-message defer
   *  so message/thread_message can go external (delayed + cooldown-guarded by the
   *  cron). Every other gate (flag/allowlist/no-phone/quiet/cap) still applies;
   *  thread_message is non-critical, so cap + quiet hours are enforced. */
  fromCron?: boolean;
}): Promise<ExternalDecision> {
  // 1) SAFETY kill-switch — off unless explicitly enabled (no admin calls either).
  if (process.env.EXTERNAL_NOTIFICATIONS_ENABLED !== "true") {
    return { send: false, reason: "flag_off" };
  }
  // 2) Chat messages → external via the unread-gated cron (Faz 2-C), not instantly.
  //    The cron opts in with fromCron:true.
  if (!params.fromCron && DEFERRED_TO_CRON.has(params.type)) {
    return { send: false, reason: "deferred_to_cron" };
  }

  const admin = createAdminClient();

  // 3) Target number = auth.users.phone (NOT profiles.phone — NULL for phone-OTP).
  const { data: authData, error: authErr } = await admin.auth.admin.getUserById(
    params.user_id,
  );
  const rawPhone = authData?.user?.phone;
  if (authErr || !rawPhone) {
    return { send: false, reason: "no_phone" };
  }
  const phone = normalizeE164(rawPhone);

  // 4) Test allowlist — when set, ONLY these numbers receive (no real-user sends).
  const allow = testPhoneAllowlist();
  if (allow && !allow.includes(phone)) {
    return { send: false, reason: "not_allowlisted" };
  }

  const critical = CRITICAL_TYPES.has(params.type);

  // 5) Quiet hours (non-critical).
  if (!critical && isQuietHours()) {
    return { send: false, reason: "quiet_hours" };
  }

  // 6) Daily cap (non-critical) — count today's instant in-app notifications for
  //    the user (excludes the cron-deferred chat types). Mirrors the email cap.
  if (!critical) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countErr } = await admin
      .from("glatko_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", params.user_id)
      .gte("created_at", since)
      .not("type", "in", "(message,thread_message)");
    if (!countErr && count != null && count > dailyCap()) {
      return { send: false, reason: "daily_cap" };
    }
  }

  // 7) Channel preference + WhatsApp consent + recipient locale.
  const { data: profile } = await admin
    .from("profiles")
    .select("notification_channel, messaging_opt_in, preferred_locale")
    .eq("id", params.user_id)
    .maybeSingle();
  const pref = (profile?.notification_channel as ChannelPref) ?? null;
  const locale = coerceLocale(profile?.preferred_locale);
  // WhatsApp only when the user explicitly chose it AND consented (phone is
  // already verified by gate 3). SMS is unaffected by messaging_opt_in.
  const whatsappEligible =
    pref === "whatsapp" && profile?.messaging_opt_in === true;

  return {
    send: true,
    phone,
    order: channelOrder(pref),
    critical,
    locale,
    whatsappEligible,
  };
}

/**
 * SMS body builder. Unicode (Turkish/Cyrillic/Arabic …) → ~70 chars/segment, so
 * keep it short. Faz 3-A: optional `link` is appended at the END and is NEVER
 * truncated — only the title/body part is trimmed to make room (the old blind
 * `.slice(0,160)` would have chopped a trailing URL). Backward compatible: with
 * no `link` (the current Faz 2-A call) it behaves exactly like the original.
 */
const SMS_TARGET_LEN = 160;
/** Exported for unit tests (Faz 3-A). */
export function composeSmsText(title: string, body?: string, link?: string): string {
  const message = [title.trim(), (body ?? "").trim()].filter(Boolean).join(": ");
  const url = (link ?? "").trim();
  if (!url) {
    // Faz 2-A path (no link): nothing to protect — keep the original cap.
    return message.slice(0, SMS_TARGET_LEN);
  }
  // Link present: keep the URL whole; trim ONLY the message to fit the target.
  const room = SMS_TARGET_LEN - url.length - 1; // -1 for the separating space
  if (room <= 0) return url; // URL alone already fills the target — never cut it.
  const trimmedMessage =
    message.length > room ? message.slice(0, room).trimEnd() : message;
  return trimmedMessage ? `${trimmedMessage} ${url}` : url;
}

/** The notification fields the delivery cascade needs. */
type ExternalMessage = {
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
};

type ApprovedDecision = Extract<ExternalDecision, { send: true }>;

/** Injectable transports — defaults are the real ones; tests pass fakes. */
export type ExternalSenders = {
  sendWhatsAppTemplate: typeof sendWhatsAppTemplate;
  sendSms: typeof sendSms;
  loadStatusDict: (
    locale: LanguageCode,
  ) => Promise<Record<string, string> | undefined>;
  /**
   * Recipient-locale SMS body for the types we translate at send-time (Faz 3-B).
   * Returns undefined for not-yet-localized types → caller sends the stored
   * title/body (still with a deep link). Coerced locale guarantees one of the 9
   * app languages, so there is NO English fallback for localized types.
   */
  loadSmsCopy: (
    type: string,
    locale: LanguageCode,
  ) => Promise<string | undefined>;
};

const defaultSenders: ExternalSenders = {
  sendWhatsAppTemplate,
  sendSms,
  loadStatusDict: async (locale) => {
    const dict = await getDictionary(locale);
    return (dict as { status?: Record<string, string> }).status;
  },
  loadSmsCopy: async (type, locale) => {
    if (type !== "new_request_match") return undefined;
    const dict = await getDictionary(locale);
    return (
      dict as {
        notifications?: { newRequestMatch?: { sms?: string } };
      }
    ).notifications?.newRequestMatch?.sms;
  },
};

/**
 * WhatsApp-first → SMS cascade for an APPROVED decision. Dependency-injected
 * (senders) so the cascade is unit-testable with no DB, network, or real sends.
 * A WhatsApp attempt is made only when eligible AND a template+data can be
 * built; ANY WhatsApp failure falls through to the proven SMS path (no link,
 * exactly as Faz 2-A).
 */
export async function deliverExternal(
  params: ExternalMessage,
  decision: ApprovedDecision,
  senders: ExternalSenders = defaultSenders,
): Promise<{ sent: boolean; channel?: "whatsapp" | "sms" }> {
  // 1) WhatsApp template (eligible + buildable).
  if (decision.whatsappEligible) {
    const statusDict = await senders.loadStatusDict(decision.locale);
    const wa = buildWhatsAppTemplateMessage({
      type: params.type,
      data: params.data,
      title: params.title,
      locale: decision.locale,
      statusDict,
    });
    if (wa) {
      const waRes = await senders.sendWhatsAppTemplate({
        to: decision.phone,
        ...wa,
      });
      if (waRes.ok) {
        console.log(
          `[GLATKO:external] sent type=${params.type} order=${decision.order.join(">")} via=WhatsApp messageId=${waRes.messageId}`,
        );
        return { sent: true, channel: "whatsapp" };
      }
      console.error(
        `[GLATKO:external] whatsapp failed type=${params.type} error=${waRes.error} — falling back to SMS`,
      );
    }
  }

  // 2) SMS — Faz 3-B: the proven path, now with a deep link so the recipient
  // can act on the notification (composeSmsText keeps the URL whole, trimming
  // only the message to fit). For localized types (new_request_match) the body
  // is the recipient-locale copy instead of the stored English; other types
  // keep their stored title/body but gain the link.
  const link = resolveExternalLink(params.type, params.data, decision.locale);
  const localizedBody = await senders.loadSmsCopy(params.type, decision.locale);
  const text = localizedBody
    ? composeSmsText(localizedBody, undefined, link)
    : composeSmsText(params.title, params.body, link);
  const res = await senders.sendSms({ to: decision.phone, text });
  if (res.ok) {
    console.log(
      `[GLATKO:external] sent type=${params.type} order=${decision.order.join(">")} via=SMS messageId=${res.messageId}`,
    );
    return { sent: true, channel: "sms" };
  }
  console.error(
    `[GLATKO:external] send failed type=${params.type} error=${res.error}`,
  );
  return { sent: false };
}

/**
 * Fire-and-forget external dispatch. Never throws. Returns { sent } so the
 * Faz 2-C cron can set its per-thread cooldown marker ONLY on a real send; the
 * instant `void dispatchExternalNotification(...)` call ignores the result.
 */
export async function dispatchExternalNotification(params: {
  user_id: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  /** Faz 2-C cron path — see shouldSendExternal. */
  fromCron?: boolean;
}): Promise<{ sent: boolean }> {
  try {
    const decision = await shouldSendExternal({
      user_id: params.user_id,
      type: params.type,
      fromCron: params.fromCron,
    });
    if (!decision.send) {
      return { sent: false };
    }
    const { sent } = await deliverExternal(
      {
        type: params.type,
        title: params.title,
        body: params.body,
        data: params.data,
      },
      decision,
    );
    return { sent };
  } catch (err) {
    glatkoCaptureException(err, {
      module: "external-dispatch",
      type: params.type,
    });
    return { sent: false };
  }
}
