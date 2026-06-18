-- ═══════════════════════════════════════════════════════════════════════════
-- 076: C0 — owner-console (admin) RPCs. service_role-only EXECUTE.
-- ═══════════════════════════════════════════════════════════════════════════
-- The owner's RoNa Legal console (/admin/career). These are the ONLY RPCs that read
-- UN-anonymized worker PII (pgp_sym_decrypt with career_pii_key) and that mutate the
-- gate (approve/pay). Every function is SECURITY DEFINER + search_path='' and granted
-- to service_role ONLY — the admin route gates the human via isAdminEmail / is_admin()
-- BEFORE calling these with the service-role client (defense in two layers, mirroring
-- the existing admin provider RPCs). anon/authenticated NEVER execute these.
--
-- STATE-GUARDED mutations use an expected→next compare-and-set (optimistic) so a stale
-- console view cannot skip a lifecycle stage. RULE R7 holds: no worker-side fee here.
-- Phase-0 NOTE: career_admin_mark_unlock_paid is a MANUAL stub — there is no live
-- payment integration yet (BUILD-RULES defers live payment). It atomically flips
-- payment_status='paid' AND unlocked_at=now() in ONE update; a real PSP webhook replaces
-- the human call later. Until then the owner marks paid by hand after off-platform settle.
--
-- ROLLBACK:
--   drop function if exists public.career_admin_search_workers(text,text,int,int);
--   drop function if exists public.career_admin_list_requisitions(career.requisition_status);
--   drop function if exists public.career_admin_set_requisition_status(uuid,career.requisition_status,career.requisition_status);
--   drop function if exists public.career_admin_set_worker_verification(uuid,text);
--   drop function if exists public.career_admin_verify_document(uuid,boolean);
--   drop function if exists public.career_admin_add_shortlist_item(uuid,text,text,uuid);
--   drop function if exists public.career_admin_remove_shortlist_item(uuid);
--   drop function if exists public.career_admin_publish_shortlist(uuid);
--   drop function if exists public.career_admin_list_unlocks(career.unlock_payment_status);
--   drop function if exists public.career_admin_approve_unlock(uuid);
--   drop function if exists public.career_admin_mark_unlock_paid(uuid);
--   drop function if exists public.career_admin_list_commissions();
--   drop function if exists public.career_admin_list_employers(text);
--   drop function if exists public.career_admin_set_employer_verified(uuid,boolean);
--   drop function if exists public.career_admin_set_employer_tier(uuid,text);
--   drop function if exists public.career_admin_compliance(uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Talent curation search — UN-anonymized (decrypts PII for display). The ONLY
--    read path that returns full_name / phone / email / passport in clear. p_q matches
--    worker_code / role / trade / region (ILIKE). Server-paginated.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_admin_search_workers(
  p_q text, p_verification text, p_limit int, p_offset int
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_key text;
begin
  v_key := (select decrypted_secret from vault.decrypted_secrets where name = 'career_pii_key');
  if v_key is null then raise exception 'PII_KEY_MISSING'; end if;

  return (
    select coalesce(jsonb_agg(row order by row ->> 'workerCode'), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id',                 wp.id,
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
        -- UN-anonymized PII (admin display only)
        'fullName',     case when wp.full_name_enc     is not null then extensions.pgp_sym_decrypt(wp.full_name_enc, v_key)     else null end,
        'dob',          case when wp.dob_enc           is not null then extensions.pgp_sym_decrypt(wp.dob_enc, v_key)           else null end,
        'exactCountry', case when wp.exact_country_enc is not null then extensions.pgp_sym_decrypt(wp.exact_country_enc, v_key) else null end,
        'phone',        case when wp.phone_enc         is not null then extensions.pgp_sym_decrypt(wp.phone_enc, v_key)         else null end,
        'email',        case when wp.email_enc         is not null then extensions.pgp_sym_decrypt(wp.email_enc, v_key)         else null end,
        'address',      case when wp.address_enc       is not null then extensions.pgp_sym_decrypt(wp.address_enc, v_key)       else null end,
        'passportNo',   case when wp.passport_no_enc   is not null then extensions.pgp_sym_decrypt(wp.passport_no_enc, v_key)   else null end
      ) as row
      from career.worker_profiles wp
      where (p_verification is null or wp.verification_status = p_verification)
        and (p_q is null or p_q = '' or
             wp.worker_code ilike '%' || p_q || '%' or
             wp.role        ilike '%' || p_q || '%' or
             wp.trade       ilike '%' || p_q || '%' or
             wp.region      ilike '%' || p_q || '%')
      order by wp.created_at desc
      limit greatest(coalesce(p_limit, 25), 1)
      offset greatest(coalesce(p_offset, 0), 0)
    ) t
  );
end $$;
revoke all on function public.career_admin_search_workers(text,text,int,int) from public, anon, authenticated;
grant execute on function public.career_admin_search_workers(text,text,int,int) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1b) Requisition list for the owner console (/admin/career/requisitions). Reads
--     ALL requisitions across ALL employers (no p_employer scoping — the admin route
--     gates the human + this RPC is service_role-only EXECUTE; see R1/R8 #2 note in
--     spec 24). PII-light: returns the UN-anonymized employer COMPANY name (owner
--     console, fine) but NO worker identity. Optional p_status filter (null = all).
--     role/headcount are derived from roles_jsonb (role→count map) so the card can
--     render "İnşaat · Kalıpçı ×6" without the client re-parsing the jsonb: `role` is
--     the first role key (alpha order), `headcount` is the summed count over all roles.
--     shortlistCount = how many workers were presented to the employer.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_admin_list_requisitions(p_status career.requisition_status)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',              r.id,
      'employerCompany', ea.company,
      'sectorLabel',     r.sector,
      'role', (
        select kv.key
        from jsonb_each(coalesce(r.roles_jsonb, '{}'::jsonb)) kv
        order by kv.key
        limit 1
      ),
      'headcount', (
        select coalesce(sum((kv.value #>> '{}')::int), 0)
        from jsonb_each(coalesce(r.roles_jsonb, '{}'::jsonb)) kv
        where jsonb_typeof(kv.value) = 'number'
      ),
      'servicePath',  r.service_path,
      'status',       r.status,
      'createdAt',    r.created_at,
      'shortlistCount', (
        select coalesce(count(si.id), 0)
        from career.shortlists sl
        join career.shortlist_items si on si.shortlist_id = sl.id
        where sl.requisition_id = r.id and sl.presented_to_employer = true
      )
    ) order by r.created_at desc
  ), '[]'::jsonb)
  from career.requisitions r
  join career.employer_accounts ea on ea.id = r.employer_id
  where p_status is null or r.status = p_status;
$$;
revoke all on function public.career_admin_list_requisitions(career.requisition_status) from public, anon, authenticated;
grant execute on function public.career_admin_list_requisitions(career.requisition_status) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Requisition status transition — state-guarded compare-and-set.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_admin_set_requisition_status(
  p_id uuid, p_expected career.requisition_status, p_next career.requisition_status
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  update career.requisitions
  set status = p_next
  where id = p_id and status = p_expected
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('ok', false, 'reason', 'STATE_MISMATCH');
  end if;
  return jsonb_build_object('ok', true, 'status', p_next);
end $$;
revoke all on function public.career_admin_set_requisition_status(uuid,career.requisition_status,career.requisition_status)
  from public, anon, authenticated;
grant execute on function public.career_admin_set_requisition_status(uuid,career.requisition_status,career.requisition_status)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Set worker verification badge tier.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_admin_set_worker_verification(p_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if p_status not in ('pending','id_verified','skills_verified','documents_verified','interview_passed','rejected') then
    raise exception 'SECTOR_INVALID';  -- stable code reuse: invalid input
  end if;
  update career.worker_profiles set verification_status = p_status where id = p_id returning id into v_id;
  if v_id is null then return jsonb_build_object('ok', false, 'reason', 'WORKER_NOT_FOUND'); end if;
  return jsonb_build_object('ok', true, 'verificationStatus', p_status);
end $$;
revoke all on function public.career_admin_set_worker_verification(uuid,text) from public, anon, authenticated;
grant execute on function public.career_admin_set_worker_verification(uuid,text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Verify (or reject) a document — stamps consent_status as a verification signal.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_admin_verify_document(p_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  update career.worker_documents
  set consent_status = case when p_approve then 'granted' else 'revoked' end,
      consent_at     = case when p_approve then now() else consent_at end
  where id = p_id
  returning id into v_id;
  if v_id is null then return jsonb_build_object('ok', false, 'reason', 'NOT_FOUND'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.career_admin_verify_document(uuid,boolean) from public, anon, authenticated;
grant execute on function public.career_admin_verify_document(uuid,boolean) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Shortlist builder — add an item. Creates the shortlist row for the requisition
--    on first add (kept private until published). p_added_by = the admin user id.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_admin_add_shortlist_item(
  p_requisition_id uuid, p_worker_code text, p_stage text, p_added_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shortlist_id uuid;
  v_worker_id    uuid;
  v_item_id      uuid;
begin
  select wp.id into v_worker_id from career.worker_profiles wp where wp.worker_code = p_worker_code;
  if v_worker_id is null then raise exception 'WORKER_NOT_FOUND'; end if;

  select sl.id into v_shortlist_id
  from career.shortlists sl
  where sl.requisition_id = p_requisition_id
  order by sl.created_at
  limit 1;

  if v_shortlist_id is null then
    insert into career.shortlists (requisition_id, added_by, presented_to_employer)
    values (p_requisition_id, p_added_by, false)
    returning id into v_shortlist_id;
  end if;

  insert into career.shortlist_items (shortlist_id, worker_id, stage)
  values (v_shortlist_id, v_worker_id, coalesce(p_stage, 'sourced'))
  returning id into v_item_id;

  return jsonb_build_object('ok', true, 'shortlistId', v_shortlist_id, 'itemId', v_item_id);
end $$;
revoke all on function public.career_admin_add_shortlist_item(uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.career_admin_add_shortlist_item(uuid,text,text,uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Remove a shortlist item.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_admin_remove_shortlist_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  delete from career.shortlist_items where id = p_item_id returning id into v_id;
  return jsonb_build_object('ok', v_id is not null);
end $$;
revoke all on function public.career_admin_remove_shortlist_item(uuid) from public, anon, authenticated;
grant execute on function public.career_admin_remove_shortlist_item(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) Publish shortlist — flips presented_to_employer=true (employer can now see it via
--    the presented-only RLS / the employer read RPC) + advances the requisition to
--    shortlist_ready (best-effort guarded).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_admin_publish_shortlist(p_shortlist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req_id uuid;
begin
  update career.shortlists
  set presented_to_employer = true
  where id = p_shortlist_id
  returning requisition_id into v_req_id;
  if v_req_id is null then
    return jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  end if;

  update career.requisitions
  set status = 'shortlist_ready'
  where id = v_req_id and status in ('submitted','under_curation');

  return jsonb_build_object('ok', true, 'requisitionId', v_req_id);
end $$;
revoke all on function public.career_admin_publish_shortlist(uuid) from public, anon, authenticated;
grant execute on function public.career_admin_publish_shortlist(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) List unlocks for the approval gate. Optional payment-status filter. UN-anonymized
--    is NOT needed here (owner sees worker_code + employer company) — PII-light.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_admin_list_unlocks(p_status career.unlock_payment_status)
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
      'employerCompany', ea.company,
      'interestAt',    ru.interest_at,
      'ownerApproved', ru.owner_approved,
      'paymentStatus', ru.payment_status,
      'feeInvoiceId',  ru.fee_invoice_id,
      'unlockedAt',    ru.unlocked_at
    ) order by ru.created_at desc
  ), '[]'::jsonb)
  from career.reveal_unlocks ru
  join career.worker_profiles   wp on wp.id = ru.worker_id
  join career.employer_accounts ea on ea.id = ru.employer_id
  where p_status is null or ru.payment_status = p_status;
$$;
revoke all on function public.career_admin_list_unlocks(career.unlock_payment_status) from public, anon, authenticated;
grant execute on function public.career_admin_list_unlocks(career.unlock_payment_status) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) Approve an unlock — state-guard: only flips an un-approved 'interest' row to
--    owner_approved=true (and issues a fee invoice placeholder). Identity is NOT yet
--    released — that happens on mark_unlock_paid. Idempotent-ish via the guard.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_admin_approve_unlock(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  update career.reveal_unlocks
  set owner_approved = true,
      payment_status = case when payment_status = 'unpaid' then 'invoiced' else payment_status end,
      fee_invoice_id = coalesce(fee_invoice_id, 'INV-' || replace(id::text, '-', ''))
  where id = p_id and owner_approved = false
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('ok', false, 'reason', 'STATE_MISMATCH');
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.career_admin_approve_unlock(uuid) from public, anon, authenticated;
grant execute on function public.career_admin_approve_unlock(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10) Mark unlock paid — PHASE-0 MANUAL STUB (live payment deferred per BUILD-RULES).
--     ATOMIC: in ONE update sets payment_status='paid' AND unlocked_at=now() (and only
--     when owner_approved=true). This is the byte that releases the full dossier (the
--     employer read RPC / document signer re-checks owner_approved && paid). A real PSP
--     webhook replaces this human call later — the SQL stays identical; only the caller
--     changes. Guard: refuses to mark paid before approval.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_admin_mark_unlock_paid(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  update career.reveal_unlocks
  set payment_status = 'paid',
      unlocked_at    = now()
  where id = p_id and owner_approved = true
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('ok', false, 'reason', 'NOT_APPROVED');  -- cannot pay an unapproved unlock
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.career_admin_mark_unlock_paid(uuid) from public, anon, authenticated;
grant execute on function public.career_admin_mark_unlock_paid(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11) Commission records list (fee tracking).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_admin_list_commissions()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',          cr.id,
      'placementId', cr.placement_id,
      'path',        cr.path,
      'amount',      cr.amount,
      'currency',    cr.currency,
      'invoiceId',   cr.invoice_id,
      'paidAt',      cr.paid_at,
      'createdAt',   cr.created_at
    ) order by cr.created_at desc
  ), '[]'::jsonb)
  from career.commission_records cr;
$$;
revoke all on function public.career_admin_list_commissions() from public, anon, authenticated;
grant execute on function public.career_admin_list_commissions() to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11b) Employer list for the owner console (/admin/career/employers). Reads ALL
--      employer accounts across ALL tiers (verified or not) — no p_employer scoping
--      (the admin route gates the human + this RPC is service_role-only EXECUTE; see
--      R1/R8 #2 note in spec 30). PII-LIGHT: returns the company name + tier + verified
--      flag + requisition count ONLY — NEVER decrypts contact_enc for a list view.
--      Optional p_tier filter ('free'|'verified'|'premium'; null = all), mirroring how
--      reviews page.tsx does `.eq("status", filter)`. Ordered created_at desc (mirror
--      §8/§11). requisitionCount = how many requisitions this employer has filed.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_admin_list_employers(p_tier text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',               ea.id,
      'company',          ea.company,
      'tier',             ea.tier,
      'verified',         ea.verified,
      'createdAt',        ea.created_at,
      'requisitionCount', (
        select coalesce(count(r.id), 0)
        from career.requisitions r
        where r.employer_id = ea.id
      )
    ) order by ea.created_at desc
  ), '[]'::jsonb)
  from career.employer_accounts ea
  where p_tier is null or ea.tier = p_tier;
$$;
revoke all on function public.career_admin_list_employers(text) from public, anon, authenticated;
grant execute on function public.career_admin_list_employers(text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12) Set employer verified flag.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_admin_set_employer_verified(p_id uuid, p_verified boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  update career.employer_accounts set verified = coalesce(p_verified, false) where id = p_id returning id into v_id;
  return jsonb_build_object('ok', v_id is not null);
end $$;
revoke all on function public.career_admin_set_employer_verified(uuid,boolean) from public, anon, authenticated;
grant execute on function public.career_admin_set_employer_verified(uuid,boolean) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13) Set employer tier.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_admin_set_employer_tier(p_id uuid, p_tier text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if p_tier not in ('free','verified','premium') then raise exception 'SECTOR_INVALID'; end if;
  update career.employer_accounts set tier = p_tier where id = p_id returning id into v_id;
  if v_id is null then return jsonb_build_object('ok', false, 'reason', 'NOT_FOUND'); end if;
  return jsonb_build_object('ok', true, 'tier', p_tier);
end $$;
revoke all on function public.career_admin_set_employer_tier(uuid,text) from public, anon, authenticated;
grant execute on function public.career_admin_set_employer_tier(uuid,text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14) Compliance view — per-worker consent log + document access audit (PDPA/GDPR).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.career_admin_compliance(p_worker_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'consents', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',        c.id,
          'purpose',   c.purpose,
          'granted',   c.granted,
          'grantedAt', c.granted_at,
          'revokedAt', c.revoked_at
        ) order by c.granted_at
      ), '[]'::jsonb)
      from career.consents c
      where c.worker_id = p_worker_id
    ),
    'accessLog', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',             al.id,
          'documentId',     al.document_id,
          'accessedBy',     al.accessed_by,
          'revealUnlockId', al.reveal_unlock_id,
          'accessedAt',     al.accessed_at,
          'ipHash',         al.ip_hash
        ) order by al.accessed_at desc
      ), '[]'::jsonb)
      from career.document_access_log al
      join career.worker_documents d on d.id = al.document_id
      where d.worker_id = p_worker_id
    )
  );
$$;
revoke all on function public.career_admin_compliance(uuid) from public, anon, authenticated;
grant execute on function public.career_admin_compliance(uuid) to service_role;
