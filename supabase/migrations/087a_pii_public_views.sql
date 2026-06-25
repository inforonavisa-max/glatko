-- 087a_pii_public_views.sql  (ADDITIVE half of the PII lockdown — audit Sprint 1)
--
-- Creates PII-free public projections for the directory + job-feed. This half is
-- HARMLESS / ADDITIVE: it only ADDS views (safe-column subsets) + grants. It does
-- NOT change any existing policy, behavior, or security posture — the broad base
-- policies (and the leak) remain exactly as-is until 087b drops them at merge.
--
-- Applied to prod NOW (apply_migration) so the repointed app works on preview
-- (the views must exist in the DB the preview reads). The restrictive half (087b,
-- the actual leak fix) is applied only after merge.
--
-- IDEMPOTENT: CREATE OR REPLACE VIEW + re-runnable GRANTs.
--
-- Views run with their owner's rights (= migration role) → they bypass base RLS
-- but project ONLY safe columns, so no PII is reachable through them.

-- ── Public professional directory (PII-free) ──
-- EXCLUDES: phone, location, location_point, admin_notes, company_documents,
-- rejection_reason, subscription_*, tier_upgraded_at, search_text, and RAW
-- tier_documents (replaced by a badge-only projection: url/path/name/uploaded_at
-- stripped, keeping verified/verified_at for the profile page's verification badges).
CREATE OR REPLACE VIEW public.glatko_public_professionals AS
SELECT
  p.id, p.slug, p.business_name, p.bio,
  p.avg_rating, p.total_reviews, p.completed_jobs, p.response_time_minutes,
  p.years_experience, p.languages, p.location_city, p.service_radius_km,
  p.hourly_rate_min, p.hourly_rate_max, p.portfolio_images,
  p.is_verified, p.verified_at, p.verification_tier, p.verification_status,
  p.is_active, p.insurance_status, p.introduction_video_url, p.pricing_model,
  p.profile_completion_score, p.is_founding_provider, p.founding_provider_at,
  p.founding_provider_number, p.featured_until, p.created_at, p.updated_at,
  (SELECT jsonb_object_agg(d.key, d.value - 'url' - 'path' - 'name' - 'uploaded_at')
     FROM jsonb_each(coalesce(p.tier_documents, '{}'::jsonb)) AS d(key, value)) AS tier_documents,
  pr.full_name, pr.avatar_url
FROM public.glatko_professional_profiles p
LEFT JOIN public.profiles pr ON pr.id = p.id
WHERE p.is_active = true;

-- ── Public job-feed (PII-free) — pros browse open requests ──
-- EXCLUDES: customer_id, anonymous_email, address, location, location_point,
-- preferred_professional_id, moderation_*, details, bid/assign internals.
CREATE OR REPLACE VIEW public.glatko_request_feed AS
SELECT
  r.id, r.category_id, r.title, r.description, r.municipality,
  r.budget_min, r.budget_max, r.preferred_date_start, r.preferred_date_end,
  r.urgency, r.status, r.locale, r.flexibility, r.photos,
  r.created_at, r.updated_at
FROM public.glatko_service_requests r
WHERE r.status NOT IN ('draft', 'cancelled');

-- ── Matched-pro request detail (address YES, email NO) ──
-- Decision: a matched pro sees the job ADDRESS + customer FIRST NAME (so they can
-- do the work — invariant D), but NEVER anonymous_email / phone / customer_id /
-- precise geo (invariant A). NON-invoker view (bypasses base RLS) but the
-- auth.uid() EXISTS filter scopes every reader to ONLY their own matched requests;
-- anon / non-matched users get 0 rows. EXCLUDES: anonymous_email, location,
-- location_point, customer_id, moderation_*, details.
CREATE OR REPLACE VIEW public.glatko_matched_request AS
SELECT
  r.id, r.category_id, r.title, r.description, r.municipality, r.address,
  r.budget_min, r.budget_max, r.preferred_date_start, r.preferred_date_end,
  r.urgency, r.status, r.locale, r.flexibility, r.photos,
  r.created_at, r.updated_at,
  c.full_name AS customer_full_name
FROM public.glatko_service_requests r
LEFT JOIN public.profiles c ON c.id = r.customer_id
WHERE r.status NOT IN ('draft', 'cancelled')
  AND EXISTS (
    SELECT 1 FROM public.glatko_request_notifications n
    WHERE n.request_id = r.id AND n.professional_id = auth.uid()
  );

GRANT SELECT ON public.glatko_public_professionals TO anon, authenticated;
-- Job-feed + matched-request are authenticated-only (pros browse/act while logged in).
-- Supabase default privileges auto-grant new views to anon, so REVOKE anon explicitly.
GRANT SELECT ON public.glatko_request_feed TO authenticated;
REVOKE SELECT ON public.glatko_request_feed FROM anon;
GRANT SELECT ON public.glatko_matched_request TO authenticated;
REVOKE SELECT ON public.glatko_matched_request FROM anon;
