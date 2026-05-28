/**
 * Shared TypeScript types for Sanity-projected data.
 *
 * Sanity's GROQ projections rewrite locale fields into plain strings
 * (`"title": title.$locale`), so the consumer sees a flat shape. The
 * types here describe that flattened result, not the raw document.
 */

import type { PortableTextBlock } from "@portabletext/types";

export interface SanityImage {
  _type: "image";
  asset?: {
    _ref?: string;
    _type?: string;
    url?: string;
    metadata?: {
      dimensions?: SanityImageDimensions;
      lqip?: string;
      palette?: { dominant?: { background?: string } };
    };
  } | null;
  hotspot?: { x: number; y: number; height: number; width: number };
  alt?: string;
  caption?: string;
}

export interface SanityImageDimensions {
  width: number;
  height: number;
  aspectRatio: number;
}

export interface PostListItem {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: SanityImage | null;
  publishedAt: string;
  featured?: boolean;
  author: {
    name: string;
    slug: string;
    avatar: SanityImage | null;
    role: string | null;
  } | null;
  category: {
    title: string;
    slug: string;
  } | null;
  serviceCategoryRefs: string[] | null;
}

export interface PostDetail extends PostListItem {
  content: PortableTextBlock[] | null;
  bio?: string | null;
  updatedAt?: string | null;
  schemaType?: string | null;
  tags: Array<{ title: string; slug: string }> | null;
  seo: {
    metaTitle: string | null;
    metaDescription: string | null;
    ogImage: SanityImage | null;
  } | null;
  // Other-language versions of this post (separate docs), resolved to the
  // locale + that locale's own slug. Powers cross-locale hreflang.
  translations?: Array<{
    locale: string | null;
    slug: string | null;
  }> | null;
}

/**
 * Sitemap projection: per-locale slug + publishedAt + the post's other-language
 * versions resolved to `{locale, slug}`. Feeds buildPostAlternates() so each
 * sitemap entry gets a correct hreflang cluster instead of single-slug spread.
 */
export interface PostSlugWithTranslations {
  slug: string;
  publishedAt: string;
  translations?: Array<{
    locale: string | null;
    slug: string | null;
  }> | null;
}
