-- 060_glatko_liquidity_rpc
-- G-PSEO-FOUNDATION FAZ2 (liquidity gate, Cephe 4): provider-count RPCs that
-- decide which service × city pages are "liquid" (publishable, indexable) vs
-- stay "coming soon" (noindex). Pure read/count over public data; mirrors the
-- app's existing searchProfessionals / getCitiesServingCategory semantics:
--   * filters is_active = true AND is_verified = true
--   * provider <-> category via the glatko_pro_services junction (category_id)
--   * ROOT-category expansion: a root's count includes pros offering ANY of its
--     active sub-categories (one level); a sub-category counts only itself.
--     Matches expandRootCategoryIds() in lib/supabase/glatko.server.ts.
--   * location_city stores the city SLUG (e.g. 'budva','herceg-novi'), matching
--     lib/glatko/cities.ts GLATKO_CITIES.slug, so city match is a direct equality.
--
-- Master Plan v1.1 threshold is phased: M0-M2 = providers only; the bid
-- criterion (M3+, table glatko_bids) is intentionally NOT implemented here — it
-- is gated in the TS layer (lib/glatko/config/liquidity-phase.ts) and added in a
-- later phase. The numeric threshold lives in TS; these functions only count.
--
-- SECURITY DEFINER + search_path = public matches existing read RPCs
-- (glatko_search, glatko_get_request_questions). Only public, non-sensitive data
-- is counted (active+verified providers already shown on public category pages).
-- REVOKE-from-PUBLIC + GRANT-to-anon/authenticated mirrors those RPCs (the app's
-- server client uses the anon key).
--
-- Additive (two new CREATE OR REPLACE functions) -> idempotent + instantly
-- reversible. Rollback: DROP both functions (see 060_rollback notes below).

-- 1) Single combination — provider count for one category x city.
CREATE OR REPLACE FUNCTION public.glatko_provider_count_by_category_city(
  p_category_slug text,
  p_city_slug text
) RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $function$
  WITH target AS (
    SELECT id, parent_id
    FROM glatko_service_categories
    WHERE slug = p_category_slug AND is_active = true
    LIMIT 1
  ),
  effective AS (
    -- the category itself
    SELECT id FROM target
    UNION
    -- if it is a ROOT (no parent), also its active sub-categories
    SELECT sub.id
    FROM glatko_service_categories sub
    JOIN target t ON sub.parent_id = t.id
    WHERE t.parent_id IS NULL AND sub.is_active = true
  )
  SELECT COALESCE(COUNT(DISTINCT ps.professional_id), 0)::integer
  FROM glatko_pro_services ps
  JOIN glatko_professional_profiles p ON p.id = ps.professional_id
  WHERE ps.category_id IN (SELECT id FROM effective)
    AND p.is_active = true
    AND p.is_verified = true
    AND p.location_city = p_city_slug;
$function$;

REVOKE ALL ON FUNCTION public.glatko_provider_count_by_category_city(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.glatko_provider_count_by_category_city(text, text)
  TO anon, authenticated;

COMMENT ON FUNCTION public.glatko_provider_count_by_category_city IS
  'G-PSEO FAZ2: count of active+verified providers offering a category (root-expanded) in a city (location_city slug). Liquidity gate input.';

-- 2) Bulk — all category x city combinations with provider_count >= threshold.
--    Used by the sitemap (publishable pages) + admin liquidity view. Same
--    expansion + filter semantics as function 1, evaluated for every category.
CREATE OR REPLACE FUNCTION public.glatko_liquid_combinations(
  p_min_providers integer DEFAULT 3
) RETURNS TABLE(category_slug text, city_slug text, provider_count integer)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $function$
  WITH cat_expand AS (
    -- every active category counts itself
    SELECT c.slug AS query_slug, c.id AS effective_cat_id
    FROM glatko_service_categories c
    WHERE c.is_active = true
    UNION
    -- a root also counts its active sub-categories
    SELECT root.slug, sub.id
    FROM glatko_service_categories root
    JOIN glatko_service_categories sub
      ON sub.parent_id = root.id AND sub.is_active = true
    WHERE root.parent_id IS NULL AND root.is_active = true
  )
  SELECT
    ce.query_slug AS category_slug,
    p.location_city AS city_slug,
    COUNT(DISTINCT ps.professional_id)::integer AS provider_count
  FROM cat_expand ce
  JOIN glatko_pro_services ps ON ps.category_id = ce.effective_cat_id
  JOIN glatko_professional_profiles p ON p.id = ps.professional_id
  WHERE p.is_active = true
    AND p.is_verified = true
    AND p.location_city IS NOT NULL
  GROUP BY ce.query_slug, p.location_city
  HAVING COUNT(DISTINCT ps.professional_id) >= p_min_providers
  ORDER BY provider_count DESC, category_slug, city_slug;
$function$;

REVOKE ALL ON FUNCTION public.glatko_liquid_combinations(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.glatko_liquid_combinations(integer)
  TO anon, authenticated;

COMMENT ON FUNCTION public.glatko_liquid_combinations IS
  'G-PSEO FAZ2: all (category_slug, city_slug, provider_count) combos with >= p_min_providers active+verified providers (root-expanded). Drives sitemap + admin liquidity view.';
