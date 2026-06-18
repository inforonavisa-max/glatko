import Link from "next/link";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, CalendarX } from "lucide-react";
import { createClient } from "@/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { listAppointments } from "@/lib/saglik/admin";
import type { Locale } from "@/i18n/routing";
import type { AdminAppointmentStatus } from "@/lib/saglik/admin";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
  searchParams:
    | Promise<{ status?: string; provider?: string; from?: string; to?: string; page?: string }>
    | { status?: string; provider?: string; from?: string; to?: string; page?: string };
};

const PAGE_SIZE = 50;

// Status filter chips — labels TODO i18n (hardcoded TR operational per existing convention).
const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Tümü" },
  { value: "confirmed", label: "Onaylı" },
  { value: "completed", label: "Tamamlandı" },
  { value: "no_show", label: "Gelmedi" },
  { value: "cancelled", label: "İptal" },
];

const STATUS_STYLES: Record<AdminAppointmentStatus, string> = {
  confirmed:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-900/20 dark:text-blue-300",
  completed:
    "border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-900/20 dark:text-green-300",
  no_show:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-300",
  cancelled:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-300",
};

const VALID_STATUSES: AdminAppointmentStatus[] = [
  "confirmed",
  "completed",
  "no_show",
  "cancelled",
];

/** Parse a YYYY-MM-DD into a UTC ISO instant (start of day), or null. */
function parseDate(raw: string | undefined, endOfDay = false): string | null {
  if (!raw) return null;
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(raw.trim());
  if (!m) return null;
  const iso = endOfDay ? `${raw}T23:59:59.999Z` : `${raw}T00:00:00.000Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default async function HealthAppointmentsPage({ params, searchParams }: Props) {
  const { locale } = await Promise.resolve(params);
  const sp = await Promise.resolve(searchParams);
  setRequestLocale(locale);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) notFound();

  const t = await getTranslations();

  const statusParam = sp.status ?? "all";
  const status =
    statusParam !== "all" && VALID_STATUSES.includes(statusParam as AdminAppointmentStatus)
      ? (statusParam as AdminAppointmentStatus)
      : null;
  const providerId = sp.provider?.trim() || null;
  const fromIso = parseDate(sp.from, false);
  const toIso = parseDate(sp.to, true);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // Fetch PAGE_SIZE + 1 to detect a next page without a count query.
  const rows = await listAppointments(locale as Locale, {
    status,
    providerId,
    fromIso,
    toIso,
    limit: PAGE_SIZE + 1,
    offset,
  });
  const hasNext = rows.length > PAGE_SIZE;
  const pageRows = hasNext ? rows.slice(0, PAGE_SIZE) : rows;

  function buildQuery(overrides: Record<string, string | undefined>): string {
    const q = new URLSearchParams();
    const merged = {
      status: statusParam !== "all" ? statusParam : undefined,
      provider: providerId ?? undefined,
      from: sp.from || undefined,
      to: sp.to || undefined,
      page: String(page),
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `?${s}` : "";
  }

  return (
    <div>
      <Link
        href={`/${locale}/admin/saglik`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-white/50 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("common.back")}
      </Link>

      <div className="mb-6">
        <h1 className="font-serif text-2xl font-bold text-gray-900 dark:text-white md:text-3xl">
          {t("admin.health.appointmentsTitle")}
        </h1>
        <div className="mt-2 h-0.5 w-12 rounded-full bg-gradient-to-r from-brandHealth to-brandHealth-700" />
      </div>

      {/* Filters */}
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((opt) => {
            const isActive = statusParam === opt.value;
            return (
              <Link
                key={opt.value}
                href={buildQuery({ status: opt.value === "all" ? undefined : opt.value, page: "1" })}
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
        {/* Date range — TODO i18n labels (hardcoded operational microcopy) */}
        <label className="flex flex-col text-[11px] font-medium text-gray-500 dark:text-white/50">
          Başlangıç
          <input
            type="date"
            name="from"
            defaultValue={sp.from ?? ""}
            className="mt-0.5 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-white/20 dark:bg-white/5 dark:text-white"
          />
        </label>
        <label className="flex flex-col text-[11px] font-medium text-gray-500 dark:text-white/50">
          Bitiş
          <input
            type="date"
            name="to"
            defaultValue={sp.to ?? ""}
            className="mt-0.5 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-white/20 dark:bg-white/5 dark:text-white"
          />
        </label>
        {statusParam !== "all" && <input type="hidden" name="status" value={statusParam} />}
        {providerId && <input type="hidden" name="provider" value={providerId} />}
        <button
          type="submit"
          className="rounded-lg border border-brandHealth/40 bg-brandHealth-50 px-4 py-2 text-sm font-medium text-brandHealth-700 transition-colors hover:bg-brandHealth/10 dark:border-brandHealth/30 dark:bg-brandHealth/10 dark:text-brandHealth"
        >
          {t("common.filter")}
        </button>
      </form>

      {pageRows.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-gray-200/50 bg-white/70 px-6 py-16 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
          <CalendarX className="h-14 w-14 text-brandHealth/30" strokeWidth={1.5} />
          <h2 className="mt-4 font-serif text-lg font-semibold text-gray-700 dark:text-white/70">
            {t("admin.health.noAppointments")}
          </h2>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200/50 bg-white/70 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:border-white/[0.06] dark:text-white/50">
                <th className="px-4 py-3">{t("admin.health.colWhen")}</th>
                <th className="px-4 py-3">{t("admin.health.colProvider")}</th>
                <th className="px-4 py-3">{t("admin.health.colPatient")}</th>
                <th className="px-4 py-3">{t("admin.health.colService")}</th>
                <th className="px-4 py-3">{t("admin.health.colStatus")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
              {pageRows.map((a) => (
                <tr key={a.appointmentId} className="text-gray-700 dark:text-white/80">
                  <td className="whitespace-nowrap px-4 py-3">
                    {new Date(a.slotStart).toLocaleString(locale, {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/${locale}/admin/saglik/${a.providerId}`}
                      className="font-medium text-brandHealth-700 hover:underline dark:text-brandHealth"
                    >
                      {a.providerName}
                    </Link>
                    <div className="text-xs text-gray-400 dark:text-white/40">{a.locationCity}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-white">{a.patientName}</div>
                    <div className="font-mono text-xs text-gray-400 dark:text-white/40">
                      {a.patientPhoneMasked}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {a.serviceName}
                    <div className="text-xs text-gray-400 dark:text-white/40">
                      {a.serviceDurationMin} {t("admin.health.minutes")} · {a.source}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[a.status]}`}
                    >
                      {t(`admin.health.appt_${a.status}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {(page > 1 || hasNext) && (
        <div className="mt-6 flex items-center justify-between">
          {page > 1 ? (
            <Link
              href={buildQuery({ page: String(page - 1) })}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-white/[0.08] dark:text-white/70 dark:hover:bg-white/[0.04]"
            >
              &larr; {t("admin.health.prev")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-gray-400 dark:text-white/40">
            {t("admin.health.page")} {page}
          </span>
          {hasNext ? (
            <Link
              href={buildQuery({ page: String(page + 1) })}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-white/[0.08] dark:text-white/70 dark:hover:bg-white/[0.04]"
            >
              {t("admin.health.next")} &rarr;
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
