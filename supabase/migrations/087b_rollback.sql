-- 087b_rollback.sql  — emergency reverse of 087b_pii_drop_broad_policies.sql
--
-- Restores the two broad public SELECT policies + anon's base-table SELECT grant,
-- for instant recovery if the POST-MERGE apply breaks a customer-facing surface
-- that still reads a base table (the repoints should cover all of them — by-slug,
-- search, cities, sitemap, provider redirect, leads, matched-request — but this
-- reverts the contract to the pre-087b posture if anything was missed).
--
-- Policy definitions reproduced exactly from prod (pg_get_expr):
--   "Anyone can view active profiles": PUBLIC SELECT USING (is_active = true)
--   "Public can view active requests": PUBLIC SELECT USING (status <> ALL ('{draft,cancelled}'))
--
-- IDEMPOTENT: drop-if-exists before create; GRANT is re-runnable.

DROP POLICY IF EXISTS "Anyone can view active profiles" ON public.glatko_professional_profiles;
CREATE POLICY "Anyone can view active profiles"
  ON public.glatko_professional_profiles
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Public can view active requests" ON public.glatko_service_requests;
CREATE POLICY "Public can view active requests"
  ON public.glatko_service_requests
  FOR SELECT
  USING (status <> ALL (ARRAY['draft'::text, 'cancelled'::text]));

GRANT SELECT ON public.glatko_professional_profiles TO anon;
