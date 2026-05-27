import { getPathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

export const SEO_LOCALES = ["tr", "en", "de", "it", "ru", "uk", "sr", "me", "ar"] as const;
export const SEO_BASE = "https://glatko.app";

/**
 * BCP 47 hreflang for each locale.
 *   me → sr-Latn-ME (Montenegro, Latin script — matches the URL subtree)
 *   sr → sr-Latn-RS (Serbia, Latin script — matches the URL subtree)
 *
 * The explicit `Latn` script subtag matches what we render in the HTML
 * `<html lang>` attribute and removes ambiguity for Google, which otherwise
 * has to infer script from the region code (Serbian is written in both
 * Cyrillic and Latin).
 */
export function hreflangForLocale(locale: string): string {
  if (locale === "me") return "sr-Latn-ME";
  if (locale === "sr") return "sr-Latn-RS";
  return locale;
}

/**
 * Set of routes declared in `i18n/routing.ts` `pathnames`. Sourced at compile
 * time so adding a new route to the map auto-extends this union — callers of
 * `buildAlternates` cannot drift from the routing config without a type error.
 */
export type Href = keyof typeof routing.pathnames;

type GetPathnameHref = Parameters<typeof getPathname>[0]["href"];

/**
 * Build canonical + 9-locale hreflang alternates for a route.
 *
 *   const alts = buildAlternates(locale, "/services/[slug]", { slug });
 *
 * Each locale's URL is resolved through next-intl's `pathnames` map, so
 * `/de/services/[slug]` → `/de/dienstleistungen/<slug>` automatically. This is
 * the single source of truth — any page emitting canonical/hreflang must use
 * this helper. Double-emission (one set here, one set in a separate component)
 * was the root cause of the 2026-05-18 GSC duplicate-canonical incident
 * (see docs/audits/gsc-audit-2026-05-18.md, Bug A).
 *
 * Parametric routes (paths containing `[`) require `params`. The runtime guard
 * throws fail-fast instead of silently emitting `/[slug]` literals into URLs.
 *
 * `x-default` mirrors the EN alternate by convention.
 */
export function buildAlternates(
  locale: string,
  href: Href,
  params?: Record<string, string>,
): {
  canonical: string;
  languages: Record<string, string>;
} {
  const isParametric =
    typeof href === "string" && (href.includes("[") || href.includes(":"));
  if (isParametric && !params) {
    throw new Error(
      `buildAlternates: route "${href}" is parametric but no params were provided`,
    );
  }

  const hrefArg: GetPathnameHref = (params
    ? { pathname: href, params }
    : href) as GetPathnameHref;

  const languages: Record<string, string> = {};
  for (const l of SEO_LOCALES) {
    languages[hreflangForLocale(l)] =
      `${SEO_BASE}${getPathname({ locale: l as Locale, href: hrefArg })}`;
  }
  // x-default points at the EN alternate by project convention; keeps Google
  // from having to guess when a locale is unsupported in the user's region.
  languages["x-default"] = languages["en"];

  return {
    canonical: `${SEO_BASE}${getPathname({ locale: locale as Locale, href: hrefArg })}`,
    languages,
  };
}

/**
 * Absolute, locale-correct URL for a route declared in i18n/routing.ts.
 *
 *   localizedUrl("de", "/services")                  → https://glatko.app/de/dienstleistungen
 *   localizedUrl("de", "/services/[slug]", { slug }) → https://glatko.app/de/dienstleistungen/<slug>
 *
 * Single source for absolute URLs emitted OUTSIDE Next's metadata pipeline —
 * schema.org/JSON-LD `url`/`item`, breadcrumbs, anywhere a hard-coded
 * `${SEO_BASE}/${locale}/...` would bake in a non-localized path segment.
 * A non-localized `/de/services/...` 307/308-redirects to
 * `/de/dienstleistungen/...` (the GSC "Page with redirect" bucket — SEO-FIX-1),
 * so routing every absolute URL through this helper keeps schema / canonical /
 * hreflang / sitemap in lockstep with the `pathnames` map.
 */
export function localizedUrl(
  locale: string,
  href: Href,
  params?: Record<string, string>,
): string {
  const isParametric =
    typeof href === "string" && (href.includes("[") || href.includes(":"));
  if (isParametric && !params) {
    throw new Error(
      `localizedUrl: route "${href}" is parametric but no params were provided`,
    );
  }
  const hrefArg: GetPathnameHref = (params
    ? { pathname: href, params }
    : href) as GetPathnameHref;
  return `${SEO_BASE}${getPathname({ locale: locale as Locale, href: hrefArg })}`;
}

/**
 * Cross-locale hreflang for a blog post whose language versions are SEPARATE
 * Sanity documents, each with its own localized slug.
 *
 * Unlike `buildAlternates` (one logical page whose single slug is spread across
 * every locale via the pathnames map), this emits hreflang ONLY for locales
 * that actually have a published version — the current post plus each linked
 * translation — so Google never receives an alternate pointing at a slug that
 * doesn't exist in that language. URLs route through `localizedUrl()` to stay
 * in lockstep with the pathnames map; keys use `hreflangForLocale()` (BCP 47).
 * `x-default` → en, else me, else the current post.
 *
 * Additive: `buildAlternates` is unchanged and remains the source for
 * path-translated, all-locale routes (services, static pages).
 */
export function buildPostAlternates(
  currentLocale: string,
  currentSlug: string,
  translations: Array<{ locale?: string | null; slug?: string | null }>,
): {
  canonical: string;
  languages: Record<string, string>;
} {
  const canonical = localizedUrl(currentLocale, "/blog/[slug]", {
    slug: currentSlug,
  });

  const languages: Record<string, string> = {};
  // raw locale → url, kept separately to resolve x-default (which needs the
  // bare `en`/`me` codes, not their BCP-47 forms used as the language keys)
  const byLocale: Record<string, string> = {};

  const add = (loc: string, slug: string) => {
    if (!SEO_LOCALES.includes(loc as (typeof SEO_LOCALES)[number])) return;
    const url = localizedUrl(loc, "/blog/[slug]", { slug });
    languages[hreflangForLocale(loc)] = url;
    byLocale[loc] = url;
  };

  add(currentLocale, currentSlug);
  for (const t of translations) {
    if (t?.locale && t?.slug) add(t.locale, t.slug);
  }

  languages["x-default"] = byLocale["en"] ?? byLocale["me"] ?? canonical;

  return { canonical, languages };
}
