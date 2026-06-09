import "server-only";
import { unstable_cache } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  LIQUIDITY_PHASE,
  ACTIVE_THRESHOLD,
  type LiquidityPhase,
} from "@/lib/glatko/config/liquidity-phase";

/**
 * Liquidity gate (G-PSEO-FOUNDATION FAZ2). Decides whether a service × city page
 * is "liquid" (publishable / indexable) or stays a noindex "coming soon"
 * placeholder, based on the count of active+verified providers offering the
 * category (root-expanded) in the city.
 *
 * Backed by the SECURITY DEFINER RPCs in migration 060
 * (glatko_provider_count_by_category_city / glatko_liquid_combinations).
 */
export interface LiquidityResult {
  isLiquid: boolean;
  providerCount: number;
  /** Populated only in the M3+ phase (framework; inert in M0-M2). */
  bidCount?: number;
  threshold: { providers: number; bids?: number };
  phase: LiquidityPhase;
}

export interface LiquidCombination {
  category: string;
  city: string;
  providerCount: number;
}

const LIQUIDITY_TTL = 3600; // 1h. Invalidation via revalidateTag on provider
// change is a placeholder until the M2+ webhook (revalidateTag('liquidity')).

/**
 * Cookie-less anon Supabase client. Liquidity counts are public,
 * session-independent data, and `unstable_cache` cannot read cookies()/headers()
 * (which the app's default server client uses). The RPCs are SECURITY DEFINER,
 * so the anon role only needs EXECUTE and the result is identical for everyone.
 * Returns null when env is absent (e.g. during build) → callers fail closed.
 */
function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}

/**
 * Active+verified provider count for one category × city, cached per combination.
 * Fails CLOSED (returns 0) on any error so a transient glitch keeps the page as
 * "coming soon" / noindex rather than leaking an unpublished page into the index.
 */
function getProviderCount(
  categorySlug: string,
  citySlug: string,
): Promise<number> {
  return unstable_cache(
    async () => {
      const supabase = publicClient();
      if (!supabase) return 0;
      const { data, error } = await supabase.rpc(
        "glatko_provider_count_by_category_city",
        { p_category_slug: categorySlug, p_city_slug: citySlug },
      );
      if (error || typeof data !== "number") return 0;
      return data;
    },
    ["liquidity-provider-count", categorySlug, citySlug],
    {
      revalidate: LIQUIDITY_TTL,
      tags: ["liquidity", `liquidity-${categorySlug}-${citySlug}`],
    },
  )();
}

/**
 * Liquidity status for a category × city under the current phase threshold.
 *
 * M0-M2 is provider-only. The M3+ bid criterion is intentionally NOT evaluated
 * here yet — until the phase flips (and a later migration adds the bid-count
 * RPC), M3+ falls back to provider-only so flipping the flag can never silently
 * over-publish without the bid data wired in.
 */
export async function getLiquidityStatus(
  categorySlug: string,
  citySlug: string,
): Promise<LiquidityResult> {
  const phase = LIQUIDITY_PHASE;
  const threshold = ACTIVE_THRESHOLD;
  const providerCount = await getProviderCount(categorySlug, citySlug);
  const isLiquid = providerCount >= threshold.providers;
  return { isLiquid, providerCount, threshold, phase };
}

/**
 * All liquid (category, city) combinations for the current phase threshold, via
 * the bulk RPC (one query, not N). Used by the sitemap and a future admin view.
 * Fails to [] on error (sitemap simply adds nothing).
 */
export const getLiquidCombinations = unstable_cache(
  async (): Promise<LiquidCombination[]> => {
    const supabase = publicClient();
    if (!supabase) return [];
    const { data, error } = await supabase.rpc("glatko_liquid_combinations", {
      p_min_providers: ACTIVE_THRESHOLD.providers,
    });
    if (error || !Array.isArray(data)) return [];
    return (
      data as Array<{
        category_slug: string;
        city_slug: string;
        provider_count: number;
      }>
    ).map((r) => ({
      category: r.category_slug,
      city: r.city_slug,
      providerCount: r.provider_count,
    }));
  },
  ["liquidity-combinations"],
  { revalidate: LIQUIDITY_TTL, tags: ["liquidity"] },
);
