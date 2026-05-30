/**
 * E.164 phone normalization + validation — single source of truth.
 *
 * Both the admin provider forms (lib/validations/admin/provider.ts) and the
 * phone-verification flow (lib/actions/phone.ts, app/api/auth/sms-hook) import
 * from here so the regex never drifts between call sites.
 *
 * Default market is Montenegro (+382): a local number entered without a
 * country code — e.g. "069 868 069" — normalizes to "+38269868069".
 */

/**
 * Lenient E.164-ish matcher for raw form-field validation, where the user may
 * omit the leading "+". Mirrors the regex that previously lived inline in the
 * admin provider schema, kept here so that import keeps behaving identically.
 */
export const PHONE_E164 = /^\+?[1-9]\d{6,14}$/;

/**
 * Strict E.164: requires the leading "+". Any value returned by
 * normalizeToE164 satisfies this.
 */
const STRICT_E164 = /^\+[1-9]\d{6,14}$/;

/** ISO-3166 alpha-2 → dial code, for normalizing local (national) numbers. */
const COUNTRY_DIAL_CODES: Record<string, string> = {
  ME: "382", // Montenegro — default market
};

export type NormalizeResult = { e164: string } | { error: string };

/** True when `phone` is a fully-qualified E.164 string (leading "+" required). */
export function isValidE164(phone: string): boolean {
  return STRICT_E164.test(phone.trim());
}

/**
 * Normalizes loose user input into a strict E.164 number.
 *
 * Accepts "+382 69 868 069", "0038269868069", "069 868 069", "69868069".
 * - Strips spaces, dashes, parentheses, dots.
 * - A leading "00" international prefix becomes "+".
 * - A number without "+" is treated as national for `defaultCountry`: a single
 *   leading trunk "0" is dropped and the dial code is prepended.
 *
 * Returns `{ e164 }` on success, or `{ error }` with a stable machine code
 * ("empty" | "invalid" | "unsupported_country") the caller maps to a
 * localized message.
 */
export function normalizeToE164(
  input: string,
  defaultCountry = "ME",
): NormalizeResult {
  const raw = (input ?? "").trim();
  if (!raw) return { error: "empty" };

  const startsWithPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return { error: "invalid" };

  let e164: string;
  if (startsWithPlus) {
    e164 = `+${digits}`;
  } else if (digits.startsWith("00")) {
    e164 = `+${digits.slice(2)}`;
  } else {
    const dial = COUNTRY_DIAL_CODES[defaultCountry];
    if (!dial) return { error: "unsupported_country" };
    const national = digits.replace(/^0+/, "");
    if (!national) return { error: "invalid" };
    e164 = `+${dial}${national}`;
  }

  if (!isValidE164(e164)) return { error: "invalid" };
  return { e164 };
}
