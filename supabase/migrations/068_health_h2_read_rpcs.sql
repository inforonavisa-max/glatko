-- ═══════════════════════════════════════════════════════════════════════════
-- 068: H2 — public read-RPC wrapper'ları (uzman dizini + profil)
-- ═══════════════════════════════════════════════════════════════════════════
-- KARAR (Rohat, 16 Haz): health şeması PostgREST'e EXPOSE EDİLMEZ (API yüzeyi dar
-- kalır). supabase-js (anon ya da service-role) yalnız PUBLIC şemayı görür; bu yüzden
-- H2'nin 3 sayfasının okuduğu veriyi PUBLIC şemada SECURITY DEFINER salt-okuma
-- fonksiyonları sağlar. Fonksiyonlar health.*'ı definer (postgres) olarak okur ve
-- YALNIZ is_published AND verification_status='approved' provider'ı döndürür (yayın
-- filtresi RPC içinde — anon hiçbir koşulda yayınlanmamış/onaysız veri göremez).
--
-- SALT-OKUMA + ADDITIVE: health şemasına ALTER/DROP YOK; yeni veri yazımı YOK. "H2 DB
-- migration yok" kuralı yalnız bu dar okuma-RPC'leri için gevşetildi (MASTER_PLAN v1.6).
-- 066/067 nesnelerine ve provider_waitlist'e DOKUNULMAZ.
--
-- GÜVENLİK: her fonksiyon SECURITY DEFINER + SET search_path='' (066/book_appointment
-- deseniyle birebir — pinli, mutable değil; tüm objeler şema-qualified). pgcrypto vb.
-- kullanılmaz (yalnız jsonb/metin). EXECUTE: anon + authenticated + service_role
-- (okuma public ama yalnız yayındaki veri döner; hassas tablolara hiç dokunmaz).
--
-- ROLLBACK:
--   drop function if exists public.health_list_specialties(text);
--   drop function if exists public.health_providers_by_specialty(text, text);
--   drop function if exists public.health_get_provider(text, text);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Aktif uzmanlıklar (ana sayfa kartları + chip'ler). names jsonb → p_locale.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_list_specialties(p_locale text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('slug', s.slug, 'name', s.names ->> p_locale, 'icon', s.icon)
      order by s.sort_order, s.slug
    ),
    '[]'::jsonb
  )
  from health.specialties s
  where s.is_active = true;
$$;
revoke all on function public.health_list_specialties(text) from public;
grant execute on function public.health_list_specialties(text) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Bir uzmanlıktaki yayınlı+onaylı provider'lar (liste kartları).
--    Kart: slug, ad, ünvan, foto, tip, doğrulanmış, diller, branş adı, birincil lokasyon.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_providers_by_specialty(
  p_specialty_slug text, p_locale text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(card order by card ->> 'fullName'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'slug',          p.slug,
      'fullName',      p.full_name,
      'title',         p.title,
      'photoUrl',      p.photo_url,
      'providerType',  p.provider_type,
      'verified',      (p.verification_status = 'approved'),
      'languages',     to_jsonb(p.languages),
      'specialtyName', sp.names ->> p_locale,
      'location', (
        select jsonb_build_object('city', l.city, 'address', l.address, 'label', l.label)
        from health.provider_locations pl
        join health.locations l on l.id = pl.location_id
        where pl.provider_id = p.id
        order by l.created_at
        limit 1
      )
    ) as card
    from health.providers p
    join health.provider_specialties ps on ps.provider_id = p.id
    join health.specialties sp on sp.id = ps.specialty_id
    where sp.slug = p_specialty_slug
      and p.is_published = true
      and p.verification_status = 'approved'
  ) t;
$$;
revoke all on function public.health_providers_by_specialty(text, text) from public;
grant execute on function public.health_providers_by_specialty(text, text) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Tek provider profili (yayınlı+onaylı). Yoksa NULL → sayfa 404.
--    bio (locale), uzmanlıklar, lokasyonlar, hizmetler (aktif, fiyat NULL olabilir).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_get_provider(p_slug text, p_locale text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'slug',         p.slug,
    'fullName',     p.full_name,
    'title',        p.title,
    'photoUrl',     p.photo_url,
    'providerType', p.provider_type,
    'verified',     (p.verification_status = 'approved'),
    'bio',          p.bio ->> p_locale,
    'languages',    to_jsonb(p.languages),
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
        jsonb_build_object('label', l.label, 'address', l.address, 'city', l.city,
                           'lat', l.lat, 'lng', l.lng)
        order by l.created_at), '[]'::jsonb)
      from health.provider_locations pl
      join health.locations l on l.id = pl.location_id
      where pl.provider_id = p.id
    ),
    'services', (
      select coalesce(jsonb_agg(
        jsonb_build_object('name', sv.name ->> p_locale, 'durationMin', sv.duration_min,
                           'priceEur', sv.price_eur, 'mode', sv.mode)
        order by sv.duration_min), '[]'::jsonb)
      from health.services sv
      where sv.provider_id = p.id and sv.is_active = true
    )
  )
  from health.providers p
  where p.slug = p_slug
    and p.is_published = true
    and p.verification_status = 'approved';
$$;
revoke all on function public.health_get_provider(text, text) from public;
grant execute on function public.health_get_provider(text, text) to anon, authenticated, service_role;
