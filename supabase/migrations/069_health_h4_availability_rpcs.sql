-- ═══════════════════════════════════════════════════════════════════════════
-- 069: H4 — availability read-RPC'leri (slot motoru girdileri)
-- ═══════════════════════════════════════════════════════════════════════════
-- KARAR (068 ile aynı): health şeması PostgREST'e EXPOSE EDİLMEZ. Slot motoru
-- (lib/saglik/availability.ts) SAF bir TypeScript fonksiyonudur; DB'den okuduğu
-- ham girdiyi bu PUBLIC şema SECURITY DEFINER salt-okuma fonksiyonlarından alır.
-- Fonksiyonlar health.*'ı definer (postgres) olarak okur ve YALNIZ
-- is_published AND verification_status='approved' provider için veri döndürür.
--
-- HASSAS VERİ DÖNMEZ (DoD B): yalnız dolu/boş zaman aralıkları (lower/upper(slot_range))
-- döner — hasta kimliği (patient_id), not (patient_note), manage_token, telefon/email
-- ASLA. busy = confirmed randevuların ZAMAN aralıkları; holds = aktif (expires_at>now)
-- hold'ların ZAMAN aralıkları. İkisi de provider-geneli (provider aynı anda iki yerde
-- olamaz; appointments/slot_holds EXCLUDE'ları provider-geneli).
--
-- SALT-OKUMA + ADDITIVE: health şemasına ALTER/DROP YOK; yeni veri yazımı YOK.
-- 066/067/068 nesnelerine ve provider_waitlist'e DOKUNULMAZ.
--
-- GÜVENLİK: her fonksiyon SECURITY DEFINER + SET search_path='' (066/068 deseniyle
-- birebir — pinli, mutable değil; tüm health.* objeleri şema-qualified; AT TIME ZONE /
-- tstzrange / now() / jsonb_* hepsi pg_catalog → search_path'ten bağımsız).
-- EXECUTE: anon + authenticated + service_role (okuma public ama yalnız yayındaki
-- veri + PII'siz zaman aralığı döner). Render TZ Europe/Podgorica (Demir Kural 7);
-- override.date ve schedule validity yerel takvim gününe göre AT TIME ZONE ile süzülür.
--
-- ROLLBACK:
--   drop function if exists public.health_get_availability_inputs(uuid,uuid,uuid,timestamptz,timestamptz);
--   drop function if exists public.health_get_availability_inputs_by_specialty(text,timestamptz,timestamptz);
--   drop function if exists public.health_get_booking_options(text,text);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Tek provider+hizmet+lokasyon için slot motoru girdisi.
--    NULL → provider yayında değil ya da hizmet o provider'a ait/aktif değil.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_get_availability_inputs(
  p_provider_id uuid,
  p_service_id  uuid,
  p_location_id uuid,
  p_from        timestamptz,
  p_to          timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when sv.id is null then null else jsonb_build_object(
    'serviceDurationMin', sv.duration_min,
    'settings', jsonb_build_object(
      'bufferMin',    coalesce(st.buffer_min, 0),
      'minNoticeMin', coalesce(st.min_notice_min, 120),
      'horizonDays',  coalesce(st.horizon_days, 60),
      'dailyCap',     st.daily_cap,
      'slotGridMin',  coalesce(st.slot_grid_min, 15)
    ),
    'schedules', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'weekday',    s.weekday,
        'startTime',  s.start_time,
        'endTime',    s.end_time,
        'validFrom',  s.valid_from,
        'validUntil', s.valid_until
      ) order by s.weekday, s.start_time), '[]'::jsonb)
      from health.schedules s
      where s.provider_id = p.id
        and s.location_id = p_location_id
        and (s.valid_from  is null or s.valid_from  <= (p_to   at time zone 'Europe/Podgorica')::date)
        and (s.valid_until is null or s.valid_until >= (p_from at time zone 'Europe/Podgorica')::date)
    ),
    'overrides', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date',      o.date,
        'startTime', o.start_time,
        'endTime',   o.end_time,
        'kind',      o.kind
      ) order by o.date), '[]'::jsonb)
      from health.schedule_overrides o
      where o.provider_id = p.id
        and o.date between (p_from at time zone 'Europe/Podgorica')::date - 1
                       and (p_to   at time zone 'Europe/Podgorica')::date + 1
    ),
    'busy', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'start', lower(a.slot_range), 'end', upper(a.slot_range)
      ) order by lower(a.slot_range)), '[]'::jsonb)
      from health.appointments a
      where a.provider_id = p.id
        and a.status = 'confirmed'
        and a.slot_range && tstzrange(p_from, p_to)
    ),
    'holds', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'start', lower(h.slot_range), 'end', upper(h.slot_range)
      ) order by lower(h.slot_range)), '[]'::jsonb)
      from health.slot_holds h
      where h.provider_id = p.id
        and h.expires_at > now()
        and h.slot_range && tstzrange(p_from, p_to)
    )
  ) end
  from health.providers p
  left join health.services sv
    on sv.id = p_service_id and sv.provider_id = p.id and sv.is_active = true
  left join health.provider_settings st on st.provider_id = p.id
  where p.id = p_provider_id
    and p.is_published = true
    and p.verification_status = 'approved';
$$;
revoke all on function public.health_get_availability_inputs(uuid,uuid,uuid,timestamptz,timestamptz) from public;
grant execute on function public.health_get_availability_inputs(uuid,uuid,uuid,timestamptz,timestamptz)
  to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Bir uzmanlıktaki TÜM yayınlı+onaylı provider'lar için slot motoru girdileri
--    (liste kartı "sonraki müsait saatler" — N+1 yerine tek çağrı). Schedules tüm
--    lokasyonları kapsar (kart "herhangi bir yerde sonraki slot" teaser'ı);
--    primaryServiceDurationMin = en kısa aktif hizmet süresi.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_get_availability_inputs_by_specialty(
  p_specialty_slug text,
  p_from           timestamptz,
  p_to             timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(obj order by obj ->> 'providerSlug'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'providerSlug', p.slug,
      'primaryServiceDurationMin', (
        select min(sv.duration_min) from health.services sv
        where sv.provider_id = p.id and sv.is_active = true
      ),
      'settings', jsonb_build_object(
        'bufferMin',    coalesce(st.buffer_min, 0),
        'minNoticeMin', coalesce(st.min_notice_min, 120),
        'horizonDays',  coalesce(st.horizon_days, 60),
        'dailyCap',     st.daily_cap,
        'slotGridMin',  coalesce(st.slot_grid_min, 15)
      ),
      'schedules', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'weekday',    s.weekday,
          'startTime',  s.start_time,
          'endTime',    s.end_time,
          'validFrom',  s.valid_from,
          'validUntil', s.valid_until
        ) order by s.weekday, s.start_time), '[]'::jsonb)
        from health.schedules s
        where s.provider_id = p.id
          and (s.valid_from  is null or s.valid_from  <= (p_to   at time zone 'Europe/Podgorica')::date)
          and (s.valid_until is null or s.valid_until >= (p_from at time zone 'Europe/Podgorica')::date)
      ),
      'overrides', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'date', o.date, 'startTime', o.start_time, 'endTime', o.end_time, 'kind', o.kind
        ) order by o.date), '[]'::jsonb)
        from health.schedule_overrides o
        where o.provider_id = p.id
          and o.date between (p_from at time zone 'Europe/Podgorica')::date - 1
                         and (p_to   at time zone 'Europe/Podgorica')::date + 1
      ),
      'busy', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'start', lower(a.slot_range), 'end', upper(a.slot_range)
        ) order by lower(a.slot_range)), '[]'::jsonb)
        from health.appointments a
        where a.provider_id = p.id and a.status = 'confirmed'
          and a.slot_range && tstzrange(p_from, p_to)
      ),
      'holds', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'start', lower(h.slot_range), 'end', upper(h.slot_range)
        ) order by lower(h.slot_range)), '[]'::jsonb)
        from health.slot_holds h
        where h.provider_id = p.id and h.expires_at > now()
          and h.slot_range && tstzrange(p_from, p_to)
      )
    ) as obj
    from health.providers p
    join health.provider_specialties ps on ps.provider_id = p.id
    join health.specialties sp on sp.id = ps.specialty_id
    left join health.provider_settings st on st.provider_id = p.id
    where sp.slug = p_specialty_slug
      and p.is_published = true
      and p.verification_status = 'approved'
  ) t;
$$;
revoke all on function public.health_get_availability_inputs_by_specialty(text,timestamptz,timestamptz) from public;
grant execute on function public.health_get_availability_inputs_by_specialty(text,timestamptz,timestamptz)
  to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Profil takvim widget'ı için bootstrap: provider id + hizmetler (id'li) +
--    lokasyonlar (id'li). H2 read-RPC'leri id döndürmediği için (068'e DOKUNMADAN)
--    eklendi; widget bu id'lerle /api/health/slots'u çağırır. NULL → yayında değil.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_get_booking_options(p_slug text, p_locale text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'providerId', p.id,
    'services', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',          sv.id,
        'name',        sv.name ->> p_locale,
        'durationMin', sv.duration_min,
        'priceEur',    sv.price_eur,
        'mode',        sv.mode
      ) order by sv.duration_min), '[]'::jsonb)
      from health.services sv
      where sv.provider_id = p.id and sv.is_active = true
    ),
    'locations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'label', l.label, 'city', l.city
      ) order by l.created_at), '[]'::jsonb)
      from health.provider_locations pl
      join health.locations l on l.id = pl.location_id
      where pl.provider_id = p.id
    )
  )
  from health.providers p
  where p.slug = p_slug
    and p.is_published = true
    and p.verification_status = 'approved';
$$;
revoke all on function public.health_get_booking_options(text,text) from public;
grant execute on function public.health_get_booking_options(text,text)
  to anon, authenticated, service_role;
