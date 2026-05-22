-- ═══════════════════════════════════════════════════════════════════════════
-- Sprint B1 migration 051: admin manual provider EDIT
-- ═══════════════════════════════════════════════════════════════════════════
-- Companion to glatko_admin_create_provider (migration 048). Where 048 INSERTs
-- a brand-new pro, this UPDATEs an existing one. The admin UI submits a single
-- sparse payload and the database applies it atomically (UPDATE profiles +
-- UPDATE glatko_professional_profiles + optional REPLACE of glatko_pro_services).
--
-- The companion app code is /admin/professionals/[id] (Sprint B2). The action
-- layer's requireAdmin() gate is the user-facing access control; this RPC is
-- invoked via createAdminClient() which authenticates as service_role.
--
-- DO NOT re-apply once it's in glatko-prod (CREATE OR REPLACE makes the
-- function idempotent).
--
-- ── SECURITY ─────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER to perform elevated writes (profiles,
-- glatko_professional_profiles, glatko_pro_services). EXECUTE is granted ONLY
-- to service_role, mirroring 048. The app-layer requireAdmin() gate in the
-- Sprint B2 update action is the user-facing control.
--
-- DO NOT grant EXECUTE to authenticated or anon — that would let any logged-in
-- user edit other pros' profiles directly via PostgREST, bypassing the gate.
--
-- ── Sparse-merge semantics (jsonb key-existence) ─────────────────────────
--
-- Every field uses the jsonb `?` key-existence operator:
--
--   field = CASE WHEN p_payload ? 'field'
--                THEN NULLIF(p_payload->>'field','')::TYPE
--                ELSE current.field END
--
--   - key ABSENT             → column unchanged (true sparse-merge)
--   - key present, "value"   → set to value
--   - key present, null      → set to NULL (->> yields SQL NULL)
--   - key present, ""        → set to NULL (NULLIF collapses empty → NULL)
--
-- This is the B1.1 fix: the previous COALESCE(NULLIF(...), current) form could
-- never clear a field back to NULL (absent and null were indistinguishable).
-- Admins can now e.g. clear subscription_end_date to mark a pro "süresiz".
--
-- ── Immutability whitelist ───────────────────────────────────────────────
--
-- NOT updatable here (intentionally omitted from the SET lists):
--   id, slug, is_founding_provider, founding_provider_number,
--   founding_provider_at  — identity / founding facts are immutable.
--   verification_status    — has its own admin action (updateProfessionalStatus,
--                            which also fires notifications + emails).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.glatko_admin_update_provider(
  p_provider_id uuid,
  p_payload     jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_primary_count int;
  v_service       jsonb;
  v_slug          text;
BEGIN
  -- ─── Pre-flight: provider must exist ─────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.glatko_professional_profiles WHERE id = p_provider_id
  ) THEN
    RAISE EXCEPTION 'Provider not found: %', p_provider_id;
  END IF;

  -- ─── Pre-flight: if services provided, exactly one primary ───────────
  -- services is optional on edit. When present it fully replaces the set,
  -- so it must satisfy the same one-primary invariant the create RPC enforces.
  IF jsonb_typeof(p_payload->'services') = 'array' THEN
    IF jsonb_array_length(p_payload->'services') < 1 THEN
      RAISE EXCEPTION 'services array, when provided, must have at least one entry';
    END IF;

    SELECT count(*) INTO v_primary_count
    FROM jsonb_array_elements(p_payload->'services') AS s
    WHERE (s->>'is_primary')::boolean = true;

    IF v_primary_count <> 1 THEN
      RAISE EXCEPTION 'Exactly one primary service required (got %)', v_primary_count;
    END IF;
  END IF;

  -- ─── Update profiles row (sparse, key-existence) ─────────────────────
  UPDATE public.profiles
  SET
    full_name        = CASE WHEN p_payload ? 'full_name'
                            THEN NULLIF(p_payload->>'full_name', '')
                            ELSE full_name END,
    phone            = CASE WHEN p_payload ? 'phone'
                            THEN NULLIF(p_payload->>'phone', '')
                            ELSE phone END,
    city             = CASE WHEN p_payload ? 'city_display'
                            THEN NULLIF(p_payload->>'city_display', '')
                            ELSE city END,
    preferred_locale = CASE WHEN p_payload ? 'preferred_locale'
                            THEN NULLIF(p_payload->>'preferred_locale', '')
                            ELSE preferred_locale END,
    avatar_url       = CASE WHEN p_payload ? 'avatar_url'
                            THEN NULLIF(p_payload->>'avatar_url', '')
                            ELSE avatar_url END,
    updated_at       = now()
  WHERE id = p_provider_id;

  -- ─── Update glatko_professional_profiles (sparse, key-existence) ─────
  UPDATE public.glatko_professional_profiles
  SET
    business_name           = CASE WHEN p_payload ? 'business_name'
                                   THEN NULLIF(p_payload->>'business_name', '')
                                   ELSE business_name END,
    bio                     = CASE WHEN p_payload ? 'bio'
                                   THEN NULLIF(p_payload->>'bio', '')
                                   ELSE bio END,
    phone                   = CASE WHEN p_payload ? 'phone'
                                   THEN NULLIF(p_payload->>'phone', '')
                                   ELSE phone END,
    hourly_rate_min         = CASE WHEN p_payload ? 'hourly_rate_min'
                                   THEN NULLIF(p_payload->>'hourly_rate_min', '')::numeric
                                   ELSE hourly_rate_min END,
    hourly_rate_max         = CASE WHEN p_payload ? 'hourly_rate_max'
                                   THEN NULLIF(p_payload->>'hourly_rate_max', '')::numeric
                                   ELSE hourly_rate_max END,
    years_experience        = CASE WHEN p_payload ? 'years_experience'
                                   THEN NULLIF(p_payload->>'years_experience', '')::int
                                   ELSE years_experience END,
    location_city           = CASE WHEN p_payload ? 'location_city'
                                   THEN NULLIF(p_payload->>'location_city', '')
                                   ELSE location_city END,
    service_radius_km       = CASE WHEN p_payload ? 'service_radius_km'
                                   THEN NULLIF(p_payload->>'service_radius_km', '')::int
                                   ELSE service_radius_km END,
    languages               = CASE WHEN p_payload ? 'languages'
                                        AND jsonb_typeof(p_payload->'languages') = 'array'
                                   THEN (SELECT array_agg(value)
                                         FROM jsonb_array_elements_text(p_payload->'languages'))
                                   ELSE languages END,
    verification_tier       = CASE WHEN p_payload ? 'verification_tier'
                                   THEN NULLIF(p_payload->>'verification_tier', '')::verification_tier
                                   ELSE verification_tier END,
    is_active               = CASE WHEN p_payload ? 'is_active'
                                   THEN (p_payload->>'is_active')::boolean
                                   ELSE is_active END,
    admin_notes             = CASE WHEN p_payload ? 'admin_notes'
                                   THEN NULLIF(p_payload->>'admin_notes', '')
                                   ELSE admin_notes END,
    subscription_plan       = CASE WHEN p_payload ? 'subscription_plan'
                                   THEN NULLIF(p_payload->>'subscription_plan', '')
                                   ELSE subscription_plan END,
    subscription_started_at = CASE WHEN p_payload ? 'subscription_started_at'
                                   THEN NULLIF(p_payload->>'subscription_started_at', '')::timestamptz
                                   ELSE subscription_started_at END,
    subscription_end_date   = CASE WHEN p_payload ? 'subscription_end_date'
                                   THEN NULLIF(p_payload->>'subscription_end_date', '')::timestamptz
                                   ELSE subscription_end_date END,
    portfolio_images        = CASE WHEN p_payload ? 'portfolio_images'
                                        AND jsonb_typeof(p_payload->'portfolio_images') = 'array'
                                   THEN (SELECT array_agg(value)
                                         FROM jsonb_array_elements_text(p_payload->'portfolio_images'))
                                   ELSE portfolio_images END,
    pricing_model           = CASE WHEN p_payload ? 'pricing_model'
                                   THEN (p_payload->'pricing_model')::jsonb
                                   ELSE pricing_model END,
    updated_at              = now()
  WHERE id = p_provider_id;

  -- ─── Replace services if provided (DELETE+INSERT) ────────────────────
  IF jsonb_typeof(p_payload->'services') = 'array' THEN
    DELETE FROM public.glatko_pro_services WHERE professional_id = p_provider_id;
    FOR v_service IN SELECT * FROM jsonb_array_elements(p_payload->'services')
    LOOP
      INSERT INTO public.glatko_pro_services (professional_id, category_id, is_primary)
      VALUES (
        p_provider_id,
        (v_service->>'category_id')::uuid,
        COALESCE((v_service->>'is_primary')::boolean, false)
      );
    END LOOP;
  END IF;

  -- ─── Return updated summary (shape mirrors create RPC) ───────────────
  SELECT slug INTO v_slug
  FROM public.glatko_professional_profiles
  WHERE id = p_provider_id;

  RETURN jsonb_build_object(
    'success',     true,
    'provider_id', p_provider_id,
    'slug',        v_slug
  );
END;
$function$;

-- Restrict execute to service_role only (see SECURITY note in the header).
-- createAdminClient() in the app layer authenticates as service_role, so the
-- Sprint B2 update action keeps working; any other caller (anon, regular
-- authenticated user via PostgREST) gets "permission denied for function".
REVOKE ALL ON FUNCTION public.glatko_admin_update_provider(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.glatko_admin_update_provider(uuid, jsonb) TO service_role;
