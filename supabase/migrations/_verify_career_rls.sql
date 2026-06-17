-- ═══════════════════════════════════════════════════════════════════════════
-- _verify_career_rls.sql — C0 RLS / gate DRY-RUN (BEGIN … ROLLBACK; no fixtures left)
-- ═══════════════════════════════════════════════════════════════════════════
-- NOT a migration. The leading underscore keeps the Supabase migration runner from
-- picking it up. RULE R8 + R15: this proves the defense-in-depth RLS layer behaves AS
-- AUTHENTICATED / ANON (NEVER service_role — service_role BYPASSES RLS and would make
-- every assert falsely pass). Everything runs inside one transaction and is ROLLED BACK,
-- so it leaves NO fixtures even though local/preview point at the PROD DB.
--
-- It proves (heavy RAISE NOTICE narration like the health verify scripts):
--   A. EMPLOYER BASE-TABLE DENIAL  — an employer cannot read career.worker_profiles
--      base rows (identity lives off the showcase VIEW).
--   B. GATED-DOC GATE              — 0 gated-doc rows visible WITHOUT a paid+approved
--      unlock; exactly 1 AFTER inserting one (owner_approved && payment_status='paid').
--      career_can_access_document() is asserted to AGREE with the RLS policy in BOTH
--      directions: false in the locked/interest-only states (B1-eq/B2-eq), true once
--      paid+approved (B4), and STILL false for a different employer even when emp_a's
--      unlock is paid (B5, employer-scoping). True no-drift, not one-directional.
--   C. ANON VIEW COLUMN-SET        — the showcase VIEW exposes EXACTLY the public-safe
--      column set (no _enc / _hash) and only is_showcased=true rows.
--   D. DENY-ALL TABLES             — commission_records / consents-write /
--      document_access_log / waitlist are unreadable/unwritable to authenticated.
--   E. WORKER-SELF ISOLATION       — worker A cannot read worker B's profile row.
--
-- HOW TO RUN: paste into Supabase Studio SQL editor (or psql) against the target DB and
-- read the NOTICEs. Every assert RAISEs EXCEPTION on failure (which still rolls back).
-- Requires migrations 073-078 already applied to the target (a staging branch ideally).

begin;

-- ── Fixtures (postgres/superuser context creates them; asserts switch role) ───────────
-- Two auth users for employers, two for workers. The career FKs reference auth.users, so
-- we insert throwaway auth.users rows (rolled back with the txn) and impersonate them at
-- the RLS boundary via request.jwt.claims.sub.
do $$
declare
  v_emp_a_user uuid := '11111111-1111-4111-8111-111111111111';
  v_emp_b_user uuid := '22222222-2222-4222-8222-222222222222';
  v_wrk_a_user uuid := '33333333-3333-4333-8333-333333333333';
  v_wrk_b_user uuid := '44444444-4444-4444-8444-444444444444';
  v_emp_a   uuid;
  v_emp_b   uuid;
  v_wrk_a   uuid;
  v_wrk_b   uuid;
  v_req_a   uuid;
  v_doc_a   uuid;
  v_unlock  uuid;
begin
  raise notice '─────────────────────────────────────────────────────────────';
  raise notice 'SETUP: 2 employers, 2 workers (1 showcased w/ a gated doc), 1 requisition.';

  -- throwaway auth.users rows (rolled back) so the career FKs resolve.
  insert into auth.users (id) values
    (v_emp_a_user), (v_emp_b_user), (v_wrk_a_user), (v_wrk_b_user)
  on conflict (id) do nothing;

  insert into career.employer_accounts (user_id, company, verified, tier)
    values (v_emp_a_user, 'Employer A doo', true, 'verified') returning id into v_emp_a;
  insert into career.employer_accounts (user_id, company, verified, tier)
    values (v_emp_b_user, 'Employer B doo', true, 'verified') returning id into v_emp_b;

  insert into career.worker_profiles (user_id, worker_code, role, trade, region, is_showcased, full_name_enc)
    values (v_wrk_a_user, 'MNE-CW-9001', 'mason', 'construction', 'Far East', true,
            extensions.pgp_sym_encrypt('Secret Name A',
              (select decrypted_secret from vault.decrypted_secrets where name='career_pii_key')))
    returning id into v_wrk_a;
  insert into career.worker_profiles (user_id, worker_code, role, trade, region, is_showcased)
    values (v_wrk_b_user, 'MNE-CW-9002', 'welder', 'construction', 'Africa', true)
    returning id into v_wrk_b;

  insert into career.requisitions (employer_id, sector, status)
    values (v_emp_a, 'construction', 'submitted') returning id into v_req_a;

  insert into career.worker_documents (worker_id, category, storage_path, visibility, consent_status)
    values (v_wrk_a, 'passport', v_wrk_a_user::text || '/passport/p.pdf', 'gated', 'granted')
    returning id into v_doc_a;

  -- stash ids in a temp table for the role-switched asserts below
  create temp table _vc (k text primary key, v uuid) on commit drop;
  insert into _vc values
    ('emp_a_user', v_emp_a_user), ('emp_b_user', v_emp_b_user),
    ('wrk_a_user', v_wrk_a_user), ('wrk_b_user', v_wrk_b_user),
    ('emp_a', v_emp_a), ('emp_b', v_emp_b), ('wrk_a', v_wrk_a), ('wrk_b', v_wrk_b),
    ('req_a', v_req_a), ('doc_a', v_doc_a);
  raise notice 'SETUP done. worker A=% (showcased, gated passport doc=%), req A=%', v_wrk_a, v_doc_a, v_req_a;
end $$;

-- ── A. EMPLOYER BASE-TABLE DENIAL ─────────────────────────────────────────────
do $$
declare
  v_emp_a_user uuid := (select v from _vc where k='emp_a_user');
  v_count int;
begin
  raise notice '─────────────────────────────────────────────────────────────';
  raise notice 'A. EMPLOYER BASE-TABLE DENIAL';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a_user, 'role','authenticated')::text, true);

  select count(*) into v_count from career.worker_profiles;
  if v_count <> 0 then
    raise exception 'FAIL A: employer saw % worker_profiles base rows (expected 0)', v_count;
  end if;
  raise notice '  PASS A: employer sees 0 career.worker_profiles base rows.';
  reset role;
end $$;

-- ── B. GATED-DOC GATE (0 without unlock → 1 after paid+approved unlock) ───────────
do $$
declare
  v_emp_a_user uuid := (select v from _vc where k='emp_a_user');
  v_emp_b_user uuid := (select v from _vc where k='emp_b_user');
  v_emp_a uuid := (select v from _vc where k='emp_a');
  v_wrk_a uuid := (select v from _vc where k='wrk_a');
  v_req_a uuid := (select v from _vc where k='req_a');
  v_count int;
  v_unlock uuid;
begin
  raise notice '─────────────────────────────────────────────────────────────';
  raise notice 'B. GATED-DOC GATE';

  -- B1: no unlock yet → employer sees 0 gated docs.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a_user, 'role','authenticated')::text, true);
  select count(*) into v_count from career.worker_documents where worker_id = v_wrk_a and visibility = 'gated';
  if v_count <> 0 then raise exception 'FAIL B1: gated doc visible (%) with NO unlock', v_count; end if;
  raise notice '  PASS B1: 0 gated docs visible before any unlock.';
  reset role;

  -- B1-eq: gate-equivalence in the CLOSED (locked) state — the RPC must AGREE with the
  --        RLS policy that the gate is shut before any unlock exists. (Finding 2 / R8 #4:
  --        B4 only proved the OPEN direction; a too-permissive locked-state drift, e.g.
  --        dropping the payment_status='paid' clause, would still pass B4 while RLS denies.
  --        Run as definer/postgres — the function is service_role-scoped; we test logic.)
  if public.career_can_access_document(v_emp_a_user, (select v from _vc where k='doc_a')) is not false then
    raise exception 'FAIL B1-eq: career_can_access_document=true with NO unlock but RLS gate is SHUT (DRIFT — too permissive)';
  end if;
  raise notice '  PASS B1-eq: career_can_access_document()=false with no unlock (locked state agrees with RLS).';

  -- B2: insert a NON-paid unlock → still 0 (interest alone never opens the gate).
  insert into career.reveal_unlocks (requisition_id, worker_id, employer_id, owner_approved, payment_status)
    values (v_req_a, v_wrk_a, v_emp_a, false, 'unpaid') returning id into v_unlock;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a_user, 'role','authenticated')::text, true);
  select count(*) into v_count from career.worker_documents where worker_id = v_wrk_a and visibility = 'gated';
  if v_count <> 0 then raise exception 'FAIL B2: gated doc visible (%) with unpaid/unapproved unlock', v_count; end if;
  raise notice '  PASS B2: 0 gated docs visible with interest-only (unpaid, unapproved) unlock.';
  reset role;

  -- B2-eq: gate-equivalence in the interest-only state — an unapproved/unpaid unlock row
  --        must NOT open the RPC gate either (mirrors B2's RLS deny). (Finding 2 / R8 #4.)
  if public.career_can_access_document(v_emp_a_user, (select v from _vc where k='doc_a')) is not false then
    raise exception 'FAIL B2-eq: career_can_access_document=true with unpaid/unapproved unlock but RLS gate is SHUT (DRIFT)';
  end if;
  raise notice '  PASS B2-eq: career_can_access_document()=false with interest-only unlock (agrees with RLS).';

  -- B3: flip to owner_approved + paid → exactly 1 gated doc now visible.
  update career.reveal_unlocks set owner_approved = true, payment_status = 'paid', unlocked_at = now()
    where id = v_unlock;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a_user, 'role','authenticated')::text, true);
  select count(*) into v_count from career.worker_documents where worker_id = v_wrk_a and visibility = 'gated';
  if v_count <> 1 then raise exception 'FAIL B3: expected 1 gated doc after paid+approved unlock, got %', v_count; end if;
  raise notice '  PASS B3: exactly 1 gated doc visible after owner_approved && payment_status=paid.';
  reset role;

  -- B4: gate-equivalence in the OPEN state — career_can_access_document agrees with the
  --     RLS policy now that the unlock is owner_approved && paid (set in B3).
  --     (run as definer/postgres — the function is service_role-scoped; we test logic.)
  if public.career_can_access_document(v_emp_a_user, (select v from _vc where k='doc_a')) is not true then
    raise exception 'FAIL B4: career_can_access_document=false but RLS gate is open (DRIFT)';
  end if;
  raise notice '  PASS B4: career_can_access_document() == RLS gated-doc policy, OPEN state (no drift).';

  -- B5: cross-employer denial — employer B owns NO unlock for worker A. Even though
  --     emp_a's unlock is now paid+approved (B3), the gate is keyed on the EMPLOYER
  --     account, so emp_b must still be denied. Proves the RPC's `ea.user_id = p_user_id`
  --     clause (and the RLS policy's matching clause) actually scope by employer — not
  --     merely "is ANY unlock paid for this worker." (Finding 2 / R8 #4: the closed
  --     direction across the employer boundary.)
  if public.career_can_access_document(v_emp_b_user, (select v from _vc where k='doc_a')) is not false then
    raise exception 'FAIL B5: employer B can access worker A''s gated doc via a DIFFERENT employer''s paid unlock (DRIFT — gate not employer-scoped)';
  end if;
  raise notice '  PASS B5: employer B denied (gate is employer-scoped; emp_a''s paid unlock does not leak to emp_b).';
end $$;

-- ── C. ANON VIEW COLUMN-SET (public-safe set exactly; no _enc/_hash) ──────────────
do $$
declare
  v_cols text;
  v_bad  text;
  v_rows int;
begin
  raise notice '─────────────────────────────────────────────────────────────';
  raise notice 'C. ANON SHOWCASE VIEW COLUMN-SET';

  select string_agg(column_name, ',' order by ordinal_position) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'career_worker_showcase';

  select string_agg(column_name, ',') into v_bad
  from information_schema.columns
  where table_schema = 'public' and table_name = 'career_worker_showcase'
    and (column_name like '%\_enc' escape '\' or column_name like '%\_hash' escape '\'
         or column_name in ('full_name','dob','exact_country','phone','email','address','passport_no','user_id','id'));
  if v_bad is not null then
    raise exception 'FAIL C1: showcase VIEW leaks private/identity columns: %', v_bad;
  end if;
  raise notice '  PASS C1: VIEW columns = [%] — zero _enc/_hash/identity columns.', v_cols;

  -- as anon, every row must be is_showcased=true (the VIEW filters it) and selectable.
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  select count(*) into v_rows from public.career_worker_showcase;
  raise notice '  PASS C2: anon can SELECT the VIEW (% showcased rows visible).', v_rows;
  reset role;
end $$;

-- ── D. DENY-ALL TABLES (authenticated cannot read/write) ──────────────────────────
-- Deny-all is implemented as NO grant to authenticated (+ RLS enabled, zero policy).
-- A blocked read therefore surfaces as EITHER a table-level insufficient_privilege error
-- OR 0 rows (if a grant existed but no policy matched). Both count as deny — accept both.
do $$
declare
  v_emp_a_user uuid := (select v from _vc where k='emp_a_user');
  v_wrk_a uuid := (select v from _vc where k='wrk_a');
  v_count int;
  v_denied boolean;
begin
  raise notice '─────────────────────────────────────────────────────────────';
  raise notice 'D. DENY-ALL TABLES (commission_records / consents-write / access_log / waitlist)';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_emp_a_user, 'role','authenticated')::text, true);

  -- D1 commission_records read
  v_denied := false;
  begin
    select count(*) into v_count from career.commission_records;
    if v_count <> 0 then raise exception 'FAIL D1: authenticated read % commission_records', v_count; end if;
    v_denied := true;  -- 0 rows = denied
  exception when insufficient_privilege then v_denied := true;  -- no grant = denied
  end;
  if not v_denied then raise exception 'FAIL D1: commission_records readable'; end if;
  raise notice '  PASS D1: commission_records denied to authenticated (no grant / 0 rows).';

  -- D2 document_access_log read
  v_denied := false;
  begin
    select count(*) into v_count from career.document_access_log;
    if v_count <> 0 then raise exception 'FAIL D2: authenticated read % document_access_log', v_count; end if;
    v_denied := true;
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'FAIL D2: document_access_log readable'; end if;
  raise notice '  PASS D2: document_access_log denied to authenticated (no grant / 0 rows).';

  -- D3 waitlist read
  v_denied := false;
  begin
    select count(*) into v_count from career.waitlist;
    if v_count <> 0 then raise exception 'FAIL D3: authenticated read % waitlist', v_count; end if;
    v_denied := true;
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'FAIL D3: waitlist readable'; end if;
  raise notice '  PASS D3: waitlist denied to authenticated (no grant / 0 rows).';

  -- D4 consents: worker-self SELECT exists, but WRITE is deny-all → INSERT blocked.
  v_denied := false;
  begin
    insert into career.consents (worker_id, purpose, granted) values (v_wrk_a, 'hack', true);
  exception when insufficient_privilege then v_denied := true;  -- no insert grant = denied
           when others then v_denied := true;                  -- RLS with-check / policy = denied
  end;
  if not v_denied then raise exception 'FAIL D4: authenticated INSERT into consents SUCCEEDED (expected deny)'; end if;
  raise notice '  PASS D4: consents INSERT blocked for authenticated (write deny-all; RPC-only).';
  reset role;
end $$;

-- ── E. WORKER-SELF ISOLATION (worker A cannot read worker B's row) ────────────────
do $$
declare
  v_wrk_a_user uuid := (select v from _vc where k='wrk_a_user');
  v_visible int;
  v_other   int;
begin
  raise notice '─────────────────────────────────────────────────────────────';
  raise notice 'E. WORKER-SELF ISOLATION';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_wrk_a_user, 'role','authenticated')::text, true);

  -- worker A sees ONLY their own profile row via the self-read policy.
  select count(*) into v_visible from career.worker_profiles;
  select count(*) into v_other   from career.worker_profiles where user_id <> v_wrk_a_user;
  if v_visible <> 1 then raise exception 'FAIL E1: worker A sees % profile rows (expected exactly 1: own)', v_visible; end if;
  if v_other  <> 0 then raise exception 'FAIL E2: worker A sees % OTHER workers'' rows (expected 0)', v_other; end if;
  raise notice '  PASS E: worker A sees exactly 1 profile row (own); 0 of worker B.';
  reset role;
end $$;

do $$ begin
  raise notice '═════════════════════════════════════════════════════════════';
  raise notice 'ALL CAREER C0 RLS / GATE ASSERTS PASSED — rolling back (no fixtures left).';
  raise notice '═════════════════════════════════════════════════════════════';
end $$;

rollback;
