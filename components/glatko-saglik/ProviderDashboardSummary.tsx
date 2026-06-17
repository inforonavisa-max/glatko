"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, Plus, X } from "lucide-react";

import type { ProviderAppointment } from "@/lib/saglik/provider";
import { occupancyPercent, type Occupancy } from "@/lib/saglik/occupancy";
import { intlLocale } from "@/lib/saglik/intl";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ProviderManualBookForm } from "@/components/glatko-saglik/ProviderManualBookForm";

/**
 * Glatko Sağlık — H7b dashboard header (provider lands here). Shows the 2-day occupancy
 * gauge + today/tomorrow appointment counts and rows, and hosts the "manual add" entry
 * (phone-in booking). Mobile-first (doctors live on phones): stacked cards, no table.
 * The occupancy % is computed server-side via the SAME availability engine patients book
 * through, so it never misleads.
 */

export type ManualServiceOption = {
  id: string;
  name: string;
  durationMin: number;
  mode: "in_person" | "video" | "home_visit";
};
export type ManualLocationOption = { id: string; label: string; city: string };

export function ProviderDashboardSummary({
  locale,
  occupancy,
  today,
  tomorrow,
  services,
  locations,
  providerId,
}: {
  locale: Locale;
  occupancy: Occupancy;
  today: ProviderAppointment[];
  tomorrow: ProviderAppointment[];
  services: ManualServiceOption[];
  locations: ManualLocationOption[];
  providerId: string;
}) {
  const t = useTranslations("healthVertical");
  const d = (k: string) => t(`pro.dashboard.${k}`);
  const [adding, setAdding] = useState(false);

  const pct = occupancyPercent(occupancy);
  const canManualBook = services.length > 0 && locations.length > 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-light tracking-tight text-gray-900 dark:text-white">
            {d("title")}
          </h1>
          <Link
            href="/health-pro/randevular/override"
            className="mt-1 inline-block text-xs font-medium text-brandHealth-700 underline-offset-2 hover:underline dark:text-brandHealth"
          >
            {d("manageOverrides")}
          </Link>
        </div>
        {canManualBook && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            aria-expanded={adding}
            className="inline-flex items-center gap-1.5 rounded-full bg-brandHealth-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brandHealth-700"
          >
            {adding ? <X className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            {adding ? d("manualCancel") : d("manualAdd")}
          </button>
        )}
      </div>

      {adding && canManualBook && (
        <div className="mt-4 rounded-2xl border border-brandHealth-200 bg-white/70 p-4 dark:border-brandHealth/30 dark:bg-white/5">
          <ProviderManualBookForm
            locale={locale}
            providerId={providerId}
            services={services}
            locations={locations}
            onBooked={() => setAdding(false)}
          />
        </div>
      )}

      {/* Occupancy gauge (2-day window) */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-white/40">
            {d("occupancy")}
          </p>
          <p className="mt-1 text-3xl font-light text-brandHealth-700 dark:text-brandHealth">
            {pct}%
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-brandHealth-500"
              style={{ width: `${pct}%` }}
              aria-hidden
            />
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-white/40">
            {d("occupancyDetail")
              .replace("{booked}", String(occupancy.booked))
              .replace("{total}", String(occupancy.total))}
          </p>
        </div>
        <DayCount label={d("today")} count={today.length} />
        <DayCount label={d("tomorrow")} count={tomorrow.length} />
      </div>

      {/* Today + tomorrow rows */}
      <DaySection locale={locale} label={d("today")} empty={d("noneToday")} items={today} />
      <DaySection
        locale={locale}
        label={d("tomorrow")}
        empty={d("noneTomorrow")}
        items={tomorrow}
      />
    </div>
  );
}

function DayCount({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-white/40">
        {label}
      </p>
      <p className="mt-1 text-3xl font-light text-gray-900 dark:text-white">{count}</p>
    </div>
  );
}

function DaySection({
  locale,
  label,
  empty,
  items,
}: {
  locale: Locale;
  label: string;
  empty: string;
  items: ProviderAppointment[];
}) {
  const time = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale(locale), {
      timeZone: "Europe/Podgorica",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));

  return (
    <div className="mt-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
        <CalendarDays className="h-4 w-4 text-brandHealth-600 dark:text-brandHealth" aria-hidden />
        {label}
      </h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-gray-400 dark:text-white/30">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((a) => (
            <li
              key={a.appointmentId}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white/60 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
            >
              <span className="font-mono font-semibold text-gray-900 dark:text-white">
                {time(a.slotStart)}
              </span>
              <span className="truncate text-gray-700 dark:text-white/70">{a.patientName}</span>
              <span className="ml-auto truncate text-xs text-gray-400 dark:text-white/40">
                {a.serviceName}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
