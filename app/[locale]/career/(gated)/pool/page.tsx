import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { PackageOpen } from "lucide-react";
import { routing, type Locale } from "@/i18n/routing";
import { createClient } from "@/supabase/server";
import {
  getEmployerUnlocks,
  getShowcaseWorkers,
  listSectors,
  resolveCareerRole,
  type ShowcaseFilters,
} from "@/lib/kariyer/queries";
import { WorkerPoolBrowser } from "@/components/glatko-kariyer/WorkerPoolBrowser";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
  searchParams:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

// R5 — per-viewer interest markers + a per-session watermark on every showcase
// photo mean one employer's render must NEVER be ISR-cached for another. Health's
// directory list is `revalidate=3600`; the pool is the deliberate exception. Do
// NOT add `generateStaticParams` (the showcase RPC fetch is dynamic anyway) and
// do NOT relax this to ISR. `noindex` is inherited from the gated group metadata.
export const dynamic = "force-dynamic";

// Server-side pagination throttle (R12, see WorkerPoolBrowser). Keep in sync with
// the client island's PAGE_SIZE; the initial SSR render uses the same limit.
const PAGE_SIZE = 24;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  // noindex is inherited from app/[locale]/career/layout.tsx — do NOT add
  // buildAlternates/indexable metadata to this gated subtree (IMPL-CONTRACT).
  return { title: t("careerVertical.pool.seoTitle") };
}

/** Read a single-valued searchParam, coercing absent/array/blank to null. */
function single(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s : null;
}

/** Read a comma-joined multi-valued searchParam into a string[] (RPC uses @>). */
function multi(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string[] {
  const v = sp[key];
  const s = Array.isArray(v) ? v.join(",") : v;
  if (!s) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Coerce `page` to a 1-based positive integer (defensive: never trust the URL). */
function pageNum(sp: Record<string, string | string[] | undefined>): number {
  const raw = Number(single(sp, "page"));
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}

/** Coerce `minReadiness` to a number in [0,100], or null (never pass a raw string). */
function readiness(
  sp: Record<string, string | string[] | undefined>,
): number | null {
  const raw = Number(single(sp, "minReadiness"));
  if (!Number.isFinite(raw)) return null;
  return Math.min(100, Math.max(0, raw));
}

/**
 * Talent Pool browse (Spec 05) — THE core employer screen. Mirrors health's
 * `app/[locale]/health/(gated)/[specialty]/page.tsx`: validate input → call the
 * read-RPC → render a header + a card surface with a designed empty state. It
 * differs in two ways (Spec 05): filters are searchParam-driven through a client
 * rail (WorkerPoolBrowser), and the page is `force-dynamic` (R5).
 *
 * Anonymization firewall (R2/R6/R8): everything below the header comes from the
 * `career_browse_showcase` RPC over the showcase VIEW — public-safe columns only
 * (worker_code, role/trade, bands, region, languages, skills, readiness,
 * verification). There is NO name/phone/email/passport/DOB/exact-location field
 * anywhere on this surface, not even in hidden markup or JSON props.
 *
 * ⚠️ R12 — UNTHROTTLED SCRAPE SURFACE: `/career/pool` is a PAGE route, so
 * lib/rateLimit.ts's `public-form` cap does NOT apply here. The structural
 * throttle is server-side pagination (p_limit + p_offset below + in the client
 * island) plus NO bulk export / "load all". Do not add a fetch-everything
 * affordance, and do not claim this surface is rate-limited. If a lightweight bot
 * guard is added later, hook it here.
 */
export default async function PoolBrowsePage({ params, searchParams }: Props) {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const l = locale as Locale;
  const sp = await Promise.resolve(searchParams);

  // Identity is derived server-side from the trusted session (auth.getUser()),
  // NEVER from the request — it decides locked vs active interest actions. The
  // `career` schema is off PostgREST, so the role lookup is a SECURITY DEFINER
  // RPC keyed by the verified uid (R1). Anon → "none" → locked CTAs.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = user ? await resolveCareerRole(user.id) : "none";
  const viewerIsEmployer = role === "employer";

  // Per-viewer already-expressed-interest markers (so a card shows "İlgi
  // gösterildi" instead of the CTA). Only an employer has unlocks; ownership is
  // re-verified inside the RPC, so a foreign uid yields zero rows.
  const interestedCodes =
    viewerIsEmployer && user
      ? (await getEmployerUnlocks(user.id)).map((u) => u.workerCode)
      : [];

  // Sector facet options (localized name by the RPC) for the left rail.
  const sectors = await listSectors(l);

  // Defensive searchParam → ShowcaseFilters coercion (Spec 05 edge cases): an
  // unknown sector simply yields no rows, page<1 → 1, non-numeric → default. We
  // never pass an unvalidated string straight into the RPC. The client island
  // (WorkerPoolBrowser) re-fetches /api/career/pool on every URL change with the
  // SAME mapping; this server pass seeds the first render + the pool-empty check.
  const page = pageNum(sp);
  const langs = multi(sp, "langs");
  const filters: ShowcaseFilters = {
    sector: single(sp, "sector"),
    trade: single(sp, "trade"),
    tier: single(sp, "tier"),
    experience: single(sp, "experience"),
    region: single(sp, "region"),
    age: single(sp, "age"),
    languages: langs.length > 0 ? langs : null,
    minReadiness: readiness(sp),
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };

  // First-page-with-no-filters probe: distinguishes a NOT-YET-SEEDED pool (Phase
  // 1) from a filter-mismatch empty. A genuine RPC failure throws here and is
  // caught by the gated group error.tsx (never a fake-empty). The filter-mismatch
  // empty state itself is owned by WorkerPoolBrowser's own fetch.
  const hasActiveFilters =
    filters.sector !== null ||
    filters.trade !== null ||
    filters.tier !== null ||
    filters.experience !== null ||
    filters.region !== null ||
    filters.age !== null ||
    (filters.languages?.length ?? 0) > 0 ||
    filters.minReadiness !== null;

  const firstPageRows =
    page === 1 && !hasActiveFilters
      ? await getShowcaseWorkers(filters)
      : null;
  const poolNotYetOpen = firstPageRows !== null && firstPageRows.length === 0;

  return (
    <div className="bg-brandCareer-50/40 dark:bg-transparent">
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-28">
        <header className="mb-8">
          <h1 className="font-serif text-3xl font-light tracking-tight text-gray-900 dark:text-white sm:text-4xl">
            {t("careerVertical.pool.title")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-white/50">
            {t("careerVertical.pool.subtitle")}
          </p>
        </header>

        {poolNotYetOpen ? (
          /* Pool-not-yet-open empty (Phase 1 seeding) — a DIFFERENT, designed
             empty from the filter-mismatch state the client island shows. Mirrors
             health's dashed-border block; neutral gray, no amber. */
          <div className="mt-12 rounded-2xl border border-dashed border-gray-300 bg-white/50 p-10 text-center dark:border-white/15 dark:bg-white/5">
            <PackageOpen className="mx-auto h-8 w-8 text-gray-400" />
            <h2 className="mt-4 font-semibold text-gray-900 dark:text-white">
              {t("careerVertical.pool.poolPreparingTitle")}
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500 dark:text-white/50">
              {t("careerVertical.pool.poolPreparingBody")}
            </p>
          </div>
        ) : (
          /* WorkerPoolBrowser owns BOTH columns: the searchParam-driven filter
             rail and the results region (count, sort, card grid, server-style
             pagination). It re-fetches via /api/career/pool on each URL change. */
          <WorkerPoolBrowser
            sectors={sectors}
            locale={l}
            viewerIsEmployer={viewerIsEmployer}
            interestedCodes={interestedCodes}
          />
        )}
      </div>
    </div>
  );
}
