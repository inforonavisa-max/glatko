import Link from "next/link";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Activity, CalendarCheck, Stethoscope, UserCheck, Users } from "lucide-react";
import { createClient } from "@/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { listProviders, getMetrics } from "@/lib/saglik/admin";
import { noShowPercent } from "@/lib/saglik/admin-metrics";
import type { Locale } from "@/i18n/routing";
import type { ProviderQueueFilter, ProviderVerificationStatus } from "@/lib/saglik/admin";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
  searchParams: Promise<{ status?: string }> | { status?: string };
};

// Filter chips — labels TODO i18n (hardcoded TR per existing professionals convention).
const STATUS_FILTER_OPTIONS: Array<{ value: ProviderQueueFilter; label: string }> = [
  { value: "pending", label: "Beklemede" },
  { value: "approved", label: "Onaylı" },
  { value: "rejected", label: "Reddedilmiş" },
  { value: "all", label: "Tümü" },
];

const STATUS_STYLES: Record<ProviderVerificationStatus, string> = {
  pending:
    "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-500/30 dark:bg-yellow-900/20 dark:text-yellow-300",
  approved:
    "border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-900/20 dark:text-green-300",
  rejected:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-300",
};

const STATUS_KEYS: Record<ProviderVerificationStatus, string> = {
  pending: "admin.health.statusPending",
  approved: "admin.health.statusApproved",
  rejected: "admin.health.statusRejected",
};

export default async function HealthAdminPage({ params, searchParams }: Props) {
  const { locale } = await Promise.resolve(params);
  const sp = await Promise.resolve(searchParams);
  setRequestLocale(locale);

  // Defensive re-check (the layout already gates; pages re-check per spec).
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) notFound();

  const t = await getTranslations();

  const validFilters: ProviderQueueFilter[] = ["pending", "approved", "rejected", "all"];
  const filter = (sp.status ?? "pending") as ProviderQueueFilter;
  const safeFilter = validFilters.includes(filter) ? filter : "pending";

  const nowIso = new Date().toISOString();
  const [providers, metrics] = await Promise.all([
    listProviders(safeFilter, locale as Locale),
    getMetrics(nowIso),
  ]);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-6 w-6 text-brandHealth-700 dark:text-brandHealth" aria-hidden />
          <h1 className="font-serif text-2xl font-bold text-gray-900 dark:text-white md:text-3xl">
            {t("admin.health.title")}
          </h1>
        </div>
        <div className="mt-2 h-0.5 w-12 rounded-full bg-gradient-to-r from-brandHealth to-brandHealth-700" />
        <p className="mt-2 text-sm text-gray-500 dark:text-white/50">
          {t("admin.health.subtitle")}
        </p>
      </div>

      {/* Metric cards */}
      <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={CalendarCheck}
          label={t("admin.health.metricWeeklyBookings")}
          value={metrics ? String(metrics.weeklyBookings) : "—"}
        />
        <MetricCard
          icon={Activity}
          label={t("admin.health.metricNoShowRate")}
          value={
            metrics
              ? `${noShowPercent(metrics.completedCount, metrics.noShowCount)}%`
              : "—"
          }
        />
        <MetricCard
          icon={UserCheck}
          label={t("admin.health.metricPending")}
          value={metrics ? String(metrics.pendingCount) : "—"}
        />
        <MetricCard
          icon={Users}
          label={t("admin.health.metricWaitlist")}
          value={metrics ? String(metrics.waitlistCount) : "—"}
        />
      </section>

      {/* Sub-nav to appointments + audit */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href={`/${locale}/admin/saglik/randevular`}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-white/[0.08] dark:text-white/70 dark:hover:bg-white/[0.04]"
        >
          {t("admin.health.appointmentsLink")}
        </Link>
        <Link
          href={`/${locale}/admin/saglik/audit`}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-white/[0.08] dark:text-white/70 dark:hover:bg-white/[0.04]"
        >
          {t("admin.health.auditLink")}
        </Link>
        <Link
          href={`/${locale}/admin/saglik/talepler`}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-white/[0.08] dark:text-white/70 dark:hover:bg-white/[0.04]"
        >
          {t("admin.health.dataRequestsLink")}
        </Link>
        <Link
          href={`/${locale}/admin/saglik/consent`}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-white/[0.08] dark:text-white/70 dark:hover:bg-white/[0.04]"
        >
          {t("admin.health.consentLink")}
        </Link>
      </div>

      {/* Verification queue */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-lg font-semibold text-gray-900 dark:text-white">
            {t("admin.health.queueTitle")}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-white/50">
            {providers.length} {t("admin.health.records")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTER_OPTIONS.map((opt) => {
            const isActive = safeFilter === opt.value;
            const href = `?status=${opt.value}`;
            return (
              <Link
                key={opt.value}
                href={href}
                className={
                  isActive
                    ? "rounded-lg bg-brandHealth/15 px-3 py-1.5 text-xs font-medium text-brandHealth-700 dark:text-brandHealth"
                    : "rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-white/60 dark:hover:bg-white/[0.04]"
                }
              >
                {opt.label}
              </Link>
            );
          })}
        </div>
      </div>

      {providers.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-gray-200/50 bg-white/70 px-6 py-16 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
          <Stethoscope className="h-14 w-14 text-brandHealth/30" strokeWidth={1.5} />
          <h3 className="mt-4 font-serif text-lg font-semibold text-gray-700 dark:text-white/70">
            {t("admin.health.queueEmpty")}
          </h3>
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((p) => {
            const initials = p.fullName
              .trim()
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0])
              .join("")
              .toUpperCase();
            const specialtyLabel = p.specialties
              .map((s) => s.name ?? s.slug)
              .filter(Boolean)
              .slice(0, 3)
              .join(", ");
            return (
              <div
                key={p.id}
                className="rounded-2xl border border-gray-200/50 bg-white/70 p-5 backdrop-blur-sm transition-all duration-300 hover:border-brandHealth/20 hover:shadow-md dark:border-white/[0.08] dark:bg-white/[0.03]"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brandHealth to-brandHealth-700 text-sm font-semibold text-white">
                      {initials || "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                        {p.title ? `${p.title} ` : ""}
                        {p.fullName}
                      </p>
                      <p className="truncate text-xs text-gray-500 dark:text-white/50">
                        {specialtyLabel || p.providerType}
                        {p.primaryCity ? ` · ${p.primaryCity}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {p.isPublished && (
                      <span className="hidden rounded-full border border-brandHealth/30 bg-brandHealth-50 px-2.5 py-1 text-[11px] font-medium text-brandHealth-700 sm:inline dark:bg-brandHealth/10 dark:text-brandHealth">
                        {t("admin.health.live")}
                      </span>
                    )}
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_STYLES[p.verificationStatus]}`}
                    >
                      {t(STATUS_KEYS[p.verificationStatus])}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-white/[0.06]">
                  <span className="text-xs text-gray-400 dark:text-white/40">
                    {new Date(p.createdAt).toLocaleDateString(locale, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <Link
                    href={`/${locale}/admin/saglik/${p.id}`}
                    className="text-xs font-medium text-brandHealth-700 transition-colors hover:text-brandHealth dark:text-brandHealth dark:hover:opacity-80"
                  >
                    {t("admin.health.viewDetail")} &rarr;
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200/60 bg-white/70 p-5 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brandHealth-50 dark:bg-brandHealth/15">
        <Icon className="h-4 w-4 text-brandHealth-700 dark:text-brandHealth" aria-hidden />
      </div>
      <p className="text-3xl font-bold tabular-nums text-gray-900 dark:text-white">{value}</p>
      <p className="mt-1 text-xs font-medium text-gray-500 dark:text-white/50">{label}</p>
    </div>
  );
}
