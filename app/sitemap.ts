import type { MetadataRoute } from "next";

import {
  getAllActiveCategories,
  getApprovedProviderCategoryIds,
  getProfessionalsForSitemap,
} from "@/lib/supabase/glatko.server";
import { getAllPostSlugsWithTranslations } from "@/lib/sanity/fetch";
import {
  buildPostAlternates,
  SEO_BASE,
  SEO_LOCALES,
  hreflangForLocale,
} from "@/lib/seo";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getLiquidCombinations } from "@/lib/glatko/liquidity";

// Force runtime evaluation. Our Supabase server client depends on `cookies()`,
// which throws during build-time prerender; without this the DB-driven
// category list comes back empty and only the static-page entries ship.
// Cached for 1h to amortize the DB hit across crawler bursts.
export const dynamic = "force-dynamic";
export const revalidate = 3600;

const LOCALES = SEO_LOCALES;

type LocaleTuple = (typeof routing.locales)[number];

/**
 * Localize a canonical href via next-intl pathnames. The returned path
 * already includes the locale prefix (e.g. "/tr/profesyonel-ol"), so
 * callers should NOT prepend the locale separately.
 */
function localized(locale: LocaleTuple, href: string): string {
  return getPathname({
    locale,
    href: href as Parameters<typeof getPathname>[0]["href"],
  });
}

/**
 * Localize a parametric route (e.g. /services/[slug]) by passing pathname +
 * params. Used for category and pro pages where the slug is dynamic.
 * Returns the full locale-prefixed path.
 */
function localizedWithParams(
  locale: LocaleTuple,
  pathname: string,
  params: Record<string, string>,
): string {
  return getPathname({
    locale,
    href: { pathname, params } as Parameters<typeof getPathname>[0]["href"],
  });
}

function makeAlternatesForHref(href: string): Record<string, string> {
  const entries: [string, string][] = LOCALES.map((l) => [
    hreflangForLocale(l),
    `${SEO_BASE}${localized(l as LocaleTuple, href)}`,
  ]);
  entries.push(["x-default", `${SEO_BASE}${localized("en", href)}`]);
  return Object.fromEntries(entries);
}

function makeAlternatesForParams(
  pathname: string,
  params: Record<string, string>,
): Record<string, string> {
  const entries: [string, string][] = LOCALES.map((l) => [
    hreflangForLocale(l),
    `${SEO_BASE}${localizedWithParams(l as LocaleTuple, pathname, params)}`,
  ]);
  entries.push([
    "x-default",
    `${SEO_BASE}${localizedWithParams("en", pathname, params)}`,
  ]);
  return Object.fromEntries(entries);
}

const STATIC_PAGES = [
  { path: "/", priority: 1.0, changeFrequency: "daily" as const },
  { path: "/services", priority: 0.9, changeFrequency: "weekly" as const },
  { path: "/become-a-pro", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/become-a-pro/founding", priority: 0.6, changeFrequency: "monthly" as const },
  { path: "/blog", priority: 0.7, changeFrequency: "daily" as const },
  { path: "/about", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/terms", priority: 0.3, changeFrequency: "monthly" as const },
  { path: "/privacy", priority: 0.3, changeFrequency: "monthly" as const },
  { path: "/cookies", priority: 0.3, changeFrequency: "monthly" as const },
  { path: "/gdpr", priority: 0.3, changeFrequency: "monthly" as const },
  { path: "/contact", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/how-it-works", priority: 0.5, changeFrequency: "monthly" as const },
] as const;

/**
 * G-CAT-4 + G-SEO-FOUNDATION: dynamic sitemap.
 * - Static pages × 9 locales (81 URLs).
 * - Active categories from DB × 9 locales.
 * - Active+approved provider profiles at /{locale}/pros/{slug} × 9 locales
 *   (G-SEO-FOUNDATION Faz 6: replaces UUID surface with stable slugs).
 *
 * Each entry carries 9-locale hreflang alternates so Search Console can
 * deduplicate locale variants.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [
    categories,
    professionals,
    blogPostsByLocale,
    approvedCatIds,
    liquidCombos,
  ] = await Promise.all([
    getAllActiveCategories(),
    getProfessionalsForSitemap(),
    // Sanity fetch — per locale, tolerating failure per locale so a single
    // CMS hiccup never zeroes out the whole blog half of the sitemap.
    Promise.all(
      LOCALES.map((l) => getAllPostSlugsWithTranslations(l).catch(() => [])),
    ),
    getApprovedProviderCategoryIds(),
    // G-PSEO-FOUNDATION FAZ2: liquid service × city combinations (only those
    // passing the liquidity gate are publishable). One bulk RPC call.
    getLiquidCombinations(),
  ]);
  const buildTime = new Date();
  const routes: MetadataRoute.Sitemap = [];

  for (const page of STATIC_PAGES) {
    for (const locale of LOCALES) {
      routes.push({
        url: `${SEO_BASE}${localized(locale as LocaleTuple, page.path)}`,
        lastModified: buildTime,
        changeFrequency: page.changeFrequency,
        priority: page.priority,
        alternates: { languages: makeAlternatesForHref(page.path) },
      });
    }
  }

  // G-SEO-FIX-1 / A1 (Phase 1 — sitemap-exclude only, NO noindex):
  // A category enters the sitemap iff it is a root (taxonomy backbone, always
  // indexed), OR has >=1 approved+active provider, OR carries real editorial
  // content (any localized description > 100 chars). Empty leaf sub-categories
  // are dropped so Google's crawl priority follows content quality — the pages
  // stay live and reachable via internal links (noindex deferred to Phase 2).
  const hasEditorial = (d: Record<string, string> | null): boolean =>
    !!d && Object.values(d).some((v) => typeof v === "string" && v.length > 100);
  const childIdsByParent = new Map<string, string[]>();
  for (const c of categories) {
    if (c.parent_id) {
      const arr = childIdsByParent.get(c.parent_id) ?? [];
      arr.push(c.id);
      childIdsByParent.set(c.parent_id, arr);
    }
  }
  const isIndexable = (c: (typeof categories)[number]): boolean => {
    if (c.parent_id === null) return true; // root: taxonomy backbone
    if (approvedCatIds.has(c.id)) return true; // own approved+active provider
    // rollup safety net for any future 3rd taxonomy level (leaves: no-op)
    if ((childIdsByParent.get(c.id) ?? []).some((id) => approvedCatIds.has(id)))
      return true;
    return hasEditorial(c.description); // real editorial content
  };
  const indexableCategories = categories.filter(isIndexable);

  for (const category of indexableCategories) {
    const params = { slug: category.slug };
    const lastModified = category.created_at
      ? new Date(category.created_at)
      : buildTime;
    // Roots (parent_id IS NULL) outrank sub-cats slightly so Google's
    // priority hint reflects the catalog hierarchy.
    const priority = category.parent_id === null ? 0.8 : 0.7;
    for (const locale of LOCALES) {
      routes.push({
        url: `${SEO_BASE}${localizedWithParams(locale as LocaleTuple, "/services/[slug]", params)}`,
        lastModified,
        changeFrequency: "weekly",
        priority,
        alternates: {
          languages: makeAlternatesForParams("/services/[slug]", params),
        },
      });
    }
  }

  // G-PSEO-FOUNDATION FAZ2: liquid service × city pages. Only combinations that
  // clear the liquidity gate are emitted; "coming soon" placeholders (the vast
  // majority of the 14×8 grid right now) stay out of the sitemap until they
  // become liquid. Self-canonical + 9 hreflang via the shared helpers.
  for (const { category, city } of liquidCombos) {
    const params = { slug: category, city };
    for (const locale of LOCALES) {
      routes.push({
        url: `${SEO_BASE}${localizedWithParams(locale as LocaleTuple, "/services/[slug]/[city]", params)}`,
        lastModified: buildTime,
        changeFrequency: "weekly",
        priority: 0.6,
        alternates: {
          languages: makeAlternatesForParams("/services/[slug]/[city]", params),
        },
      });
    }
  }

  for (const pro of professionals) {
    const params = { slug: pro.slug };
    const lastModified = pro.updated_at
      ? new Date(pro.updated_at)
      : buildTime;
    for (const locale of LOCALES) {
      routes.push({
        url: `${SEO_BASE}${localizedWithParams(locale as LocaleTuple, "/pros/[slug]", params)}`,
        lastModified,
        changeFrequency: "weekly",
        priority: 0.7,
        alternates: {
          languages: makeAlternatesForParams("/pros/[slug]", params),
        },
      });
    }
  }

  // G-CMS-1 / SEO-SITEMAP-FIX: Sanity blog posts.
  //
  // Each locale's posts are fetched separately (Promise.all above) and emitted
  // at THEIR OWN slug. The previous implementation took ME slugs only and
  // cross-spread each across all nine locale prefixes — for any post whose
  // non-ME slug differed (i.e. every post since the SEO-HREFLANG-FIX migration)
  // that produced 404-bound sitemap entries and hid the real per-locale URLs.
  //
  // For alternates we reuse `buildPostAlternates`, which consumes the post's
  // `translations` array (a [{locale, slug}] list resolved by
  // ALL_POST_SLUGS_WITH_TRANSLATIONS_QUERY) and returns the same hreflang
  // cluster the blog page itself emits in its <head>. Sitemap + page now agree
  // by construction.
  for (let i = 0; i < LOCALES.length; i++) {
    const locale = LOCALES[i] as LocaleTuple;
    const localePosts = blogPostsByLocale[i] ?? [];
    for (const post of localePosts) {
      if (!post.slug) continue;
      const lastModified = post.publishedAt
        ? new Date(post.publishedAt)
        : buildTime;
      const { canonical, languages } = buildPostAlternates(
        locale,
        post.slug,
        post.translations ?? [],
      );
      routes.push({
        url: canonical,
        lastModified,
        changeFrequency: "weekly",
        priority: 0.6,
        alternates: { languages },
      });
    }
  }

  return routes;
}
