/**
 * Sprint A: Supabase Send SMS Hook receiver.
 *
 * Supabase calls this endpoint whenever it needs to deliver an auth SMS code —
 * in Glatko's case the phone-verification (phone_change) OTP triggered by
 * lib/actions/phone.ts → supabase.auth.updateUser({ phone }). We:
 *   1. Verify the standardwebhooks HMAC signature using SEND_SMS_HOOK_SECRET
 *      (mirrors app/api/auth/email-hook exactly).
 *   2. Enforce the per-phone hourly OTP cap (defence-in-depth over Supabase).
 *   3. Render the localized SMS body from dictionaries (notifications.sms.otp).
 *   4. Deliver via Infobip (lib/sms/infobip.ts) — the single SMS source.
 *
 * This route ONLY sends SMS; it never touches the email auth flow. A non-2xx
 * response makes the originating auth call fail (there is no built-in SMS
 * fallback) — exactly what we want for rate-limit / delivery errors.
 */
import { Webhook } from "standardwebhooks";
import { type NextRequest, NextResponse } from "next/server";
import { sendSms } from "@/lib/sms/infobip";
import { checkSmsOtpLimit } from "@/lib/ratelimit/sms-otp-limit";
import { getDictionary, type LanguageCode } from "@/dictionaries";
import { glatkoCaptureException } from "@/lib/sentry/glatko-capture";

type SmsHookPayload = {
  user: {
    id: string;
    phone?: string | null;
    /**
     * Pending new phone during a phone-change flow (updateUser({ phone })).
     * For a user with no confirmed phone yet, GoTrue leaves `phone` empty and
     * carries the destination number here. GoTrue's User model serializes the
     * PhoneChange field as `new_phone` (mirrors `new_email` for email change);
     * `phone_change` is the DB column name, kept as a defensive fallback. The
     * OTP target is `phone || new_phone || phone_change`.
     */
    new_phone?: string | null;
    phone_change?: string | null;
    user_metadata?: {
      preferred_locale?: string;
      locale?: string;
      [key: string]: unknown;
    } | null;
  };
  sms: { otp: string };
};

const SUPPORTED_LOCALES: readonly LanguageCode[] = [
  "me",
  "sr",
  "en",
  "tr",
  "de",
  "it",
  "ru",
  "ar",
  "uk",
];

/** Ultimate fallback if a locale somehow lacks notifications.sms.otp. */
const FALLBACK_OTP_TEXT = "Your Glatko verification code: {otp}";

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function decodeHookSecret(raw: string): string {
  // Supabase issues secrets as `v1,whsec_<base64>`; standardwebhooks expects
  // the `whsec_...` form, so strip the `v1,` prefix if present.
  return raw.startsWith("v1,") ? raw.slice(3) : raw;
}

function resolveSmsLocale(
  meta: SmsHookPayload["user"]["user_metadata"],
): LanguageCode {
  const raw = meta?.preferred_locale ?? meta?.locale;
  if (
    typeof raw === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(raw)
  ) {
    return raw as LanguageCode;
  }
  return "me";
}

export async function GET() {
  // Health check: confirm the route is deployed without leaking the secret.
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/auth/sms-hook",
    supportedLocales: SUPPORTED_LOCALES,
  });
}

export async function POST(request: NextRequest) {
  const secret = process.env.SEND_SMS_HOOK_SECRET;
  if (!secret) {
    console.error("[GLATKO:sms-hook] SEND_SMS_HOOK_SECRET unset");
    return jsonError("Hook secret not configured", 503);
  }

  const body = await request.text();
  const headers = {
    "webhook-id": request.headers.get("webhook-id") ?? "",
    "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
    "webhook-signature": request.headers.get("webhook-signature") ?? "",
  };

  let payload: SmsHookPayload;
  try {
    const wh = new Webhook(decodeHookSecret(secret));
    payload = wh.verify(body, headers) as SmsHookPayload;
  } catch (err) {
    console.warn(
      "[GLATKO:sms-hook] signature verify failed",
      err instanceof Error ? err.message : err,
    );
    return jsonError("Invalid webhook signature", 401);
  }

  const user = payload?.user;
  // phone signup/login uses `phone`; a phone-change leaves `phone` empty and
  // carries the new number in `new_phone` (GoTrue JSON tag; `phone_change` is
  // the DB column, kept as a fallback). Accept whichever is present.
  const phone =
    user?.phone?.trim() ||
    user?.new_phone?.trim() ||
    user?.phone_change?.trim();
  const otp = payload?.sms?.otp?.trim();
  const userId = user?.id;
  if (!phone || !otp || !userId) {
    console.error(
      "[GLATKO:sms-hook] malformed payload",
      JSON.stringify({
        hasPhone: Boolean(user?.phone),
        hasNewPhone: Boolean(user?.new_phone),
        hasPhoneChange: Boolean(user?.phone_change),
        hasOtp: Boolean(otp),
        hasUserId: Boolean(userId),
        userKeys: user ? Object.keys(user) : null,
      }),
    );
    return jsonError("Malformed hook payload", 400);
  }

  // Per-phone hourly cap (the server action enforces the per-user daily cap).
  const limit = await checkSmsOtpLimit(userId, phone, "phone");
  if (!limit.allowed) {
    console.warn("[GLATKO:sms-hook] per-phone OTP cap exceeded");
    return jsonError("SMS rate limit exceeded", 429);
  }

  const locale = resolveSmsLocale(payload.user.user_metadata);

  let template = FALLBACK_OTP_TEXT;
  try {
    const dict = await getDictionary(locale);
    const fromDict = (
      dict?.notifications as { sms?: { otp?: string } } | undefined
    )?.sms?.otp;
    if (typeof fromDict === "string" && fromDict.includes("{otp}")) {
      template = fromDict;
    }
  } catch (err) {
    console.warn(
      "[GLATKO:sms-hook] dictionary load failed; using fallback copy",
      err instanceof Error ? err.message : err,
    );
  }

  const text = template.replace(/\{otp\}/g, otp);

  const result = await sendSms({ to: phone, text });
  if (!result.ok) {
    console.error("[GLATKO:sms-hook] SMS send failed", result.error);
    glatkoCaptureException(new Error(`SMS hook send failed: ${result.error}`), {
      module: "sms-hook",
      locale,
    });
    return jsonError(result.error, 502);
  }

  // Success: Supabase only needs a 2xx with an empty body.
  return new NextResponse(null, { status: 200 });
}
