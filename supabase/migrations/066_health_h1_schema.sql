-- ═══════════════════════════════════════════════════════════════════════════
-- 066: H1 — health vertical tam veri modeli (docs/health/MASTER_PLAN.md §2)
-- ═══════════════════════════════════════════════════════════════════════════
-- DB şeması = `health` (v1.4 konvansiyonu; kod namespace `saglik` AYRI). 066,
-- 065'in ÜZERİNE saf ADDITIVE: mevcut health.provider_waitlist + public.
-- health_waitlist_join'a DOKUNMAZ. Mevcut public.* tablolarında ALTER/DROP YOK.
--
-- İçerik: extensions (btree_gist, pgcrypto, pg_cron) · §2.0'daki 16 tablo ·
-- indexler · §2.1 book_appointment (search_path='' pinli) · owns_provider RLS
-- yardımcısı · appointments kolon-kilidi trigger'ı · §2.2 RLS matrisi + grant'lar ·
-- pg_cron temizlik job'u · health-licenses private bucket. Hepsi idempotent
-- (IF NOT EXISTS). SEED ayrı dosyada: 067_health_h1_seed.sql.
--
-- GÜVENLİK DURUŞU:
--   * `health` şeması PostgREST'e EXPOSE EDİLMEZ (bu migration config'e dokunmaz) →
--     hiçbir rol REST üzerinden health.* göremez. RLS + grant'lar derinlemesine savunma.
--   * anon'a health şemasında HİÇBİR grant YOK (USAGE dahil) — DoD C4. Matristeki
--     "anon SELECT" public-read, H2'de server/service-role ile sunulur; RLS public-read
--     policy'leri + `authenticated` grant'ları yerinde (giriş yapmış okuma + ileride
--     expose için hazır).
--   * authenticated: schema USAGE + RLS-gated grant'lar (provider kendi satırları).
--   * service_role: full grant + BYPASSRLS → matristeki "admin ALL" buradan gelir
--     (ayrı admin policy yazılmaz).
--   * Hassas tablolar (patients, slot_holds, otp_codes, reminders_outbox, audit_log):
--     anon/authenticated grant YOK + RLS policy YOK = deny-all. Tüm hasta erişimi
--     SECURITY DEFINER fonksiyon / service-role route üzerinden.
--   * patients için matrisin "provider: ad + maskeli tel" hücresi: telefon bytea-şifreli
--     olduğundan + kolon-maskeleme row-level RLS ile ifade edilemediğinden, provider'a
--     maskeli okuma H7'de bir SECURITY DEFINER fonksiyonla verilir. H1'de patients tablosu
--     deny-all (en güvenli temel).
--   * book_appointment `health` şemasında (§2.1). PostgREST rpc çağrılabilirliği H5'in
--     işi (health expose veya public wrapper); H1 doğrulaması direkt SQL ile yapılır.
--
-- ROLLBACK (saf additive — mevcut veriyi etkilemez; provider_waitlist'e DOKUNMA):
--   select cron.unschedule('health_cleanup_expired');
--   delete from storage.objects where bucket_id='health-licenses';
--   drop policy if exists "health_licenses owner manage" on storage.objects;
--   drop policy if exists "health_licenses admin read"   on storage.objects;
--   delete from storage.buckets where id='health-licenses';
--   drop function if exists health.book_appointment(uuid,uuid,text);
--   drop function if exists health.cleanup_expired();
--   drop function if exists health.owns_provider(uuid);
--   drop function if exists health.appointments_guard_provider_update();
--   -- 066 tabloları (provider_waitlist HARİÇ) — bağımlılık sırasıyla:
--   drop table if exists health.audit_log, health.reminders_outbox, health.otp_codes,
--     health.appointments, health.slot_holds, health.patients, health.provider_settings,
--     health.schedule_overrides, health.schedules, health.services,
--     health.provider_locations, health.provider_specialties, health.providers,
--     health.locations, health.clinics, health.specialties cascade;
--   -- (health şemasını tümden kaldırmak = provider_waitlist'i de siler; İSTENMEZ.)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────
create schema if not exists health;
create extension if not exists btree_gist with schema extensions;  -- EXCLUDE (uuid gist)
create extension if not exists pgcrypto  with schema extensions;   -- pgp_sym_*, digest, gen_random_bytes
create extension if not exists pg_cron;                            -- cleanup scheduler (schema `cron`)

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TABLOLAR (§2.0 — birebir)
-- ─────────────────────────────────────────────────────────────────────────────

-- Uzmanlık taksonomisi (9 locale çeviri: jsonb)
create table if not exists health.specialties (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  names       jsonb not null,
  icon        text,
  sort_order  int default 0,
  is_active   boolean default true
);

create table if not exists health.clinics (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid references auth.users(id),
  name            text not null,
  vat_number      text,
  created_at      timestamptz default now()
);

create table if not exists health.locations (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid references health.clinics(id),
  label       text not null,
  address     text not null,
  city        text not null,
  lat         double precision,
  lng         double precision,
  created_at  timestamptz default now()
);

create table if not exists health.providers (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid unique references auth.users(id),
  provider_type       text not null check (provider_type in
                        ('doctor','dentist','psychologist','physio','other')),
  full_name           text not null,
  title               text,
  slug                text unique not null,
  license_number      text,
  chamber             text,
  languages           text[] default '{}',
  bio                 jsonb,
  photo_url           text,
  verification_status text not null default 'pending'
                        check (verification_status in ('pending','approved','rejected')),
  verified_at         timestamptz,
  is_published        boolean default false,
  subscription_tier   text default 'free',
  created_at          timestamptz default now()
);

create table if not exists health.provider_specialties (
  provider_id  uuid references health.providers(id) on delete cascade,
  specialty_id uuid references health.specialties(id),
  primary key (provider_id, specialty_id)
);

create table if not exists health.provider_locations (
  provider_id uuid references health.providers(id) on delete cascade,
  location_id uuid references health.locations(id),
  primary key (provider_id, location_id)
);

create table if not exists health.services (
  id           uuid primary key default gen_random_uuid(),
  provider_id  uuid not null references health.providers(id) on delete cascade,
  name         jsonb not null,
  duration_min int not null check (duration_min between 5 and 240),
  price_eur    numeric(8,2),
  mode         text not null default 'in_person'
                 check (mode in ('in_person','video','home_visit')),
  is_active    boolean default true
);

-- Haftalık tekrar eden çalışma saatleri
create table if not exists health.schedules (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references health.providers(id) on delete cascade,
  location_id uuid not null references health.locations(id),
  weekday     int not null check (weekday between 0 and 6),  -- 0=Pazartesi
  start_time  time not null,
  end_time    time not null,
  valid_from  date,
  valid_until date,
  check (start_time < end_time)
);

-- Tek günlük istisnalar: tatil / mola / ekstra mesai
create table if not exists health.schedule_overrides (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references health.providers(id) on delete cascade,
  date        date not null,
  start_time  time,
  end_time    time,
  kind        text not null check (kind in ('holiday','break','extra'))
);

create table if not exists health.provider_settings (
  provider_id     uuid primary key references health.providers(id) on delete cascade,
  buffer_min      int default 0,
  min_notice_min  int default 120,
  horizon_days    int default 60,
  daily_cap       int,
  slot_grid_min   int default 15
);

-- Hastalar: hesap zorunlu değil (guest-first). PII kolon-şifreli (pgp_sym_encrypt);
-- şifreleme anahtarı write-zamanında (H5 booking RPC / service-role route) Vault'tan
-- gelir — H1 yalnız şemayı modeller.
create table if not exists health.patients (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references auth.users(id),
  full_name               text not null,
  phone_enc               bytea not null,
  email_enc               bytea,
  phone_hash              text not null,
  consent_health_data_at  timestamptz not null,
  consent_marketing_at    timestamptz,
  created_at              timestamptz default now()
);
create index if not exists health_patients_phone_hash_idx on health.patients (phone_hash);

-- 5 dakikalık soft hold (UX katmanı). EXCLUDE: aynı provider için çakışan hold olamaz.
create table if not exists health.slot_holds (
  id           uuid primary key default gen_random_uuid(),
  provider_id  uuid not null references health.providers(id),
  service_id   uuid not null references health.services(id),
  location_id  uuid not null,
  slot_range   tstzrange not null,
  session_key  text not null,
  expires_at   timestamptz not null default now() + interval '5 minutes',
  exclude using gist (provider_id with =, slot_range with &&)
);

-- RANDEVULAR — sistemin kalbi. manage_token default'u extensions.gen_random_bytes
-- kullanır → book_appointment (search_path='') içinden INSERT'te de çözülsün diye
-- şema-qualified yazıldı (pgcrypto `extensions` şemasında).
create table if not exists health.appointments (
  id            uuid primary key default gen_random_uuid(),
  provider_id   uuid not null references health.providers(id),
  service_id    uuid not null references health.services(id),
  location_id   uuid not null references health.locations(id),
  patient_id    uuid not null references health.patients(id),
  slot_range    tstzrange not null,
  status        text not null default 'confirmed'
                  check (status in ('confirmed','cancelled','completed','no_show')),
  patient_note  text,
  manage_token  text unique not null default encode(extensions.gen_random_bytes(24),'hex'),
  source        text not null default 'web' check (source in ('web','admin','provider')),
  cancelled_at  timestamptz,
  cancel_reason text,
  created_at    timestamptz default now()
);

-- ÇİFT REZERVASYON KORUMASI KATMAN 1: aktif (confirmed) randevular çakışamaz.
do $$ begin
  alter table health.appointments add constraint no_overlap
    exclude using gist (provider_id with =, slot_range with &&)
    where (status = 'confirmed');
exception when duplicate_object then null; end $$;
create index if not exists health_appointments_provider_status_idx
  on health.appointments (provider_id, status);
create index if not exists health_appointments_slot_range_gist_idx
  on health.appointments using gist (slot_range);

create table if not exists health.otp_codes (
  id          uuid primary key default gen_random_uuid(),
  phone_hash  text not null,
  code_hash   text not null,
  attempts    int default 0,
  expires_at  timestamptz not null default now() + interval '10 minutes',
  verified_at timestamptz,
  created_at  timestamptz default now()
);
create index if not exists health_otp_codes_phone_created_idx
  on health.otp_codes (phone_hash, created_at);

create table if not exists health.reminders_outbox (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid not null references health.appointments(id) on delete cascade,
  channel         text not null check (channel in ('sms','whatsapp','email')),
  template        text not null,
  send_at         timestamptz not null,
  sent_at         timestamptz,
  provider_msg_id text,
  status          text default 'pending'
                    check (status in ('pending','sent','failed','skipped')),
  retry_count     int default 0
);
create index if not exists health_reminders_outbox_status_sendat_idx
  on health.reminders_outbox (status, send_at);

create table if not exists health.audit_log (
  id           bigserial primary key,
  actor_id     uuid,
  action       text not null,
  target_table text,
  target_id    uuid,
  payload      jsonb,
  at           timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. FONKSİYONLAR + TRIGGER
-- ─────────────────────────────────────────────────────────────────────────────

-- RLS yardımcısı: çağıran kullanıcı verilen provider'ın sahibi mi?
-- SECURITY DEFINER → providers RLS'ini bypass eder (policy özyinelemesi olmaz).
create or replace function health.owns_provider(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from health.providers
    where id = p_provider_id and user_id = auth.uid()
  );
$$;
revoke all on function health.owns_provider(uuid) from public;
grant execute on function health.owns_provider(uuid) to authenticated, service_role;

-- §2.1 Atomik rezervasyon — KATMAN 2 (FOR UPDATE pessimistic lock) + KATMAN 1
-- (appointments EXCLUDE son bekçi). search_path='' pinli; tüm objeler şema-qualified.
create or replace function health.book_appointment(
  p_hold_id uuid, p_patient_id uuid, p_note text
) returns health.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold health.slot_holds;
  v_appt health.appointments;
begin
  select * into v_hold from health.slot_holds
   where id = p_hold_id and expires_at > now()
   for update;                                 -- KATMAN 2: pessimistic lock
  if not found then
    raise exception 'HOLD_EXPIRED';
  end if;

  insert into health.appointments
    (provider_id, service_id, location_id, patient_id, slot_range, patient_note)
  values
    (v_hold.provider_id, v_hold.service_id, v_hold.location_id,
     p_patient_id, v_hold.slot_range, p_note)
  returning * into v_appt;                     -- KATMAN 1 (EXCLUDE) son bekçi

  delete from health.slot_holds where id = p_hold_id;
  return v_appt;
exception when exclusion_violation then
  raise exception 'SLOT_TAKEN';
end $$;
revoke all on function health.book_appointment(uuid,uuid,text) from public, anon, authenticated;
grant execute on function health.book_appointment(uuid,uuid,text) to service_role;

-- appointments kolon-kilidi: provider (authenticated) yalnız status + iptal alanlarını
-- değiştirebilir; hasta/slot/kimlik alanları kilitli. service_role (admin) bypass.
create or replace function health.appointments_guard_provider_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if (new.provider_id, new.service_id, new.location_id, new.patient_id,
        new.slot_range, new.patient_note, new.manage_token, new.source, new.created_at)
       is distinct from
       (old.provider_id, old.service_id, old.location_id, old.patient_id,
        old.slot_range, old.patient_note, old.manage_token, old.source, old.created_at)
    then
      raise exception 'APPOINTMENT_FIELDS_LOCKED: provider may change status/cancellation only';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists appointments_guard_provider_update on health.appointments;
create trigger appointments_guard_provider_update
  before update on health.appointments
  for each row execute function health.appointments_guard_provider_update();

-- pg_cron temizlik: süresi geçmiş holds + otp'ler. SECURITY DEFINER (cron job sahibi
-- = postgres; yine de sıkı tut).
create or replace function health.cleanup_expired()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from health.slot_holds where expires_at < now();
  delete from health.otp_codes  where expires_at < now();
end $$;
revoke all on function health.cleanup_expired() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS + GRANT'LAR (§2.2 matrisi)
-- ─────────────────────────────────────────────────────────────────────────────
-- Şema erişimi: anon'a HİÇBİR şey (DoD C4). authenticated + service_role USAGE.
grant usage on schema health to authenticated, service_role;

-- service_role: full DML (BYPASSRLS ile birlikte "admin ALL").
grant all privileges on all tables in schema health to service_role;
grant usage, select on all sequences in schema health to service_role;
alter default privileges in schema health grant all on tables to service_role;
alter default privileges in schema health grant usage, select on sequences to service_role;

-- authenticated: public-read SELECT + provider-own DML (hepsi RLS ile sınırlı).
grant select on
  health.specialties, health.clinics, health.locations, health.providers,
  health.provider_specialties, health.provider_locations, health.services,
  health.schedules, health.schedule_overrides, health.provider_settings
  to authenticated;
grant insert, update, delete on
  health.clinics, health.locations, health.services, health.schedules,
  health.schedule_overrides, health.provider_settings,
  health.provider_specialties, health.provider_locations
  to authenticated;
grant select, update on health.appointments to authenticated;
-- (patients, slot_holds, otp_codes, reminders_outbox, audit_log: authenticated grant YOK.)

-- RLS enable — 16 tablo (provider_waitlist 065'te zaten enabled).
alter table health.specialties          enable row level security;
alter table health.clinics              enable row level security;
alter table health.locations            enable row level security;
alter table health.providers            enable row level security;
alter table health.provider_specialties enable row level security;
alter table health.provider_locations   enable row level security;
alter table health.services             enable row level security;
alter table health.schedules            enable row level security;
alter table health.schedule_overrides   enable row level security;
alter table health.provider_settings    enable row level security;
alter table health.patients             enable row level security;
alter table health.slot_holds           enable row level security;
alter table health.appointments         enable row level security;
alter table health.otp_codes            enable row level security;
alter table health.reminders_outbox     enable row level security;
alter table health.audit_log            enable row level security;

-- specialties: public-read (aktif olanlar)
drop policy if exists specialties_public_read on health.specialties;
create policy specialties_public_read on health.specialties
  for select to anon, authenticated using (is_active = true);

-- clinics: public-read + owner manage
drop policy if exists clinics_public_read on health.clinics;
create policy clinics_public_read on health.clinics
  for select to anon, authenticated using (true);
drop policy if exists clinics_owner_manage on health.clinics;
create policy clinics_owner_manage on health.clinics
  for all to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- locations: public-read + clinic-owner manage
drop policy if exists locations_public_read on health.locations;
create policy locations_public_read on health.locations
  for select to anon, authenticated using (true);
drop policy if exists locations_owner_manage on health.locations;
create policy locations_owner_manage on health.locations
  for all to authenticated
  using (exists (select 1 from health.clinics c
                  where c.id = clinic_id and c.owner_user_id = auth.uid()))
  with check (exists (select 1 from health.clinics c
                       where c.id = clinic_id and c.owner_user_id = auth.uid()));

-- providers: public-read (published+approved) + own-read (pending profilini görür)
drop policy if exists providers_public_read on health.providers;
create policy providers_public_read on health.providers
  for select to anon, authenticated
  using (is_published = true and verification_status = 'approved');
drop policy if exists providers_own_read on health.providers;
create policy providers_own_read on health.providers
  for select to authenticated using (user_id = auth.uid());

-- provider_specialties: public-read + owner manage
drop policy if exists provider_specialties_public_read on health.provider_specialties;
create policy provider_specialties_public_read on health.provider_specialties
  for select to anon, authenticated using (true);
drop policy if exists provider_specialties_owner_manage on health.provider_specialties;
create policy provider_specialties_owner_manage on health.provider_specialties
  for all to authenticated
  using (health.owns_provider(provider_id))
  with check (health.owns_provider(provider_id));

-- provider_locations: public-read + owner manage
drop policy if exists provider_locations_public_read on health.provider_locations;
create policy provider_locations_public_read on health.provider_locations
  for select to anon, authenticated using (true);
drop policy if exists provider_locations_owner_manage on health.provider_locations;
create policy provider_locations_owner_manage on health.provider_locations
  for all to authenticated
  using (health.owns_provider(provider_id))
  with check (health.owns_provider(provider_id));

-- services: public-read (yayınlı provider'ın aktif hizmetleri) + owner manage
drop policy if exists services_public_read on health.services;
create policy services_public_read on health.services
  for select to anon, authenticated
  using (is_active = true and exists (
    select 1 from health.providers p
     where p.id = provider_id
       and p.is_published = true and p.verification_status = 'approved'));
drop policy if exists services_owner_manage on health.services;
create policy services_owner_manage on health.services
  for all to authenticated
  using (health.owns_provider(provider_id))
  with check (health.owns_provider(provider_id));

-- schedules / overrides / settings: yalnız provider-own (public read YOK; slot API service-role)
drop policy if exists schedules_owner_manage on health.schedules;
create policy schedules_owner_manage on health.schedules
  for all to authenticated
  using (health.owns_provider(provider_id))
  with check (health.owns_provider(provider_id));

drop policy if exists schedule_overrides_owner_manage on health.schedule_overrides;
create policy schedule_overrides_owner_manage on health.schedule_overrides
  for all to authenticated
  using (health.owns_provider(provider_id))
  with check (health.owns_provider(provider_id));

drop policy if exists provider_settings_owner_manage on health.provider_settings;
create policy provider_settings_owner_manage on health.provider_settings
  for all to authenticated
  using (health.owns_provider(provider_id))
  with check (health.owns_provider(provider_id));

-- appointments: provider-own SELECT + UPDATE (kolon-kilidi trigger ile status-only).
drop policy if exists appointments_owner_read on health.appointments;
create policy appointments_owner_read on health.appointments
  for select to authenticated using (health.owns_provider(provider_id));
drop policy if exists appointments_owner_update on health.appointments;
create policy appointments_owner_update on health.appointments
  for update to authenticated
  using (health.owns_provider(provider_id))
  with check (health.owns_provider(provider_id));

-- patients, slot_holds, otp_codes, reminders_outbox, audit_log:
-- RLS enabled + POLICY YOK = deny-all (anon/authenticated). Erişim yalnız service_role.

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. pg_cron — süresi geçmiş holds/otp temizliği (her 5 dk)
-- ─────────────────────────────────────────────────────────────────────────────
-- Idempotent: pg_cron'da doğrudan cron.job DML kısıtlı → fonksiyon API'si kullanılır.
-- (Var olmayan job'da cron.unschedule hata fırlatır → yakalanır.)
do $$ begin
  perform cron.unschedule('health_cleanup_expired');
exception when others then null;
end $$;
select cron.schedule('health_cleanup_expired', '*/5 * * * *',
                     $cron$ select health.cleanup_expired(); $cron$);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. STORAGE — health-licenses private bucket (pro-documents pattern'i)
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('health-licenses','health-licenses', false, 5242880,
        array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;

drop policy if exists "health_licenses owner manage" on storage.objects;
create policy "health_licenses owner manage" on storage.objects
  for all to authenticated
  using (bucket_id = 'health-licenses'
         and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'health-licenses'
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "health_licenses admin read" on storage.objects;
create policy "health_licenses admin read" on storage.objects
  for select to authenticated
  using (bucket_id = 'health-licenses' and public.is_admin());
