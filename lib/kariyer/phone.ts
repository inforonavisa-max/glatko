import "server-only";

import { createHash, randomInt } from "crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Glatko Kariyer — phone + OTP helpers (server-only).
 *
 * One place owns: E.164 normalization (Montenegro default), the salted phone
 * hash used as the worker/otp lookup key, and 6-digit OTP code generation +
 * peppered hashing. The OTP plain code is NEVER persisted — only otpCodeHash()
 * goes to the DB. The pepper is a server secret (not in the DB), so a DB leak
 * alone cannot brute-force codes/phones.
 */

const PEPPER =
  process.env.CAREER_OTP_PEPPER || process.env.RATE_LIMIT_SALT || "glatko-career-dev-pepper";

/** Normalize to E.164 ("+382…"), Montenegro as the default region. null if invalid. */
export function normalizePhone(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;
  const parsed = parsePhoneNumberFromString(raw.trim(), "ME");
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number; // E.164
}

/** Stable, peppered SHA-256 of the E.164 phone — the otp/worker lookup key. */
export function phoneHash(e164: string): string {
  return createHash("sha256").update(`${e164}:${PEPPER}`).digest("hex");
}

/** Cryptographically-random 6-digit code (000000–999999). */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Peppered SHA-256 of the code — only this is stored / compared. */
export function otpCodeHash(code: string): string {
  return createHash("sha256").update(`${code}:${PEPPER}`).digest("hex");
}
