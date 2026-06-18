/**
 * Single source of truth (SSOT) for Glatko's cities — all 25 official
 * Montenegro municipalities (opštine), incl. Zeta (split from Podgorica, a
 * municipality since 2024).
 *
 * Every consumer (onboarding, profile settings, search filter, admin provider
 * area, request-service location, SEO JSON-LD) derives its list from here, so
 * adding/adjusting a city is a ONE-FILE change.
 *
 * Fields:
 *   • key   — i18n key under the dictionaries "cities" namespace (ASCII, camelCase)
 *   • name  — official Latin name (proper noun; same across all locales)
 *   • slug  — URL-safe identifier
 *   • lat/lng — municipal-seat coordinates (~4 decimals: enough for Google's
 *               "near me" / areaServed matching, not GPS-precise). The first six
 *               reuse the exact values previously in lib/seo/jsonld.ts.
 *
 * City NAMES are proper nouns and are not translated; the "cities" i18n
 * namespace exists so the KEY layer is consistent and a future per-locale
 * transliteration (e.g. Cyrillic) is a drop-in.
 */
export type GlatkoCity = {
  key: string;
  name: string;
  slug: string;
  lat: number;
  lng: number;
};

export const GLATKO_CITIES: readonly GlatkoCity[] = [
  { key: "podgorica", name: "Podgorica", slug: "podgorica", lat: 42.4304, lng: 19.2594 },
  { key: "niksic", name: "Nikšić", slug: "niksic", lat: 42.7731, lng: 18.9445 },
  { key: "hercegNovi", name: "Herceg Novi", slug: "herceg-novi", lat: 42.4531, lng: 18.5375 },
  { key: "pljevlja", name: "Pljevlja", slug: "pljevlja", lat: 43.3567, lng: 19.3584 },
  { key: "bijeloPolje", name: "Bijelo Polje", slug: "bijelo-polje", lat: 43.0383, lng: 19.7476 },
  { key: "bar", name: "Bar", slug: "bar", lat: 42.0931, lng: 19.1006 },
  { key: "budva", name: "Budva", slug: "budva", lat: 42.2911, lng: 18.84 },
  { key: "berane", name: "Berane", slug: "berane", lat: 42.8458, lng: 19.8722 },
  { key: "kotor", name: "Kotor", slug: "kotor", lat: 42.4247, lng: 18.7712 },
  { key: "ulcinj", name: "Ulcinj", slug: "ulcinj", lat: 41.9294, lng: 19.2244 },
  { key: "tivat", name: "Tivat", slug: "tivat", lat: 42.4347, lng: 18.6961 },
  { key: "cetinje", name: "Cetinje", slug: "cetinje", lat: 42.3911, lng: 18.9116 },
  { key: "rozaje", name: "Rožaje", slug: "rozaje", lat: 42.8408, lng: 20.1664 },
  { key: "danilovgrad", name: "Danilovgrad", slug: "danilovgrad", lat: 42.5536, lng: 19.1069 },
  { key: "mojkovac", name: "Mojkovac", slug: "mojkovac", lat: 42.9603, lng: 19.5831 },
  { key: "kolasin", name: "Kolašin", slug: "kolasin", lat: 42.8222, lng: 19.5172 },
  { key: "plav", name: "Plav", slug: "plav", lat: 42.5969, lng: 19.9442 },
  { key: "zabljak", name: "Žabljak", slug: "zabljak", lat: 43.1547, lng: 19.1228 },
  { key: "pluzine", name: "Plužine", slug: "pluzine", lat: 43.1561, lng: 18.8439 },
  { key: "savnik", name: "Šavnik", slug: "savnik", lat: 42.9572, lng: 19.0961 },
  { key: "andrijevica", name: "Andrijevica", slug: "andrijevica", lat: 42.7344, lng: 19.7906 },
  { key: "gusinje", name: "Gusinje", slug: "gusinje", lat: 42.5611, lng: 19.8336 },
  { key: "petnjica", name: "Petnjica", slug: "petnjica", lat: 42.9106, lng: 19.9656 },
  { key: "tuzi", name: "Tuzi", slug: "tuzi", lat: 42.3656, lng: 19.3314 },
  { key: "zeta", name: "Zeta", slug: "zeta", lat: 42.3361, lng: 19.2447 },
];

export const CITY_KEYS: readonly string[] = GLATKO_CITIES.map((c) => c.key);
export const CITY_NAMES: readonly string[] = GLATKO_CITIES.map((c) => c.name);

/** Sentinel select value for the free-text "type your city" option. */
export const OTHER_CITY_VALUE = "__other__";
/** i18n key (under the "cities" namespace) for the "other" option label. */
export const OTHER_CITY_KEY = "other";

export function getCityByKey(key: string): GlatkoCity | undefined {
  return GLATKO_CITIES.find((c) => c.key === key);
}

export function getCityBySlug(slug: string): GlatkoCity | undefined {
  return GLATKO_CITIES.find((c) => c.slug === slug);
}

export function getCityByName(name: string): GlatkoCity | undefined {
  const n = name.trim().toLowerCase();
  return GLATKO_CITIES.find((c) => c.name.toLowerCase() === n);
}

export function getCityName(key: string): string | undefined {
  return getCityByKey(key)?.name;
}

/** Official Latin name for a city SLUG (e.g. "budva" → "Budva"); undefined if unknown. */
export function getCityNameBySlug(slug: string): string | undefined {
  return getCityBySlug(slug)?.name;
}

/**
 * Backward-compatible with the pre-SSOT helper: true when `value` matches a
 * known city NAME (case-insensitive). Free-text "other" cities return false,
 * which is fine — the city column is free text and callers allow custom values.
 */
export function isGlatkoCity(value: string): boolean {
  return getCityByName(value) !== undefined;
}
