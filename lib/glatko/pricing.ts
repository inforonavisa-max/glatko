/**
 * Static, indicative cost data for service × city pages (G-PSEO-FOUNDATION FAZ 3).
 *
 * WHY static: Glatko has no cost catalog — pricing lives per-professional
 * (hourly_rate_min/max) and per-bid. Showing a "typical range" cost guide is a
 * Cephe 3 (AEO / cost tables) play, so we keep a small, hand-curated dataset of
 * market ranges keyed by `categorySlug:citySlug`.
 *
 * Master Plan İlke 5 (no fabricated stats): these are INDICATIVE market RANGES
 * grounded in Montenegro 2025 sources (gradnja.me, daibau.rs, mojbiznis.me) —
 * NOT performance claims ("X jobs completed", "98% satisfied"). Every surface
 * that renders them MUST also render the `disclaimer` template string.
 *
 * FAZ-3A scope: only the sample combo (renovation-construction:podgorica).
 * Adding a combo is a one-object change here.
 */
import type { Locale } from "@/i18n/routing";

export type PriceUnit = "hour" | "job" | "sqm" | "item";

export interface CostRange {
  min: number;
  max: number;
  currency: "EUR";
  unit: PriceUnit;
  /** Cost drivers, surfaced as a hint, not a quote. */
  factors?: string[];
}

export interface PricingExample {
  /** i18n sub-key under servicesCity.content.<slug>.<city>.costScenario.<key> */
  scenarioKey: string;
  priceRange: CostRange;
}

export interface ServiceCityPricing {
  categorySlug: string;
  citySlug: string;
  typical: CostRange;
  examples: PricingExample[];
  /** ISO date — keeps cost guides auditable / refreshable. */
  lastUpdated: string;
}

function key(categorySlug: string, citySlug: string): string {
  return `${categorySlug}:${citySlug}`;
}

/**
 * Indicative ranges (Montenegro, 2025). Renovation overall ~€400–600/m²
 * (standard→premium); bathroom €300–700/m²; tiling €15–50/m²; kitchen a
 * per-project estimate. Conservative bands — actual price comes from quotes.
 */
export const PRICING_DATA: Record<string, ServiceCityPricing> = {
  "renovation-construction:podgorica": {
    categorySlug: "renovation-construction",
    citySlug: "podgorica",
    typical: {
      min: 300,
      max: 600,
      currency: "EUR",
      unit: "sqm",
      factors: ["materials", "complexity", "finishLevel", "urgency"],
    },
    examples: [
      {
        scenarioKey: "fullApartment",
        priceRange: { min: 400, max: 600, currency: "EUR", unit: "sqm" },
      },
      {
        scenarioKey: "bathroom",
        priceRange: { min: 300, max: 700, currency: "EUR", unit: "sqm" },
      },
      {
        scenarioKey: "kitchen",
        priceRange: { min: 2500, max: 9000, currency: "EUR", unit: "job" },
      },
      {
        scenarioKey: "tiling",
        priceRange: { min: 15, max: 50, currency: "EUR", unit: "sqm" },
      },
      {
        scenarioKey: "painting",
        priceRange: { min: 4, max: 12, currency: "EUR", unit: "sqm" },
      },
    ],
    lastUpdated: "2026-06-09",
  },
};

export function getCostRange(
  categorySlug: string,
  citySlug: string,
): ServiceCityPricing | null {
  return PRICING_DATA[key(categorySlug, citySlug)] ?? null;
}

/** BCP-47 tags for Intl number grouping; app locales aren't all valid tags. */
const NUMBER_LOCALE: Record<Locale, string> = {
  tr: "tr",
  en: "en",
  de: "de",
  it: "it",
  ru: "ru",
  uk: "uk",
  sr: "sr-Latn",
  me: "sr-Latn",
  ar: "ar",
};

/** Locales that write the euro symbol AFTER the amount ("300 €"). */
const EURO_AFTER: ReadonlySet<Locale> = new Set<Locale>([
  "tr",
  "de",
  "it",
  "ru",
  "uk",
  "sr",
  "me",
]);

/** Short unit labels per locale. "m²" is universal; others localized. */
const UNIT_LABELS: Record<Locale, Record<PriceUnit, string>> = {
  tr: { hour: "saat", job: "proje", sqm: "m²", item: "adet" },
  en: { hour: "hour", job: "project", sqm: "m²", item: "item" },
  de: { hour: "Stunde", job: "Projekt", sqm: "m²", item: "Stück" },
  it: { hour: "ora", job: "progetto", sqm: "m²", item: "pezzo" },
  ru: { hour: "час", job: "проект", sqm: "m²", item: "шт." },
  uk: { hour: "год", job: "проєкт", sqm: "m²", item: "шт." },
  sr: { hour: "sat", job: "projekat", sqm: "m²", item: "komad" },
  me: { hour: "sat", job: "projekat", sqm: "m²", item: "komad" },
  ar: { hour: "ساعة", job: "مشروع", sqm: "م²", item: "قطعة" },
};

function formatAmount(value: number, locale: Locale): string {
  const grouped = new Intl.NumberFormat(NUMBER_LOCALE[locale] ?? "en", {
    maximumFractionDigits: 0,
  }).format(value);
  return EURO_AFTER.has(locale) ? `${grouped} €` : `€${grouped}`;
}

/**
 * "€300 – €600 / m²" (en) · "300 € – 600 € / m²" (de/me) — euro placement and
 * digit grouping follow the locale; the unit label is localized.
 */
export function formatPriceRange(range: CostRange, locale: Locale): string {
  const unit = UNIT_LABELS[locale]?.[range.unit] ?? UNIT_LABELS.en[range.unit];
  return `${formatAmount(range.min, locale)} – ${formatAmount(range.max, locale)} / ${unit}`;
}
