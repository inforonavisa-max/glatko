import { groq } from "next-sanity";

/**
 * GROQ queries for Glatko blog content.
 *
 * Every locale-aware projection reads `*.$locale` and the calling fetch
 * helper passes `{ locale }`. The `[$locale]` GROQ syntax doesn't work
 * across all client versions, so we string-interpolate the locale into
 * the projection at query-build time (see lib/sanity/fetch.ts).
 *
 * Note: GROQ doesn't support template-string parameter substitution in
 * field paths — `*[$locale].current` would fail. The fetch helper
 * generates the per-locale query by replacing `$$LOCALE$$` markers.
 */

const POST_LIST_PROJECTION = `
  _id,
  "title": title.$$LOCALE$$,
  "slug": slug.$$LOCALE$$.current,
  "excerpt": excerpt.$$LOCALE$$,
  coverImage,
  publishedAt,
  featured,
  serviceCategoryRefs,
  "author": author->{
    name,
    "slug": slug.current,
    avatar,
    role
  },
  "category": category->{
    "title": title.$$LOCALE$$,
    "slug": slug.current
  }
`;

const POST_DETAIL_PROJECTION = `
  _id,
  "title": title.$$LOCALE$$,
  "slug": slug.$$LOCALE$$.current,
  "excerpt": excerpt.$$LOCALE$$,
  "content": content.$$LOCALE$$,
  coverImage,
  publishedAt,
  "updatedAt": _updatedAt,
  featured,
  schemaType,
  serviceCategoryRefs,
  "author": author->{
    name,
    "slug": slug.current,
    "bio": bio.$$LOCALE$$,
    avatar,
    role
  },
  "category": category->{
    "title": title.$$LOCALE$$,
    "slug": slug.current
  },
  "tags": tags[]->{
    title,
    "slug": slug.current
  },
  "seo": seo {
    "metaTitle": metaTitle.$$LOCALE$$,
    "metaDescription": metaDescription.$$LOCALE$$,
    ogImage
  },
  "translations": translations[]->{
    "locale": select(
      defined(slug.me.current) => "me",
      defined(slug.en.current) => "en",
      defined(slug.tr.current) => "tr",
      defined(slug.ru.current) => "ru",
      defined(slug.de.current) => "de",
      defined(slug.it.current) => "it",
      defined(slug.sr.current) => "sr",
      defined(slug.ar.current) => "ar",
      defined(slug.uk.current) => "uk"
    ),
    "slug": coalesce(
      slug.me.current, slug.en.current, slug.tr.current, slug.ru.current,
      slug.de.current, slug.it.current, slug.sr.current, slug.ar.current,
      slug.uk.current
    )
  }
`;

export const ALL_POSTS_QUERY = groq`
  *[_type == "post" && defined(slug.$$LOCALE$$.current) && length(coalesce(title.$$LOCALE$$, "")) > 0]
  | order(publishedAt desc) {
    ${POST_LIST_PROJECTION}
  }
`;

export const POST_BY_SLUG_QUERY = groq`
  *[_type == "post" && slug.$$LOCALE$$.current == $slug][0] {
    ${POST_DETAIL_PROJECTION}
  }
`;

export const FEATURED_POSTS_QUERY = groq`
  *[_type == "post" && featured == true && defined(slug.$$LOCALE$$.current) && length(coalesce(title.$$LOCALE$$, "")) > 0]
  | order(publishedAt desc)[0...3] {
    ${POST_LIST_PROJECTION}
  }
`;

export const POSTS_BY_SERVICE_CATEGORY_QUERY = groq`
  *[_type == "post" && $serviceCategorySlug in serviceCategoryRefs && defined(slug.$$LOCALE$$.current)]
  | order(publishedAt desc)[0...6] {
    ${POST_LIST_PROJECTION}
  }
`;

export const ALL_POST_SLUGS_QUERY = groq`
  *[_type == "post" && defined(slug.$$LOCALE$$.current) && length(coalesce(title.$$LOCALE$$, "")) > 0] {
    "slug": slug.$$LOCALE$$.current,
    publishedAt
  }
`;

/**
 * Replace the locale marker with the actual locale field name. GROQ
 * can't parameterise field paths, so we do a simple string substitution
 * before calling the client.
 */
export function withLocale(query: string, locale: string): string {
  // Whitelist locale to keep the resulting string injection safe.
  const safe = /^[a-z]{2,3}$/.test(locale) ? locale : "me";
  return query.replace(/\$\$LOCALE\$\$/g, safe);
}
