"use server";

import { z } from "zod";
import { createClient } from "@/supabase/server";
import { parseLoginPhone } from "@/lib/phone/login-phone";
import { checkPhoneLoginLimit } from "@/lib/ratelimit/sms-otp-limit";
import { glatkoCaptureException } from "@/lib/sentry/glatko-capture";

/**
 * Sprint 2 — passwordless PHONE LOGIN (SMS OTP). This is sign-in/sign-up via a
 * phone number, distinct from the phone-VERIFICATION flow in lib/actions/phone.ts:
 *   • login uses signInWithOtp + verifyOtp({ type: "sms" }) and CREATES a session.
 *   • verification uses updateUser({ phone }) + verifyOtp({ type: "phone_change" })
 *     for an already-authenticated user. The two never mix.
 *
 * The OTP itself is delivered by the existing Send SMS hook → Infobip, so no new
 * provider wiring is needed. The 30-day session is set by the server client's
 * mergeSessionCookieOptions wrapper (G-AUTH-1) — untouched here.
 */

export type PhoneLoginError =
  | "invalid_phone"
  | "rate_limited"
  | "wrong_code"
  | "send_failed"
  | "generic";

export type StartPhoneLoginResult =
  | { ok: true; phone: string }
  | { ok: false; error: PhoneLoginError };

export type VerifyPhoneLoginResult =
  | { ok: true; needsOnboarding: boolean }
  | { ok: false; error: PhoneLoginError };

const rawPhoneSchema = z.string().min(3).max(32);
const regionSchema = z.string().length(2);
const e164Schema = z.string().regex(/^\+[1-9]\d{6,14}$/);
const otpSchema = z.string().regex(/^\d{4,8}$/);

/** Default display name set by the handle_new_user trigger (migration 053). */
const ONBOARDING_PLACEHOLDER_NAME = "Glatko User";

const LOGIN_LOCALES = [
  "tr",
  "en",
  "de",
  "it",
  "ru",
  "uk",
  "sr",
  "me",
  "ar",
] as const;

/**
 * Rate-limits, then sends the login OTP to a normalized E.164 number.
 * `metaLocale` (when valid) is stored as the new user's preferred_locale so the
 * Send SMS hook renders the OTP in the language the visitor is using (it
 * otherwise defaults to Montenegrin). Ignored by GoTrue for existing users.
 */
async function sendLoginOtp(
  e164: string,
  metaLocale?: string,
): Promise<StartPhoneLoginResult> {
  const limit = await checkPhoneLoginLimit(e164);
  if (!limit.allowed) return { ok: false, error: "rate_limited" };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone: e164,
    options: {
      channel: "sms",
      shouldCreateUser: true,
      ...(metaLocale ? { data: { preferred_locale: metaLocale } } : {}),
    },
  });

  if (error) {
    const status = (error as { status?: number }).status;
    if (status === 429) return { ok: false, error: "rate_limited" };
    console.error("[GLATKO:phone-login] signInWithOtp failed", error.message);
    glatkoCaptureException(error, { module: "phone-login-start" });
    return { ok: false, error: "send_failed" };
  }

  return { ok: true, phone: e164 };
}

/**
 * Validates raw input + ISO region, normalizes to E.164, and sends the OTP.
 * Returns the normalized number so the client passes it back to verify/resend.
 */
export async function startPhoneLogin(input: {
  phone: string;
  region: string;
  locale?: string;
}): Promise<StartPhoneLoginResult> {
  const phone = rawPhoneSchema.safeParse(input?.phone);
  const region = regionSchema.safeParse(input?.region);
  if (!phone.success || !region.success) {
    return { ok: false, error: "invalid_phone" };
  }

  const norm = parseLoginPhone(phone.data, region.data);
  if ("error" in norm) return { ok: false, error: "invalid_phone" };

  const metaLocale = (LOGIN_LOCALES as readonly string[]).includes(
    input?.locale ?? "",
  )
    ? input.locale
    : undefined;

  return sendLoginOtp(norm.e164, metaLocale);
}

/** Resends the OTP to an already-normalized E.164 number (same limits). */
export async function resendPhoneLoginOtp(
  e164: string,
): Promise<StartPhoneLoginResult> {
  const parsed = e164Schema.safeParse(e164);
  if (!parsed.success) return { ok: false, error: "invalid_phone" };
  return sendLoginOtp(parsed.data);
}

/**
 * Verifies the SMS OTP. On success the session cookie is set (30-day wrapper),
 * and we report whether the user still needs onboarding (fresh phone-only
 * account: no real display name yet and onboarding not completed).
 */
export async function verifyPhoneLogin(input: {
  phone: string;
  token: string;
}): Promise<VerifyPhoneLoginResult> {
  const phone = e164Schema.safeParse(input?.phone);
  const token = otpSchema.safeParse(input?.token);
  if (!phone.success) return { ok: false, error: "invalid_phone" };
  if (!token.success) return { ok: false, error: "wrong_code" };

  const supabase = createClient();

  const { error: verifyErr } = await supabase.auth.verifyOtp({
    phone: phone.data,
    token: token.data,
    type: "sms",
  });
  if (verifyErr) {
    // Wrong or expired code — expected user error, no Sentry noise.
    return { ok: false, error: "wrong_code" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "generic" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  const name = (profile?.full_name ?? "").trim();
  const needsOnboarding =
    profile?.onboarding_completed !== true &&
    (name === "" || name === ONBOARDING_PLACEHOLDER_NAME);

  return { ok: true, needsOnboarding };
}
