import Link from "next/link";
import { Search } from "lucide-react";

import { createAdminClient } from "@/supabase/server";
import { cn } from "@/lib/utils";
import { AdminWorkerCurationList } from "@/components/admin/AdminWorkerCurationList";

// R8 #1 spirit: this page renders clear-text PII (un-anonymized worker dossier),
// so it must NEVER be ISR-cached — a cached page would serve one query's PII to a
// later admin's URL. `force-dynamic` + no `revalidate` is load-bearing, not perf.
// `runtime = "nodejs"` because the read path decrypts via the service-role/PII key.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
  searchParams:
    | Promise<{ q?: string; verification?: string; offset?: string }>
    | { q?: string; verification?: string; offset?: string };
};

/** One worker-document manifest entry consumed by the curation island's sub-list. */
export interface CareerAdminWorkerDoc {
  id: string;
  category: string;
  filename: string | null;
  consentStatus: string;
}

/**
 * Spec 25 — one UN-anonymized worker row as projected by `career_admin_search_workers`
 * (migration 076, item 1 — the ONLY read path that decrypts PII). This row INTENTIONALLY
 * carries clear-text identity (fullName / dob / exactCountry / phone / email / address /
 * passportNo); it is the single surface in the product allowed to ship PII to its
 * (admin-only) client island (R8 #1/#3 boundary). Do NOT reuse this type, the island, or
 * this read on any employer/worker surface. R7: NO fee/price/payment field lives here.
 *
 * `documents` / `createdAt` are optional: the search RPC does not return them (the island
 * renders them only when present — a sibling admin read can hydrate docs per-card later).
 */
export interface CareerAdminWorkerRow {
  id: string;
  workerCode: string;
  role: string | null;
  trade: string | null;
  skillTier: string | null;
  experienceBand: string | null;
  region: string | null;
  ageBand: string | null;
  languages: string[];
  skills: string[];
  readinessScore: number | null;
  verificationStatus: string | null;
  isShowcased: boolean;
  // ── UN-anonymized PII (admin display only) ──────────────────────────────────
  fullName: string | null;
  dob: string | null;
  exactCountry: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  passportNo: string | null;
  // ── Optional manifest / timestamp (not returned by the search RPC) ──────────
  documents?: CareerAdminWorkerDoc[];
  createdAt?: string | null;
}

// Admin chrome is TR-hardcoded by policy (admin-i18n policy; NOT under careerVertical.*).
// Only the verification-status labels are translated to TR inline. ───────────────
const VERIFICATION_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "Tümü" },
  { value: "pending", label: "Beklemede" },
  { value: "id_verified", label: "Kimlik" },
  { value: "skills_verified", label: "Beceri" },
  { value: "documents_verified", label: "Belge" },
  { value: "interview_passed", label: "Mülakat" },
  { value: "rejected", label: "Reddedilmiş" },
];

const VALID_VERIFICATIONS = new Set(
  VERIFICATION_FILTERS.map((f) => f.value).filter(Boolean),
);

const PAGE_SIZE = 25;

/** Build a curation-page href preserving q / verification while changing nothing else. */
function filterHref(locale: string, q: string, verification: string): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (verification) params.set("verification", verification);
  const qs = params.toString();
  return `/${locale}/admin/career/curation${qs ? `?${qs}` : ""}`;
}

/**
 * Spec 25 — Talent Curation (owner-only, un-anonymized). THE single surface in the
 * product where a human reads a worker's real name / phone / email / passport. Lives
 * under /admin and inherits its email-allowlist gate (no auth check here — a non-admin
 * never renders this page); exempt from CAREER_VERTICAL_ENABLED, like the rest of the
 * owner console. Mirrors app/[locale]/admin/career/requisitions/page.tsx: the
 * service-role client reads ALL workers through the SECURITY DEFINER RPC (the career
 * schema is not PostgREST-exposed), then a header + filter chrome wrap the client island.
 *
 * The URL is the single source of truth (mirroring the providers filter-via-querystring
 * pattern): `q` (ILIKE search), `verification` (status pill), `offset` (server paging).
 * The RPC parameterizes p_q, so quotes / % are data, not SQL — no client-side
 * interpolation into any query.
 *
 * R8 #1: NEVER cached (`force-dynamic`). PII_KEY_MISSING (Vault `career_pii_key` absent)
 * or any genuine infra failure THROWS here → the admin error.tsx boundary; we do not
 * swallow it into a silent blank list of half-decrypted rows (fail loud, R4 spirit).
 */
export default async function AdminCareerCurationPage({
  params,
  searchParams,
}: Props) {
  const { locale } = await Promise.resolve(params);
  const sp = await Promise.resolve(searchParams);

  const q = (sp.q ?? "").trim();
  const verification = VALID_VERIFICATIONS.has(sp.verification ?? "")
    ? (sp.verification as string)
    : "";
  const offset = Math.max(Number.parseInt(sp.offset ?? "0", 10) || 0, 0);

  // The single read path that decrypts PII (migration 076 item 1). service_role-only
  // EXECUTE; the human is already gated by the /admin layout (defense in two layers).
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("career_admin_search_workers", {
    p_q: q === "" ? null : q,
    p_verification: verification === "" ? null : verification,
    p_limit: PAGE_SIZE,
    p_offset: offset,
  });
  // Fail LOUD on infra failure (incl. PII_KEY_MISSING): a PII surface must never serve a
  // silent blank list — let the admin error boundary render the designed error screen.
  if (error) {
    throw new Error(`career_admin_search_workers failed: ${error.message}`);
  }

  const raw = (data ?? []) as Array<{
    id: string;
    workerCode: string;
    role: string | null;
    trade: string | null;
    skillTier: string | null;
    experienceBand: string | null;
    region: string | null;
    ageBand: string | null;
    languages: string[] | null;
    skills: string[] | null;
    readinessScore: number | null;
    verificationStatus: string | null;
    isShowcased: boolean | null;
    fullName: string | null;
    dob: string | null;
    exactCountry: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    passportNo: string | null;
  }>;

  const rows: CareerAdminWorkerRow[] = raw.map((w) => ({
    id: w.id,
    workerCode: w.workerCode,
    role: w.role ?? null,
    trade: w.trade ?? null,
    skillTier: w.skillTier ?? null,
    experienceBand: w.experienceBand ?? null,
    region: w.region ?? null,
    ageBand: w.ageBand ?? null,
    languages: w.languages ?? [],
    skills: w.skills ?? [],
    readinessScore: w.readinessScore ?? null,
    verificationStatus: w.verificationStatus ?? null,
    isShowcased: w.isShowcased ?? false,
    fullName: w.fullName ?? null,
    dob: w.dob ?? null,
    exactCountry: w.exactCountry ?? null,
    phone: w.phone ?? null,
    email: w.email ?? null,
    address: w.address ?? null,
    passportNo: w.passportNo ?? null,
  }));

  // A full page implies a next page may exist (server-paginated; the RPC takes limit/offset).
  const hasMore = rows.length === PAGE_SIZE;

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-serif text-2xl font-bold text-gray-900 dark:text-white">
          İşgücü Küratörlüğü
        </h1>
        <div className="mt-2 h-0.5 w-12 rounded-full bg-brandCareer" />
        <p className="mt-2 text-sm text-gray-500 dark:text-white/50">
          {rows.length} kayıt
        </p>
      </header>

      {/* Search box — a GET-form text input submitting back to the page; the URL is the
          single source of truth (no client search state). The RPC does the matching. */}
      <form method="get" className="mb-3 flex max-w-md items-center gap-2">
        {verification && (
          <input type="hidden" name="verification" value={verification} />
        )}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-white/40" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="İşçi kodu, rol, meslek, bölge ara"
            aria-label="İşçi ara"
            className="w-full rounded-lg border border-gray-200 bg-white/70 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brandCareer focus:outline-none focus:ring-1 focus:ring-brandCareer dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/40"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-amber-500/25 transition-opacity hover:opacity-90"
        >
          Ara
        </button>
      </form>

      {/* Verification filter pills — Links carrying ?verification= (preserving q). The
          active pill uses the amber 50/700 ramp. */}
      <div className="mb-2 flex flex-wrap gap-2">
        {VERIFICATION_FILTERS.map((f) => {
          const isActive = verification === f.value;
          return (
            <Link
              key={f.value || "all"}
              href={filterHref(locale, q, f.value)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-brandCareer-50 text-brandCareer-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-white/60 dark:hover:bg-white/[0.1]",
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <AdminWorkerCurationList
        rows={rows}
        locale={locale}
        q={q}
        verification={verification}
        offset={offset}
        limit={PAGE_SIZE}
        hasMore={hasMore}
      />
    </div>
  );
}
