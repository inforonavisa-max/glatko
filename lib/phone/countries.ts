/**
 * Country dial-code options for the phone-login selector.
 *
 * Client-safe: this is a plain constant with NO libphonenumber-js import, so it
 * adds nothing to the client bundle beyond the list itself. The actual E.164
 * parsing/validation runs server-side in lib/phone/login-phone.ts using the
 * selected ISO region.
 *
 * Default market is Montenegro (ME, +382). The list covers Glatko's primary
 * markets, the languages we localize for, Balkan neighbours, and the main
 * diaspora destinations (DE/AT). Flag emoji are language-neutral, so the
 * selector needs no per-locale translation.
 */
export type PhoneCountry = {
  /** ISO-3166 alpha-2, passed to libphonenumber-js as the default region. */
  iso: string;
  /** International dial code, without the leading "+". */
  dial: string;
  /** Flag emoji shown in the selector. */
  flag: string;
};

export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  { iso: "ME", dial: "382", flag: "🇲🇪" },
  { iso: "RS", dial: "381", flag: "🇷🇸" },
  { iso: "BA", dial: "387", flag: "🇧🇦" },
  { iso: "HR", dial: "385", flag: "🇭🇷" },
  { iso: "AL", dial: "355", flag: "🇦🇱" },
  { iso: "TR", dial: "90", flag: "🇹🇷" },
  { iso: "DE", dial: "49", flag: "🇩🇪" },
  { iso: "AT", dial: "43", flag: "🇦🇹" },
  { iso: "IT", dial: "39", flag: "🇮🇹" },
  { iso: "FR", dial: "33", flag: "🇫🇷" },
  { iso: "GB", dial: "44", flag: "🇬🇧" },
  { iso: "RU", dial: "7", flag: "🇷🇺" },
  { iso: "UA", dial: "380", flag: "🇺🇦" },
] as const;

/** Default selected country for the phone-login form. */
export const DEFAULT_PHONE_COUNTRY = "ME";

export const PHONE_COUNTRY_ISOS: readonly string[] = PHONE_COUNTRIES.map(
  (c) => c.iso,
);

export function isSupportedPhoneCountry(iso: string): boolean {
  return PHONE_COUNTRY_ISOS.includes(iso);
}
