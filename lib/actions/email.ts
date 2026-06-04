"use server";

import { z } from "zod";
import { createClient } from "@/supabase/server";
import { checkEmailAddLimit } from "@/lib/ratelimit/email-add-limit";
import { glatkoCaptureException } from "@/lib/sentry/glatko-capture";

/**
 * Sprint 3 — "add a backup email" for phone-only users (auth.users.email NULL).
 *
 * This is the trigger side only. updateUser({ email }) stages an email_change
 * and fires the Send Email Hook → Resend confirmation mail (localized, already
 * built). The user finishes by clicking the link → /auth/confirm?type=
 * email_change → verifyOtp → auth.users.email is set. After that, setPassword
 * (lib/actions/profile.ts) works and the user has an email+password backup
 * login alongside phone-OTP.
 *
 * Never touches the existing email-hook / confirm route / setPassword — only
 * calls updateUser, mirroring the phone-verification action shape.
 */

export type AddEmailError =
  | "unauthorized"
  | "invalid_email"
  | "already_has_email"
  | "email_in_use"
  | "rate_limited"
  | "generic";

export type AddEmailResult =
  | { ok: true; email: string }
  | { ok: false; error: AddEmailError };

const emailSchema = z.string().trim().toLowerCase().email().max(254);

/** Mirrors lib/actions/phone.ts isPhoneInUse: detect "email already registered". */
function isEmailInUse(error: {
  code?: string;
  message?: string;
  status?: number;
}): boolean {
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "email_exists" ||
    code === "user_already_exists" ||
    msg.includes("already been registered") ||
    msg.includes("already registered") ||
    msg.includes("already in use") ||
    msg.includes("email address is already") ||
    msg.includes("a user with this email")
  );
}

export async function addEmail(rawEmail: string): Promise<AddEmailResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  // This flow is strictly for accounts that have no email yet.
  if (user.email) return { ok: false, error: "already_has_email" };

  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, error: "invalid_email" };
  const email = parsed.data;

  const limit = await checkEmailAddLimit(user.id);
  if (!limit.allowed) return { ok: false, error: "rate_limited" };

  // Stages email_change + fires the confirmation mail (hook → Resend). Because
  // there is no current email, Supabase confirms the new address only (verified
  // against the live "Secure email change" setting during testing).
  const { error } = await supabase.auth.updateUser({ email });
  if (error) {
    if (isEmailInUse(error as { code?: string; message?: string })) {
      return { ok: false, error: "email_in_use" };
    }
    console.error("[GLATKO:add-email] updateUser(email) failed", error.message);
    glatkoCaptureException(error, { module: "add-email" });
    return { ok: false, error: "generic" };
  }

  return { ok: true, email };
}
