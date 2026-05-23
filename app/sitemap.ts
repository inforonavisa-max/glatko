import type { MetadataRoute } from "next";

import {
  getAllActiveCategories,
  getApprovedProviderCategoryIds,
  getProfessionalsForSitemap,
} from "@/lib/supabase/glatko.server";
import { getAllPostSlugs } from "@/lib/sanity/fetch";
import { SEO_BASE, SEO_LOCALES, hreflangForLocale } from "@/lib/seo";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

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
  const [categories, professionals, blogSlugs, approvedCatIds] =
    await Promise.all([
      getAllActiveCategories(),
      getProfessionalsForSitemap(),
      // Sanity fetch — tolerate failure so a CMS hiccup never breaks
      // the catalog half of the sitemap.
      getAllPostSlugs("me").catch(() => []),
      getApprovedProviderCategoryIds(),
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

  // G-CMS-1: Sanity blog posts. ME is the primary locale; until per-locale
  // sitemap fetches are wired we surface the ME slug (which equals the URL
  // path on /me/blog/[slug]). Other locales serving the same article via
  // their own slug join the canonical via hreflang on the post page.
  for (const post of blogSlugs) {
    if (!post.slug) continue;
    const params = { slug: post.slug };
    const lastModified = post.publishedAt
      ? new Date(post.publishedAt)
      : buildTime;
    for (const locale of LOCALES) {
      routes.push({
        url: `${SEO_BASE}${localizedWithParams(locale as LocaleTuple, "/blog/[slug]", params)}`,
        lastModified,
        changeFrequency: "weekly",
        priority: 0.6,
        alternates: {
          languages: makeAlternatesForParams("/blog/[slug]", params),
        },
      });
    }
  }

  return routes;
}
