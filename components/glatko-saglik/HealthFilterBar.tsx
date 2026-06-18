"use client";

import { useCallback, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { MapPin, LocateFixed, X, Loader2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { GLATKO_CITIES } from "@/lib/glatko/cities";
import {
  parseHealthFilters,
  buildFilterQuery,
  hasActiveFilters,
  HEALTH_MODES,
  HEALTH_LANGUAGES,
  RADIUS_OPTIONS_KM,
  RADIUS_DEFAULT_KM,
  AVAIL_WEEK,
  type HealthFilters,
  type HealthMode,
} from "@/lib/saglik/filters";

/**
 * H3 establishes the searchParams-synced filter pattern (the marketplace uses a
 * modal, so there's nothing to copy wholesale). 'use client' bar:
 *   • initial state ← next/navigation useSearchParams (plain reader)
 *   • each change → build a fresh URLSearchParams + locale-aware router.replace
 *     (REPLACE, not push, scroll:false → no history spam) at the CANONICAL path:
 *     the city filter is a PATH segment (/health/[specialty]/[city]) so the
 *     high-value combos are clean shareable URLs; every other filter stays a
 *     query param. Clearing the city navigates back to /health/[specialty].
 *   • "near me": navigator.geolocation (cheapest — no Mapbox) OR free-text via
 *     /api/health/geocode (server keeps the token off the client). Either path
 *     degrades to the city dropdown on failure (graceful — Demir Kural).
 *
 * The SERVER page parses+validates searchParams (lib/saglik/filters) — this bar
 * only WRITES the URL; it never owns the source of truth.
 */
type Labels = {
  filtersTitle: string;
  cityLabel: string;
  cityAll: string;
  languageLabel: string;
  modeLabel: string;
  modeAny: string;
  modeInPerson: string;
  modeVideo: string;
  modeHomeVisit: string;
  availLabel: string;
  availWeek: string;
  nearLabel: string;
  nearPlaceholder: string;
  useMyLocation: string;
  locating: string;
  locationDenied: string;
  radiusLabel: string;
  radiusKm: string; // "{km} km" — localized unit (ru/uk "{km} км", ar "{km} كم")
  clearFilters: string;
  cityNames: Record<string, string>; // slug → localized city name
  langNames: Record<string, string>; // lang code → localized label
};

export function HealthFilterBar({
  specialtySlug,
  currentCity,
  labels,
}: {
  specialtySlug: string;
  /**
   * The active city on the CANONICAL route /health/[specialty]/[city], where the
   * city is a PATH segment (not ?city=). useSearchParams only sees the query
   * string, so without this the bar's city would always read null on a city page
   * → the <select> would show "All cities" and changing any other filter would
   * navigate() to /health/[specialty] WITHOUT the city, silently dropping it. The
   * server (SpecialtyDirectory) already forces the path city into its filters and
   * threads it here so the bar's state matches reality. null on /health/[specialty]
   * (where city, if any, IS a query param and parseHealthFilters picks it up).
   */
  currentCity: string | null;
  labels: Labels;
}) {
  const modeLabels: Record<HealthMode, string> = {
    in_person: labels.modeInPerson,
    video: labels.modeVideo,
    home_visit: labels.modeHomeVisit,
  };

  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState(false);
  const [nearText, setNearText] = useState("");

  // Initial state from the URL (defensive parse — stale/garbage params dropped).
  // The city is the one filter that can live in the PATH (canonical city route),
  // which useSearchParams cannot see → fall back to the server-supplied path city.
  const parsed = parseHealthFilters(searchParams);
  const filters: HealthFilters = { ...parsed, city: currentCity ?? parsed.city };

  /** Navigate to the canonical route for these filters (city = path segment). */
  const navigate = useCallback(
    (next: HealthFilters) => {
      // City lives in the PATH; strip it from the query string.
      const query = buildFilterQuery({ ...next, city: null });
      const queryObj: Record<string, string> = {};
      query.forEach((v, k) => {
        queryObj[k] = v;
      });
      startTransition(() => {
        if (next.city) {
          router.replace(
            {
              pathname: "/health/[specialty]/[city]",
              params: { specialty: specialtySlug, city: next.city },
              query: queryObj,
            },
            { scroll: false },
          );
        } else {
          router.replace(
            {
              pathname: "/health/[specialty]",
              params: { specialty: specialtySlug },
              query: queryObj,
            },
            { scroll: false },
          );
        }
      });
    },
    [router, specialtySlug],
  );

  const setCity = (slug: string) =>
    navigate({ ...filters, city: slug === "" ? null : slug });

  const toggleLang = (code: string) => {
    const has = filters.langs.includes(code);
    const langs = has
      ? filters.langs.filter((l) => l !== code)
      : [...filters.langs, code].sort();
    navigate({ ...filters, langs });
  };

  const setMode = (mode: string) =>
    navigate({
      ...filters,
      mode: HEALTH_MODES.includes(mode as HealthMode) ? (mode as HealthMode) : null,
    });

  const toggleAvail = () =>
    navigate({ ...filters, avail: filters.avail ? null : AVAIL_WEEK });

  const setRadius = (km: number) =>
    navigate({
      ...filters,
      near: filters.near ? { ...filters.near, radiusKm: km } : null,
    });

  const clearAll = () =>
    navigate({ city: null, langs: [], mode: null, avail: null, near: null });

  /** "Use my location" — geolocation → straight to the geo filter (no Mapbox). */
  const useMyLocation = () => {
    setLocError(false);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocError(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        navigate({
          ...filters,
          near: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            radiusKm: filters.near?.radiusKm ?? RADIUS_DEFAULT_KM,
          },
        });
      },
      () => {
        setLocating(false);
        setLocError(true); // permission denied / unavailable → fall back to dropdown
      },
      { timeout: 8000, maximumAge: 300_000 },
    );
  };

  /** Free-text "near" → server geocode (token stays server-side). Null → no-op
   *  (user falls back to the city dropdown — the page works regardless). */
  const submitNearText = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = nearText.trim();
    if (q === "") return;
    setLocError(false);
    setLocating(true);
    try {
      const res = await fetch(`/api/health/geocode?q=${encodeURIComponent(q)}`);
      const json: unknown = res.ok ? await res.json() : null;
      const point =
        json && typeof json === "object" && "lat" in json && "lng" in json
          ? (json as { lat: number; lng: number })
          : null;
      if (point) {
        navigate({
          ...filters,
          near: {
            lat: point.lat,
            lng: point.lng,
            radiusKm: filters.near?.radiusKm ?? RADIUS_DEFAULT_KM,
          },
        });
      } else {
        setLocError(true);
      }
    } catch {
      setLocError(true);
    } finally {
      setLocating(false);
    }
  };

  const selectCls =
    "rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brandHealth focus:outline-none focus:ring-1 focus:ring-brandHealth dark:border-white/10 dark:bg-white/5 dark:text-white";

  return (
    <section
      aria-label={labels.filtersTitle}
      className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-premium-sm dark:border-white/10 dark:bg-white/5"
      data-pending={isPending ? "1" : undefined}
    >
      <div className="flex flex-wrap items-end gap-3">
        {/* City */}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500 dark:text-white/50">
            {labels.cityLabel}
          </span>
          <select
            value={filters.city ?? ""}
            onChange={(e) => setCity(e.target.value)}
            className={selectCls}
          >
            <option value="">{labels.cityAll}</option>
            {GLATKO_CITIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {labels.cityNames[c.slug] ?? c.name}
              </option>
            ))}
          </select>
        </label>

        {/* Mode */}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500 dark:text-white/50">
            {labels.modeLabel}
          </span>
          <select
            value={filters.mode ?? ""}
            onChange={(e) => setMode(e.target.value)}
            className={selectCls}
          >
            <option value="">{labels.modeAny}</option>
            {HEALTH_MODES.map((m) => (
              <option key={m} value={m}>
                {modeLabels[m]}
              </option>
            ))}
          </select>
        </label>

        {/* Availability — "this week" toggle */}
        <button
          type="button"
          onClick={toggleAvail}
          aria-pressed={filters.avail === AVAIL_WEEK}
          className={`self-end rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            filters.avail === AVAIL_WEEK
              ? "border-brandHealth bg-brandHealth-50 text-brandHealth-700 dark:border-brandHealth dark:bg-brandHealth/15 dark:text-brandHealth"
              : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-white/10 dark:bg-white/5 dark:text-white/70"
          }`}
        >
          {labels.availWeek}
        </button>

        {/* Clear filters */}
        {hasActiveFilters(filters) && (
          <button
            type="button"
            onClick={clearAll}
            className="self-end inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-800 dark:text-white/50 dark:hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
            {labels.clearFilters}
          </button>
        )}
      </div>

      {/* Languages — multi-select chips */}
      <div className="mt-4">
        <span className="text-xs font-medium text-gray-500 dark:text-white/50">
          {labels.languageLabel}
        </span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {HEALTH_LANGUAGES.map((code) => {
            const on = filters.langs.includes(code);
            return (
              <button
                key={code}
                type="button"
                onClick={() => toggleLang(code)}
                aria-pressed={on}
                className={`rounded-md px-2 py-1 text-xs font-medium uppercase transition-colors ${
                  on
                    ? "bg-brandHealth-600 text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/10 dark:text-white/50 dark:hover:bg-white/20"
                }`}
              >
                {labels.langNames[code] ?? code}
              </button>
            );
          })}
        </div>
      </div>

      {/* Near me — geolocation + free-text geocode (graceful fallback to dropdown) */}
      <div className="mt-4 border-t border-gray-100 pt-4 dark:border-white/5">
        <span className="text-xs font-medium text-gray-500 dark:text-white/50">
          {labels.nearLabel}
        </span>
        <form onSubmit={submitNearText} className="mt-1.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-gray-300 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-white/70"
          >
            {locating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LocateFixed className="h-4 w-4 text-brandHealth" />
            )}
            {labels.useMyLocation}
          </button>
          <label className="relative flex-1 min-w-[12rem]">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={nearText}
              onChange={(e) => setNearText(e.target.value)}
              placeholder={labels.nearPlaceholder}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brandHealth focus:outline-none focus:ring-1 focus:ring-brandHealth dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
          </label>
          {filters.near && (
            <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-white/50">
              {labels.radiusLabel}
              <select
                value={filters.near.radiusKm}
                onChange={(e) => setRadius(Number(e.target.value))}
                className={selectCls}
              >
                {RADIUS_OPTIONS_KM.map((km) => (
                  <option key={km} value={km}>
                    {labels.radiusKm.replace("{km}", String(km))}
                  </option>
                ))}
              </select>
            </label>
          )}
        </form>
        {locating && (
          <p className="mt-2 text-xs text-gray-400 dark:text-white/40">{labels.locating}</p>
        )}
        {locError && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            {labels.locationDenied}
          </p>
        )}
      </div>
    </section>
  );
}
