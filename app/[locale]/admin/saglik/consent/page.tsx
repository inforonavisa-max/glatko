import Link from "next/link";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, FileCheck2 } from "lucide-react";
import { createClient } from "@/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { listConsents } from "@/lib/saglik/admin";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
  searchParams: Promise<{ page?: string }> | { page?: string };
};

const PAGE_SIZE = 50;

/**
 * H10 admin consent-records view: read-only patient health-consent timestamps
 * (PDPL proof of explicit consent). Phone + name are masked in-RPC; email is never
 * returned. isAdminEmail-gated (the layout also gates the route); brandHealth-700 chrome.
 */
export default async function HealthConsentPage({ params, searchParams }: Props) {
  const { locale } = await Promise.resolve(params);
  const sp = await Promise.resolve(searchParams);
  setRequestLocale(locale);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) notFound();

  const t = await getTranslations();

  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const rows = await listConsents(PAGE_SIZE + 1, offset);
  const hasNext = rows.length > PAGE_SIZE;
  const pageRows = hasNext ? rows.slice(0, PAGE_SIZE) : rows;

  function fmt(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
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
          {t("admin.health.consent.title")}
        </h1>
        <div className="mt-2 h-0.5 w-12 rounded-full bg-gradient-to-r from-brandHealth to-brandHealth-700" />
        <p className="mt-2 text-sm text-gray-500 dark:text-white/50">
          {t("admin.health.consent.subtitle")}
        </p>
      </div>

      {pageRows.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-gray-200/50 bg-white/70 px-6 py-16 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
          <FileCheck2 className="h-14 w-14 text-brandHealth/30" strokeWidth={1.5} />
          <h2 className="mt-4 font-serif text-lg font-semibold text-gray-700 dark:text-white/70">
            {t("admin.health.consent.empty")}
          </h2>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200/50 bg-white/70 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:border-white/[0.06] dark:text-white/50">
                <th className="px-4 py-3">{t("admin.health.consent.colPatient")}</th>
                <th className="px-4 py-3">{t("admin.health.consent.colHealthConsent")}</th>
                <th className="px-4 py-3">{t("admin.health.consent.colMarketingConsent")}</th>
                <th className="px-4 py-3">{t("admin.health.consent.colCreated")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
              {pageRows.map((row) => (
                <tr key={row.id} className="align-top text-gray-700 dark:text-white/80">
                  <td className="px-4 py-3 text-xs">
                    <span className="text-gray-700 dark:text-white/80">{row.patientNameMasked}</span>
                    <div className="font-mono text-[11px] text-gray-400 dark:text-white/40">
                      {row.patientPhoneMasked}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-brandHealth-700 dark:text-brandHealth">
                    {fmt(row.consentHealthAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500 dark:text-white/50">
                    {row.consentMarketingAt
                      ? fmt(row.consentMarketingAt)
                      : t("admin.health.consent.notGiven")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-400 dark:text-white/40">
                    {fmt(row.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(page > 1 || hasNext) && (
        <div className="mt-6 flex items-center justify-between">
          {page > 1 ? (
            <Link
              href={`?page=${page - 1}`}
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
              href={`?page=${page + 1}`}
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
