/**
 * Glatko launch-market cities (Montenegro coast + capital). Used by the
 * post-signup onboarding step. City names are proper nouns and are NOT
 * translated, so a single shared list works across all locales.
 */
export const GLATKO_CITIES = [
  "Budva",
  "Kotor",
  "Tivat",
  "Bar",
  "Herceg Novi",
  "Podgorica",
] as const;

export type GlatkoCity = (typeof GLATKO_CITIES)[number];

export function isGlatkoCity(value: string): value is GlatkoCity {
  return (GLATKO_CITIES as readonly string[]).includes(value);
}
