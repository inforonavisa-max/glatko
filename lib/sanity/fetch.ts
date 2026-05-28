/**
 * Typed fetch helpers for Glatko Sanity content.
 *
 * Every helper accepts `locale` and substitutes it into the GROQ field
 * paths via `withLocale()`. ISR is the responsibility of the caller via
 * Next's `revalidate` export — the client itself uses CDN caching only.
 */

import { publicClient } from "./client";
import {
  ALL_POSTS_QUERY,
  ALL_POST_SLUGS_WITH_TRANSLATIONS_QUERY,
  FEATURED_POSTS_QUERY,
  POST_BY_SLUG_QUERY,
  POSTS_BY_SERVICE_CATEGORY_QUERY,
  withLocale,
} from "./queries";
import type {
  PostDetail,
  PostListItem,
  PostSlugWithTranslations,
} from "./types";

export async function getAllPosts(locale: string): Promise<PostListItem[]> {
  const query = withLocale(ALL_POSTS_QUERY, locale);
  return publicClient.fetch<PostListItem[]>(query);
}

export async function getFeaturedPosts(
  locale: string,
): Promise<PostListItem[]> {
  const query = withLocale(FEATURED_POSTS_QUERY, locale);
  return publicClient.fetch<PostListItem[]>(query);
}

export async function getPostBySlug(
  slug: string,
  locale: string,
): Promise<PostDetail | null> {
  const query = withLocale(POST_BY_SLUG_QUERY, locale);
  return publicClient.fetch<PostDetail | null>(query, { slug });
}

export async function getPostsByServiceCategory(
  serviceCategorySlug: string,
  locale: string,
): Promise<PostListItem[]> {
  const query = withLocale(POSTS_BY_SERVICE_CATEGORY_QUERY, locale);
  return publicClient.fetch<PostListItem[]>(query, { serviceCategorySlug });
}

export async function getAllPostSlugsWithTranslations(
  locale: string,
): Promise<PostSlugWithTranslations[]> {
  const query = withLocale(ALL_POST_SLUGS_WITH_TRANSLATIONS_QUERY, locale);
  return publicClient.fetch<PostSlugWithTranslations[]>(query);
}
