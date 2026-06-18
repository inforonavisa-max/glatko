-- ═══════════════════════════════════════════════════════════════════════════
-- 075: C0 — write RPCs (waitlist · worker/employer/requisition · interest · gate)
-- ═══════════════════════════════════════════════════════════════════════════
-- SYMMETRIC with health 070: the career schema is NOT exposed to PostgREST → even
-- service-role cannot .from('career.*'). So every WRITE goes through PUBLIC-schema
-- SECURITY DEFINER RPCs, called with the service-role client (createAdminClient()).
--
-- RULE R1: NO auth.uid() — identity is derived in the route/action (auth.getUser())
-- and PASSED DOWN as p_*_user_id; ownership re-verified inside (career.owns_employer).
-- RULE R3: career_express_interest verifies (a) the requisition's employer_id is owned
-- by p_employer_user_id AND (b) the worker_code resolves to an is_showcased=true worker,
-- else RAISE NOT_OWNED (prevents seeding gate rows for arbitrary workers/reqs).
-- RULE R7 (ILO Employer Pays + MNE fine): NO fee/price/payment arg on any worker-side
-- RPC. Payment state lives only on reveal_unlocks / commission_records (employer side).
--
-- PII: all _enc columns are extensions.pgp_sym_encrypt'd with the career_pii_key Vault
-- secret (073). Plaintext PII NEVER lands in a non-encrypted column; *_hash columns are
-- digest(lower(value),'sha256') for idempotent dedup/lookup. Worker rows are created
-- only with explicit consent (CONSENT_REQUIRED otherwise) + a career.consents audit row.
--
-- STABLE RAISE CODES (must match lib/kariyer/booking.ts CODES later):
--   SECTOR_INVALID · CONSENT_REQUIRED · NOT_OWNED · GATE_LOCKED · WORKER_NOT_FOUND ·
--   ALREADY_EXISTS · PII_KEY_MISSING (infra).
--
-- ROLLBACK:
--   drop function if exists public.career_waitlist_join(career.waitlist_audience,text,text,text,text,text);
--   drop function if exists public.career_create_worker_profile(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text[],text[],boolean);
--   drop function if exists public.career_create_employer_account(uuid,text,text);
--   drop function if exists public.career_create_requisition(uuid,text,jsonb,jsonb,jsonb,career.service_path);
--   drop function if exists public.career_add_document(uuid,text,text,career.doc_visibility,boolean);
--   drop function if exists public.career_express_interest(uuid,text,uuid);
--   drop function if exists public.career_can_access_document(uuid,uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Waitlist join — idempotent upsert on email_hash. PII (email/name/phone) encrypted
--    with career_pii_key. Returns the waitlist id. Re-submitting the same email updates
--    audience/sector/region (latest wins) without creating a duplicate row.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_waitlist_join(
  p_audience career.waitlist_audience,
  p_email    text,
  p_name     text,
  p_phone    text,
  p_sector   text,
  p_region   text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key  text;
  v_hash text;
  v_id   uuid;
begin
  if p_email is null or length(btrim(p_email)) = 0 then
    raise exception 'CONSENT_REQUIRED';   -- no contact → nothing to capture (reuse stable code)
  end if;

  v_key := (select decrypted_secret from vault.decrypted_secrets where name = 'career_pii_key');
  if v_key is null then raise exception 'PII_KEY_MISSING'; end if;

  v_hash := encode(extensions.digest(lower(btrim(p_email)), 'sha256'), 'hex');

  insert into career.waitlist (audience, email_enc, email_hash, name_enc, phone_enc, sector, region)
  values (
    p_audience,
    extensions.pgp_sym_encrypt(btrim(p_email), v_key),
    v_hash,
    case when p_name  is not null and length(btrim(p_name))  > 0
         then extensions.pgp_sym_encrypt(btrim(p_name),  v_key) else null end,
    case when p_phone is not null and length(btrim(p_phone)) > 0
         then extensions.pgp_sym_encrypt(btrim(p_phone), v_key) else null end,
    p_sector,
    p_region
  )
  on conflict (email_hash) do update
    set audience = excluded.audience,
        name_enc = coalesce(excluded.name_enc, career.waitlist.name_enc),
        phone_enc = coalesce(excluded.phone_enc, career.waitlist.phone_enc),
        sector   = excluded.sector,
        region   = excluded.region
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function public.career_waitlist_join(career.waitlist_audience,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.career_waitlist_join(career.waitlist_audience,text,text,text,text,text)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Create worker profile (multi-step builder commit). RULE R7: NO fee arg. Requires
--    explicit consent (RAISE CONSENT_REQUIRED). Encrypts PII → bytea + sha256 hashes;
--    generates worker_code MNE-<TRADECODE>-<seq>; writes a career.consents audit row.
--    One profile per user_id (RAISE ALREADY_EXISTS on re-create).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_create_worker_profile(
  p_user_id        uuid,
  p_full_name      text,
  p_dob            text,
  p_exact_country  text,
  p_phone          text,
  p_email          text,
  p_address        text,
  p_passport_no    text,
  p_role           text,
  p_trade          text,
  p_tier           text,
  p_experience     text,
  p_region         text,
  p_age            text,
  p_languages      text[],
  p_skills         text[],
  p_consent        boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key       text;
  v_id        uuid;
  v_code      text;
  v_trade_cd  text;
  v_seq       bigint;
begin
  if p_consent is not true then
    raise exception 'CONSENT_REQUIRED';
  end if;
  if p_user_id is null then
    raise exception 'NOT_OWNED';
  end if;
  if exists (select 1 from career.worker_profiles wp where wp.user_id = p_user_id) then
    raise exception 'ALREADY_EXISTS';
  end if;

  v_key := (select decrypted_secret from vault.decrypted_secrets where name = 'career_pii_key');
  if v_key is null then raise exception 'PII_KEY_MISSING'; end if;

  -- worker_code: MNE-<2-letter TRADECODE>-<zero-padded seq>. Trade code derived from
  -- the trade text (first two upper letters), fallback 'XX'. Seq is a per-prefix count.
  v_trade_cd := upper(coalesce(substring(regexp_replace(coalesce(p_trade, p_role, ''), '[^A-Za-z]', '', 'g') from 1 for 2), ''));
  if length(v_trade_cd) < 2 then v_trade_cd := 'XX'; end if;
  select count(*) + 1 into v_seq
    from career.worker_profiles wp
    where wp.worker_code like 'MNE-' || v_trade_cd || '-%';
  v_code := 'MNE-' || v_trade_cd || '-' || lpad(v_seq::text, 4, '0');

  insert into career.worker_profiles (
    user_id, worker_code, role, trade, skill_tier, experience_band, region, age_band,
    languages, skills, verification_status, is_showcased,
    full_name_enc, dob_enc, exact_country_enc, phone_enc, phone_hash,
    email_enc, email_hash, address_enc, passport_no_enc
  )
  values (
    p_user_id, v_code, p_role, p_trade, p_tier, p_experience, p_region, p_age,
    coalesce(p_languages, '{}'), coalesce(p_skills, '{}'), 'pending', false,
    case when p_full_name     is not null then extensions.pgp_sym_encrypt(p_full_name,    v_key) else null end,
    case when p_dob           is not null then extensions.pgp_sym_encrypt(p_dob,          v_key) else null end,
    case when p_exact_country is not null then extensions.pgp_sym_encrypt(p_exact_country,v_key) else null end,
    case when p_phone         is not null then extensions.pgp_sym_encrypt(p_phone,        v_key) else null end,
    case when p_phone         is not null then encode(extensions.digest(p_phone, 'sha256'), 'hex') else null end,
    case when p_email         is not null then extensions.pgp_sym_encrypt(p_email,        v_key) else null end,
    case when p_email         is not null then encode(extensions.digest(lower(btrim(p_email)), 'sha256'), 'hex') else null end,
    case when p_address       is not null then extensions.pgp_sym_encrypt(p_address,      v_key) else null end,
    case when p_passport_no   is not null then extensions.pgp_sym_encrypt(p_passport_no,  v_key) else null end
  )
  returning id into v_id;

  -- consent audit row (append-only; written only here, service-role).
  insert into career.consents (worker_id, purpose, granted, granted_at)
  values (v_id, 'profile_data_processing', true, now());

  return jsonb_build_object('ok', true, 'workerId', v_id, 'workerCode', v_code);
end $$;
revoke all on function public.career_create_worker_profile(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text[],text[],boolean)
  from public, anon, authenticated;
grant execute on function public.career_create_worker_profile(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text[],text[],boolean)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Create employer account. Contact encrypted. One account per user_id
--    (RAISE ALREADY_EXISTS). New accounts start verified=false, tier='free'.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_create_employer_account(
  p_user_id uuid, p_company text, p_contact text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_id  uuid;
begin
  if p_user_id is null then raise exception 'NOT_OWNED'; end if;
  if p_company is null or length(btrim(p_company)) = 0 then raise exception 'SECTOR_INVALID'; end if;
  if exists (select 1 from career.employer_accounts ea where ea.user_id = p_user_id) then
    raise exception 'ALREADY_EXISTS';
  end if;

  v_key := (select decrypted_secret from vault.decrypted_secrets where name = 'career_pii_key');
  if v_key is null then raise exception 'PII_KEY_MISSING'; end if;

  insert into career.employer_accounts (user_id, company, contact_enc, contact_hash, verified, tier)
  values (
    p_user_id, btrim(p_company),
    case when p_contact is not null and length(btrim(p_contact)) > 0
         then extensions.pgp_sym_encrypt(btrim(p_contact), v_key) else null end,
    case when p_contact is not null and length(btrim(p_contact)) > 0
         then encode(extensions.digest(lower(btrim(p_contact)), 'sha256'), 'hex') else null end,
    false, 'free'
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'employerId', v_id);
end $$;
revoke all on function public.career_create_employer_account(uuid,text,text) from public, anon, authenticated;
grant execute on function public.career_create_employer_account(uuid,text,text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Create requisition. RULE R1/R3: re-verify the caller owns the employer account
--    before inserting, else RAISE NOT_OWNED. Validates the sector slug exists.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_create_requisition(
  p_employer_user_id uuid,
  p_sector           text,
  p_roles_jsonb      jsonb,
  p_requirements     jsonb,
  p_terms_jsonb      jsonb,
  p_service_path     career.service_path
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employer_id uuid;
  v_id          uuid;
begin
  select ea.id into v_employer_id
  from career.employer_accounts ea
  where ea.user_id = p_employer_user_id;
  if v_employer_id is null then
    raise exception 'NOT_OWNED';
  end if;

  if p_sector is not null and not exists (
    select 1 from career.sectors s where s.slug = p_sector and s.is_published = true
  ) then
    raise exception 'SECTOR_INVALID';
  end if;

  insert into career.requisitions
    (employer_id, sector, roles_jsonb, requirements, terms_jsonb, service_path, status)
  values
    (v_employer_id, p_sector, p_roles_jsonb, p_requirements, p_terms_jsonb,
     coalesce(p_service_path, 'commission'), 'submitted')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'requisitionId', v_id);
end $$;
revoke all on function public.career_create_requisition(uuid,text,jsonb,jsonb,jsonb,career.service_path)
  from public, anon, authenticated;
grant execute on function public.career_create_requisition(uuid,text,jsonb,jsonb,jsonb,career.service_path)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Add worker document. RULE R1: resolves the worker via p_user_id (the doc must
--    belong to the calling worker). consent flag stamps consent_status/consent_at.
--    visibility is the single source of truth (073). RAISE WORKER_NOT_FOUND if the
--    user has no worker profile.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_add_document(
  p_user_id      uuid,
  p_category     text,
  p_storage_path text,
  p_visibility   career.doc_visibility,
  p_consent      boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker_id uuid;
  v_id        uuid;
begin
  select wp.id into v_worker_id
  from career.worker_profiles wp
  where wp.user_id = p_user_id;
  if v_worker_id is null then
    raise exception 'WORKER_NOT_FOUND';
  end if;

  insert into career.worker_documents
    (worker_id, category, storage_path, visibility, consent_status, consent_at)
  values
    (v_worker_id, p_category, p_storage_path, coalesce(p_visibility, 'internal_only'),
     case when p_consent is true then 'granted' else 'pending' end,
     case when p_consent is true then now() else null end)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'documentId', v_id);
end $$;
revoke all on function public.career_add_document(uuid,text,text,career.doc_visibility,boolean)
  from public, anon, authenticated;
grant execute on function public.career_add_document(uuid,text,text,career.doc_visibility,boolean)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Express interest (+ add-to-requisition). RULE R3: verify (a) the requisition's
--    employer_id is owned by p_employer_user_id AND (b) the worker_code resolves to an
--    is_showcased=true worker; else RAISE NOT_OWNED. Inserts a reveal_unlocks row in
--    state 'interest' (owner_approved=false, payment_status='unpaid') — NO identity
--    revealed. ON CONFLICT (req,worker,employer) DO NOTHING (idempotent; the UNIQUE
--    from 073 prevents duplicate gate rows). The owner-notification trigger is wired in
--    the route layer (RULE R10: dispatchInterestNotice), not here.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_express_interest(
  p_employer_user_id uuid,
  p_worker_code      text,
  p_requisition_id   uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employer_id uuid;
  v_worker_id   uuid;
  v_unlock_id   uuid;
begin
  -- (a) the requisition exists AND its employer account is owned by the caller.
  select r.employer_id into v_employer_id
  from career.requisitions r
  where r.id = p_requisition_id
    and career.owns_employer(r.employer_id, p_employer_user_id);
  if v_employer_id is null then
    raise exception 'NOT_OWNED';
  end if;

  -- (b) the worker_code resolves to an is_showcased = true worker.
  select wp.id into v_worker_id
  from career.worker_profiles wp
  where wp.worker_code = p_worker_code and wp.is_showcased = true;
  if v_worker_id is null then
    raise exception 'WORKER_NOT_FOUND';
  end if;

  insert into career.reveal_unlocks
    (requisition_id, worker_id, employer_id, interest_at, owner_approved, payment_status)
  values
    (p_requisition_id, v_worker_id, v_employer_id, now(), false, 'unpaid')
  on conflict (requisition_id, worker_id, employer_id) do nothing
  returning id into v_unlock_id;

  if v_unlock_id is null then
    -- already expressed — return the existing row id (idempotent, still locked).
    select ru.id into v_unlock_id
    from career.reveal_unlocks ru
    where ru.requisition_id = p_requisition_id
      and ru.worker_id = v_worker_id
      and ru.employer_id = v_employer_id;
    return jsonb_build_object('ok', true, 'unlockId', v_unlock_id, 'created', false);
  end if;

  return jsonb_build_object('ok', true, 'unlockId', v_unlock_id, 'created', true);
end $$;
revoke all on function public.career_express_interest(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.career_express_interest(uuid,text,uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) career_can_access_document — the SIGNING-TIME gate (RULE R6 + R8 #4). Returns
--    true iff: the document is the requesting user's OWN doc, OR (it is 'gated' AND a
--    reveal_unlocks row for that worker is owner_approved AND payment_status='paid' AND
--    the unlock's employer account belongs to p_user_id). This predicate MUST stay
--    byte-for-byte equivalent to the worker_documents_gated_unlock_read RLS policy in
--    073 (gate-equivalence test asserts no drift). PII-free boolean.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_can_access_document(p_user_id uuid, p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    -- (a) own document (worker reading their own original)
    select 1
    from career.worker_documents d
    join career.worker_profiles wp on wp.id = d.worker_id
    where d.id = p_document_id
      and wp.user_id = p_user_id
  )
  or exists (
    -- (b) gated doc, unlocked for an employer account owned by the caller
    select 1
    from career.worker_documents d
    join career.reveal_unlocks   ru on ru.worker_id = d.worker_id
    join career.employer_accounts ea on ea.id = ru.employer_id
    where d.id = p_document_id
      and d.visibility = 'gated'
      and ru.owner_approved = true
      and ru.payment_status = 'paid'
      and ea.user_id = p_user_id
  );
$$;
revoke all on function public.career_can_access_document(uuid,uuid) from public, anon, authenticated;
grant execute on function public.career_can_access_document(uuid,uuid) to service_role;
