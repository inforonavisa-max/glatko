"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  RotateCw,
  SearchX,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import type {
  CareerSector,
  ShowcaseWorkerCard as ShowcaseWorker,
} from "@/lib/kariyer/queries";
import { WorkerCard } from "@/components/glatko-kariyer/WorkerCard";

/**
 * Glatko Kariyer — Talent Pool browse client island (Spec 05).
 *
 * MIRRORS components/glatko-saglik/BookingWidget.tsx's interaction skeleton:
 * `useSearchParams` to read the active filter state, `useRouter` from
 * @/i18n/navigation to write a new (typed) URL, and a three-state abortable
 * fetch (loading / ready / error) where the LAST request wins (fetchSeq guard).
 * Health fetches /api/health/slots; we fetch /api/career/pool with the same
 * shape (anonymized worker cards over the showcase VIEW — never base tables).
 *
 * This component owns BOTH columns of the screen: the left filter rail (every
 * facet from careerVertical.pool.filters.*) and the right results region
 * (result count, sort, the WorkerCard grid, server-style pagination). Every
 * facet writes a searchParam and resets `page` to 1; the router push re-runs
 * the fetch via the searchParams dependency.
 *
 * Accent = amber / brandCareer wherever health uses sky / brandHealth; the
 * active-filter count badge + primary CTAs use the amber gradient
 * (from-amber-500 to-amber-600). brandCareer-700 is the text accent (amber-600
 * DEFAULT is below AA for text). Tailwind needs static class literals, so the
 * brandCareer ramp is written out rather than derived from CAREER_ACCENT_TOKEN.
 *
 * ⚠️ R12 — UNTHROTTLED SCRAPE SURFACE: /career/pool is a page route, so
 * lib/rateLimit.ts's `public-form` cap does NOT cover it. Server-side
 * pagination (p_limit + p_offset, NO bulk export / "load all") is the
 * structural throttle. Do NOT add a fetch-everything affordance here.
 *
 * NO IDENTITY LEAK: the showcase type carries worker_code only — never a name,
 * phone, email, passport, exact location, or DOB. The card renders solely the
 * public-safe fields the RPC/VIEW projects.
 */

const PAGE_SIZE = 24;

// Region facet is constrained to broad zones ONLY (PART 4) — never country/city.
const REGION_OPTIONS = ["farEast", "middleEast", "africa", "balkans", "other"] as const;
const SKILL_TIER_OPTIONS = ["entry", "skilled", "experienced", "expert"] as const;
const EXPERIENCE_OPTIONS = ["lt1", "1to3", "3to5", "5to10", "gt10"] as const;
const AGE_OPTIONS = ["18to24", "25to34", "35to44", "45plus"] as const;
const LANGUAGE_OPTIONS = ["en", "tr", "ru", "ar", "sr", "de", "uk"] as const;
const SORT_OPTIONS = ["relevance", "readiness", "experience", "recent"] as const;

// The 074 career_browse_showcase RPC does NOT yet accept certs / availability
// filter args (Spec 05 GAP). We render those facets DISABLED-with-tooltip rather
// than silently showing controls that don't filter. Wire them when the migration
// owner extends the signature (R15 — no prod apply without explicit go).
const DISABLED_FACETS = true;

type FetchState =
  | { status: "loading"; workers: ShowcaseWorker[] }
  | { status: "ready"; workers: ShowcaseWorker[] }
  | { status: "error"; workers: ShowcaseWorker[] };

type PoolResponse = { workers: ShowcaseWorker[] };

type WorkerPoolBrowserProps = {
  /** Localized sector facet options (from career_list_sectors via the page). */
  sectors: CareerSector[];
  locale: string;
  /** Viewer is a logged-in employer → interest/add actions are active, not locked. */
  viewerIsEmployer: boolean;
  /** Worker codes this employer has already expressed interest in (→ "İlgi gösterildi"). */
  interestedCodes?: string[];
};

/** Read a single-valued searchParam, coercing absent/blank to null. */
function readParam(sp: URLSearchParams, key: string): string | null {
  const v = sp.get(key);
  return v && v.trim() ? v : null;
}

/** Read a multi-valued (comma-joined) searchParam into a string[]. */
function readMulti(sp: URLSearchParams, key: string): string[] {
  const v = sp.get(key);
  if (!v) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Coerce the `page` searchParam to a 1-based positive integer (defensive). */
function readPage(sp: URLSearchParams): number {
  const raw = Number(sp.get("page"));
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}

export function WorkerPoolBrowser({
  sectors,
  viewerIsEmployer,
  interestedCodes = [],
}: WorkerPoolBrowserProps) {
  const t = useTranslations("careerVertical.pool");
  const searchParams = useSearchParams();
  const router = useRouter();

  // Mobile: the rail opens as a sheet/drawer; desktop it is always visible.
  const [railOpen, setRailOpen] = useState(false);

  // ── Active filter state, derived from the URL (the URL is the source of truth) ──
  const sector = readParam(searchParams, "sector");
  const trade = readParam(searchParams, "trade");
  const tier = readParam(searchParams, "tier");
  const experience = readParam(searchParams, "experience");
  const region = readParam(searchParams, "region");
  const age = readParam(searchParams, "age");
  const langs = useMemo(() => readMulti(searchParams, "langs"), [searchParams]);
  const minReadiness = readParam(searchParams, "minReadiness");
  const sort = readParam(searchParams, "sort") ?? "relevance";
  const page = readPage(searchParams);

  const interestedSet = useMemo(
    () => new Set(interestedCodes),
    [interestedCodes],
  );

  // ── URL writer — every facet change resets page to 1 and pushes a new typed URL ──
  // Mirrors BookingWidget's searchParam-driven re-fetch: the push updates the URL,
  // the searchParams hook re-derives state, and the fetch effect re-runs.
  const pushFilters = useCallback(
    (mutate: (next: URLSearchParams) => void, resetPage = true) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      if (resetPage) next.delete("page");
      const query = Object.fromEntries(next.entries());
      router.push({ pathname: "/career/pool", query }, { scroll: false });
    },
    [router, searchParams],
  );

  const setSingle = useCallback(
    (key: string, value: string | null) => {
      pushFilters((next) => {
        if (value === null || next.get(key) === value) next.delete(key);
        else next.set(key, value);
        // Trade depends on sector — clearing/changing sector drops a stale trade.
        if (key === "sector") next.delete("trade");
      });
    },
    [pushFilters],
  );

  const toggleLanguage = useCallback(
    (code: string) => {
      pushFilters((next) => {
        const current = new Set(readMulti(next, "langs"));
        if (current.has(code)) current.delete(code);
        else current.add(code);
        if (current.size === 0) next.delete("langs");
        else next.set("langs", Array.from(current).join(","));
      });
    },
    [pushFilters],
  );

  const setReadiness = useCallback(
    (value: string | null) => setSingle("minReadiness", value),
    [setSingle],
  );

  const setSort = useCallback(
    (value: string) => {
      // Sort is not a "filter" — keep the current page (sort re-orders, not subsets).
      pushFilters((next) => {
        if (value === "relevance") next.delete("sort");
        else next.set("sort", value);
      }, false);
    },
    [pushFilters],
  );

  const goToPage = useCallback(
    (target: number) => {
      pushFilters((next) => {
        if (target <= 1) next.delete("page");
        else next.set("page", String(target));
      }, false);
    },
    [pushFilters],
  );

  const clearAll = useCallback(() => {
    router.push({ pathname: "/career/pool" }, { scroll: false });
  }, [router]);

  const activeFilterCount =
    (sector ? 1 : 0) +
    (trade ? 1 : 0) +
    (tier ? 1 : 0) +
    (experience ? 1 : 0) +
    (region ? 1 : 0) +
    (age ? 1 : 0) +
    (langs.length > 0 ? 1 : 0) +
    (minReadiness ? 1 : 0);

  // ── Abortable, last-request-wins fetch (mirror BookingWidget.fetchSeq) ──────
  const [fetchState, setFetchState] = useState<FetchState>({
    status: "loading",
    workers: [],
  });
  const [retryNonce, setRetryNonce] = useState(0);
  const fetchSeq = useRef(0);

  const runFetch = useCallback(
    (signal: AbortSignal) => {
      const seq = ++fetchSeq.current;
      setFetchState((prev) => ({ status: "loading", workers: prev.workers }));

      const params = new URLSearchParams();
      if (sector) params.set("sector", sector);
      if (trade) params.set("trade", trade);
      if (tier) params.set("tier", tier);
      if (experience) params.set("experience", experience);
      if (region) params.set("region", region);
      if (age) params.set("age", age);
      if (langs.length > 0) params.set("langs", langs.join(","));
      if (minReadiness) params.set("minReadiness", minReadiness);
      if (sort && sort !== "relevance") params.set("sort", sort);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String((page - 1) * PAGE_SIZE));

      fetch(`/api/career/pool?${params.toString()}`, { signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`pool ${res.status}`);
          return (await res.json()) as PoolResponse;
        })
        .then((json) => {
          if (signal.aborted || seq !== fetchSeq.current) return;
          setFetchState({ status: "ready", workers: json.workers });
        })
        .catch((err: unknown) => {
          if (
            signal.aborted ||
            (err instanceof DOMException && err.name === "AbortError")
          ) {
            return; // cancelled request — ignore
          }
          if (seq !== fetchSeq.current) return;
          setFetchState((prev) => ({ status: "error", workers: prev.workers }));
        });
    },
    [sector, trade, tier, experience, region, age, langs, minReadiness, sort, page],
  );

  useEffect(() => {
    const controller = new AbortController();
    runFetch(controller.signal);
    return () => controller.abort();
  }, [runFetch, retryNonce]);

  const workers = fetchState.workers;
  const hasActiveFilters = activeFilterCount > 0;

  // ── Card labels (parent owns the translator; the card is zero-JS presentational) ──
  const cardLabels = useMemo(
    () => ({
      verified: t("card.verifiedBadge"),
      readinessLabel: t("card.readinessLabel"),
      expressInterest: t("card.expressInterest"),
      addToRequisition: t("card.addToRequisition"),
      viewLocked: t("card.viewProfile"),
      employerLoginRequired: t("loginPrompt"),
      interestSent: t("card.interestMarked"),
      photoAlt: t("card.photoBlurredNote"),
      tierLabel: t("card.tierLabel"),
      experienceLabel: t("card.experienceLabel"),
      regionLabel: t("card.regionLabel"),
    }),
    [t],
  );

  // ── Reusable rail facet pieces ──────────────────────────────────────────────
  const chipBase =
    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brandCareer focus-visible:ring-offset-1 dark:focus-visible:ring-offset-0";
  const chipActive =
    "border-brandCareer bg-brandCareer-50 text-brandCareer-700 dark:border-brandCareer/40 dark:bg-brandCareer/15 dark:text-brandCareer";
  const chipIdle =
    "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-brandCareer-50/40 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:border-white/20";

  const renderSingleFacet = (
    titleKey: string,
    paramKey: string,
    active: string | null,
    options: readonly string[],
    labelFor: (opt: string) => string,
  ) => (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
        {t(titleKey)}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((opt) => {
          const isActive = active === opt;
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={isActive}
              onClick={() => setSingle(paramKey, isActive ? null : opt)}
              className={`${chipBase} ${isActive ? chipActive : chipIdle}`}
            >
              {labelFor(opt)}
            </button>
          );
        })}
      </div>
    </div>
  );

  const filterRail = (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-brandCareer" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {t("filters.title")}
          </span>
          {activeFilterCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-1.5 text-xs font-semibold text-white">
              {activeFilterCount}
            </span>
          )}
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-medium text-brandCareer-700 hover:underline dark:text-brandCareer"
          >
            {t("filters.clearAll")}
          </button>
        )}
      </div>

      {/* 1. Sector (single-select, from career_list_sectors) */}
      {sectors.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
            {t("filters.sector")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {sectors.map((s) => {
              const isActive = sector === s.slug;
              return (
                <button
                  key={s.slug}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setSingle("sector", isActive ? null : s.slug)}
                  className={`${chipBase} ${isActive ? chipActive : chipIdle}`}
                >
                  {s.name ?? s.slug}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Skill tier */}
      {renderSingleFacet(
        "filters.skillTier",
        "tier",
        tier,
        SKILL_TIER_OPTIONS,
        (opt) => t(`skillTier.${opt}`),
      )}

      {/* 4. Experience band */}
      {renderSingleFacet(
        "filters.experienceBand",
        "experience",
        experience,
        EXPERIENCE_OPTIONS,
        (opt) => t(`experienceBand.${opt}`),
      )}

      {/* 5. Region — broad zones only (never country/city, PART 4) */}
      {renderSingleFacet(
        "filters.region",
        "region",
        region,
        REGION_OPTIONS,
        (opt) => t(`region.${opt}`),
      )}

      {/* 6. Age band — banded, never DOB */}
      {renderSingleFacet(
        "filters.ageBand",
        "age",
        age,
        AGE_OPTIONS,
        (opt) => t(`ageBand.${opt}`),
      )}

      {/* 7. Languages — multi-select checkbox group (RPC uses @> contains) */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
          {t("filters.languages")}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map((code) => {
            const isActive = langs.includes(code);
            return (
              <button
                key={code}
                type="button"
                aria-pressed={isActive}
                onClick={() => toggleLanguage(code)}
                className={`${chipBase} uppercase ${isActive ? chipActive : chipIdle}`}
              >
                {code}
              </button>
            );
          })}
        </div>
      </div>

      {/* 9. Readiness — min-score segmented (maps to p_min_readiness) */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
          {t("filters.readiness")}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[
            { v: "80", k: "high" },
            { v: "50", k: "medium" },
            { v: "0", k: "low" },
          ].map(({ v, k }) => {
            const isActive = minReadiness === v;
            return (
              <button
                key={v}
                type="button"
                aria-pressed={isActive}
                onClick={() => setReadiness(isActive ? null : v)}
                className={`${chipBase} ${isActive ? chipActive : chipIdle}`}
              >
                {t(`readiness.${k}`)}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Trade / 8. Certifications / 10. Availability — GAP (Spec 05): the 074
          RPC does not yet accept trade-cascade / certs / availability args.
          Rendered DISABLED-with-tooltip so we never show a control that silently
          fails to filter. Wire on the follow-up migration (R15). */}
      {DISABLED_FACETS && (
        <div className="space-y-3 rounded-xl border border-dashed border-gray-200 p-3 dark:border-white/10">
          {[
            { titleKey: "filters.trade" },
            { titleKey: "filters.certifications" },
            { titleKey: "filters.availability" },
          ].map(({ titleKey }) => (
            <div
              key={titleKey}
              className="flex items-center justify-between"
              title={t("filters.anyOption")}
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
                {t(titleKey)}
              </span>
              <Lock className="h-3.5 w-3.5 text-gray-300 dark:text-white/20" />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[18rem_1fr] lg:gap-8">
      {/* ── Left filter rail ─────────────────────────────────────────────────── */}
      {/* Mobile: a "Filtrele" button toggles the rail as a sheet; desktop: sticky. */}
      <div className="mb-6 lg:mb-0">
        <button
          type="button"
          onClick={() => setRailOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 lg:hidden dark:border-white/10 dark:bg-white/5 dark:text-white"
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-brandCareer" />
            {t("filters.title")}
            {activeFilterCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-1.5 text-xs font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </span>
          {railOpen ? (
            <X className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
        </button>

        <aside
          className={`${railOpen ? "block" : "hidden"} mt-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-premium-sm lg:sticky lg:top-24 lg:mt-0 lg:block dark:border-white/10 dark:bg-white/5`}
        >
          {filterRail}
        </aside>
      </div>

      {/* ── Right results region ─────────────────────────────────────────────── */}
      <div>
        {/* Result count + sort */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600 dark:text-white/60">
            {fetchState.status === "loading" && workers.length === 0
              ? t("loading")
              : t("resultsCount", { count: workers.length })}
          </p>
          <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-white/50">
            <span className="sr-only">{t("sort.label")}</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brandCareer dark:border-white/10 dark:bg-white/5 dark:text-white/80"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {t(`sort.${opt}`)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Results / states */}
        <div className="mt-6">
          {fetchState.status === "error" ? (
            /* Error — graceful screen with amber retry (never a fake-empty). */
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white/50 p-10 text-center dark:border-white/15 dark:bg-white/5">
              <h2 className="font-semibold text-gray-900 dark:text-white">
                {t("errorTitle")}
              </h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500 dark:text-white/50">
                {t("errorBody")}
              </p>
              <button
                type="button"
                onClick={() => setRetryNonce((n) => n + 1)}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 transition-all hover:shadow-amber-500/40"
              >
                <RotateCw className="h-4 w-4" />
                {t("retry")}
              </button>
            </div>
          ) : fetchState.status === "loading" && workers.length === 0 ? (
            /* Loading skeleton grid — neutral gray blocks, no amber. */
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-44 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/10"
                />
              ))}
            </div>
          ) : workers.length === 0 ? (
            /* Empty — distinguish filter-mismatch from a not-yet-seeded pool. */
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white/50 p-10 text-center dark:border-white/15 dark:bg-white/5">
              <SearchX className="mx-auto h-8 w-8 text-gray-400" />
              <h2 className="mt-4 font-semibold text-gray-900 dark:text-white">
                {t("noResultsTitle")}
              </h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500 dark:text-white/50">
                {t("noResultsBody")}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl border border-brandCareer/40 bg-brandCareer-50 px-4 py-2 text-sm font-semibold text-brandCareer-700 transition-colors hover:bg-brandCareer-50/70 dark:bg-brandCareer/15 dark:text-brandCareer"
                >
                  {t("filters.clearAll")}
                </button>
              )}
            </div>
          ) : (
            /* Success — anonymized card grid. */
            <div
              className={`grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 ${
                fetchState.status === "loading" ? "opacity-60" : ""
              } transition-opacity`}
            >
              {workers.map((worker) => (
                <WorkerCard
                  key={worker.workerCode}
                  worker={worker}
                  photoUrl={null}
                  viewerRole={viewerIsEmployer ? "employer" : "anon"}
                  interestSent={interestedSet.has(worker.workerCode)}
                  labels={cardLabels}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pagination (server-side throttle, R12) — Prev disabled on page 1, Next
            disabled when the returned page is short of a full limit. NO bulk export. */}
        {fetchState.status !== "error" && (workers.length > 0 || page > 1) && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-white/70"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-sm font-medium text-gray-700 dark:text-white/70">
              {page}
            </span>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={workers.length < PAGE_SIZE}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-white/70"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Locked CTA for anon/non-employer viewers — entry to the login funnel. */}
        {!viewerIsEmployer && workers.length > 0 && (
          <div className="mt-8 rounded-2xl border border-brandCareer/30 bg-brandCareer-50/60 p-5 text-center dark:border-brandCareer/20 dark:bg-brandCareer/10">
            <p className="text-sm font-medium text-gray-700 dark:text-white/70">
              {t("loginPrompt")}
            </p>
            <Link
              href="/career/login"
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 transition-all hover:shadow-amber-500/40"
            >
              {t("lockedCta.loginCta")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
