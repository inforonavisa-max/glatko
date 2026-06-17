-- ═══════════════════════════════════════════════════════════════════════════
-- 074: C0 — public showcase VIEW + read RPCs (the anti-disintermediation GATE)
-- ═══════════════════════════════════════════════════════════════════════════
-- SYMMETRIC with health 068: the `career` schema is NOT exposed to PostgREST →
-- supabase-js (anon or service-role) sees only the PUBLIC schema. So every read the
-- product needs is served by PUBLIC-schema SECURITY DEFINER functions over a PUBLIC
-- VIEW. The functions read career.* as definer (postgres) and project ONLY public-safe
-- columns (NO _enc / _hash / private column EVER).
--
-- THE GATE (BUILD-RULES): (a) the VIEW's SELECT column list + (b) each RPC's SQL body.
-- A single RPC selecting a private column, or the VIEW including an _enc/_hash column,
-- leaks identity with every RLS policy still green. The 074 surface is therefore the
-- load-bearing column-projection wall.
--
-- RULE R1: NO auth.uid() inside any career RPC — every RPC is invoked via
-- createAdminClient() (service_role) where auth.uid() is NULL. Identity is derived in
-- the route/action layer (auth.getUser()) and PASSED DOWN as an explicit p_*_user_id
-- arg; ownership is re-verified inside the RPC (career.owns_employer / re-checked
-- user_id). This mirrors health's book_appointment(... p_session_key ...).
--
-- RULE R2: public.career_worker_showcase is a STANDARD view (NOT security_invoker),
-- owned by postgres, GRANT SELECT TO anon, authenticated. A security_invoker view would
-- return zero rows to anon (the schema grants anon nothing). It selects ONLY public-safe
-- columns where is_showcased = true.
--
-- GRANTS: read RPCs default to service_role-only EXECUTE (prod calls them via the admin
-- client). career_list_sectors is also granted anon/authenticated because static
-- marketing pages may read sectors directly. revoke all from public first.
--
-- ROLLBACK:
--   drop function if exists public.career_list_sectors(text);
--   drop function if exists public.career_browse_showcase(text,text,text,text,text,text,text[],int,int,int);
--   drop function if exists public.career_get_showcase_worker(text);
--   drop function if exists public.career_get_worker_profile(uuid);
--   drop function if exists public.career_get_worker_documents(uuid);
--   drop function if exists public.career_get_worker_status(uuid);
--   drop function if exists public.career_employer_requisitions(uuid);
--   drop function if exists public.career_employer_requisition(uuid,uuid);
--   drop function if exists public.career_employer_unlocks(uuid);
--   drop function if exists public.career_resolve_role(uuid);
--   drop view if exists public.career_worker_showcase;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) THE SHOWCASE VIEW (RULE R2) — public-safe columns ONLY, is_showcased = true.
--    Standard (non security_invoker) view, owned by postgres. NO _enc / _hash column.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.career_worker_showcase as
  select
    wp.worker_code,
    wp.role,
    wp.trade,
    wp.skill_tier,
    wp.experience_band,
    wp.region,
    wp.age_band,
    wp.languages,
    wp.skills,
    wp.readiness_score,
    wp.verification_status,
    wp.created_at
  from career.worker_profiles wp
  where wp.is_showcased = true;

-- The view is the only career surface anon may touch. It exposes exactly the column
-- set above (RULE R8 #5: anon `SELECT *` column set == public-safe set exactly).
grant select on public.career_worker_showcase to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Sectors list (sectors hub + filter facets). name_jsonb → p_locale.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_list_sectors(p_locale text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('slug', s.slug, 'name', s.name_jsonb ->> p_locale)
      order by s.sort_order, s.slug
    ),
    '[]'::jsonb
  )
  from career.sectors s
  where s.is_published = true;
$$;
revoke all on function public.career_list_sectors(text) from public, anon, authenticated;
grant execute on function public.career_list_sectors(text) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Talent pool browse — reads the VIEW ONLY (never the base table). Server-side
--    pagination (p_limit/p_offset). All filters optional (NULL = no filter). RULE R12:
--    this is a page-route surface with no /api rate-limit cap; pagination + no bulk
--    export are the structural throttle (see lib/kariyer notes).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_browse_showcase(
  p_sector        text,
  p_trade         text,
  p_tier          text,
  p_experience    text,
  p_region        text,
  p_age           text,
  p_languages     text[],
  p_min_readiness int,
  p_limit         int,
  p_offset        int
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(card order by card ->> 'workerCode'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'workerCode',         v.worker_code,
      'role',               v.role,
      'trade',              v.trade,
      'skillTier',          v.skill_tier,
      'experienceBand',     v.experience_band,
      'region',             v.region,
      'ageBand',            v.age_band,
      'languages',          to_jsonb(v.languages),
      'skills',             to_jsonb(v.skills),
      'readinessScore',     v.readiness_score,
      'verificationStatus', v.verification_status
    ) as card
    from public.career_worker_showcase v
    -- p_sector contract (SQL-review finding 3 / R12): worker_profiles has NO normalized
    -- `sector` FK column — sector faceting is a CASE-INSENSITIVE match of the sector slug
    -- (078 seeds 'construction'/'hospitality') against the free-text trade/role columns.
    -- lower()-normalized so a capitalized trade ('Construction') still matches slug
    -- 'construction'. NOTE for the UI/data agent: to make this filter reliably return
    -- rows, seed/store worker `trade` (or `role`) values equal to the sector slug, OR
    -- promote `sector` to a normalized column on worker_profiles and switch this to
    -- `v.sector = p_sector` + an index. Not a gate/leak (VIEW-only, public-safe columns).
    where (p_sector     is null or lower(v.trade) = lower(p_sector) or lower(v.role) = lower(p_sector))
      and (p_trade      is null or v.trade = p_trade)
      and (p_tier       is null or v.skill_tier = p_tier)
      and (p_experience is null or v.experience_band = p_experience)
      and (p_region     is null or v.region = p_region)
      and (p_age        is null or v.age_band = p_age)
      and (p_languages  is null or v.languages @> p_languages)
      and (p_min_readiness is null or v.readiness_score >= p_min_readiness)
    order by v.readiness_score desc, v.worker_code
    limit greatest(coalesce(p_limit, 24), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  ) t;
$$;
revoke all on function public.career_browse_showcase(text,text,text,text,text,text,text[],int,int,int)
  from public, anon, authenticated;
grant execute on function public.career_browse_showcase(text,text,text,text,text,text,text[],int,int,int)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Single anonymized worker detail by code — VIEW ONLY. NULL → 404 / not showcased.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_get_showcase_worker(p_worker_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'workerCode',         v.worker_code,
    'role',               v.role,
    'trade',              v.trade,
    'skillTier',          v.skill_tier,
    'experienceBand',     v.experience_band,
    'region',             v.region,
    'ageBand',            v.age_band,
    'languages',          to_jsonb(v.languages),
    'skills',             to_jsonb(v.skills),
    'readinessScore',     v.readiness_score,
    'verificationStatus', v.verification_status
  )
  from public.career_worker_showcase v
  where v.worker_code = p_worker_code;
$$;
revoke all on function public.career_get_showcase_worker(text) from public, anon, authenticated;
grant execute on function public.career_get_showcase_worker(text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Worker reads OWN profile. RULE R1: scoped by explicit p_user_id, re-verified
--    (where user_id = p_user_id). Returns the public-safe block ONLY — even the
--    worker's own dossier read here excludes _enc PII (PII is shown via a separate
--    decrypt path / never round-tripped to the client in clear here). NULL → no row.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_get_worker_profile(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'workerCode',         wp.worker_code,
    'role',               wp.role,
    'trade',              wp.trade,
    'skillTier',          wp.skill_tier,
    'experienceBand',     wp.experience_band,
    'region',             wp.region,
    'ageBand',            wp.age_band,
    'languages',          to_jsonb(wp.languages),
    'skills',             to_jsonb(wp.skills),
    'readinessScore',     wp.readiness_score,
    'verificationStatus', wp.verification_status,
    'isShowcased',        wp.is_showcased,
    'createdAt',          wp.created_at
  )
  from career.worker_profiles wp
  where wp.user_id = p_user_id;       -- RULE R1: re-verify ownership via explicit arg
$$;
revoke all on function public.career_get_worker_profile(uuid) from public, anon, authenticated;
grant execute on function public.career_get_worker_profile(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Worker reads OWN documents (visibility + consent state, never raw bytes). Joins
--    on the worker's own profile via p_user_id. Returns per-doc metadata for the
--    /career/worker/documents center (what is/isn't public).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_get_worker_documents(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',                     d.id,
      'category',               d.category,
      'visibility',             d.visibility,
      'consentStatus',          d.consent_status,
      'consentAt',              d.consent_at,
      'retentionUntil',         d.retention_until,
      'watermarkedVariantPath', d.watermarked_variant_path,
      'createdAt',              d.created_at
    ) order by d.created_at
  ), '[]'::jsonb)
  from career.worker_documents d
  join career.worker_profiles wp on wp.id = d.worker_id
  where wp.user_id = p_user_id;        -- RULE R1
$$;
revoke all on function public.career_get_worker_documents(uuid) from public, anon, authenticated;
grant execute on function public.career_get_worker_documents(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Worker status summary (dashboard signal). PII-free. Counts interest/approval
--    state on the worker's reveal_unlocks WITHOUT exposing employer identity
--    (symmetric gate — worker never sees the employer pre-placement).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_get_worker_status(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'workerCode',          wp.worker_code,
    'verificationStatus',  wp.verification_status,
    'isShowcased',         wp.is_showcased,
    'readinessScore',      wp.readiness_score,
    'interestCount',       (select count(*) from career.reveal_unlocks ru
                              where ru.worker_id = wp.id),
    'approvedCount',       (select count(*) from career.reveal_unlocks ru
                              where ru.worker_id = wp.id and ru.owner_approved = true),
    'placedCount',         (select count(*) from career.placements pl
                              join career.reveal_unlocks ru on ru.id = pl.reveal_unlock_id
                              where ru.worker_id = wp.id)
  )
  from career.worker_profiles wp
  where wp.user_id = p_user_id;        -- RULE R1
$$;
revoke all on function public.career_get_worker_status(uuid) from public, anon, authenticated;
grant execute on function public.career_get_worker_status(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) Employer requisitions list. RULE R1 + R8 #2: re-verify ownership via
--    career.owns_employer(employer_id, p_employer_user_id) — passing employer B's uid
--    returns ZERO rows (the NULL-auth.uid() cross-employer failure mode is closed).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_employer_requisitions(p_employer_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',           r.id,
      'sector',       r.sector,
      'rolesJsonb',   r.roles_jsonb,
      'requirements', r.requirements,
      'termsJsonb',   r.terms_jsonb,
      'servicePath',  r.service_path,
      'status',       r.status,
      'createdAt',    r.created_at
    ) order by r.created_at desc
  ), '[]'::jsonb)
  from career.requisitions r
  where career.owns_employer(r.employer_id, p_employer_user_id);
$$;
revoke all on function public.career_employer_requisitions(uuid) from public, anon, authenticated;
grant execute on function public.career_employer_requisitions(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) Single employer requisition + its PRESENTED shortlist (anonymized cards only).
--    Re-verifies ownership; presented_to_employer=true gate on the shortlist. The
--    shortlist cards are projected from the showcase VIEW (no private columns).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_employer_requisition(p_id uuid, p_employer_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id',           r.id,
    'sector',       r.sector,
    'rolesJsonb',   r.roles_jsonb,
    'requirements', r.requirements,
    'termsJsonb',   r.terms_jsonb,
    'servicePath',  r.service_path,
    'status',       r.status,
    'createdAt',    r.created_at,
    'shortlist', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'workerCode',     v.worker_code,
          'role',           v.role,
          'trade',          v.trade,
          'skillTier',      v.skill_tier,
          'experienceBand', v.experience_band,
          'region',         v.region,
          'readinessScore', v.readiness_score,
          'stage',          si.stage
        ) order by v.worker_code
      ), '[]'::jsonb)
      from career.shortlists sl
      join career.shortlist_items si on si.shortlist_id = sl.id
      join career.worker_profiles wp on wp.id = si.worker_id
      join public.career_worker_showcase v on v.worker_code = wp.worker_code
      where sl.requisition_id = r.id
        and sl.presented_to_employer = true
    )
  )
  from career.requisitions r
  where r.id = p_id
    and career.owns_employer(r.employer_id, p_employer_user_id);
$$;
revoke all on function public.career_employer_requisition(uuid,uuid) from public, anon, authenticated;
grant execute on function public.career_employer_requisition(uuid,uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) Employer unlock/reveal center — interest + approval + payment state. RULE R1 +
--    R8 #2: ownership re-verified. Worker stays anonymized (worker_code only); full
--    dossier release is gated on owner_approved && paid (signed via 075/076 at access).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_employer_unlocks(p_employer_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',            ru.id,
      'requisitionId', ru.requisition_id,
      'workerCode',    wp.worker_code,
      'interestAt',    ru.interest_at,
      'ownerApproved', ru.owner_approved,
      'paymentStatus', ru.payment_status,
      'unlockedAt',    ru.unlocked_at
    ) order by ru.created_at desc
  ), '[]'::jsonb)
  from career.reveal_unlocks ru
  join career.worker_profiles wp on wp.id = ru.worker_id
  where career.owns_employer(ru.employer_id, p_employer_user_id);
$$;
revoke all on function public.career_employer_unlocks(uuid) from public, anon, authenticated;
grant execute on function public.career_employer_unlocks(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10) Role resolver — route layer asks "is this user a worker, an employer, or
--     neither?" to pick the right nav/dashboard. RULE R1: explicit p_user_id.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_resolve_role(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from career.employer_accounts ea where ea.user_id = p_user_id) then 'employer'
    when exists (select 1 from career.worker_profiles  wp where wp.user_id = p_user_id) then 'worker'
    else 'none'
  end;
$$;
revoke all on function public.career_resolve_role(uuid) from public, anon, authenticated;
grant execute on function public.career_resolve_role(uuid) to service_role;
