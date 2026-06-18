import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import {
  searchProviders,
  getNextSlotDatesBySpecialty,
  getNextSlotsBySpecialty,
  type HealthSearchCard,
} from "@/lib/saglik/queries";
import {
  applyClientFilters,
  nearbyCitySuggestions,
  type HealthFilters,
} from "@/lib/saglik/filters";
import { getCityNameBySlug, GLATKO_CITIES } from "@/lib/glatko/cities";
import { specialtyIcon } from "@/lib/saglik/specialty-icons";
import { intlLocale } from "@/lib/saglik/intl";
import { ProviderCard } from "@/components/glatko-saglik/ProviderCard";
import { HealthFilterBar } from "@/components/glatko-saglik/HealthFilterBar";
import { HealthEmptyState } from "@/components/glatko-saglik/HealthEmptyState";

/**
 * Shared H3 directory body, used by BOTH /health/[specialty] (city in ?city=)
 * and /health/[specialty]/[city] (city as a path segment). Server Component
 * (ISR-compatible — only HealthFilterBar is client). The pages validate the
 * specialty + parse searchParams into Filters, then hand off here.
 *
 * Data flow:
 *   1. searchProviders(specialty, locale, filters) → filtered cards via the 074
 *      read-RPC (city/lang/mode/geo applied in SQL; distanceKm when geo given).
 *   2. "this week available" (avail=week) is cross-referenced HERE against the
 *      069 bulk slot RPC (slot engine stays single-sourced) — wrapped in
 *      try/catch so an availability outage degrades to "show all", never a 500.
 *   3. teaser next-slot chips per card (best-effort, same degrade contract).
 */
type TeaserSlots = Record<
  string,
  Array<{ startUtc: string; endUtc: string; localTime: string; date: string }>
>;

function localTodayIso(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Podgorica" }).format(now);
}

/** Map a search card to the pure-filter shape for the "this week" cross-ref. */
function citySlugForName(name: string | undefined): string | null {
  if (!name) return null;
  const found = GLATKO_CITIES.find((c) => c.name.toLowerCase() === name.toLowerCase());
  return found ? found.slug : null;
}

export async function SpecialtyDirectory({
  specialtySlug,
  specialtyName,
  locale,
  filters,
}: {
  specialtySlug: string;
  specialtyName: string;
  locale: Locale;
  filters: HealthFilters;
}) {
  const t = await getTranslations();
  const d = (k: string) => t(`healthVertical.directory.${k}`);
  const s = (k: string) => t(`healthVertical.directory.search.${k}`);

  // 1) Filtered cards (city/lang/mode/geo in SQL).
  let providers: HealthSearchCard[] = await searchProviders(
    specialtySlug,
    locale,
    filters,
  );

  // 2) "this week available" cross-ref (avail=week) — pure window filter over
  //    the bulk slot RPC. Degrade to "show all" on availability outage.
  if (filters.avail === "week") {
    try {
      const slotDates = await getNextSlotDatesBySpecialty(specialtySlug);
      const todayIso = localTodayIso(new Date());
      const filterable = providers.map((p) => ({
        slug: p.slug,
        languages: p.languages,
        modes: [],
        citySlug: citySlugForName(p.location?.city),
        location: null,
      }));
      const kept = new Set(
        applyClientFilters(
          filterable,
          { city: null, langs: [], mode: null, avail: "week", near: null },
          { nextSlotDates: slotDates, todayIso },
        ).map((p) => p.slug),
      );
      providers = providers.filter((p) => kept.has(p.slug));
    } catch {
      // availability outage → keep all (neutral degrade), do not 500.
    }
  }

  // 3) Teaser "next available" chips per card (best-effort).
  let nextSlots: TeaserSlots = {};
  try {
    nextSlots = await getNextSlotsBySpecialty(specialtySlug);
  } catch {
    nextSlots = {};
  }

  const Icon = specialtyIcon(specialtySlug);

  // Localized city names for the FilterBar dropdown (cities i18n namespace keyed
  // by GLATKO_CITIES.key; falls back to the proper-noun name).
  const cityNames: Record<string, string> = {};
  for (const c of GLATKO_CITIES) {
    cityNames[c.slug] = t.has(`cities.${c.key}`) ? t(`cities.${c.key}`) : c.name;
  }
  // Lang chip labels: uppercase ISO code (matches ProviderCard's raw display).
  const langNames: Record<string, string> = {};
  for (const code of ["me", "sr", "en", "tr", "de", "ru", "uk", "it", "ar"]) {
    langNames[code] = code.toUpperCase();
  }

  // Nearby-city suggestions for the empty state (K3 coastal→Podgorica). Resolved
  // server-side; localized names.
  const nearby = nearbyCitySuggestions(filters.city, 3).map((c) => ({
    slug: c.slug,
    name: cityNames[c.slug] ?? c.name,
  }));

  const hasFilters =
    filters.city !== null ||
    filters.langs.length > 0 ||
    filters.mode !== null ||
    filters.avail !== null ||
    filters.near !== null;

  const intl = intlLocale(locale);
  const cityName = filters.city ? (getCityNameBySlug(filters.city) ?? null) : null;

  return (
    <div className="bg-brandHealth-50/40 dark:bg-transparent">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-28">
        <Link
          href="/health"
          className="inline-flex items-center gap-1 text-sm font-medium text-teal-600 hover:underline dark:text-teal-400"
        >
          <ChevronLeft className="h-4 w-4" />
          {d("allSpecialties")}
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brandHealth-50 dark:bg-brandHealth/15">
            <Icon className="h-6 w-6 text-brandHealth" />
          </span>
          <div>
            <h1 className="font-serif text-3xl font-light tracking-tight text-gray-900 dark:text-white">
              {specialtyName}
              {cityName ? ` · ${cityName}` : ""}
            </h1>
            <p className="text-sm text-gray-500 dark:text-white/50">
              {d("specialtyIntro")}
            </p>
          </div>
        </div>

        <HealthFilterBar
          specialtySlug={specialtySlug}
          currentCity={filters.city}
          labels={{
            filtersTitle: s("filtersTitle"),
            cityLabel: s("cityLabel"),
            cityAll: s("cityAll"),
            languageLabel: s("languageLabel"),
            modeLabel: s("modeLabel"),
            modeAny: s("modeAny"),
            modeInPerson: s("modeInPerson"),
            modeVideo: s("modeVideo"),
            modeHomeVisit: s("modeHomeVisit"),
            availLabel: s("availLabel"),
            availWeek: s("availWeek"),
            nearLabel: s("nearLabel"),
            nearPlaceholder: s("nearPlaceholder"),
            useMyLocation: s("useMyLocation"),
            locating: s("locating"),
            locationDenied: s("locationDenied"),
            radiusLabel: s("radiusLabel"),
            radiusKm: s("radiusKm"),
            clearFilters: s("clearFilters"),
            cityNames,
            langNames,
          }}
        />

        {providers.length === 0 ? (
          <HealthEmptyState
            specialtySlug={specialtySlug}
            filtered={hasFilters}
            labels={{
              title: hasFilters ? s("emptyFilteredTitle") : d("emptyTitle"),
              body: hasFilters ? s("emptyFilteredBody") : d("emptyBody"),
              clearFilters: s("clearFilters"),
              nearbyCities: s("nearbyCities"),
            }}
            nearbyCities={nearby}
          />
        ) : (
          <>
            <p className="mt-6 text-sm text-gray-500 dark:text-white/50">
              {s("resultsCount").replace("{count}", String(providers.length))}
            </p>
            <div className="mt-3 grid gap-4">
              {providers.map((p) => (
                <ProviderCard
                  key={p.slug}
                  provider={p}
                  locale={locale}
                  slots={nextSlots[p.slug] ?? []}
                  labels={{ verified: d("verified"), noAvailability: d("noAvailability") }}
                  distanceLabel={
                    p.distanceKm != null
                      ? s("distanceAway").replace(
                          "{km}",
                          new Intl.NumberFormat(intl, {
                            maximumFractionDigits: 1,
                          }).format(p.distanceKm),
                        )
                      : undefined
                  }
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
