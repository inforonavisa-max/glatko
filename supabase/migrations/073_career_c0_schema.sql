-- ═══════════════════════════════════════════════════════════════════════════
-- 073: C0 — career vertical full data model (docs/career/career-vertical-plan-v1.md)
-- ═══════════════════════════════════════════════════════════════════════════
-- DB schema = `career` (mirrors the `health` convention; code namespace `kariyer`
-- is SEPARATE). Pure ADDITIVE: no ALTER/DROP on any existing public.* or health.*
-- object. Idempotent throughout (IF NOT EXISTS + DO-guarded enums/constraints).
-- SEED lives in a separate file: 078_career_c0_seed.sql. Read/write/admin RPCs and
-- the public showcase VIEW live in 074-076. Storage buckets in 077.
--
-- Contents: extensions (pgcrypto) · 13 tables (§ "Data model") + enums · indexes
-- on every RLS/RPC predicate column · ownership helpers career.owns_employer /
-- career.owns_worker (SECURITY DEFINER, anti-recursion) · RLS enabled day-one on
-- EVERY table (CVE-2025-48757) + defense-in-depth policies · grant/revoke matrix ·
-- Vault secret career_pii_key (mirror health_pii_key from 070) · self-contained
-- public.is_admin() via a CREATE-ONLY guard that never REPLACEs the live prod function
-- (RULE R4 / SQL-review finding 1). All idempotent.
--
-- SECURITY POSTURE (BUILD-RULES "single most important truth"):
--   * The `career` schema is NOT exposed to PostgREST (this migration does not touch
--     config) → no role can read career.* over REST. Production reads/writes run as
--     service_role through public.* SECURITY DEFINER RPCs (074-076) over the public
--     VIEW. RLS policies here are DEFENSE-IN-DEPTH ONLY — never the production read
--     path. Do not call RLS "the gate." THE GATE = the showcase VIEW's column list
--     + each RPC's SQL body + career_can_access_document at signing time.
--   * anon gets NOTHING on the career schema (no USAGE) — DoD. The public VIEW
--     (074) is what anon/authenticated browse; it carries only public-safe columns.
--   * authenticated: schema USAGE + RLS-gated grants (worker reads own rows;
--     employer reads own account/requisitions/unlocks). These NEVER run in prod
--     (prod uses service_role RPCs); they exist as a correct second wall.
--   * service_role: full grant + BYPASSRLS → the "admin ALL" cell of the matrix.
--   * Sensitive tables (commission_records, document_access_log, waitlist; the
--     consents write path) = RLS enabled + ZERO permissive policy = deny-all. All
--     access via SECURITY DEFINER RPC / service-role route.
--   * RULE R7 (ILO Employer Pays + MNE €500-20 000 fine): NO fee/price/payment
--     column attaches to worker_profiles/worker_documents/consents. Payment columns
--     live ONLY on reveal_unlocks / commission_records (employer side).
--
-- ROLLBACK NOTES (pure additive — does not touch existing data):
--   -- Vault (manual; data loss = existing PII becomes undecryptable):
--   --   select vault.delete_secret(id) from vault.secrets where name='career_pii_key';
--   drop function if exists career.owns_employer(uuid, uuid);
--   drop function if exists career.owns_worker(uuid, uuid);
--   -- Tables (dependency order; child → parent):
--   drop table if exists career.document_access_log, career.commission_records,
--     career.placements, career.reveal_unlocks, career.shortlist_items,
--     career.shortlists, career.requisitions, career.worker_documents,
--     career.consents, career.worker_profiles, career.employer_accounts,
--     career.waitlist, career.sectors cascade;
--   -- Enums:
--   drop type if exists career.doc_visibility, career.service_path,
--     career.requisition_status, career.unlock_payment_status, career.waitlist_audience;
--   -- (Dropping the whole `career` schema is fine here — unlike health, career has no
--   --  pre-existing tables to preserve: drop schema if exists career cascade;)
--   -- public.is_admin() is shared/prod-owned — DO NOT drop on rollback.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. SCHEMA + EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────
create schema if not exists career;
create extension if not exists pgcrypto with schema extensions;  -- pgp_sym_*, digest, gen_random_bytes

-- ─────────────────────────────────────────────────────────────────────────────
-- 0a. RULE R4 — self-contained public.is_admin() (CREATE-ONLY guard, never REPLACE)
-- ─────────────────────────────────────────────────────────────────────────────
-- is_admin() is referenced by the storage admin-read policy (077) and by ~13 existing
-- prod RLS policies (027/029/030/031/033/035/036/037, health 066), but it is defined
-- OUT-OF-BAND in prod (no in-repo CREATE except this one) → a fresh DB (the staging
-- branch we test on) would fail to apply the storage/admin policies without it.
--
-- HAZARD (SQL-review finding 1 / R4): a bare CREATE OR REPLACE here would SILENTLY
-- OVERWRITE the live prod admin gate for the WHOLE app the moment 073 is applied to
-- prod. Verified prod definition (read-only `pg_get_functiondef('public.is_admin()')`
-- against glatko-prod cjqappdfyxgytdyeytwv, 2026-06-17):
--   CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
--    LANGUAGE sql STABLE SECURITY DEFINER
--   AS $function$
--     SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
--   $function$
-- — i.e. prod has NO `set search_path = ''` (proconfig = NULL) and NO explicit grant.
-- The body logic matches our recreation, but the volatility/search_path/grant metadata
-- DIFFERS. A CREATE OR REPLACE would mutate that prod metadata as a side effect of a
-- career-local migration → a repo-wide admin-auth regression, not a career-local one.
--
-- FIX (finding 1, option b): GUARD the recreation so it only ever CREATES on a fresh DB
-- and is a TRUE no-op whenever the function already exists (prod). On a fresh DB we
-- create it WITHOUT `set search_path = ''` to stay byte-equivalent to the verified prod
-- definition (fully schema-qualified `public.profiles` keeps it safe; fails-closed:
-- returns false when no session / no matching admin row).
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    execute $fn$
      create function public.is_admin()
      returns boolean
      language sql
      stable
      security definer
      as $body$
        select exists (
          select 1 from public.profiles
          where id = auth.uid() and role = 'admin'
        );
      $body$;
    $fn$;
    -- match prod posture: no grant beyond default (the existing prod function carries
    -- none); the fresh-DB create above leaves EXECUTE on PUBLIC by default, which is the
    -- standard Postgres default and is what every existing policy already relies on.
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ENUMS (DO-guarded — idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin
  create type career.doc_visibility as enum ('public_anonymized','gated','internal_only');
exception when duplicate_object then null; end $$;

do $$ begin
  create type career.service_path as enum ('commission','full_service');
exception when duplicate_object then null; end $$;

do $$ begin
  create type career.requisition_status as enum
    ('submitted','under_curation','shortlist_ready','interest_expressed',
     'approved','placed','in_guarantee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type career.unlock_payment_status as enum ('unpaid','invoiced','paid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type career.waitlist_audience as enum ('employer','worker');
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TABLES (13 — "Data model")
-- ─────────────────────────────────────────────────────────────────────────────

-- Sector taxonomy (9-locale jsonb). Public-read (is_published). Seeded in 078.
create table if not exists career.sectors (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name_jsonb  jsonb not null,
  is_published boolean default true,
  sort_order  int default 0
);
create index if not exists career_sectors_published_idx on career.sectors (is_published);

-- Worker profiles — split public-safe vs PRIVATE (encrypted) columns. The public
-- VIEW (074) selects ONLY the public-safe block; the _enc/_hash columns NEVER leave
-- the schema except via admin-decrypt RPCs (076). RULE R7: no fee/payment column here.
create table if not exists career.worker_profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id),
  -- public-safe (showcase) block --------------------------------------------------
  worker_code         text unique not null,                 -- e.g. MNE-CW-0427
  role                text,
  trade               text,
  skill_tier          text,
  experience_band     text,
  region              text,                                 -- Far East / ME / Africa (not country)
  age_band            text,
  languages           text[] default '{}',
  skills              text[] default '{}',
  readiness_score     int default 0,
  verification_status text not null default 'pending'
                        check (verification_status in ('pending','id_verified','skills_verified',
                               'documents_verified','interview_passed','rejected')),
  is_showcased        boolean default false,
  created_at          timestamptz default now(),
  -- PRIVATE (gated) block — column-encrypted PII (pgp_sym_encrypt; key = career_pii_key)
  full_name_enc       bytea,
  dob_enc             bytea,
  exact_country_enc   bytea,
  phone_enc           bytea,
  phone_hash          text,
  email_enc           bytea,
  email_hash          text,
  address_enc         bytea,
  passport_no_enc     bytea
);
create index if not exists career_worker_profiles_user_id_idx   on career.worker_profiles (user_id);
create index if not exists career_worker_profiles_worker_code_idx on career.worker_profiles (worker_code);
create index if not exists career_worker_profiles_showcased_idx  on career.worker_profiles (is_showcased);
create index if not exists career_worker_profiles_email_hash_idx on career.worker_profiles (email_hash);
create index if not exists career_worker_profiles_phone_hash_idx on career.worker_profiles (phone_hash);

-- Worker documents — per-item visibility flag is the single source of truth. RULE R6:
-- only public_anonymized rows may be signed for showcase; gated originals only post-unlock.
create table if not exists career.worker_documents (
  id                      uuid primary key default gen_random_uuid(),
  worker_id               uuid not null references career.worker_profiles(id) on delete cascade,
  category                text not null,        -- passport/diploma/work_photo/insurance/reference/...
  storage_path            text not null,
  visibility              career.doc_visibility not null default 'internal_only',
  watermarked_variant_path text,
  consent_status          text not null default 'pending'
                            check (consent_status in ('pending','granted','revoked')),
  consent_at              timestamptz,
  retention_until         timestamptz,
  created_at              timestamptz default now()
);
create index if not exists career_worker_documents_worker_id_idx  on career.worker_documents (worker_id);
create index if not exists career_worker_documents_visibility_idx on career.worker_documents (visibility);

-- Employer accounts — contact column-encrypted. RULE R3: ownership re-verified in RPCs.
create table if not exists career.employer_accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id),
  company     text not null,
  contact_enc bytea,
  contact_hash text,
  verified    boolean default false,
  tier        text not null default 'free'
                check (tier in ('free','verified','premium')),
  created_at  timestamptz default now()
);
create index if not exists career_employer_accounts_user_id_idx on career.employer_accounts (user_id);

-- Requisitions — employer demand. roles_jsonb = role→count; terms_jsonb = MNE disclosure fields.
create table if not exists career.requisitions (
  id            uuid primary key default gen_random_uuid(),
  employer_id   uuid not null references career.employer_accounts(id) on delete cascade,
  sector        text,
  roles_jsonb   jsonb,
  requirements  jsonb,
  terms_jsonb   jsonb,
  service_path  career.service_path not null default 'commission',
  status        career.requisition_status not null default 'submitted',
  created_at    timestamptz default now()
);
create index if not exists career_requisitions_employer_id_idx on career.requisitions (employer_id);
create index if not exists career_requisitions_status_idx      on career.requisitions (status);

-- Shortlists — owner-curated anonymized lists presented to an employer.
create table if not exists career.shortlists (
  id                    uuid primary key default gen_random_uuid(),
  requisition_id        uuid not null references career.requisitions(id) on delete cascade,
  added_by              uuid references auth.users(id),
  presented_to_employer boolean default false,
  created_at            timestamptz default now()
);
create index if not exists career_shortlists_requisition_id_idx on career.shortlists (requisition_id);

create table if not exists career.shortlist_items (
  id           uuid primary key default gen_random_uuid(),
  shortlist_id uuid not null references career.shortlists(id) on delete cascade,
  worker_id    uuid not null references career.worker_profiles(id),
  stage        text not null default 'sourced',
  created_at   timestamptz default now()
);
create index if not exists career_shortlist_items_shortlist_id_idx on career.shortlist_items (shortlist_id);
create index if not exists career_shortlist_items_worker_id_idx    on career.shortlist_items (worker_id);

-- Reveal unlocks — THE GATE ROW. Identity/doc access granted only when
-- owner_approved = true AND payment_status = 'paid'. UNIQUE prevents duplicate gate rows.
create table if not exists career.reveal_unlocks (
  id             uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references career.requisitions(id) on delete cascade,
  worker_id      uuid not null references career.worker_profiles(id),
  employer_id    uuid not null references career.employer_accounts(id),
  interest_at    timestamptz default now(),
  owner_approved boolean default false,
  fee_invoice_id text,
  payment_status career.unlock_payment_status not null default 'unpaid',
  unlocked_at    timestamptz,
  created_at     timestamptz default now(),
  unique (requisition_id, worker_id, employer_id)
);
create index if not exists career_reveal_unlocks_requisition_id_idx on career.reveal_unlocks (requisition_id);
create index if not exists career_reveal_unlocks_worker_id_idx      on career.reveal_unlocks (worker_id);
create index if not exists career_reveal_unlocks_employer_id_idx    on career.reveal_unlocks (employer_id);
create index if not exists career_reveal_unlocks_owner_approved_idx on career.reveal_unlocks (owner_approved);
create index if not exists career_reveal_unlocks_payment_status_idx on career.reveal_unlocks (payment_status);

-- Placements — successful matches + 90-day guarantee + replacement linkage (self-ref).
create table if not exists career.placements (
  id               uuid primary key default gen_random_uuid(),
  reveal_unlock_id uuid not null references career.reveal_unlocks(id),
  placed_at        timestamptz default now(),
  guarantee_until  timestamptz,
  replacement_of   uuid references career.placements(id),
  status           text not null default 'active'
                     check (status in ('active','in_guarantee','completed','replaced','terminated')),
  created_at       timestamptz default now()
);
create index if not exists career_placements_reveal_unlock_id_idx on career.placements (reveal_unlock_id);
create index if not exists career_placements_replacement_of_idx   on career.placements (replacement_of);

-- Commission records — employer-side revenue. RULE R7: worker never appears here.
create table if not exists career.commission_records (
  id           uuid primary key default gen_random_uuid(),
  placement_id uuid not null references career.placements(id) on delete cascade,
  path         career.service_path,
  amount       numeric(12,2),
  currency     text default 'EUR',
  invoice_id   text,
  paid_at      timestamptz,
  created_at   timestamptz default now()
);
create index if not exists career_commission_records_placement_id_idx on career.commission_records (placement_id);

-- Consents — PDPA/GDPR audit trail. Append-only via RPC (deny-all writes for non-service).
create table if not exists career.consents (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references career.worker_profiles(id) on delete cascade,
  purpose    text not null,
  granted    boolean not null default false,
  granted_at timestamptz,
  revoked_at timestamptz
);
create index if not exists career_consents_worker_id_idx on career.consents (worker_id);

-- Document access log — every signed-URL issuance for a gated original (RULE R6).
create table if not exists career.document_access_log (
  id               bigserial primary key,
  document_id      uuid,
  accessed_by      uuid,
  reveal_unlock_id uuid,
  accessed_at      timestamptz default now(),
  ip_hash          text
);
create index if not exists career_document_access_log_document_id_idx on career.document_access_log (document_id);

-- Waitlist — pre-launch demand capture (employer + worker). PII column-encrypted.
create table if not exists career.waitlist (
  id         uuid primary key default gen_random_uuid(),
  audience   career.waitlist_audience not null,
  email_enc  bytea,
  email_hash text,
  name_enc   bytea,
  phone_enc  bytea,
  sector     text,
  region     text,
  created_at timestamptz default now()
);
create unique index if not exists career_waitlist_email_hash_uq on career.waitlist (email_hash);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. OWNERSHIP HELPERS (SECURITY DEFINER STABLE — anti-RLS-recursion)
-- ─────────────────────────────────────────────────────────────────────────────
-- Used both inside RLS policies (defense-in-depth) and inside the write/read RPCs
-- (074-076). EXPLICIT p_user_id arg (RULE R1) — these helpers DO NOT read auth.uid()
-- so they work identically in a service_role RPC where auth.uid() is NULL. They are
-- SECURITY DEFINER so referencing them from a policy on the same table never recurses.
create or replace function career.owns_employer(p_employer_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from career.employer_accounts ea
    where ea.id = p_employer_id and ea.user_id = p_user_id
  );
$$;
revoke all on function career.owns_employer(uuid, uuid) from public;
grant execute on function career.owns_employer(uuid, uuid) to authenticated, service_role;

create or replace function career.owns_worker(p_worker_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from career.worker_profiles wp
    where wp.id = p_worker_id and wp.user_id = p_user_id
  );
$$;
revoke all on function career.owns_worker(uuid, uuid) from public;
grant execute on function career.owns_worker(uuid, uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. VAULT — career_pii_key (mirror health_pii_key from 070). Random, idempotent.
-- ─────────────────────────────────────────────────────────────────────────────
-- Key is NEVER written to repo/SQL — generated randomly with a not-exists guard, so
-- re-applying this migration never rotates an existing key. PII columns (worker/
-- employer/waitlist _enc) are pgp_sym_encrypt'd against this secret in the write RPCs.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'career_pii_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'career_pii_key',
      'Glatko career.* column encryption key (pgp_sym; C0)'
    );
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. GRANTS — schema access matrix
-- ─────────────────────────────────────────────────────────────────────────────
-- anon: NOTHING on the career schema (not even USAGE). The public showcase VIEW
-- (074) is the only career surface anon touches. authenticated + service_role: USAGE.
revoke all on schema career from anon;
grant usage on schema career to authenticated, service_role;

-- service_role: full DML (with BYPASSRLS → "admin ALL"). Default privileges so the
-- 074-077 objects created later inherit the grant.
grant all privileges on all tables in schema career to service_role;
grant usage, select on all sequences in schema career to service_role;
alter default privileges in schema career grant all on tables to service_role;
alter default privileges in schema career grant usage, select on sequences to service_role;

-- authenticated: narrow RLS-gated grants (NEVER the prod read path; defense-in-depth).
--   * sectors: public-read.
--   * worker_profiles / worker_documents / consents: worker reads own rows.
--   * employer_accounts / requisitions / reveal_unlocks: employer reads own rows.
--   * shortlist_items: presented-only read.
-- No grant at all on commission_records, document_access_log, waitlist (deny-all).
grant select on career.sectors to authenticated;
grant select on career.worker_profiles to authenticated;
grant select on career.worker_documents to authenticated;
grant select on career.consents to authenticated;
grant select on career.employer_accounts to authenticated;
grant select on career.requisitions to authenticated;
grant select on career.reveal_unlocks to authenticated;
grant select on career.shortlists to authenticated;
grant select on career.shortlist_items to authenticated;
grant select on career.placements to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY — ENABLED ON EVERY TABLE FROM DAY ONE
-- ─────────────────────────────────────────────────────────────────────────────
-- CVE-2025-48757 (disclosed 2025-06-04, CVSS 8.26): Supabase leaves RLS OFF for
-- SQL-created tables; 303 endpoints across 170 projects had tables readable by the
-- anon key. We enable RLS on all 13 tables unconditionally. The career schema is also
-- un-exposed to PostgREST (belt + suspenders). Policies below are DEFENSE-IN-DEPTH —
-- prod never traverses them (service_role bypasses RLS via the 074-076 RPCs).
alter table career.sectors             enable row level security;
alter table career.worker_profiles     enable row level security;
alter table career.worker_documents    enable row level security;
alter table career.employer_accounts   enable row level security;
alter table career.requisitions        enable row level security;
alter table career.shortlists          enable row level security;
alter table career.shortlist_items     enable row level security;
alter table career.reveal_unlocks      enable row level security;
alter table career.placements          enable row level security;
alter table career.commission_records  enable row level security;
alter table career.consents            enable row level security;
alter table career.document_access_log enable row level security;
alter table career.waitlist            enable row level security;

-- sectors: public-read (published only).
drop policy if exists sectors_public_read on career.sectors;
create policy sectors_public_read on career.sectors
  for select to anon, authenticated using (is_published = true);

-- worker_profiles: worker-self SELECT only (own row). Employers get NO base grant —
-- they browse via the public VIEW (074). auth.uid() wrapped as (select auth.uid()).
drop policy if exists worker_profiles_self_read on career.worker_profiles;
create policy worker_profiles_self_read on career.worker_profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

-- worker_documents: (a) worker-self read on own docs, AND (b) the GATED-DOC policy —
-- an employer may read a worker's GATED docs ONLY if a reveal_unlocks row for that
-- worker is owner_approved AND payment_status='paid' AND the employer account belongs
-- to the caller. This is the exact predicate career_can_access_document encodes (RULE
-- R8 #4 gate-equivalence). Both are SELECT-only; mutation is service_role / RPC only.
drop policy if exists worker_documents_self_read on career.worker_documents;
create policy worker_documents_self_read on career.worker_documents
  for select to authenticated
  using (career.owns_worker(worker_id, (select auth.uid())));

drop policy if exists worker_documents_gated_unlock_read on career.worker_documents;
create policy worker_documents_gated_unlock_read on career.worker_documents
  for select to authenticated
  using (
    visibility = 'gated'
    and exists (
      select 1
      from career.reveal_unlocks ru
      join career.employer_accounts ea on ea.id = ru.employer_id
      where ru.worker_id = career.worker_documents.worker_id
        and ru.owner_approved = true
        and ru.payment_status = 'paid'
        and ea.user_id = (select auth.uid())
    )
  );

-- consents: worker-self SELECT on own consent rows. WRITE = deny-all (no insert/update
-- policy) → consent rows are written only by service_role RPCs (075). Audit integrity.
drop policy if exists consents_self_read on career.consents;
create policy consents_self_read on career.consents
  for select to authenticated
  using (career.owns_worker(worker_id, (select auth.uid())));

-- employer_accounts: employer-self read on own account.
drop policy if exists employer_accounts_self_read on career.employer_accounts;
create policy employer_accounts_self_read on career.employer_accounts
  for select to authenticated
  using (user_id = (select auth.uid()));

-- requisitions: employer-self read on requisitions of an account they own.
drop policy if exists requisitions_self_read on career.requisitions;
create policy requisitions_self_read on career.requisitions
  for select to authenticated
  using (career.owns_employer(employer_id, (select auth.uid())));

-- reveal_unlocks: employer-self read on unlocks for an account they own.
drop policy if exists reveal_unlocks_self_read on career.reveal_unlocks;
create policy reveal_unlocks_self_read on career.reveal_unlocks
  for select to authenticated
  using (career.owns_employer(employer_id, (select auth.uid())));

-- shortlists: employer-self read, ONLY once presented_to_employer = true, on a
-- requisition of an account they own (curation stays private until published).
drop policy if exists shortlists_presented_read on career.shortlists;
create policy shortlists_presented_read on career.shortlists
  for select to authenticated
  using (
    presented_to_employer = true
    and exists (
      select 1 from career.requisitions r
      where r.id = career.shortlists.requisition_id
        and career.owns_employer(r.employer_id, (select auth.uid()))
    )
  );

-- shortlist_items: presented-only read — visible to the owning employer ONLY when the
-- parent shortlist has presented_to_employer = true (RULE: curation private pre-publish).
drop policy if exists shortlist_items_presented_read on career.shortlist_items;
create policy shortlist_items_presented_read on career.shortlist_items
  for select to authenticated
  using (
    exists (
      select 1
      from career.shortlists sl
      join career.requisitions r on r.id = sl.requisition_id
      where sl.id = career.shortlist_items.shortlist_id
        and sl.presented_to_employer = true
        and career.owns_employer(r.employer_id, (select auth.uid()))
    )
  );

-- placements: employer-self read, via the unlock→account ownership chain.
drop policy if exists placements_self_read on career.placements;
create policy placements_self_read on career.placements
  for select to authenticated
  using (
    exists (
      select 1
      from career.reveal_unlocks ru
      where ru.id = career.placements.reveal_unlock_id
        and career.owns_employer(ru.employer_id, (select auth.uid()))
    )
  );

-- commission_records, document_access_log, waitlist:
--   RLS enabled + ZERO permissive policy = DENY-ALL for anon/authenticated.
--   Access exclusively via service_role (admin RPCs 076). No policy is intentional.

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ROLLBACK NOTES — see boxed block at top of file.
-- ─────────────────────────────────────────────────────────────────────────────
-- RULE R15: this file is AUTHORED ONLY. Do NOT apply_migration to glatko-prod
-- (cjqappdfyxgytdyeytwv) without the owner's explicit go. Validate via the
-- _verify_career_rls.sql BEGIN/ROLLBACK dry-run first.
