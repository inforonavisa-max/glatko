import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { createClient } from "@/supabase/server";
import { routing, type Locale } from "@/i18n/routing";
import LandingPageClient, {
  type FeaturedCategoryCard,
  type RootCategoryLink,
} from "./landing-page-client";
import { LatestBlogPosts } from "@/components/glatko/landing/LatestBlogPosts";
import {
  generateWebSiteSchema,
  generateFAQPageSchema,
  jsonLdScriptProps,
  type LocalizedFAQ,
} from "@/lib/seo/jsonld";
import { HOME_FAQ_KEYS } from "@/lib/glatko/home-faq";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  return { title: t("seo.homeTitle") };
}

const FEATURED_CATEGORY_SLUGS = [
  "boat-services",
  "home-cleaning",
  "renovation-construction",
  "beauty-wellness",
] as const;

export default async function LocaleHomePage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();

  const supabase = createClient();

  // Three independent category reads — run them concurrently so the homepage
  // pays one round-trip instead of three serial ones. (All active root
  // categories feed crawlable internal links from home, incl. provider-less
  // roots which stay indexable; not gated on is_p0, which curates /services.)
  const [{ data: rows }, { count: totalCategoryCount }, { data: rootRows }] =
    await Promise.all([
      supabase
        .from("glatko_service_categories")
        .select("id, slug, name, description, hero_image_url, icon")
        .in("slug", FEATURED_CATEGORY_SLUGS as unknown as string[])
        .is("parent_id", null)
        .eq("is_active", true),
      supabase
        .from("glatko_service_categories")
        .select("id", { count: "exact", head: true })
        .is("parent_id", null)
        .eq("is_active", true),
      supabase
        .from("glatko_service_categories")
        .select("slug, name")
        .is("parent_id", null)
        .eq("is_active", true)
        .order("badge_priority", { ascending: true, nullsFirst: false }),
    ]);

  const bySlug = new Map(
    (rows ?? []).map((r) => [r.slug as string, r as FeaturedCategoryCard]),
  );
  const featuredCategories: FeaturedCategoryCard[] = FEATURED_CATEGORY_SLUGS
    .map((s) => bySlug.get(s))
    .filter((c): c is FeaturedCategoryCard => Boolean(c));

  const allCategories: RootCategoryLink[] = (rootRows ?? []).map((r) => ({
    slug: r.slug as string,
    name: r.name as RootCategoryLink["name"],
  }));

  // Homepage FAQPage JSON-LD — built from the same landing.faq.* dictionary
  // entries the visible <FAQ/> accordion renders (single source → the
  // structured data and on-page content always match, which Google's FAQ
  // rich-result policy requires). Skips gracefully if any entry is missing.
  const t = await getTranslations({ locale });
  const homeFaqs: LocalizedFAQ[] = HOME_FAQ_KEYS.flatMap((n) => {
    const qKey = `landing.faq.q${n}` as const;
    const aKey = `landing.faq.a${n}` as const;
    if (!t.has(qKey) || !t.has(aKey)) return [];
    return [{ q: { [locale]: t(qKey) }, a: { [locale]: t(aKey) } }];
  });
  const faqSchema = generateFAQPageSchema(homeFaqs, locale);

  return (
    <>
      <script {...jsonLdScriptProps(generateWebSiteSchema(locale))} />
      {faqSchema ? <script {...jsonLdScriptProps(faqSchema)} /> : null}
      {/* VerticalsNav moved to app/[locale]/layout.tsx so the 3-tab switcher
          is persistent on every page (was homepage-only — see feat/health-nav-fix). */}
      <LandingPageClient
        featuredCategories={featuredCategories}
        totalCategoryCount={totalCategoryCount ?? 0}
        allCategories={allCategories}
        locale={locale as Locale}
      />
      <LatestBlogPosts locale={locale} />
    </>
  );
}
