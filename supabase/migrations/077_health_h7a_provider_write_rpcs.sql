-- ═══════════════════════════════════════════════════════════════════════════
-- 077: H7a — provider onboarding + profile/calendar yazma-RPC'leri
-- ═══════════════════════════════════════════════════════════════════════════
-- H2/H4/H5 ile SİMETRİK: health şeması PostgREST'e EXPOSE EDİLMEZ → service-role
-- bile .from('health.*') yapamaz. Tüm provider OKUMA + YAZMA da public şemada
-- SECURITY DEFINER RPC'lerle. H7a sağlık sağlayıcısının (doktor) KENDİ varlığını
-- kurmasını sağlar: profil + lisans + lokasyon + hizmet + haftalık çalışma saati.
-- Günlük operasyon (override/randevu yönetimi) H7b.
--
-- ÖZNEL GÜVENLİK MODELİ (kritik):
--   * health.owns_provider() auth.uid()'i İÇERİDEN kullanır → service-role çağrıda
--     auth.uid() NULL olduğu için BURADA KULLANILAMAZ. Bunun yerine her RPC,
--     sunucu-DOĞRULANMIŞ p_user_id alır (cookie-auth user.id; client veremez) ve
--     sahipliği `providers.user_id = p_user_id` ile DOĞRUDAN kontrol eder.
--   * İlk onboarding (provider satırı yok): upsert_profile p_user_id ile çözer;
--     yoksa verification_status='pending' + is_published=false + benzersiz slug ile
--     INSERT eder (providers.user_id UNIQUE → hesap başına tek provider).
--   * Sonraki tüm mutasyonlar: v_pid := (select id from health.providers where
--     user_id = p_user_id); yoksa RAISE 'NOT_A_PROVIDER'. Çocuk-tablo (service/
--     location/schedule/settings/specialty) yazımları, hedef satırın provider_id =
--     v_pid olduğunu mutasyondan ÖNCE doğrular (yoksa RAISE 'NOT_OWNER').
--   * Provider yalnızca KENDİ satırlarına dokunabilir — fonksiyon privileged definer
--     olarak çalışsa bile.
--
-- GÜVENLİK DURUŞU (070 deseni birebir):
--   * Her fonksiyon SECURITY DEFINER + SET search_path='' ; tüm health.*/extensions.*
--     objeleri şema-qualified.
--   * EXECUTE yalnız service_role (anon/authenticated ASLA) — provider mutasyonu
--     yalnız server action/route'tan service-role ile çağrılır. Sahiplik p_user_id ile.
--   * Provider verisi PUBLIC-yüzlü (PII DEĞİL) → düz kolonlar. YALNIZ lisans DOSYASI
--     gizli (health-licenses bucket). license_file_path düz metin kolon (dosya REF'i);
--     068 public read-RPC'si bunu ASLA seçmez (PII sızıntısı önlemi).
--   * RAISE EXCEPTION '<CODE>' iş hataları (070 ile aynı sözleşme) → PostgREST
--     error.message == kod → lib/saglik/provider.ts stable union'a parse eder.
--
-- ADDITIVE: TEK şema mutasyonu = ALTER TABLE health.providers ADD COLUMN IF NOT
-- EXISTS license_file_path text (idempotent, non-destructive). 066-076 nesnelerine
-- ALTER/DROP YOK. Yeni public RPC'ler.
--
-- ───────────────────────── DRY-RUN PLANI (prod-safe; main session uygular) ──────
-- BEGIN;
--   -- (1) bu dosyanın tamamını yükle (ALTER + CREATE FUNCTION'lar)
--   -- (2) kolon eklendi mi?
--   --   select column_name from information_schema.columns
--   --     where table_schema='health' and table_name='providers'
--   --       and column_name='license_file_path';  -- 1 satır beklenir
--   -- (3) yabancı user_id reddi (sahte iki kullanıcı; veri yazmadan):
--   --   do $$ declare v_a uuid := gen_random_uuid(); v_b uuid := gen_random_uuid();
--   --                 v_pid uuid; begin
--   --     -- A için provider yarat
--   --     perform public.health_provider_upsert_profile(v_a,'doctor','Dr A','GP',
--   --       '{"en":"bio"}'::jsonb, null, array['en'], array[]::text[]);
--   --     select id into v_pid from health.providers where user_id=v_a;
--   --     -- B (sahip değil) A'nın settings'ini yazmaya çalışırsa NOT_A_PROVIDER:
--   --     begin
--   --       perform public.health_provider_upsert_settings(v_b,0,120,60,null,15);
--   --       raise notice 'BEKLENMEDİK: B settings yazdı';
--   --     exception when others then raise notice 'OK reddedildi: %', sqlerrm; end;
--   --     -- B, A'nın provider'ı için submit deneyemez (kendi provider'ı yok):
--   --     begin perform public.health_provider_submit_for_review(v_b);
--   --       raise notice 'BEKLENMEDİK: B submit etti';
--   --     exception when others then raise notice 'OK reddedildi: %', sqlerrm; end;
--   --   end $$;
--   -- (4) get_own NULL (provider'ı olmayan kullanıcı):
--   --   select public.health_provider_get_own(gen_random_uuid(),'en');  -- null
-- ROLLBACK;  -- prod'a kalıcı yazım YOK; ana oturum tekrar BEGIN/COMMIT ile uygular.
--
-- ROLLBACK (kalıcı uygulandıysa geri-al):
--   alter table health.providers drop column if exists license_file_path;
--   drop function if exists public.health_provider_get_own(uuid,text);
--   drop function if exists public.health_provider_upsert_profile(uuid,text,text,text,jsonb,text,text[],text[]);
--   drop function if exists public.health_provider_set_license(uuid,text,text,text);
--   drop function if exists public.health_provider_upsert_location(uuid,uuid,text,text,text,double precision,double precision);
--   drop function if exists public.health_provider_delete_location(uuid,uuid);
--   drop function if exists public.health_provider_upsert_service(uuid,uuid,jsonb,int,numeric,text,boolean);
--   drop function if exists public.health_provider_delete_service(uuid,uuid);
--   drop function if exists public.health_provider_set_schedules(uuid,uuid,jsonb);
--   drop function if exists public.health_provider_upsert_settings(uuid,int,int,int,int,int);
--   drop function if exists public.health_provider_submit_for_review(uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) ŞEMA: lisans dosyası REF'i (tek additive kolon). Gizli bucket path'i tutar
--    ("<uid>/license.pdf"). 068 public RPC'si ASLA seçmez.
-- ─────────────────────────────────────────────────────────────────────────────
alter table health.providers add column if not exists license_file_path text;

-- ─────────────────────────────────────────────────────────────────────────────
-- yardımcı: full_name → URL-güvenli slug stem (accent-stripped, lowercased).
--   SQL DB otoritesi; TS tarafı (provider-validation.ts) aynı kuralı test eder.
--   `unaccent` extension'a BAĞIMLI DEĞİL (prod'da kurulu olmayabilir) → diakritik
--   katlama translate() ile (Latin Sırpça/Karadağca + genel Latin aksanlar) +
--   Türkçe ı→i. translate tek karakter eşler; çok-baytlı UTF-8 doğru ele alır.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  -- translate FIRST (covers BOTH cases of letters whose lower() is locale-
  -- dependent on some servers — esp. Đ/đ d-stroke, Turkish İ/ı), THEN lower().
  -- The uppercase entries fold to lowercase ASCII directly so a non-UTF locale
  -- can't drop them; remaining plain A-Z are handled by lower().
  select coalesce(
    nullif(
      trim(both '-' from
        regexp_replace(
          regexp_replace(
            lower(
              translate(
                coalesce(p_text, ''),
                'ÇĆČĐŠŽĞİŞçćčđšžğışÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝÑàáâãäåèéêëìíîïòóôõöùúûüýñ',
                'cccdszgiscccdszgisaaaaaaeeeeiiiiooooouuuuynaaaaaaeeeeiiiiooooouuuuyn'
              )
            ),
            '[^a-z0-9]+', '-', 'g'
          ),
          '-+', '-', 'g'
        )
      ),
      ''
    ),
    'provider'
  );
$$;
revoke all on function public.health_slugify(text) from public, anon, authenticated;
grant execute on function public.health_slugify(text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) OKUMA: çağıranın KENDİ provider taslağı (herhangi durum/yayın). 068 public
--    RPC'sinin aksine yayın filtresi YOK — provider taslağını düzenlemek için.
--    Sahiplik = where user_id = p_user_id. NULL = henüz provider yok (ilk onboarding).
--    license_file_path'i DÖNDÜRMEZ (sadece set-mi bayrağı) — gizli path sızmaz.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_provider_get_own(p_user_id uuid, p_locale text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'providerId',         p.id,
    'slug',               p.slug,
    'providerType',       p.provider_type,
    'fullName',           p.full_name,
    'title',              p.title,
    'bio',                coalesce(p.bio, '{}'::jsonb),
    'photoUrl',           p.photo_url,
    'languages',          to_jsonb(p.languages),
    'licenseNumber',      p.license_number,
    'chamber',            p.chamber,
    'licenseFileSet',     (p.license_file_path is not null),
    'verificationStatus', p.verification_status,
    'isPublished',        p.is_published,
    'specialties', (
      select coalesce(jsonb_agg(
        jsonb_build_object('slug', s.slug, 'name', s.names ->> p_locale)
        order by s.sort_order), '[]'::jsonb)
      from health.provider_specialties ps
      join health.specialties s on s.id = ps.specialty_id
      where ps.provider_id = p.id
    ),
    'locations', (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', l.id, 'label', l.label, 'address', l.address,
                           'city', l.city, 'lat', l.lat, 'lng', l.lng)
        order by l.created_at), '[]'::jsonb)
      from health.provider_locations pl
      join health.locations l on l.id = pl.location_id
      where pl.provider_id = p.id
    ),
    'services', (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', sv.id, 'name', coalesce(sv.name, '{}'::jsonb),
                           'durationMin', sv.duration_min, 'priceEur', sv.price_eur,
                           'mode', sv.mode, 'isActive', sv.is_active)
        order by sv.duration_min), '[]'::jsonb)
      from health.services sv
      where sv.provider_id = p.id
    ),
    'schedules', (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', sc.id, 'locationId', sc.location_id,
                           'weekday', sc.weekday,
                           'startTime', to_char(sc.start_time, 'HH24:MI'),
                           'endTime', to_char(sc.end_time, 'HH24:MI'))
        order by sc.location_id, sc.weekday, sc.start_time), '[]'::jsonb)
      from health.schedules sc
      where sc.provider_id = p.id
    ),
    'settings', (
      select case when ps.provider_id is null then null else
        jsonb_build_object('bufferMin', ps.buffer_min, 'minNoticeMin', ps.min_notice_min,
                           'horizonDays', ps.horizon_days, 'dailyCap', ps.daily_cap,
                           'slotGridMin', ps.slot_grid_min)
      end
      from health.provider_settings ps
      where ps.provider_id = p.id
    )
  )
  from health.providers p
  where p.user_id = p_user_id;
$$;
revoke all on function public.health_provider_get_own(uuid, text) from public, anon, authenticated;
grant execute on function public.health_provider_get_own(uuid, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) ADIM 1: profil upsert. İlk çağrı provider satırını yaratır (UNIQUE user_id),
--    verification_status='pending' + is_published=false + benzersiz slug (slugify +
--    çakışma döngüsü, 048 deseni). Uzmanlıkları re-sync eder. Döner {providerId, slug}.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_provider_upsert_profile(
  p_user_id        uuid,
  p_provider_type  text,
  p_full_name      text,
  p_title          text,
  p_bio            jsonb,
  p_photo_url      text,
  p_languages      text[],
  p_specialty_slugs text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pid       uuid;
  v_base      text;
  v_slug      text;
  v_n         int := 0;
  v_langs     text[];
begin
  if p_user_id is null then
    raise exception 'INVALID_INPUT';
  end if;
  if coalesce(length(trim(p_full_name)), 0) < 2 then
    raise exception 'INVALID_INPUT';
  end if;
  if p_provider_type is null or p_provider_type not in
       ('doctor','dentist','psychologist','physio','other') then
    raise exception 'INVALID_INPUT';
  end if;

  -- diller: lowercase + dedupe (057 konvansiyonu). NULL → boş.
  v_langs := (
    select coalesce(array_agg(distinct lower(trim(x))) filter (where trim(x) <> ''), '{}'::text[])
    from unnest(coalesce(p_languages, '{}'::text[])) as x
  );

  select id into v_pid from health.providers where user_id = p_user_id;

  if v_pid is null then
    -- ── İlk onboarding: benzersiz slug üret (pre-flight + çakışma döngüsü) ──
    v_base := public.health_slugify(p_full_name);
    v_slug := v_base;
    loop
      exit when not exists (select 1 from health.providers where slug = v_slug);
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n::text;
    end loop;

    begin
      insert into health.providers
        (user_id, provider_type, full_name, title, slug, bio, photo_url, languages,
         verification_status, is_published)
      values
        (p_user_id, p_provider_type, trim(p_full_name), nullif(trim(coalesce(p_title,'')),''),
         v_slug, p_bio, nullif(trim(coalesce(p_photo_url,'')),''), v_langs,
         'pending', false)
      returning id into v_pid;
    exception when unique_violation then
      -- pre-flight ile INSERT arası slug kapıldı → tek retry suffix.
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n::text;
      insert into health.providers
        (user_id, provider_type, full_name, title, slug, bio, photo_url, languages,
         verification_status, is_published)
      values
        (p_user_id, p_provider_type, trim(p_full_name), nullif(trim(coalesce(p_title,'')),''),
         v_slug, p_bio, nullif(trim(coalesce(p_photo_url,'')),''), v_langs,
         'pending', false)
      returning id into v_pid;
    end;
  else
    -- ── Güncelle (slug + verification_status + is_published DOKUNULMAZ) ──
    update health.providers
       set provider_type = p_provider_type,
           full_name     = trim(p_full_name),
           title         = nullif(trim(coalesce(p_title,'')),''),
           bio           = p_bio,
           photo_url     = nullif(trim(coalesce(p_photo_url,'')),''),
           languages     = v_langs
     where id = v_pid;
    select slug into v_slug from health.providers where id = v_pid;
  end if;

  -- ── Uzmanlıkları re-sync (verilen slug'lar → provider_specialties) ──
  if p_specialty_slugs is not null then
    delete from health.provider_specialties where provider_id = v_pid;
    insert into health.provider_specialties (provider_id, specialty_id)
    select v_pid, s.id
    from health.specialties s
    where s.slug = any(p_specialty_slugs) and s.is_active = true
    on conflict do nothing;
  end if;

  return jsonb_build_object('providerId', v_pid, 'slug', v_slug);
end $$;
revoke all on function public.health_provider_upsert_profile(uuid,text,text,text,jsonb,text,text[],text[])
  from public, anon, authenticated;
grant execute on function public.health_provider_upsert_profile(uuid,text,text,text,jsonb,text,text[],text[])
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) ADIM 2: lisans. license_number/chamber/license_file_path set eder (kendi
--    provider'ı). p_file_path verilirse p_user_id::text || '/' ile başlamalı
--    (bucket owner-RLS klasörüyle eşleşir — defense). NOT_A_PROVIDER if no row.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_provider_set_license(
  p_user_id       uuid,
  p_license_number text,
  p_chamber       text,
  p_file_path     text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pid uuid;
begin
  select id into v_pid from health.providers where user_id = p_user_id;
  if v_pid is null then
    raise exception 'NOT_A_PROVIDER';
  end if;

  if p_file_path is not null and p_file_path <> '' then
    if left(p_file_path, length(p_user_id::text) + 1) <> (p_user_id::text || '/') then
      raise exception 'INVALID_FILE_PATH';
    end if;
  end if;

  update health.providers
     set license_number    = nullif(trim(coalesce(p_license_number,'')),''),
         chamber           = nullif(trim(coalesce(p_chamber,'')),''),
         license_file_path = coalesce(nullif(p_file_path,''), license_file_path)
   where id = v_pid;

  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.health_provider_set_license(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.health_provider_set_license(uuid,text,text,text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) ADIM 3: lokasyon upsert. p_location_id null → INSERT + provider_locations
--    link; doluysa kendi provider'ına bağlı lokasyonu UPDATE (yoksa NOT_OWNER).
--    Döner {locationId}.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_provider_upsert_location(
  p_user_id     uuid,
  p_location_id uuid,
  p_label       text,
  p_address     text,
  p_city        text,
  p_lat         double precision,
  p_lng         double precision
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pid uuid;
  v_lid uuid;
begin
  select id into v_pid from health.providers where user_id = p_user_id;
  if v_pid is null then
    raise exception 'NOT_A_PROVIDER';
  end if;
  if coalesce(length(trim(p_label)),0) = 0 or coalesce(length(trim(p_address)),0) = 0
     or coalesce(length(trim(p_city)),0) = 0 then
    raise exception 'INVALID_INPUT';
  end if;

  if p_location_id is null then
    insert into health.locations (label, address, city, lat, lng)
    values (trim(p_label), trim(p_address), trim(p_city), p_lat, p_lng)
    returning id into v_lid;
    insert into health.provider_locations (provider_id, location_id)
    values (v_pid, v_lid)
    on conflict do nothing;
  else
    -- Sahiplik: lokasyon çağıranın provider'ına bağlı mı?
    if not exists (
      select 1 from health.provider_locations pl
      where pl.provider_id = v_pid and pl.location_id = p_location_id
    ) then
      raise exception 'NOT_OWNER';
    end if;
    update health.locations
       set label = trim(p_label), address = trim(p_address), city = trim(p_city),
           lat = p_lat, lng = p_lng
     where id = p_location_id;
    v_lid := p_location_id;
  end if;

  return jsonb_build_object('locationId', v_lid);
end $$;
revoke all on function public.health_provider_upsert_location(uuid,uuid,text,text,text,double precision,double precision)
  from public, anon, authenticated;
grant execute on function public.health_provider_upsert_location(uuid,uuid,text,text,text,double precision,double precision)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Lokasyon sil (kendi provider'ına bağlı + HİÇBİR randevu — confirmed veya
--    geçmiş — tarafından kullanılmıyorsa). Owner-checked. Döner boolean.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_provider_delete_location(
  p_user_id uuid, p_location_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pid uuid;
begin
  select id into v_pid from health.providers where user_id = p_user_id;
  if v_pid is null then
    raise exception 'NOT_A_PROVIDER';
  end if;
  if not exists (
    select 1 from health.provider_locations pl
    where pl.provider_id = v_pid and pl.location_id = p_location_id
  ) then
    raise exception 'NOT_OWNER';
  end if;

  -- Herhangi bir randevuda kullanılıyorsa engelle (confirmed AYRICA completed/
  -- cancelled/no_show geçmişi). appointments.location_id FK'sinde ON DELETE
  -- yok → geçmiş randevulu satırı silmek 23503 fırlatır; bu kontrol o ham FK
  -- hatası yerine dostça LOCATION_IN_USE döndürür (lib parseProviderError eşler).
  if exists (
    select 1 from health.appointments a
    where a.location_id = p_location_id and a.provider_id = v_pid
  ) then
    raise exception 'LOCATION_IN_USE';
  end if;

  delete from health.schedules where provider_id = v_pid and location_id = p_location_id;
  delete from health.provider_locations where provider_id = v_pid and location_id = p_location_id;
  -- locations satırını yalnız başka provider bağlı değilse sil (paylaşımlı olabilir).
  delete from health.locations l
    where l.id = p_location_id
      and not exists (select 1 from health.provider_locations pl where pl.location_id = l.id);
  return true;
end $$;
revoke all on function public.health_provider_delete_location(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.health_provider_delete_location(uuid,uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) ADIM 4: hizmet upsert. duration 5-240, mode in_person/video/home_visit.
--    Güncellemede service.provider_id == çağıranın provider'ı (yoksa NOT_OWNER).
--    Döner {serviceId}.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_provider_upsert_service(
  p_user_id    uuid,
  p_service_id uuid,
  p_name       jsonb,
  p_duration_min int,
  p_price_eur  numeric,
  p_mode       text,
  p_is_active  boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pid uuid;
  v_sid uuid;
begin
  select id into v_pid from health.providers where user_id = p_user_id;
  if v_pid is null then
    raise exception 'NOT_A_PROVIDER';
  end if;
  if p_duration_min is null or p_duration_min < 5 or p_duration_min > 240 then
    raise exception 'INVALID_INPUT';
  end if;
  if p_mode is null or p_mode not in ('in_person','video','home_visit') then
    raise exception 'INVALID_INPUT';
  end if;
  if p_price_eur is not null and p_price_eur < 0 then
    raise exception 'INVALID_INPUT';
  end if;
  if p_name is null or jsonb_typeof(p_name) <> 'object' then
    raise exception 'INVALID_INPUT';
  end if;

  if p_service_id is null then
    insert into health.services (provider_id, name, duration_min, price_eur, mode, is_active)
    values (v_pid, p_name, p_duration_min, p_price_eur, p_mode, coalesce(p_is_active, true))
    returning id into v_sid;
  else
    if not exists (
      select 1 from health.services s where s.id = p_service_id and s.provider_id = v_pid
    ) then
      raise exception 'NOT_OWNER';
    end if;
    update health.services
       set name = p_name, duration_min = p_duration_min, price_eur = p_price_eur,
           mode = p_mode, is_active = coalesce(p_is_active, true)
     where id = p_service_id;
    v_sid := p_service_id;
  end if;

  return jsonb_build_object('serviceId', v_sid);
end $$;
revoke all on function public.health_provider_upsert_service(uuid,uuid,jsonb,int,numeric,text,boolean)
  from public, anon, authenticated;
grant execute on function public.health_provider_upsert_service(uuid,uuid,jsonb,int,numeric,text,boolean)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) Hizmet sil (kendi provider'ı + HİÇBİR randevu — confirmed veya geçmiş —
--    kullanmıyorsa). Owner-checked.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_provider_delete_service(
  p_user_id uuid, p_service_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pid uuid;
begin
  select id into v_pid from health.providers where user_id = p_user_id;
  if v_pid is null then
    raise exception 'NOT_A_PROVIDER';
  end if;
  if not exists (
    select 1 from health.services s where s.id = p_service_id and s.provider_id = v_pid
  ) then
    raise exception 'NOT_OWNER';
  end if;
  -- Herhangi bir randevuda kullanılıyorsa engelle (confirmed + geçmiş). services
  -- FK'sinde de ON DELETE yok → geçmiş randevulu silmek 23503; bu kontrol ham FK
  -- yerine dostça SERVICE_IN_USE döndürür.
  if exists (
    select 1 from health.appointments a
    where a.service_id = p_service_id and a.provider_id = v_pid
  ) then
    raise exception 'SERVICE_IN_USE';
  end if;
  delete from health.services where id = p_service_id;
  return true;
end $$;
revoke all on function public.health_provider_delete_service(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.health_provider_delete_service(uuid,uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) ADIM 5 + takvim editörü: BİR kendi lokasyonu için haftalık tekrarlı satırları
--    atomik DEĞİŞTİR. Lokasyon çağıranın provider'ına bağlı mı (yoksa NOT_OWNER);
--    o (provider,location) için mevcut schedules SİL; p_rows [{weekday 0-6,
--    start_time,end_time}] start<end + lokasyon-içi weekday çakışma yok doğrulamasıyla
--    INSERT. Döner {count}. Override'lar (holiday/break/extra) H7b'de.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_provider_set_schedules(
  p_user_id     uuid,
  p_location_id uuid,
  p_rows        jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pid    uuid;
  v_row    jsonb;
  v_wd     int;
  v_st     time;
  v_et     time;
  v_count  int := 0;
  v_prev   record;
begin
  select id into v_pid from health.providers where user_id = p_user_id;
  if v_pid is null then
    raise exception 'NOT_A_PROVIDER';
  end if;
  if not exists (
    select 1 from health.provider_locations pl
    where pl.provider_id = v_pid and pl.location_id = p_location_id
  ) then
    raise exception 'NOT_OWNER';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'INVALID_INPUT';
  end if;

  -- Çakışma kontrolü: aynı weekday'de açılan iki aralık üst üste binemez.
  -- (DB'de (provider,location,weekday) unique YOK → kodda zorla.) Bitişik
  -- (end == next start) kabul; gerçek overlap reddedilir.
  for v_prev in
    select (e.value->>'weekday')::int as weekday,
           (e.value->>'start_time')::time as st,
           (e.value->>'end_time')::time as et
    from jsonb_array_elements(p_rows) e
  loop
    if v_prev.weekday is null or v_prev.weekday < 0 or v_prev.weekday > 6 then
      raise exception 'INVALID_INPUT';
    end if;
    if v_prev.st is null or v_prev.et is null or v_prev.st >= v_prev.et then
      raise exception 'INVALID_INPUT';
    end if;
  end loop;

  -- WITH ORDINALITY → a.ord/b.ord expose array position so a row isn't compared
  -- with itself; genuine overlap (a.start < b.end AND b.start < a.end) rejected,
  -- adjacency (a.end == b.start) accepted.
  if exists (
    select 1
    from jsonb_array_elements(p_rows) with ordinality as a(value, ord)
    join jsonb_array_elements(p_rows) with ordinality as b(value, ord)
      on (a.value->>'weekday')::int = (b.value->>'weekday')::int
     and a.ord <> b.ord
    where (a.value->>'start_time')::time < (b.value->>'end_time')::time
      and (b.value->>'start_time')::time < (a.value->>'end_time')::time
  ) then
    raise exception 'SCHEDULE_OVERLAP';
  end if;

  -- Atomik değiştir: sil + ekle (tek tx; fonksiyon = implicit tx).
  delete from health.schedules where provider_id = v_pid and location_id = p_location_id;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_wd := (v_row->>'weekday')::int;
    v_st := (v_row->>'start_time')::time;
    v_et := (v_row->>'end_time')::time;
    insert into health.schedules (provider_id, location_id, weekday, start_time, end_time)
    values (v_pid, p_location_id, v_wd, v_st, v_et);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('count', v_count);
end $$;
revoke all on function public.health_provider_set_schedules(uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.health_provider_set_schedules(uuid,uuid,jsonb) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) ayarlar: provider_settings upsert (PK=provider_id → ON CONFLICT). Aralık
--    doğrulaması: buffer>=0, min_notice>=0, slot_grid in {5,10,15,20,30,60},
--    horizon_days 1-180, daily_cap null-or-positive. Owner-checked.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_provider_upsert_settings(
  p_user_id       uuid,
  p_buffer_min    int,
  p_min_notice_min int,
  p_horizon_days  int,
  p_daily_cap     int,
  p_slot_grid_min int
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pid uuid;
begin
  select id into v_pid from health.providers where user_id = p_user_id;
  if v_pid is null then
    raise exception 'NOT_A_PROVIDER';
  end if;
  if p_buffer_min is null or p_buffer_min < 0 then raise exception 'INVALID_INPUT'; end if;
  if p_min_notice_min is null or p_min_notice_min < 0 then raise exception 'INVALID_INPUT'; end if;
  if p_horizon_days is null or p_horizon_days < 1 or p_horizon_days > 180 then
    raise exception 'INVALID_INPUT';
  end if;
  if p_slot_grid_min is null or p_slot_grid_min not in (5,10,15,20,30,60) then
    raise exception 'INVALID_INPUT';
  end if;
  if p_daily_cap is not null and p_daily_cap < 1 then raise exception 'INVALID_INPUT'; end if;

  insert into health.provider_settings
    (provider_id, buffer_min, min_notice_min, horizon_days, daily_cap, slot_grid_min)
  values
    (v_pid, p_buffer_min, p_min_notice_min, p_horizon_days, p_daily_cap, p_slot_grid_min)
  on conflict (provider_id) do update
    set buffer_min     = excluded.buffer_min,
        min_notice_min = excluded.min_notice_min,
        horizon_days   = excluded.horizon_days,
        daily_cap      = excluded.daily_cap,
        slot_grid_min  = excluded.slot_grid_min;

  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.health_provider_upsert_settings(uuid,int,int,int,int,int)
  from public, anon, authenticated;
grant execute on function public.health_provider_upsert_settings(uuid,int,int,int,int,int) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10) Wizard finalize: minimum tamlık (profil + lisans + >=1 lokasyon + >=1 aktif
--     hizmet + >=1 schedule satırı). verification_status='pending' + is_published=
--     false KORUNUR (admin H8 onaylar). Eksikse {ok:false, missing[]}. Burada YAYIN YOK.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_provider_submit_for_review(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pid     uuid;
  v_missing text[] := '{}';
  v_prov    health.providers;
begin
  select * into v_prov from health.providers where user_id = p_user_id;
  if v_prov.id is null then
    raise exception 'NOT_A_PROVIDER';
  end if;
  v_pid := v_prov.id;

  if coalesce(length(trim(v_prov.full_name)),0) < 2 then
    v_missing := array_append(v_missing, 'profile');
  end if;
  if v_prov.license_number is null and v_prov.license_file_path is null then
    v_missing := array_append(v_missing, 'license');
  end if;
  if not exists (select 1 from health.provider_locations pl where pl.provider_id = v_pid) then
    v_missing := array_append(v_missing, 'location');
  end if;
  if not exists (select 1 from health.services s
                  where s.provider_id = v_pid and s.is_active = true) then
    v_missing := array_append(v_missing, 'service');
  end if;
  if not exists (select 1 from health.schedules sc where sc.provider_id = v_pid) then
    v_missing := array_append(v_missing, 'schedule');
  end if;

  if array_length(v_missing, 1) is not null then
    return jsonb_build_object('ok', false, 'missing', to_jsonb(v_missing));
  end if;

  -- Tamlık geçti → audit damgası (verification_status DOKUNULMAZ; admin H8 onaylar).
  insert into health.audit_log (actor_id, action, target_table, target_id, payload)
  values (p_user_id, 'provider_submit_for_review', 'providers', v_pid,
          jsonb_build_object('at', now()));

  return jsonb_build_object('ok', true, 'missing', '[]'::jsonb,
                            'providerId', v_pid, 'slug', v_prov.slug);
end $$;
revoke all on function public.health_provider_submit_for_review(uuid)
  from public, anon, authenticated;
grant execute on function public.health_provider_submit_for_review(uuid) to service_role;
