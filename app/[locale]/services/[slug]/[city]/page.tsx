import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";

import { routing, type Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { ArrowRight, Star, Users } from "lucide-react";
import { PageBackground } from "@/components/ui/PageBackground";
import { Breadcrumb, type BreadcrumbCrumb } from "@/components/seo/Breadcrumb";
import { FoundingProviderBadge } from "@/components/glatko/founding/FoundingProviderBadge";
import {
  getCategoryBySlug,
  getSubCategories,
  getCitiesServingCategory,
  searchProfessionals,
} from "@/lib/supabase/glatko.server";
import { buildAlternates, localizedUrl } from "@/lib/seo";
import { GLATKO_CITIES, getCityByName } from "@/lib/glatko/cities";
import { getLiquidityStatus } from "@/lib/glatko/liquidity";
import { getCostRange, formatPriceRange } from "@/lib/glatko/pricing";
import {
  generateServiceCitySchema,
  generateLocalBusinessCitySchema,
  generateBreadcrumbSchema,
  generateFAQPageSchema,
  jsonLdScriptProps,
} from "@/lib/seo/jsonld";
import { Intro } from "@/components/glatko/service-city/Intro";
import { WhatsIncluded } from "@/components/glatko/service-city/WhatsIncluded";
import {
  HowItWorks,
  type HowItWorksStep,
} from "@/components/glatko/service-city/HowItWorks";
import {
  CostGuideTable,
  type CostGuideRow,
} from "@/components/glatko/service-city/CostGuideTable";
import {
  PageFAQ,
  type PageFAQItem,
} from "@/components/glatko/service-city/PageFAQ";
import {
  RelatedLinks,
  type RelatedLinkGroup,
} from "@/components/glatko/service-city/RelatedLinks";

/**
 * Service × city page — G-PSEO-FOUNDATION.
 *
 * FAZ 1: routing + scaffold (noindex "coming soon").
 * FAZ 2 (this): liquidity gate. getLiquidityStatus() decides per combination:
 *   - LIQUID (>= threshold active+verified providers, Master Plan v1.1 M0-M2 =
 *     3): robots index,follow + provider count + a basic provider list.
 *   - NOT liquid: robots noindex,follow + the FAZ 1 "coming soon" placeholder.
 *
 * Rich, generated content (cost tables, Q&A, etc.) is FAZ 3 — NOT here.
 * SEO single-sourced through buildAlternates() (self-canonical + 9 hreflang).
 */
type Props = {
  params:
    | Promise<{ locale: string; slug: string; city: string }>
    | { locale: string; slug: string; city: string };
};

export const revalidate = 3600;

function pickLocalized(
  obj: Record<string, string> | null | undefined,
  locale: string,
  fallback: string,
): string {
  if (!obj) return fallback;
  return obj[locale] || obj.en || fallback;
}

function findCity(citySlug: string) {
  return GLATKO_CITIES.find((c) => c.slug === citySlug) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug, city: citySlug } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};

  const category = await getCategoryBySlug(slug);
  const city = findCity(citySlug);
  if (!category || !city) return { robots: { index: false, follow: false } };

  const t = await getTranslations({ locale });
  const service = pickLocalized(category.name, locale, slug);
  const vars = { service, city: city.name };
  const title = t("servicesCity.titlePattern", vars);
  const description = t("servicesCity.metaDescription", vars);
  const alternates = buildAlternates(locale, "/services/[slug]/[city]", {
    slug,
    city: citySlug,
  });

  // Liquidity gate drives indexability: only publishable (liquid) combinations
  // are indexed; "coming soon" placeholders stay out of the index.
  const liquidity = await getLiquidityStatus(slug, citySlug);

  return {
    title,
    description,
    alternates,
    robots: { index: liquidity.isLiquid, follow: true },
    openGraph: {
      title,
      description,
      url: alternates.canonical,
      siteName: "Glatko",
      locale,
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

type ProRow = {
  id: string;
  slug?: string | null;
  business_name: string | null;
  avg_rating: number;
  total_reviews: number;
  is_founding_provider?: boolean | null;
  founding_provider_number?: number | null;
  profile?: { full_name: string | null; avatar_url: string | null } | null;
};

export default async function ServiceCityPage({ params }: Props) {
  const {
    locale: localeParam,
    slug,
    city: citySlug,
  } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, localeParam)) notFound();
  const locale = localeParam as Locale;
  setRequestLocale(locale);

  const category = await getCategoryBySlug(slug);
  const city = findCity(citySlug);
  if (!category || !city) notFound();

  const t = await getTranslations();
  const service = pickLocalized(category.name, locale, slug);
  const vars = { service, city: city.name };

  const liquidity = await getLiquidityStatus(slug, citySlug);
  const pros: ProRow[] = liquidity.isLiquid
    ? ((
        await searchProfessionals({
          locale,
          categorySlug: slug,
          city: citySlug,
          sortBy: "rating",
          limit: 12,
        })
      ).professionals as ProRow[])
    : [];

  // --- FAZ 3 content layer (liquid pages only) ---------------------------
  // Generic template keys exist in all 9 locales; per-page content
  // (servicesCity.content.<slug>.<city>.*) is authored per locale and gated
  // with t.has() so locales without it (FAZ-3B backlog) degrade gracefully
  // instead of rendering raw keys or "[FAZ-3B]" placeholders.
  const contentBase = `servicesCity.content.${slug}.${citySlug}`;
  let introText: string | null = null;
  const includedItems: string[] = [];
  let howItWorksSteps: HowItWorksStep[] = [];
  let costRows: CostGuideRow[] = [];
  let typicalRange: string | null = null;
  const pageFaqs: PageFAQItem[] = [];
  let relatedGroups: RelatedLinkGroup[] = [];

  if (liquidity.isLiquid) {
    introText = t.has(`${contentBase}.intro`) ? t(`${contentBase}.intro`) : null;

    for (let i = 1; i <= 8; i++) {
      const k = `${contentBase}.included${i}`;
      if (t.has(k)) includedItems.push(t(k));
    }

    howItWorksSteps = [1, 2, 3]
      .map((n) => {
        const titleKey = `servicesCity.template.howItWorks.step${n}Title`;
        const bodyKey = `servicesCity.template.howItWorks.step${n}Body`;
        if (!t.has(titleKey) || !t.has(bodyKey)) return null;
        return { title: t(titleKey), body: t(bodyKey) };
      })
      .filter((s): s is HowItWorksStep => s !== null);

    const pricing = getCostRange(slug, citySlug);
    if (pricing) {
      typicalRange = formatPriceRange(pricing.typical, locale);
      costRows = pricing.examples
        .map((ex) => {
          const labelKey = `${contentBase}.costScenario.${ex.scenarioKey}`;
          if (!t.has(labelKey)) return null;
          return {
            label: t(labelKey),
            range: formatPriceRange(ex.priceRange, locale),
          };
        })
        .filter((r): r is CostGuideRow => r !== null);
    }

    for (let i = 1; i <= 8; i++) {
      const qKey = `${contentBase}.faqQ${i}`;
      const aKey = `${contentBase}.faqA${i}`;
      if (t.has(qKey) && t.has(aKey)) {
        pageFaqs.push({ question: t(qKey), answer: t(aKey) });
      }
    }

    // Internal links: related services (same city) + this service in other
    // cities. Other-cities list is demand-driven (cities that actually serve
    // this category) — İlke 3 (no city priority).
    const subCats = await getSubCategories(category.id);
    const relatedServiceLinks = subCats.slice(0, 8).map((c) => ({
      label: pickLocalized(c.name as Record<string, string>, locale, c.slug),
      href: {
        pathname: "/services/[slug]/[city]" as const,
        params: { slug: c.slug, city: citySlug },
      },
    }));

    const servingCities = await getCitiesServingCategory(category.id);
    const relatedCityLinks = Array.from(
      new Map(
        servingCities
          .map((name) => getCityByName(name))
          .filter((c) => c !== undefined && c.slug !== citySlug)
          .map((c) => [c!.slug, c!] as const),
      ).values(),
    )
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8)
      .map((c) => ({
        label: c.name,
        href: {
          pathname: "/services/[slug]/[city]" as const,
          params: { slug, city: c.slug },
        },
      }));

    relatedGroups = [
      {
        heading: t("servicesCity.template.relatedServices.headline"),
        links: relatedServiceLinks,
      },
      {
        heading: t("servicesCity.template.relatedCities.headline"),
        links: relatedCityLinks,
      },
    ];
  }

  const crumbs: BreadcrumbCrumb[] = [
    { name: "Glatko", href: "/" },
    { name: t("nav.services"), href: "/services" },
    { name: service, href: { pathname: "/services/[slug]", params: { slug } } },
    {
      name: city.name,
      href: {
        pathname: "/services/[slug]/[city]",
        params: { slug, city: citySlug },
      },
    },
  ];

  // Page-specific JSON-LD for LIQUID (indexable) pages: Service + LocalBusiness
  // (city-scoped, for Google local rich results) + BreadcrumbList. Non-liquid
  // pages stay minimal (only the layout Organization). Reuses
  // generateBreadcrumbSchema + the localized servicesCity.metaDescription, so no
  // new i18n keys. The layout's Organization schema is left untouched.
  const pageUrl = localizedUrl(locale, "/services/[slug]/[city]", {
    slug,
    city: citySlug,
  });
  const serviceDescription = t("servicesCity.metaDescription", vars);
  const citySchemas = liquidity.isLiquid
    ? [
        generateServiceCitySchema({
          serviceName: service,
          serviceDescription,
          serviceTypeEn: pickLocalized(category.name, "en", slug),
          cityName: city.name,
          url: pageUrl,
        }),
        generateLocalBusinessCitySchema({
          serviceName: service,
          serviceDescription,
          cityName: city.name,
          cityGeo: { latitude: city.lat, longitude: city.lng },
          url: pageUrl,
        }),
        generateBreadcrumbSchema([
          { name: "Glatko", url: localizedUrl(locale, "/") },
          { name: t("nav.services"), url: localizedUrl(locale, "/services") },
          {
            name: service,
            url: localizedUrl(locale, "/services/[slug]", { slug }),
          },
          { name: city.name, url: pageUrl },
        ]),
        // FAQPage from this page's own FAQ (single source — same data the
        // visible PageFAQ renders). Only when the locale has authored FAQs.
        ...(pageFaqs.length > 0
          ? [
              generateFAQPageSchema(
                pageFaqs.map((f) => ({
                  q: { [locale]: f.question },
                  a: { [locale]: f.answer },
                })),
                locale,
              ),
            ].filter((s): s is NonNullable<typeof s> => s !== null)
          : []),
      ]
    : [];

  return (
    <PageBackground opacity={0.1}>
      {citySchemas.map((schema, i) => (
        <script key={i} {...jsonLdScriptProps(schema)} />
      ))}
      <Breadcrumb items={crumbs} />

      <div className="bg-gradient-to-b from-teal-600/[0.12] via-teal-500/[0.05] to-transparent py-16 md:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h1 className="font-serif text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">
            {t("servicesCity.titlePattern", vars)}
          </h1>
          <div className="mt-2 h-0.5 w-16 rounded-full bg-gradient-to-r from-teal-500 to-teal-600" />
          {liquidity.isLiquid && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-teal-500/20 bg-teal-500/5 px-4 py-1.5 text-sm text-teal-700 dark:text-teal-300">
              <Users className="h-4 w-4" />
              {t("servicesCity.proCountBadge", { count: liquidity.providerCount })}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 pb-24 pt-12 sm:px-6 lg:px-8">
        {liquidity.isLiquid ? (
          <>
            {introText && <Intro text={introText} />}
            {includedItems.length > 0 && (
              <WhatsIncluded
                heading={t("servicesCity.template.whatsIncluded.headline")}
                items={includedItems}
              />
            )}
            {pros.length > 0 && (
              <div className="mb-10">
                <h2 className="mb-6 font-serif text-xl font-semibold text-gray-900 dark:text-white">
                  {t("services.topPros")}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {pros.map((p) => {
                    const displayName =
                      p.business_name || p.profile?.full_name || "Professional";
                    const parts = displayName.trim().split(/\s+/).filter(Boolean);
                    const initials =
                      parts.length >= 2
                        ? (parts[0][0] + parts[1][0]).toUpperCase()
                        : (parts[0] || "?").slice(0, 2).toUpperCase();
                    const fullStars = Math.min(5, Math.round(p.avg_rating));
                    const href = p.slug
                      ? { pathname: "/pros/[slug]" as const, params: { slug: p.slug } }
                      : { pathname: "/provider/[id]" as const, params: { id: p.id } };
                    return (
                      <Link
                        key={p.id}
                        href={href}
                        className="group rounded-2xl border border-gray-200/50 bg-white/70 p-5 backdrop-blur-sm transition-all duration-300 hover:border-teal-500/20 hover:shadow-lg dark:border-white/[0.08] dark:bg-white/[0.03]"
                      >
                        <div className="flex items-center gap-3">
                          {p.profile?.avatar_url ? (
                            <Image
                              src={p.profile.avatar_url}
                              alt=""
                              width={48}
                              height={48}
                              className="h-12 w-12 shrink-0 rounded-full border border-gray-200/60 object-cover dark:border-white/[0.1]"
                            />
                          ) : (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-500/10 text-sm font-semibold text-teal-600 dark:text-teal-400">
                              {initials}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-gray-900 dark:text-white">
                              {displayName}
                            </p>
                            <div className="mt-0.5 flex items-center gap-1">
                              {Array.from({ length: 5 }, (_, i) => (
                                <Star
                                  key={i}
                                  className={`h-3 w-3 ${i < fullStars ? "fill-teal-500 text-teal-500" : "text-gray-300 dark:text-white/20"}`}
                                />
                              ))}
                              <span className="ml-1 text-xs text-gray-500 dark:text-white/40">
                                {p.avg_rating.toFixed(1)} ({p.total_reviews})
                              </span>
                            </div>
                            {p.is_founding_provider ? (
                              <div className="mt-1.5">
                                <FoundingProviderBadge
                                  size="sm"
                                  number={p.founding_provider_number ?? undefined}
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {howItWorksSteps.length > 0 && (
              <HowItWorks
                heading={t("servicesCity.template.howItWorks.headline")}
                steps={howItWorksSteps}
              />
            )}
            {costRows.length > 0 && (
              <CostGuideTable
                heading={t("servicesCity.template.costGuide.headline")}
                caption={`${t("servicesCity.template.costGuide.headline")} — ${service}, ${city.name}`}
                columns={{
                  scenario: t("servicesCity.template.costGuide.colScenario"),
                  range: t("servicesCity.template.costGuide.colRange"),
                }}
                typicalLabel={t("servicesCity.template.costGuide.typicalLabel")}
                typicalRange={typicalRange ?? ""}
                rows={costRows}
                disclaimer={t("servicesCity.template.costGuide.disclaimer")}
              />
            )}
            {pageFaqs.length > 0 && (
              <PageFAQ
                heading={t("servicesCity.template.faq.headline")}
                faqs={pageFaqs}
              />
            )}
            <RelatedLinks groups={relatedGroups} />

            <Link
              href="/request-service"
              className="inline-flex items-center gap-2 rounded-full bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
            >
              {t("servicesCity.ctaQuote")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        ) : (
          <div className="rounded-2xl border border-gray-200/50 bg-white/70 p-8 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
            <h2 className="font-serif text-xl font-semibold text-gray-900 dark:text-white">
              {t("servicesCity.comingSoonTitle")}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-600 dark:text-white/60">
              {t("servicesCity.comingSoonBody")}
            </p>
            <Link
              href={{ pathname: "/services/[slug]", params: { slug } }}
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/5 px-5 py-2.5 text-sm font-medium text-teal-700 transition hover:bg-teal-500/10 dark:text-teal-300"
            >
              {t("servicesCity.browseCategory", vars)}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </PageBackground>
  );
}
