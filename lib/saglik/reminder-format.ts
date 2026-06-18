import { getPathname } from "@/i18n/navigation";
import { getSiteUrl } from "@/lib/email/resend";
import { intlLocale } from "@/lib/saglik/intl";
import type { Locale } from "@/i18n/routing";

/**
 * H6 — shared, pure formatters for health reminder notifications.
 *
 * Extracted from lib/saglik/booking.ts so the immediate confirm dispatch (sent
 * from the booking route) and the cron-driven t24/t2/cancelled/followup dispatch
 * format the appointment date, the doctor string, and the manage/feedback URL
 * IDENTICALLY — one source, no drift. No `server-only` marker and no DB access,
 * so this is directly unit-testable under vitest.
 */

/** Localized "weekday day month, HH:MM" in the clinic timezone (Europe/Podgorica). */
export function formatAppointmentDateTime(slotStartIso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: "Europe/Podgorica",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(slotStartIso));
}

/** "Title FullName" (title optional), trimmed. */
export function formatDoctor(providerTitle: string | null, providerName: string): string {
  return `${providerTitle ? `${providerTitle} ` : ""}${providerName}`.trim();
}

/** Absolute, localized manage/feedback URL (/health/r/[token]). Pure given an explicit locale. */
export function manageUrl(manageToken: string, locale: Locale): string {
  const path = getPathname({
    href: { pathname: "/health/r/[token]", params: { token: manageToken } },
    locale,
  });
  return `${getSiteUrl()}${path}`;
}
