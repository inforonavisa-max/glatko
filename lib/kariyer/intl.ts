/**
 * App locale → BCP-47 tag for `Intl` date/number formatting.
 *
 * Two app locales aren't valid `Intl` locales as-is:
 *  - "me" (Montenegrin) is not recognised by ICU → falls back to English.
 *  - "sr" defaults to Cyrillic, but the Glatko sr UI is written in Latin script.
 * Both map to Serbian-Latin so weekday/month names match the rest of the UI
 * (e.g. "sre 17." instead of "17 Wed" or Cyrillic "сре 17."). All other locales
 * are valid `Intl` tags and pass through unchanged.
 */
const INTL_LOCALE_MAP: Record<string, string> = {
  me: "sr-Latn-ME",
  sr: "sr-Latn",
};

export function intlLocale(locale: string): string {
  return INTL_LOCALE_MAP[locale] ?? locale;
}
