"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { CalendarClock, MapPin, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { intlLocale } from "@/lib/saglik/intl";
import type { UserAppointment } from "@/lib/saglik/booking";

/**
 * Glatko Sağlık — H9 "Randevularım" presentational list (Client Component).
 *
 * Upcoming vs past sections, status badges, a manage deep-link per row. No PII
 * beyond the PII-free summary the read-RPC returns. Each row links to
 * /health/r/[token] (cancel/reschedule). 9-locale via next-intl; dates in the
 * clinic timezone (Europe/Podgorica), sr/me Latin via intlLocale.
 */

type Props = {
  appointments: UserAppointment[];
  locale: string;
};

const STATUS_TONE: Record<UserAppointment["status"], string> = {
  confirmed: "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  cancelled: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-white/50",
  completed: "bg-brandHealth-50 text-brandHealth-700 dark:bg-brandHealth/15 dark:text-brandHealth",
  no_show: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
};

export function UserAppointmentsList({ appointments, locale }: Props) {
  const t = useTranslations("healthVertical.account");
  const bk = useTranslations("healthVertical.booking");

  const fmt = useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocale(locale), {
        timeZone: "Europe/Podgorica",
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    [locale],
  );

  const now = Date.now();
  const { upcoming, past } = useMemo(() => {
    const up: UserAppointment[] = [];
    const pa: UserAppointment[] = [];
    for (const a of appointments) {
      // Upcoming = confirmed AND still in the future; everything else is history.
      if (a.status === "confirmed" && Date.parse(a.slotStart) > now) up.push(a);
      else pa.push(a);
    }
    // Upcoming soonest-first; past most-recent-first (RPC returns slot desc).
    up.sort((x, y) => Date.parse(x.slotStart) - Date.parse(y.slotStart));
    return { upcoming: up, past: pa };
  }, [appointments, now]);

  function statusLabel(s: UserAppointment["status"]): string {
    return t(`status.${s}`);
  }

  function Card({ a }: { a: UserAppointment }) {
    return (
      <Link
        href={{ pathname: "/health/r/[token]", params: { token: a.manageToken } }}
        className="group flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-premium-sm transition-colors hover:border-gray-300 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
              {a.providerTitle ? `${a.providerTitle} ` : ""}
              {a.providerName}
            </p>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[a.status]}`}>
              {statusLabel(a.status)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm text-gray-600 dark:text-white/70">{a.serviceName}</p>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-white">
            <CalendarClock className="h-4 w-4 shrink-0 text-brandHealth" />
            {fmt.format(new Date(a.slotStart))}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500 dark:text-white/50">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-brandHealth" />
            {a.locationLabel}, {a.locationCity}
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 dark:text-white/40" />
      </Link>
    );
  }

  if (appointments.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white/50 p-10 text-center dark:border-white/15 dark:bg-white/5">
        <CalendarClock className="mx-auto h-9 w-9 text-gray-400 dark:text-white/40" />
        <p className="mt-3 text-sm font-medium text-gray-900 dark:text-white">{t("emptyTitle")}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500 dark:text-white/50">{t("emptyBody")}</p>
        <Link
          href="/health"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40"
        >
          {bk("backToDirectory")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
            {t("upcomingTitle")}
          </h2>
          <div className="space-y-3">
            {upcoming.map((a) => (
              <Card key={a.manageToken} a={a} />
            ))}
          </div>
        </section>
      )}
      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
            {t("pastTitle")}
          </h2>
          <div className="space-y-3">
            {past.map((a) => (
              <Card key={a.manageToken} a={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
