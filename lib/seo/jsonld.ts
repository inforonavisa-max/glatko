/**
 * G-CAT-4: Type-safe schema.org JSON-LD generators for Glatko.
 *
 * Shapes produced by this module:
 *   1. Organization        (root, single source — rendered once in app/[locale]/layout.tsx)
 *   2. WebSite + SearchAction (landing only)
 *   3. Service             (category detail)
 *   4. LocalBusiness       (category detail — Google local rich-snippet)
 *   5. ItemList            (services index sub-cats; per-category sub-cats)
 *   6. BreadcrumbList      (category detail)
 *   7. FAQPage             (category detail; blog posts with an FAQ block)
 *   8. Article             (blog post detail)
 *   9. HowTo               (step-by-step blog posts)
 *
 * `jsonLdScriptProps` returns a typed object suitable for spreading onto a
 * `<script type="application/ld+json">` element. Schemas are minified
 * deterministically so HTML diffs stay stable across renders.
 */

import { SEO_BASE, SEO_LOCALES, localizedUrl, type Href } from "@/lib/seo";
import { GLATKO_CITIES } from "@/lib/glatko/cities";

const ORG_NAME = "Glatko" as const;

// areaServed cities come from the single source of truth
// (lib/glatko/cities.ts) — all 25 Montenegro municipalities with municipal-seat
// coordinates (~4 decimals; enough for Google "near me", not GPS-precise).

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
    legalName: "RONA LEGAL DOO",
    url: localizedUrl(locale, "/"),
    logo: `${SEO_BASE}/logo.png`,
    description: ORG_DESCRIPTIONS[locale] || ORG_DESCRIPTIONS.en,
    taxID: "04390768",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Lazi Božović Lamela B Broj 24",
      addressLocality: "Budva",
      postalCode: "85310",
      addressCountry: "ME",
    },
    areaServed: GLATKO_CITIES.map((c) => ({
      "@type": "City",
      name: c.name,
      geo: {
        "@type": "GeoCoordinates",
        latitude: c.lat,
        longitude: c.lng,
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
      ...GLATKO_CITIES.map((c) => c.name),
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
      ...GLATKO_CITIES.map((c) => c.name),
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

// 3b/4b. Service × city page (G-PSEO-FOUNDATION) — city-scoped variants of the
// category Service/LocalBusiness above. Unlike #3/#4 (category-wide, all cities,
// coarse centroid), these scope `areaServed` to the SINGLE city, carry the
// precise city geo + locality, and point at the city page's own URL. Emitted
// only on LIQUID (indexable) pages; non-liquid placeholders stay noindex with
// just the layout Organization. Callers pass already-localized strings.
export function generateServiceCitySchema(params: {
  serviceName: string;
  serviceDescription: string;
  serviceTypeEn: string;
  cityName: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: params.serviceName,
    description: params.serviceDescription,
    url: params.url,
    serviceType: params.serviceTypeEn,
    provider: {
      "@type": "Organization",
      name: ORG_NAME,
      url: SEO_BASE,
    },
    areaServed: {
      "@type": "City",
      name: params.cityName,
      addressCountry: "ME",
    },
    availableLanguage: SEO_LOCALES,
    currenciesAccepted: "EUR",
    paymentAccepted: "Cash, Credit Card, Bank Transfer",
  };
}

export function generateLocalBusinessCitySchema(params: {
  serviceName: string;
  serviceDescription: string;
  cityName: string;
  cityGeo: { latitude: number; longitude: number };
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: `${ORG_NAME} — ${params.serviceName}, ${params.cityName}`,
    description: params.serviceDescription,
    url: params.url,
    address: {
      "@type": "PostalAddress",
      addressLocality: params.cityName,
      addressCountry: "ME",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: params.cityGeo.latitude,
      longitude: params.cityGeo.longitude,
    },
    areaServed: {
      "@type": "City",
      name: params.cityName,
      addressCountry: "ME",
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
 * 8. Article — blog post detail. `title`/`description` arrive already
 * localized (the GROQ projection flattens `content.$locale`), so callers
 * pass plain strings, not locale dicts. `url` should be the canonical
 * absolute URL from `localizedUrl()` so schema stays in lockstep with the
 * page canonical / hreflang.
 */
export function generateArticleSchema(input: {
  title: string;
  description?: string;
  url: string;
  imageUrl?: string;
  authorName?: string;
  publishedAt: string;
  updatedAt?: string;
  locale: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description || undefined,
    url: input.url,
    image: input.imageUrl || undefined,
    author: input.authorName
      ? { "@type": "Person", name: input.authorName }
      : { "@type": "Organization", name: ORG_NAME },
    publisher: {
      "@type": "Organization",
      name: ORG_NAME,
      url: SEO_BASE,
      logo: { "@type": "ImageObject", url: `${SEO_BASE}/logo.png` },
    },
    datePublished: input.publishedAt,
    dateModified: input.updatedAt || input.publishedAt,
    inLanguage: input.locale,
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
  };
}

export interface HowToStep {
  name: string;
  text: string;
  image?: string;
}

/**
 * 9. HowTo — step-by-step guides. The generator is ready for CONTENT-ENGINE
 * how-to posts; it is wired on the article page once a structured `steps`
 * source exists (a body block parsed into steps, or a dedicated field).
 */
export function generateHowToSchema(input: {
  title: string;
  description?: string;
  url: string;
  imageUrl?: string;
  steps: HowToStep[];
  totalTime?: string;
  locale: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: input.title,
    description: input.description || undefined,
    url: input.url,
    image: input.imageUrl || undefined,
    inLanguage: input.locale,
    totalTime: input.totalTime || undefined,
    step: input.steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
      image: s.image || undefined,
    })),
  };
}

/**
 * Serialize a schema object to a string that is safe to inject into a
 * `<script type="application/ld+json">` element via dangerouslySetInnerHTML.
 *
 * Plain JSON.stringify does NOT neutralize the `</script>` sequence: inside a
 * raw-text `<script>` element the HTML parser closes the element at a literal
 * `</script`, so any user-controlled field (provider bio/business name, review
 * body, customer display name) containing `</script><script>…</script>` would
 * break out and execute — a stored XSS. Escaping `<`, `>` and `&` as JSON
 * `\\uXXXX` unicode escapes keeps the JSON valid (these only ever appear inside
 * string values, never in the structural JSON) while making breakout
 * impossible. U+2028/U+2029 are escaped too for strict JS-string safety.
 */
export function serializeJsonLd(schema: object): string {
  return JSON.stringify(schema)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Spread onto a `<script>` element to render a JSON-LD blob.
 * Stable JSON.stringify (no whitespace) keeps SSR HTML diffs deterministic.
 */
export function jsonLdScriptProps(schema: object) {
  return {
    type: "application/ld+json" as const,
    dangerouslySetInnerHTML: {
      __html: serializeJsonLd(schema),
    },
  };
}
