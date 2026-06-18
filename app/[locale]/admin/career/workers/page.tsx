import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";

import { createAdminClient } from "@/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Spec 29 — Talent Curation worker list (`/admin/career/workers`).
 *
 * The owner's (RoNa Legal) curation entry point: a searchable, paginated list of
 * EVERY worker with UN-anonymized identity (full name + country) — the ONE career
 * surface where PII is shown by design — each row linking into the per-worker
 * curation detail (Spec 25, /admin/career/workers/[id], not yet written).
 *
 * Mirrors app/[locale]/admin/users/page.tsx end to end (createAdminClient search /
 * filter / pager) and app/[locale]/admin/reviews for the keyed STATUS_BADGE record.
 * The career schema is not exposed to PostgREST, so the read goes through the
 * SECURITY DEFINER career_admin_search_workers RPC (076 §1) — the ONLY read path
 * that pgp_sym_decrypts full_name/phone/email/passport with career_pii_key. The
 * two-layer defense is (1) the admin layout email allowlist gates the human, (2)
 * the RPC is service_role-EXECUTE only. R1/R8 #2 exception applies: admin RPCs are
 * owner-only and read ALL workers (no per-worker scoping). The admin layout already
 * gates the human (redirect /login → notFound for non-allowlisted) and applies
 * noindex via metadata.robots — do not re-implement. CAREER_VERTICAL_ENABLED does
 * NOT gate /admin/* (the owner curates before public launch).
 *
 * R5/R11: reads the admin session + per-request ?q/?status/?page and the rows carry
 * special-category PII — must never be ISR-cached or shared.
 *
 * PII scope (highest-sensitivity surface in the vertical): the RPC returns
 * phone/email/passport/dob/address in clear, but the LIST renders name + taxonomy
 * ONLY — those clear fields belong to the detail (Spec 25). Never log the decrypted
 * payload. Read-only: no mutation, no audit row (R13 audit lives on the Spec 25
 * mutations).
 */

export const dynamic = "force-dynamic";

// The RPC returns no total count (Spec 29 GAP) — fetch PAGE_SIZE + 1 as a has-next
// probe, render PAGE_SIZE, show "Sonraki" only when the (PAGE_SIZE+1)th came back.
// No "Sayfa X / Y" total (we do NOT fake one); Önceki/Sonraki only.
const PAGE_SIZE = 50;

interface Props {
  params: Promise<{ locale: string }> | { locale: string };
  searchParams:
    | Promise<{ q?: string; status?: string; page?: string }>
    | { q?: string; status?: string; page?: string };
}

// The verification lifecycle (RPC §3 career_admin_set_worker_verification enum).
const VERIFICATION_STATUSES = [
  "pending",
  "id_verified",
  "skills_verified",
  "documents_verified",
  "interview_passed",
  "rejected",
] as const;
type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

// One worker row as career_admin_search_workers projects it. The list renders ONLY
// the name + taxonomy fields below; the RPC ALSO returns dob/phone/email/address/
// passportNo in clear, deliberately NOT typed here so they can't leak onto the list.
interface AdminWorkerRow {
  id: string;
  workerCode: string;
  role: string | null;
  trade: string | null;
  experienceBand: string | null;
  region: string | null;
  readinessScore: number | null;
  verificationStatus: string;
  isShowcased: boolean;
  fullName: string | null;
}

// TR-hardcoded admin chrome (admin-i18n-policy) — never careerVertical.*. Amber is
// reserved for the in-curation attention band + the "Vitrinde" pill so it stays
// meaningful: pending = gray, interview_passed = emerald, rejected = red.
const STATUS_BADGE: Record<VerificationStatus, { label: string; cls: string }> = {
  pending: {
    label: "Beklemede",
    cls: "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-white/60",
  },
  id_verified: {
    label: "Kimlik Doğrulandı",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  skills_verified: {
    label: "Beceri Doğrulandı",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  documents_verified: {
    label: "Belgeler Doğrulandı",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  interview_passed: {
    label: "Mülakat Geçti",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  rejected: {
    label: "Reddedildi",
    cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
};

// Status filter options (Tümü = all → null p_verification).
const STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Tüm Durumlar" },
  ...VERIFICATION_STATUSES.map((s) => ({
    value: s,
    label: STATUS_BADGE[s].label,
  })),
];

type LoadResult =
  | { ok: true; rows: AdminWorkerRow[]; hasNext: boolean }
  | { ok: false; keyMissing: boolean };

async function loadWorkers(
  query: string,
  statusFilter: string,
  page: number,
): Promise<LoadResult> {
  const admin = createAdminClient();

  // Empty q / "all" status pass null so the RPC returns the unfiltered first page.
  const pQ = query.trim().length > 0 ? query.trim() : null;
  const pVerification =
    statusFilter && statusFilter !== "all" ? statusFilter : null;
  const offset = (page - 1) * PAGE_SIZE;

  const { data, error } = await admin.rpc("career_admin_search_workers", {
    p_q: pQ,
    p_verification: pVerification,
    p_limit: PAGE_SIZE + 1, // has-next probe (no total count from the RPC)
    p_offset: offset,
  });

  if (error) {
    // PII_KEY_MISSING: the vault career_pii_key is absent (fresh/staging DB) so the
    // RPC raised — surface a loud inline note (decryption is unavailable), do NOT
    // crash. Any other read failure: log + fall through to an empty list (admin
    // convention). Never log the decrypted payload.
    const keyMissing =
      typeof error.message === "string" &&
      error.message.includes("PII_KEY_MISSING");
    if (keyMissing) {
      console.error(
        "[GLATKO:admin] career worker search: career_pii_key MISSING — decryption unavailable",
      );
      return { ok: false, keyMissing: true };
    }
    console.error("[GLATKO:admin] career workers fetch failed:", error.message);
    return { ok: false, keyMissing: false };
  }

  const raw = (data ?? []) as Array<{
    id: string;
    workerCode: string;
    role: string | null;
    trade: string | null;
    experienceBand: string | null;
    region: string | null;
    readinessScore: number | null;
    verificationStatus: string;
    isShowcased: boolean;
    fullName: string | null;
  }>;

  const hasNext = raw.length > PAGE_SIZE;
  const rows: AdminWorkerRow[] = raw.slice(0, PAGE_SIZE).map((w) => ({
    id: w.id,
    workerCode: w.workerCode,
    role: w.role ?? null,
    trade: w.trade ?? null,
    experienceBand: w.experienceBand ?? null,
    region: w.region ?? null,
    readinessScore: w.readinessScore ?? null,
    verificationStatus: w.verificationStatus,
    isShowcased: Boolean(w.isShowcased),
    fullName: w.fullName ?? null,
  }));

  return { ok: true, rows, hasNext };
}

export default async function AdminCareerWorkersPage({
  params,
  searchParams,
}: Props) {
  const { locale } = await Promise.resolve(params);
  const sp = await Promise.resolve(searchParams);

  const query = sp.q ?? "";
  const statusFilter = sp.status ?? "all";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const result = await loadWorkers(query, statusFilter, page);
  const rows = result.ok ? result.rows : [];
  const hasNext = result.ok ? result.hasNext : false;
  const keyMissing = !result.ok && result.keyMissing;

  const isFiltered = query.trim().length > 0 || statusFilter !== "all";

  // Sticky filters across pager links (mirror users' buildPageHref).
  const linkParams = new URLSearchParams();
  if (query) linkParams.set("q", query);
  if (statusFilter && statusFilter !== "all")
    linkParams.set("status", statusFilter);

  const buildPageHref = (p: number) => {
    const lp = new URLSearchParams(linkParams);
    lp.set("page", String(p));
    return `?${lp.toString()}`;
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white md:text-3xl">
            İşçi Küratörlüğü
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-white/50">
            {rows.length} işçi
          </p>
        </div>
      </header>

      <Card>
        <CardContent className="pt-6">
          <form
            method="GET"
            className="flex flex-col gap-3 md:flex-row md:items-center"
          >
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                name="q"
                defaultValue={query}
                placeholder="Kod, rol, meslek veya bölge ile ara…"
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brandCareer focus:outline-none focus:ring-2 focus:ring-brandCareer/20 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
              />
            </label>
            <select
              name="status"
              defaultValue={statusFilter}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brandCareer focus:outline-none focus:ring-2 focus:ring-brandCareer/20 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
            >
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg bg-gradient-to-r from-brandCareer to-brandCareer-700 px-5 py-2 text-sm font-medium text-white transition-all hover:from-brandCareer-700 hover:to-brandCareer-700"
            >
              Filtrele
            </button>
          </form>
        </CardContent>
      </Card>

      {keyMissing ? (
        <Card>
          <CardContent className="px-4 py-6">
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              Veriler yüklenemedi
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-white/50">
              İşçi kimlik şifre çözümü kullanılamıyor (career_pii_key bulunamadı).
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-gray-500 dark:text-white/50">
                {isFiltered ? "Sonuç bulunamadı" : "Henüz işçi yok"}
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-white/[0.06]">
                {rows.map((w) => {
                  const badge =
                    STATUS_BADGE[w.verificationStatus as VerificationStatus] ??
                    STATUS_BADGE.pending;
                  const taxonomy = [
                    w.workerCode,
                    [w.role, w.trade].filter(Boolean).join(" · ") || null,
                    w.region,
                    w.experienceBand,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <Link
                      key={w.id}
                      href={`/${locale}/admin/career/workers/${w.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                            {w.fullName || w.workerCode}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              badge.cls,
                            )}
                          >
                            {badge.label}
                          </span>
                          {w.isShowcased ? (
                            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                              Vitrinde
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-white/50">
                          {taxonomy || "—"}
                          {w.readinessScore != null
                            ? ` · Hazırlık ${w.readinessScore}`
                            : ""}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 dark:text-white/30" />
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {page > 1 || hasNext ? (
        <div className="flex items-center justify-center gap-2">
          {page > 1 ? (
            <Link
              href={buildPageHref(page - 1)}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.06]"
            >
              Önceki
            </Link>
          ) : null}
          <span className="text-sm text-gray-500 dark:text-white/50">
            Sayfa {page}
          </span>
          {hasNext ? (
            <Link
              href={buildPageHref(page + 1)}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.06]"
            >
              Sonraki
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
