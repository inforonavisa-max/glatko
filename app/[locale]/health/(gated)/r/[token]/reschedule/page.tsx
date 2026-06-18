import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { getAppointment } from "@/lib/saglik/booking";
import { getBookingOptions } from "@/lib/saglik/queries";
import { intlLocale } from "@/lib/saglik/intl";
import { RescheduleFlow } from "@/components/glatko-saglik/RescheduleFlow";

type Props = {
  params:
    | Promise<{ locale: string; token: string }>
    | { locale: string; token: string };
};

// Live appointment status via the uncached read-RPC + noindex (SEO quarantine).
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function RescheduleAppointmentPage({ params }: Props) {
  const { locale, token } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const l = locale as Locale;
  const d = (k: string) => t(`healthVertical.booking.${k}`);

  const appt = await getAppointment(token, l);
  if (!appt) notFound();

  const slotPassed = Date.parse(appt.slotStart) <= Date.now();
  // Inert if not confirmed (already cancelled/moved/completed) or the slot has passed:
  // graceful screen, never an action (mirrors the manage page's status-driven logic).
  const inert = appt.status !== "confirmed" || slotPassed;

  if (inert) {
    return (
      <div className="mx-auto max-w-md px-4 pb-24 pt-40 text-center">
        <AlertTriangle className="mx-auto h-9 w-9 text-gray-400" />
        <h1 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
          {slotPassed ? d("passedTitle") : d("rescheduleUnavailableTitle")}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500 dark:text-white/50">
          {slotPassed ? d("passedBody") : d("rescheduleUnavailableBody")}
        </p>
        <Link
          href={{ pathname: "/health/r/[token]", params: { token } }}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40"
        >
          {d("manageCta")}
        </Link>
      </div>
    );
  }

  // Bootstrap the reused widget, locked to the ORIGINAL service + location.
  const options = await getBookingOptions(appt.providerSlug, l);
  const service = options?.services.find((s) => s.id === appt.serviceId);
  const location = options?.locations.find((loc) => loc.id === appt.locationId);
  // The provider/service/location must still be bookable; otherwise reschedule is
  // unavailable (e.g. the service was deactivated) → graceful fallback to manage.
  if (!options || !service || !location) {
    return (
      <div className="mx-auto max-w-md px-4 pb-24 pt-40 text-center">
        <AlertTriangle className="mx-auto h-9 w-9 text-gray-400" />
        <h1 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
          {d("rescheduleUnavailableTitle")}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500 dark:text-white/50">
          {d("rescheduleUnavailableBody")}
        </p>
        <Link
          href={{ pathname: "/health/r/[token]", params: { token } }}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40"
        >
          {d("manageCta")}
        </Link>
      </div>
    );
  }

  const currentDateTime = new Intl.DateTimeFormat(intlLocale(l), {
    timeZone: "Europe/Podgorica",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(appt.slotStart));

  return (
    <div className="bg-brandHealth-50/40 pb-16 dark:bg-transparent">
      <div className="mx-auto max-w-xl px-4 pb-16 pt-28">
        <h1 className="font-serif text-3xl font-light tracking-tight text-gray-900 dark:text-white">
          {d("rescheduleTitle")}
        </h1>

        {/* Current appointment summary (PII-free) — what is being moved. */}
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-premium-sm dark:border-white/10 dark:bg-white/5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
            {d("rescheduleCurrentLabel")}
          </p>
          <p className="mt-2 text-base font-semibold text-gray-900 dark:text-white">
            {appt.providerTitle ? `${appt.providerTitle} ` : ""}
            {appt.providerName}
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-white/70">
            {appt.serviceName} · {appt.serviceDurationMin}{" "}
            {t("healthVertical.directory.minutesShort")}
          </p>
          <p className="mt-3 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
            <CalendarClock className="h-4 w-4 text-brandHealth" />
            {currentDateTime}
          </p>
        </section>

        <RescheduleFlow
          token={token}
          slug={appt.providerSlug}
          providerId={options.providerId}
          service={service}
          location={location}
          locale={l}
        />

        <Link
          href={{ pathname: "/health/r/[token]", params: { token } }}
          className="mt-8 inline-block text-sm font-medium text-brandHealth hover:underline"
        >
          {d("backToManage")}
        </Link>
      </div>
    </div>
  );
}
