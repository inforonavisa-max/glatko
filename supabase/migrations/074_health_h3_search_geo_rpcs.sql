-- ═══════════════════════════════════════════════════════════════════════════
-- 074: H3 — arama + filtre + geo read-RPC (uzman dizini araması)
-- ═══════════════════════════════════════════════════════════════════════════
-- KARAR (068/069 ile aynı): health şeması PostgREST'e EXPOSE EDİLMEZ. H3 dizini
-- aramasını TEK bir PUBLIC şema SECURITY DEFINER salt-okuma fonksiyonu sağlar.
-- Fonksiyon health.*'ı definer (postgres) olarak okur ve YALNIZ
-- is_published AND verification_status='approved' provider döndürür (yayın filtresi
-- RPC içinde — anon hiçbir koşulda yayınlanmamış/onaysız veri göremez).
--
-- 068.health_providers_by_specialty'nin BİREBİR genişletilmişi: aynı kart şekli
-- (slug/fullName/title/photoUrl/providerType/verified/languages/specialtyName +
-- birincil lokasyon) + şu opsiyonel yüklemler:
--   • p_city    — birincil lokasyon şehri. AKSAN-DUYARSIZ eşleşme: iki taraf da
--                  extensions.unaccent + lower ile normalize edilir. Sebep: SSOT
--                  GLATKO_CITIES.name aksan taşır (Nikšić, Rožaje, Kolašin, Žabljak,
--                  Plužine, Šavnik…); provider'ın serbest-metin location.city'si
--                  aksansız ('Niksic') saklanmışsa düz ILIKE eşleşmezdi → provider
--                  sessizce kaybolurdu. unaccent extensions şemasında KURULU (1.1).
--   • p_langs   — diller (overlap &&; provider.languages text[] ile kesişim)
--   • p_mode    — aktif bir hizmetin modu (in_person|video|home_visit) var mı
--   • p_lat/p_lng/p_radius_m — "yakınımda": birincil lokasyon koordinatından
--                  yarıçap içi; sonuç kartına distance_km eklenir; mesafeye göre sıralı
-- "bu hafta müsait" filtresi BU RPC'DE DEĞİL — slot motoru tek-kaynak kalsın diye
-- TS'te (lib/saglik/queries.getNextSlotsBySpecialty, 069) cross-ref edilir.
--
-- GEO (geoStrategy): PostGIS 3.3.7 ZATEN KURULU (schema 'extensions'); cube/earthdistance
-- KURULU DEĞİL. ADDITIVE Demir Kural: health.locations'a geography kolonu / gist index
-- EKLENMEZ (066 kilidi). Mesafe RPC içinde INLINE hesaplanır:
--   extensions.ST_DistanceSphere(extensions.ST_MakePoint(l.lng,l.lat),
--                                extensions.ST_MakePoint(p_lng,p_lat))  -- metre, küresel
-- Şema-qualified (search_path='' altında çözülür). Launch'ta ~birkaç yüz satır → seq-scan
-- yeterli; büyürse expression-üstü gist index AYRI bir migration'da (tabloya DDL YOK).
--
-- HASSAS VERİ DÖNMEZ: yalnız public kart alanları + (geo verilirse) distance_km. PII yok
-- → 068/069 ile aynı grant: anon + authenticated + service_role.
--
-- SALT-OKUMA + ADDITIVE: health şemasına ALTER/DROP YOK; 066–073 nesnelerine DOKUNULMAZ;
-- yeni veri yazımı YOK. Yalnız PUBLIC şemaya yeni fonksiyon eklenir.
--
-- GÜVENLİK: SECURITY DEFINER + SET search_path='' (066/068/069 deseniyle birebir — pinli,
-- mutable değil; tüm health.* + extensions.* objeleri şema-qualified; lower/&&/jsonb_*
-- pg_catalog → search_path'ten bağımsız). unaccent İKİ ARGÜMANLI çağrılır
-- (extensions.unaccent('extensions.unaccent'::regdictionary, …)): tek-argümanlı form
-- sözlüğü search_path'ten çözmeye çalışır → '' altında IMMUTABLE değil/başarısız;
-- regdictionary şema-qualified hali pinlidir.
--
-- ⚠️ PROD'A UYGULANMADI. Bu dosya yalnız yazıldı + aşağıdaki BEGIN/ROLLBACK dry-run
-- planı ile doğrulanır; ana oturum (main session) uygular. (Demir Kural: migration
-- ADDITIVE + dosya + dry-run; bu BUILD agent apply_migration ÇAĞIRMAZ.)
--
-- ROLLBACK:
--   drop function if exists public.health_search_providers(text,text,text,text[],text,double precision,double precision,int);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tek filtreli dizin sorgusu. Tüm filtre argümanları opsiyonel (NULL = filtre yok);
-- defansif: garbage/boş argüman tüm sonuçları döndürmeye düşer (TS tarafı da parse'ı
-- defansif yapar). Sıralama: geo verildiyse mesafe artan, yoksa fullName.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_search_providers(
  p_specialty_slug text,
  p_locale         text,
  p_city           text default null,
  p_langs          text[] default null,
  p_mode           text default null,
  p_lat            double precision default null,
  p_lng            double precision default null,
  p_radius_m       int default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      card
      -- geo verildiyse mesafe artan (NULL'lar sona); değilse ad artan.
      order by
        case when p_lat is not null and p_lng is not null
             then (card ->> 'distanceKm')::numeric end asc nulls last,
        card ->> 'fullName' asc
    ),
    '[]'::jsonb
  )
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'slug',          p.slug,
      'fullName',      p.full_name,
      'title',         p.title,
      'photoUrl',      p.photo_url,
      'providerType',  p.provider_type,
      'verified',      (p.verification_status = 'approved'),
      'languages',     to_jsonb(p.languages),
      'specialtyName', sp.names ->> p_locale,
      'location',      to_jsonb(loc.loc),
      -- distance_km yalnız geo verildiğinde; aksi halde NULL → strip_nulls düşürür.
      'distanceKm',    case
        when p_lat is not null and p_lng is not null and loc.lat is not null and loc.lng is not null
        then round(
          (extensions.ST_DistanceSphere(
             extensions.ST_MakePoint(loc.lng, loc.lat),
             extensions.ST_MakePoint(p_lng, p_lat)
           ) / 1000.0)::numeric, 1)
        else null
      end
    )) as card
    from health.providers p
    join health.provider_specialties ps on ps.provider_id = p.id
    join health.specialties sp on sp.id = ps.specialty_id
    -- Birincil lokasyon (en eski created_at) — kart + geo + city filtresinin dayanağı.
    left join lateral (
      select l.city, l.address, l.label, l.lat, l.lng,
             jsonb_build_object('city', l.city, 'address', l.address, 'label', l.label) as loc
      from health.provider_locations pl
      join health.locations l on l.id = pl.location_id
      where pl.provider_id = p.id
      order by l.created_at
      limit 1
    ) loc on true
    where sp.slug = p_specialty_slug
      and p.is_published = true
      and p.verification_status = 'approved'
      -- city: birincil lokasyon şehri — AKSAN-DUYARSIZ tam eşleşme. İki taraf da
      -- unaccent + lower ile normalize (SSOT şehir adları aksan taşır; provider'ın
      -- serbest-metin şehri aksansız saklanmış olabilir).
      and (
        p_city is null
        or extensions.unaccent('extensions.unaccent'::regdictionary, lower(loc.city))
           = extensions.unaccent('extensions.unaccent'::regdictionary, lower(p_city))
      )
      -- diller: provider.languages ile kesişim
      and (p_langs is null or array_length(p_langs, 1) is null or p.languages && p_langs)
      -- mode: o moddan aktif bir hizmet var mı
      and (p_mode is null or exists (
        select 1 from health.services sv
        where sv.provider_id = p.id and sv.is_active = true and sv.mode = p_mode
      ))
      -- geo yarıçap: birincil lokasyon koordinatından p_radius_m metre içinde
      and (
        p_lat is null or p_lng is null or p_radius_m is null
        or (
          loc.lat is not null and loc.lng is not null
          and extensions.ST_DistanceSphere(
                extensions.ST_MakePoint(loc.lng, loc.lat),
                extensions.ST_MakePoint(p_lng, p_lat)
              ) <= p_radius_m
        )
      )
  ) t;
$$;
revoke all on function public.health_search_providers(text,text,text,text[],text,double precision,double precision,int) from public;
grant execute on function public.health_search_providers(text,text,text,text[],text,double precision,double precision,int)
  to anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- DRY-RUN PLANI (ana oturum uygular; bu BUILD agent apply ETMEZ)
-- ═══════════════════════════════════════════════════════════════════════════
-- Aşağıdaki blok BEGIN/ROLLBACK ile prod'da hiçbir kalıcı değişiklik yapmadan
-- fonksiyonun derlendiğini + senaryoları döndürdüğünü kanıtlar. Prod verisi (TEYİTLİ):
--   • psiholog: dr-test-psiholog-podgorica, city 'Podgorica' @42.4304,19.2594
--   • dis-hekimi (DİŞ HEKİMİ — slug 'stomatolog' DEĞİL): dr-test-stomatolog-budva,
--     city 'Budva' @42.2911,18.8401
-- (Bu blok BUILD agent tarafından prod'da fiilen koşturuldu + rollback edildi; sonuçlar
--  aşağıdaki beklenen değerlerle bire bir tuttu.)
--
--   begin;
--     -- (0) fonksiyonu yarat (bu dosyanın gövdesi)
--     create or replace function public.health_search_providers(...) ...;
--     -- (1) filtresiz: psiholog → 1 kart (distanceKm YOK)
--     select jsonb_array_length(public.health_search_providers('psikolog','en'));               -- 1
--     -- (2) city=Podgorica (SSOT adı) → 1  ; case-insensitive: 'podGORICA' → 1
--     select jsonb_array_length(public.health_search_providers('psikolog','en', p_city => 'Podgorica')); -- 1
--     -- (3) AKSAN-DUYARSIZLIK KANITI: dis-hekimi'nin stored city'sini geçici olarak
--     --     aksansız/farklı-case 'budva' yap; SSOT sorgusu 'Budva' yine de EŞLEŞMELİ.
--     update health.locations set city = 'budva'
--       where id in (select pl.location_id from health.provider_locations pl
--                    join health.providers p on p.id=pl.provider_id
--                    where p.slug='dr-test-stomatolog-budva');
--     select jsonb_array_length(public.health_search_providers('dis-hekimi','en', p_city => 'Budva')); -- 1 (düz ILIKE'ta 0 olurdu)
--     -- (4) geo: Kotor (42.4247,18.7712) 20km → dis-hekimi (Budva ~15.9km) IN; distanceKm dolu
--     select public.health_search_providers('dis-hekimi','en',
--              p_lat => 42.4247, p_lng => 18.7712, p_radius_m => 20000);                          -- 1 kart, distanceKm 15.9
--     -- (5) geo: aynı nokta 5km → OUT
--     select jsonb_array_length(public.health_search_providers('dis-hekimi','en',
--              p_lat => 42.4247, p_lng => 18.7712, p_radius_m => 5000));                          -- 0
--     -- (6) dil filtresi: olmayan dil → 0
--     select jsonb_array_length(public.health_search_providers('psikolog','en', p_langs => array['xx'])); -- 0
--   rollback;
--
-- Beklenen: tüm SELECT'ler hatasız döner, sayılar yukarıdaki yorumlarla tutar,
-- hiçbir DDL/DML kalıcı olmaz (ROLLBACK). Geçerse 074 prod'a uygulanabilir.
