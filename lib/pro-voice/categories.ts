import "server-only";

import { createAdminClient } from "@/supabase/server";
import type { Locale } from "@/i18n/routing";
import type { MultiLangText } from "@/types/glatko";

/**
 * G-VOICE-1 — category taxonomy access for the voice pipeline. There is NO
 * compile-time slug enum in this repo (taxonomy lives only in
 * glatko_service_categories). So we fetch the live ROOT slugs at request time
 * and inject them into the OpenAI structured-output enum — the model physically
 * cannot return a slug outside this set (zero category hallucination, spec §2c).
 *
 * Roots only: a provider's primary category is always a root (sub-services are
 * captured as free text). Slug→id resolution happens here too, because
 * glatko_pro_services stores category_id (uuid), never the slug.
 */

export interface RootCategory {
  id: string;
  slug: string;
  name: MultiLangText;
}

/**
 * Live root categories (parent_id IS NULL, is_active). Uses the service-role
 * client so it works inside route handlers without a cookie session; categories
 * are public data so this leaks nothing.
 */
export async function getRootCategories(): Promise<RootCategory[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("glatko_service_categories")
    .select("id, slug, name, parent_id, is_active, sort_order")
    .is("parent_id", null)
    .eq("is_active", true)
    .order("sort_order");

  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as MultiLangText,
  }));
}

/** Just the slug list — the OpenAI enum payload. */
export async function getRootCategorySlugs(): Promise<string[]> {
  const roots = await getRootCategories();
  return roots.map((r) => r.slug);
}

/** Resolve a slug back to its category id (for glatko_pro_services). */
export function resolveCategoryId(
  roots: RootCategory[],
  slug: string,
): string | null {
  return roots.find((r) => r.slug === slug)?.id ?? null;
}

/** Localized label for a root, with sane fallbacks (mirrors wizard logic). */
export function rootLabel(cat: RootCategory, locale: Locale): string {
  const n = cat.name;
  return (
    n[locale] ??
    n.en ??
    n.tr ??
    (Object.values(n).find((v) => typeof v === "string") as string | undefined) ??
    cat.slug
  );
}
