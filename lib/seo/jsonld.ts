/**
 * G-CAT-4: Type-safe schema.org JSON-LD generators for Glatko.
 *
 * Six shapes are produced by this module:
 *   1. Organization        (root, single source — rendered once in app/[locale]/layout.tsx)
 *   2. WebSite + SearchAction (landing only)
 *   3. Service             (category detail)
 *   4. LocalBusiness       (category detail — Google local rich-snippet)
 *   5. ItemList            (services index sub-cats; per-category sub-cats)
 *   6. BreadcrumbList      (category detail)
 *
 * `jsonLdScriptProps` returns a typed object suitable for spreading onto a
 * `<script type="application/ld+json">` element. Schemas are minified
 * deterministically so HTML diffs stay stable across renders.
 */

import { SEO_BASE, SEO_LOCALES, localizedUrl, type Href } from "@/lib/seo";

const ORG_NAME = "Glatko" as const;

/**
 * Six default Karadağ cities used as fallback when no verified pros yet
 * advertise a `location_city` for a given category. Lat/long stay tight
 * (~4 decimals) — enough for Google's "near me" matching but not GPS-precise.
 */
const MONTENEGRO_CITIES = [
  { name: "Budva", latitude: 42.2911, longitude: 18.84 },
  { name: "Kotor", latitude: 42.4247, longitude: 18.7712 },
  { name: "Tivat", latitude: 42.4347, longitude: 18.6961 },
  { name: "Bar", latitude: 42.0931, longitude: 19.1006 },
  { name: "Herceg Novi", latitude: 42.4531, longitude: 18.5375 },
  { name: "Podgorica", latitude: 42.4304, longitude: 19.2594 },
] as const;

/**
 * Locale-localized one-line org descriptions; safe to render in JSON-LD
 * `description` and OG `description` for the homepage.
 */
const ORG_DESCRIPTIONS: Record<string, string> = {
  me: "Premium servisna platforma Crne Gore",
  sr: "Premium servisna platforma Crne Gore",
  en: "Premium service marketplace for Montenegro",
  tr: "Karadağ'ın premium hizmet platformu",
  de: "Premium-Service-Plattform für Montenegro",
  it: "Piattaforma di servizi premium per il Montenegro",
  ru: "Премиум-платформа услуг для Черногории",
  ar: "منصة خدمات متميزة للجبل الأسود",
  uk: "Преміум-платформа послуг для Чорногорії",
};

function pickLocalized(
  obj: Record<string, string> | null | undefined,
  locale: string,
  fallback: string,
): string {
  if (!obj) return fallback;
  return obj[locale] || obj.en || fallback;
}

export interface CategorySchemaInput {
  slug: string;
  name: Record<string, string>;
  description: Record<string, string> | null;
  hero_image_url: string | null;
  parent_slug?: string | null;
  parent_name?: Record<string, string> | null;
  seasonal?: string | null;
}

export interface SubCategorySchemaInput {
  slug: string;
  name: Record<string, string>;
}

// 1. Organization — single source rendered in root locale layout.
export function generateOrganizationSchema(locale: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: ORG_NAME,
    url: localizedUrl(locale, "/"),
    logo: `${SEO_BASE}/logo.png`,
    description: ORG_DESCRIPTIONS[locale] || ORG_DESCRIPTIONS.en,
    address: {
      "@type": "PostalAddress",
      addressCountry: "ME",
    },
    areaServed: MONTENEGRO_CITIES.map((c) => ({
      "@type": "City",
      name: c.name,
      geo: {
        "@type": "GeoCoordinates",
        latitude: c.latitude,
        longitude: c.longitude,
      },
    })),
  };
}

// 2. WebSite + SearchAction — landing page.
export function generateWebSiteSchema(locale: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: ORG_NAME,
    url: localizedUrl(locale, "/"),
    description: ORG_DESCRIPTIONS[locale] || ORG_DESCRIPTIONS.en,
    inLanguage: locale,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${localizedUrl(locale, "/services")}?openSearch=1&q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

// 3. Service — category detail page.
export function generateServiceSchema(
  category: CategorySchemaInput,
  locale: string,
  citiesFromPros: string[] = [],
) {
  const name = pickLocalized(category.name, locale, category.slug);
  const description = pickLocalized(category.description, locale, name);
  const url = localizedUrl(locale, "/services/[slug]", { slug: category.slug });
  const englishName = pickLocalized(category.name, "en", category.slug);

  // areaServed: union of pro cities and the 6 Karadağ defaults.
  const allCities = Array.from(
    new Set([
      ...citiesFromPros.filter((c) => c && c.trim().length > 0),
      ...MONTENEGRO_CITIES.map((c) => c.name),
    ]),
  );

  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name,
    description,
    url,
    image: category.hero_image_url || undefined,
    serviceType: englishName,
    provider: {
      "@type": "Organization",
      name: ORG_NAME,
      url: SEO_BASE,
    },
    areaServed: allCities.map((cityName) => ({
      "@type": "City",
      name: cityName,
      addressCountry: "ME",
    })),
    availableLanguage: SEO_LOCALES,
    currenciesAccepted: "EUR",
    paymentAccepted: "Cash, Credit Card, Bank Transfer",
  };
}

// 4. LocalBusiness — category detail (separate Google rich result type).
export function generateCategoryLocalBusinessSchema(
  category: CategorySchemaInput,
  locale: string,
  citiesFromPros: string[] = [],
) {
  const name = pickLocalized(category.name, locale, category.slug);
  const description = pickLocalized(category.description, locale, name);
  const allCities = Array.from(
    new Set([
      ...citiesFromPros.filter((c) => c && c.trim().length > 0),
      ...MONTENEGRO_CITIES.map((c) => c.name),
    ]),
  );

  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: `${ORG_NAME} — ${name}`,
    description,
    url: localizedUrl(locale, "/services/[slug]", { slug: category.slug }),
    image: category.hero_image_url || undefined,
    address: {
      "@type": "PostalAddress",
      addressCountry: "ME",
    },
    areaServed: allCities,
    geo: {
      // Karadağ centroid — coarse but valid; per-city `City` nodes carry
      // precise coords already.
      "@type": "GeoCoordinates",
      latitude: 42.4304,
      longitude: 19.05,
    },
    priceRange: "€€",
    currenciesAccepted: "EUR",
    paymentAccepted: "Cash, Credit Card, Bank Transfer",
  };
}

// 5. ItemList — sub-categories or P0 root grid.
export function generateItemListSchema(
  items: SubCategorySchemaInput[],
  locale: string,
  basePath: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: localizedUrl(locale, `${basePath}/[slug]` as Href, { slug: item.slug }),
      name: pickLocalized(item.name, locale, item.slug),
    })),
  };
}

// 6. BreadcrumbList — category detail (and any nested page that needs it).
export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function generateBreadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

/**
 * Multi-locale FAQ entry as stored in `glatko_service_categories.faqs`
 * (migration 042). Both fields are 9-locale dicts.
 */
export interface LocalizedFAQ {
  q: Record<string, string>;
  a: Record<string, string>;
}

/**
 * FAQPage schema for Google's FAQ rich results + AEO citations
 * (ChatGPT/Perplexity/Claude weight FAQPage heavily). Returns null when no
 * FAQ items resolve in the requested locale, so the caller can skip the
 * `<script>` tag entirely instead of emitting an empty mainEntity array.
 */
export function generateFAQPageSchema(
  faqs: LocalizedFAQ[] | null | undefined,
  locale: string,
) {
  if (!faqs || faqs.length === 0) return null;
  const mainEntity = faqs
    .map((entry) => {
      const question = entry.q?.[locale] || entry.q?.en;
      const answer = entry.a?.[locale] || entry.a?.en;
      if (!question || !answer) return null;
      return {
        "@type": "Question" as const,
        name: question,
        acceptedAnswer: {
          "@type": "Answer" as const,
          text: answer,
        },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (mainEntity.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity,
  };
}

/**
 * Spread onto a `<script>` element to render a JSON-LD blob.
 * Stable JSON.stringify (no whitespace) keeps SSR HTML diffs deterministic.
 */
export function jsonLdScriptProps(schema: object) {
  return {
    type: "application/ld+json" as const,
    dangerouslySetInnerHTML: {
      __html: JSON.stringify(schema),
    },
  };
}
