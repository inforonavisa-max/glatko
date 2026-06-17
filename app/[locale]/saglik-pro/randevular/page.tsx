import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";

import { routing, type Locale } from "@/i18n/routing";
import { createClient } from "@/supabase/server";
import { isHealthVerticalEnabled } from "@/lib/saglik/flags";
import {
  getProviderDashboard,
  getOwnProvider,
  listProviderAppointments,
  type ProviderAppointment,
} from "@/lib/saglik/provider";
import {
  generateAvailability,
  DEFAULT_TIME_ZONE,
  type AvailabilityInputs,
} from "@/lib/saglik/availability";
import { computeOccupancy, countSlots, type Occupancy } from "@/lib/saglik/occupancy";
import { PageBackground } from "@/components/ui/PageBackground";
import { Link } from "@/i18n/navigation";
import { SaglikProNav } from "@/components/glatko-saglik/SaglikProNav";
import { ProviderDashboardSummary } from "@/components/glatko-saglik/ProviderDashboardSummary";
import { ProviderAppointmentList } from "@/components/glatko-saglik/ProviderAppointmentList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const MS_PER_DAY = 86_400_000;

/** Today's local (render TZ) date "YYYY-MM-DD". */
function localToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TIME_ZONE }).format(now);
}
/** "YYYY-MM-DD" + n days (pure calendar arithmetic, UTC-safe). */
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + n * MS_PER_DAY);
  const p = (x: number) => (x < 10 ? `0${x}` : String(x));
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

/**
 * Occupancy for the [fromDate, toDate] local window: run the SAME pure engine TWICE —
 * once with the real busy[] (free slots) and once with busy=[] (capacity). Using the
 * identical engine for numerator + denominator guarantees the % matches exactly what
 * patients can book (buffer / min-notice / grid / daily-cap / overrides honored both
 * times). confirmedCount = busy.length within the window.
 */
function occupancyForWindow(
  inputs: AvailabilityInputs,
  fromDate: string,
  toDate: string,
  now: Date,
): Occupancy {
  const engineFrom = new Date(`${fromDate}T12:00:00Z`);
  const engineTo = new Date(`${toDate}T12:00:00Z`);
  const opts = { from: engineFrom, to: engineTo, now, timeZone: DEFAULT_TIME_ZONE };

  if (!inputs.serviceDurationMin || inputs.serviceDurationMin <= 0) {
    return computeOccupancy(0, 0, 0);
  }
  const freeDays = generateAvailability(inputs, opts);
  const capacityDays = generateAvailability({ ...inputs, busy: [], holds: [] }, opts);
  // booked = confirmed appointments whose start falls in the window.
  const fromMs = new Date(`${fromDate}T00:00:00Z`).getTime() - MS_PER_DAY;
  const toMs = new Date(`${toDate}T23:59:59Z`).getTime() + MS_PER_DAY;
  const booked = inputs.busy.filter((b) => {
    const t = Date.parse(b.start);
    return Number.isFinite(t) && t >= fromMs && t <= toMs;
  }).length;
  return computeOccupancy(countSlots(capacityDays), countSlots(freeDays), booked);
}

export default async function RandevularPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  if (!isHealthVerticalEnabled()) notFound();
  setRequestLocale(locale);
  const l = locale as Locale;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const now = new Date();
  const today = localToday(now);
  const tomorrow = addDays(today, 1);
  // RPC window ±1 day (boundary-safe; the engine ignores the surplus).
  const rpcFrom = new Date(`${today}T12:00:00Z`).getTime() - MS_PER_DAY;
  const rpcTo = new Date(`${tomorrow}T12:00:00Z`).getTime() + MS_PER_DAY;

  const [dashboard, draft, upcoming, t] = await Promise.all([
    getProviderDashboard(user.id, new Date(rpcFrom).toISOString(), new Date(rpcTo).toISOString(), l),
    getOwnProvider(user.id, l),
    listProviderAppointments(user.id, l, "upcoming", null),
    getTranslations({ locale, namespace: "healthVertical" }),
  ]);

  // No provider row yet → onboarding nudge (mirrors profil/takvim empty state).
  if (!draft || !dashboard) {
    return (
      <PageBackground opacity={0.08}>
        <div className="pt-16">
          <SaglikProNav />
          <div className="mx-auto max-w-3xl px-4 pb-24 pt-8">
            <div className="rounded-2xl border border-dashed border-brandHealth-200 bg-white/60 p-8 text-center dark:border-brandHealth/30 dark:bg-white/5">
              <h1 className="font-serif text-xl font-light text-gray-900 dark:text-white">
                {t("pro.profile.noProviderTitle")}
              </h1>
              <p className="mx-auto mt-2 max-w-sm text-sm text-gray-600 dark:text-white/60">
                {t("pro.profile.noProviderBody")}
              </p>
              <Link
                href="/health-pro/basvuru"
                className="mt-5 inline-flex items-center rounded-full bg-brandHealth-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brandHealth-700"
              >
                {t("pro.profile.goToOnboarding")}
              </Link>
            </div>
          </div>
        </div>
      </PageBackground>
    );
  }

  const occupancy = occupancyForWindow(dashboard.availabilityInputs, today, tomorrow, now);

  // Split the dashboard appointments into today / tomorrow buckets by local date.
  const dayOf = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TIME_ZONE }).format(new Date(iso));
  const todays: ProviderAppointment[] = dashboard.appointments.filter(
    (a) => dayOf(a.slotStart) === today,
  );
  const tomorrows: ProviderAppointment[] = dashboard.appointments.filter(
    (a) => dayOf(a.slotStart) === tomorrow,
  );

  return (
    <PageBackground opacity={0.08}>
      <div className="pt-16">
        <SaglikProNav />
        <div className="mx-auto max-w-3xl px-4 pb-24 pt-8">
          <ProviderDashboardSummary
            locale={l}
            occupancy={occupancy}
            today={todays}
            tomorrow={tomorrows}
            services={draft.services
              .filter((s) => s.isActive)
              .map((s) => ({
                id: s.id,
                name: s.name[l] ?? s.name.en ?? s.name.me ?? Object.values(s.name)[0] ?? "",
                durationMin: s.durationMin,
                mode: s.mode,
              }))}
            locations={draft.locations.map((loc) => ({
              id: loc.id,
              label: loc.label,
              city: loc.city,
            }))}
            providerId={draft.providerId}
          />
          <div className="mt-8">
            <ProviderAppointmentList locale={l} initialAppointments={upcoming} />
          </div>
        </div>
      </div>
    </PageBackground>
  );
}
