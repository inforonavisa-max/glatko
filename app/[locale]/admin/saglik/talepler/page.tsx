import Link from "next/link";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, ShieldQuestion } from "lucide-react";
import { createClient } from "@/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { listDataRequests, type DataRequestFilter } from "@/lib/saglik/admin";
import { DataRequestActions } from "./DataRequestActions";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
  searchParams: Promise<{ status?: string; page?: string }> | { status?: string; page?: string };
};

const PAGE_SIZE = 50;
const SLA_DAYS = 15;
const MS_PER_DAY = 86_400_000;

// Filter chips — labels hardcoded TR per the existing admin convention (TODO i18n-b4).
const STATUS_FILTER_OPTIONS: Array<{ value: DataRequestFilter; label: string }> = [
  { value: "pending", label: "Beklemede" },
  { value: "fulfilled", label: "Tamamlandı" },
  { value: "rejected", label: "Reddedildi" },
  { value: "all", label: "Tümü" },
];

export default async function HealthDataRequestsPage({ params, searchParams }: Props) {
  const { locale } = await Promise.resolve(params);
  const sp = await Promise.resolve(searchParams);
  setRequestLocale(locale);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) notFound();

  const t = await getTranslations();

  const valid: DataRequestFilter[] = ["pending", "fulfilled", "rejected", "all"];
  const filter = (sp.status ?? "pending") as DataRequestFilter;
  const safeFilter = valid.includes(filter) ? filter : "pending";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const rows = await listDataRequests(safeFilter, PAGE_SIZE + 1, offset);
  const hasNext = rows.length > PAGE_SIZE;
  const pageRows = hasNext ? rows.slice(0, PAGE_SIZE) : rows;

  const now = Date.now();

  function buildQuery(overrides: Record<string, string | undefined>): string {
    const q = new URLSearchParams();
    const merged = { status: safeFilter, page: String(page), ...overrides };
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
          {t("admin.health.dataRequests.title")}
        </h1>
        <div className="mt-2 h-0.5 w-12 rounded-full bg-gradient-to-r from-brandHealth to-brandHealth-700" />
        <p className="mt-2 text-sm text-gray-500 dark:text-white/50">
          {t("admin.health.dataRequests.subtitle")}
        </p>
      </div>

      {/* Status filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTER_OPTIONS.map((opt) => {
          const isActive = safeFilter === opt.value;
          return (
            <Link
              key={opt.value}
              href={`?status=${opt.value}`}
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

      {pageRows.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-gray-200/50 bg-white/70 px-6 py-16 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
          <ShieldQuestion className="h-14 w-14 text-brandHealth/30" strokeWidth={1.5} />
          <h2 className="mt-4 font-serif text-lg font-semibold text-gray-700 dark:text-white/70">
            {t("admin.health.dataRequests.empty")}
          </h2>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200/50 bg-white/70 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:border-white/[0.06] dark:text-white/50">
                <th className="px-4 py-3">{t("admin.health.dataRequests.colRequested")}</th>
                <th className="px-4 py-3">{t("admin.health.dataRequests.colType")}</th>
                <th className="px-4 py-3">{t("admin.health.dataRequests.colPatient")}</th>
                <th className="px-4 py-3">{t("admin.health.dataRequests.colSla")}</th>
                <th className="px-4 py-3 text-right">{t("admin.health.dataRequests.colAction")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
              {pageRows.map((row) => {
                const ageDays = Math.floor((now - Date.parse(row.requestedAt)) / MS_PER_DAY);
                const daysLeft = SLA_DAYS - ageDays;
                const overdue = row.status === "pending" && daysLeft < 0;
                const urgent = row.status === "pending" && daysLeft >= 0 && daysLeft <= 3;
                return (
                  <tr key={row.id} className="align-top text-gray-700 dark:text-white/80">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500 dark:text-white/50">
                      {new Date(row.requestedAt).toLocaleString(locale, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-brandHealth-50 px-2 py-0.5 text-xs font-medium text-brandHealth-700 dark:bg-brandHealth/10 dark:text-brandHealth">
                        {row.type === "delete"
                          ? t("admin.health.dataRequests.typeDelete")
                          : t("admin.health.dataRequests.typeExport")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="text-gray-700 dark:text-white/80">{row.patientNameMasked}</span>
                      <div className="font-mono text-[11px] text-gray-400 dark:text-white/40">
                        {row.patientPhoneMasked}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {row.status === "pending" ? (
                        <span
                          className={
                            overdue
                              ? "font-semibold text-red-600 dark:text-red-400"
                              : urgent
                                ? "font-semibold text-amber-600 dark:text-amber-400"
                                : "text-gray-500 dark:text-white/50"
                          }
                        >
                          {overdue
                            ? t("admin.health.dataRequests.slaOverdue", { days: -daysLeft })
                            : t("admin.health.dataRequests.slaDaysLeft", { days: daysLeft })}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-white/40">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DataRequestActions requestId={row.id} status={row.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
