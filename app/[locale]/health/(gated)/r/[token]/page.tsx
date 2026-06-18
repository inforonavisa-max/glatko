import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { CalendarClock, MapPin } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { getAppointment } from "@/lib/saglik/booking";
import { intlLocale } from "@/lib/saglik/intl";
import { ManageAppointment } from "@/components/glatko-saglik/ManageAppointment";
import { DataRightsRequest } from "@/components/glatko-saglik/DataRightsRequest";

type Props = {
  params:
    | Promise<{ locale: string; token: string }>
    | { locale: string; token: string };
};

// Dynamic-on-demand (live appointment status via the uncached read-RPC) + noindex.
// NOTE: an unknown token calls notFound() and renders the not-found UI, but Next 14.2
// keeps HTTP 200 for notFound() in a matched dynamic page (verified: force-dynamic and
// revalidate=0 both 200; a co-located not-found.tsx doesn't change it — see PR #120 C2).
// In production the flag-guard middleware 404s every gated route anyway; this is noindex,
// so the cosmetic 200 has no SEO/UX impact (the user still sees a "not found" page).
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ManageAppointmentPage({ params }: Props) {
  const { locale, token } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const l = locale as Locale;
  const d = (k: string) => t(`healthVertical.booking.${k}`);

  const appt = await getAppointment(token, l);
  if (!appt) notFound();

  const dateTime = new Intl.DateTimeFormat(intlLocale(l), {
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
          {d("manageTitle")}
        </h1>

        {/* Summary (PII-free) — mirrors the confirmation page card */}
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-premium-sm dark:border-white/10 dark:bg-white/5">
          <p className="text-base font-semibold text-gray-900 dark:text-white">
            {appt.providerTitle ? `${appt.providerTitle} ` : ""}
            {appt.providerName}
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-white/70">
            {appt.serviceName} · {appt.serviceDurationMin}{" "}
            {t("healthVertical.directory.minutesShort")}
            {appt.servicePriceEur != null ? ` · €${appt.servicePriceEur}` : ""}
          </p>
          <p className="mt-3 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
            <CalendarClock className="h-4 w-4 text-brandHealth" />
            {dateTime}
          </p>
          <p className="mt-1.5 flex items-start gap-2 text-sm text-gray-600 dark:text-white/70">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brandHealth" />
            <span>
              {appt.locationLabel}
              <br />
              {appt.locationAddress}, {appt.locationCity}
            </span>
          </p>
        </section>

        <ManageAppointment
          token={appt.manageToken}
          initialStatus={appt.status}
          locale={l}
          slotPassed={Date.parse(appt.slotStart) <= Date.now()}
        />

        {/* H10 — PDPL data-subject rights (identity already proven via manage_token). */}
        <DataRightsRequest token={appt.manageToken} />

        <Link
          href="/health"
          className="mt-8 inline-block text-sm font-medium text-brandHealth hover:underline"
        >
          {d("backToDirectory")}
        </Link>
      </div>
    </div>
  );
}
