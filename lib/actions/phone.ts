"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/supabase/server";
import { normalizeToE164 } from "@/lib/utils/phone";
import { checkSmsOtpLimit } from "@/lib/ratelimit/sms-otp-limit";
import { glatkoCaptureException } from "@/lib/sentry/glatko-capture";

/**
 * Sprint A — phone verification (SMS OTP) for existing, already-authenticated
 * users. This is verification, NOT phone login: we never create a session from
 * a phone number, we only prove ownership of the number and mirror the result
 * into profiles.phone_verified.
 *
 * Flow:
 *   startPhoneVerification → supabase.auth.updateUser({ phone })  (fires the
 *     Send SMS hook with "Secure phone change" on, so the change is staged but
 *     not committed until the code is verified)
 *   confirmPhoneOtp        → supabase.auth.verifyOtp({ type: "phone_change" })
 *     then UPDATE profiles { phone, phone_verified, phone_verified_at }.
 */

export type PhoneActionError =
  | "unauthorized"
  | "invalid_phone"
  | "rate_limited"
  | "phone_in_use"
  | "wrong_code"
  | "generic";

export type StartPhoneResult =
  | { ok: true; phone: string }
  | { ok: false; error: PhoneActionError };

export type ConfirmPhoneResult =
  | { ok: true }
  | { ok: false; error: PhoneActionError };

const phoneSchema = z.string().min(3).max(32);
const otpSchema = z.string().regex(/^\d{4,10}$/);

function isPhoneInUse(error: { code?: string; message?: string }): boolean {
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "phone_exists" ||
    msg.includes("already registered") ||
    msg.includes("already been registered") ||
    msg.includes("already in use") ||
    msg.includes("phone number already")
  );
}

function revalidateSecurity() {
  // Mirrors lib/actions/profile.ts: refresh server data app-wide so the
  // verified badge reflects immediately on the next render.
  revalidatePath("/", "layout");
}

/**
 * Stages a phone change and sends the OTP. Returns the normalized E.164 number
 * so the client can pass it back to confirm/resend.
 */
export async function startPhoneVerification(
  rawPhone: string,
): Promise<StartPhoneResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const parsed = phoneSchema.safeParse(rawPhone);
  if (!parsed.success) return { ok: false, error: "invalid_phone" };

  const norm = normalizeToE164(parsed.data, "ME");
  if ("error" in norm) return { ok: false, error: "invalid_phone" };

  // Per-user daily cap (the SMS hook enforces the per-phone hourly cap, so the
  // two windows never double-increment for one request).
  const limit = await checkSmsOtpLimit(user.id, norm.e164, "user");
  if (!limit.allowed) return { ok: false, error: "rate_limited" };

  const { error } = await supabase.auth.updateUser({ phone: norm.e164 });
  if (error) {
    if (isPhoneInUse(error as { code?: string; message?: string })) {
      return { ok: false, error: "phone_in_use" };
    }
    console.error("[GLATKO:phone] updateUser(phone) failed", error.message);
    glatkoCaptureException(error, { module: "phone-start" });
    return { ok: false, error: "generic" };
  }

  return { ok: true, phone: norm.e164 };
}

/**
 * Verifies the OTP and, on success, writes phone_verified to profiles.
 */
export async function confirmPhoneOtp(
  phone: string,
  token: string,
): Promise<ConfirmPhoneResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const parsedPhone = phoneSchema.safeParse(phone);
  if (!parsedPhone.success) return { ok: false, error: "invalid_phone" };
  const parsedToken = otpSchema.safeParse(token);
  if (!parsedToken.success) return { ok: false, error: "wrong_code" };

  const norm = normalizeToE164(parsedPhone.data, "ME");
  if ("error" in norm) return { ok: false, error: "invalid_phone" };

  const { error: verifyErr } = await supabase.auth.verifyOtp({
    phone: norm.e164,
    token: parsedToken.data,
    type: "phone_change",
  });
  if (verifyErr) {
    // Wrong or expired code — expected user error, no Sentry noise.
    return { ok: false, error: "wrong_code" };
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from("profiles")
    .update({
      phone: norm.e164,
      phone_verified: true,
      phone_verified_at: now,
      updated_at: now,
    })
    .eq("id", user.id);

  if (updateErr) {
    // The OTP is already consumed and auth.users.phone is confirmed; only the
    // profiles mirror failed. Report it so we notice, and surface a soft error.
    console.error(
      "[GLATKO:phone] profiles verify-write failed",
      updateErr.message,
    );
    glatkoCaptureException(updateErr, { module: "phone-confirm-write" });
    return { ok: false, error: "generic" };
  }

  revalidateSecurity();
  return { ok: true };
}

/** Resends the OTP. Same flow and same per-user daily limit as the first send. */
export async function resendPhoneOtp(phone: string): Promise<StartPhoneResult> {
  return startPhoneVerification(phone);
}
