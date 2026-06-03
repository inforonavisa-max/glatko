import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { isSupportedPhoneCountry } from "@/lib/phone/countries";

export type LoginPhoneResult = { e164: string } | { error: "invalid" };

/**
 * Server-side E.164 parse + validation for the phone-LOGIN flow.
 *
 * Imported ONLY by the "use server" action (lib/actions/phone-login.ts), so the
 * libphonenumber-js metadata never ships to the client bundle.
 *
 * Behaviour:
 *   • International input ("+90 532…", "0049…") parses to its own country; the
 *     selected region is ignored in that case.
 *   • National input is interpreted for `regionIso` (e.g. "069…" + ME → +382…).
 *   • Validity is checked with libphonenumber-js `.isValid()`, so numbers that
 *     are the wrong length/prefix for their country are rejected (not just any
 *     7–15 digit string).
 */
export function parseLoginPhone(
  input: string,
  regionIso: string,
): LoginPhoneResult {
  const raw = (input ?? "").trim();
  if (!raw) return { error: "invalid" };

  const region = (
    isSupportedPhoneCountry(regionIso) ? regionIso : "ME"
  ) as CountryCode;

  try {
    const parsed = parsePhoneNumberFromString(raw, region);
    if (!parsed || !parsed.isValid()) return { error: "invalid" };
    return { e164: parsed.number };
  } catch {
    return { error: "invalid" };
  }
}
