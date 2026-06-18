-- ═══════════════════════════════════════════════════════════════════════════
-- 079: H8 — admin "Sağlık" bölümü RPC'leri (doğrulama kuyruğu + yönetim + metrik)
-- ═══════════════════════════════════════════════════════════════════════════
-- H7a (077) provider onboarding + H7b (078) günlük operasyonu kurdu; H8 MEVCUT
-- Glatko admin paneline (app/[locale]/admin/*) bir "Sağlık" bölümü ekler: bekleyen
-- provider doğrulama kuyruğu + detay (lisans dosyası dahil) + ONAYLA/REDDET +
-- yayından kaldır/yayınla + tier değişimi + TÜM randevuların admin görünümü +
-- health.audit_log görüntüleyici + metrik kartları (haftalık rezervasyon / no-show /
-- doluluk girdileri / bekleme listesi). Onay → provider CANLI olur (is_published=true).
--
-- ÖZNEL GÜVENLİK MODELİ (077/078 birebir, KRİTİK SAPMA NOTU):
--   * health.owns_provider() / public.is_admin() auth.uid()'i İÇERİDEN okur → service-role
--     çağrıda auth.uid() NULL olduğu için BURADA KULLANILAMAZ. AYRICA prod'da üç gerçek
--     admin'in de profiles.role='user' (admin DEĞİL) olduğu DOĞRULANDI → public.is_admin()
--     gerçek admin'ler için bile FALSE döndürür ve service-role altında ÖLÜ bir kontroldür.
--     Bu yüzden H8 RPC'leri profiles.role/is_admin() ÜZERİNE KAPI KOYMAZ (hiç kimseyi
--     yetkilendirmez). Yetki = (a) EXECUTE yalnız service_role + (b) UYGULAMA katmanında
--     isAdminEmail(user.email) — çağıran server action/sayfa, RPC'den ÖNCE kontrol eder
--     (mevcut glatko_admin_* RPC'leriyle birebir aynı duruş).
--   * Her mutasyon RPC'si sunucu-DOĞRULANMIŞ p_actor_id alır (cookie-auth admin user.id;
--     client veremez) ve bunu health.audit_log.actor_id olarak yazar. p_actor_id bir
--     YETKİ kapısı DEĞİL (yukarıdaki app-layer isAdminEmail odur) — yalnız iz/kimlik.
--   * is_admin()/profiles.role drift'i AYRI bir temizlik işidir; H8 İÇİNDE düzeltilmez.
--
-- GÜVENLİK DURUŞU (066-078 deseni): her fonksiyon SECURITY DEFINER + SET search_path='' ;
-- tüm health.*/extensions.*/vault.* objeleri şema-qualified. EXECUTE yalnız service_role
-- (anon/authenticated ASLA). RAISE EXCEPTION '<CODE>' iş hataları → PostgREST error.message
-- == kod → lib/saglik/admin.ts stable union'a parse eder.
--
-- PII: randevu admin listesi telefonu DEFINER İÇİNDE çözer + YALNIZ maskeli string
-- döndürür ('•••' || right(decrypt,3) — 078 ile birebir); e-posta ASLA döndürülmez. Ham
-- telefon transient local; asla seçilmez/loglanmaz. Lisans DOSYASI (gizli health-licenses
-- bucket) için detay-RPC license_file_path'i DÖNDÜRÜR (yalnız admin; 068/077 ASLA seçmez)
-- → çağıran action kısa-ömürlü imzalı download URL üretir (path asla loglanmaz).
--
-- ADDITIVE: health.* tabloları + 066-078 objelerine ALTER/DROP YOK. ŞEMA MUTASYONU YOK
-- (rejection reason health.audit_log payload'ında saklanır — ek kolon GEREKMEZ; daha
-- düşük-riskli additive seçim). subscription_tier'da CHECK yok (066) → izin verilen tier
-- kümesi RPC İÇİNDE doğrulanır. YALNIZ yeni public RPC'ler.
--
-- ───────────────────────── DRY-RUN PLANI (prod-safe; MAIN session uygular) ──────────────
-- begin;
--   -- (1) Bu dosyanın tüm CREATE FUNCTION bloklarını bu tx içinde yükle.
--   -- (2) EXECUTE yalnız service_role'a verildi mi? (anon/authenticated/public ASLA):
--   --   select p.proname, r.rolname
--   --   from pg_proc p
--   --   join pg_namespace n on n.oid = p.pronamespace
--   --   cross join lateral aclexplode(p.proacl) a
--   --   join pg_roles r on r.oid = a.grantee
--   --   where n.nspname='public' and p.proname like 'health_admin_%' and a.privilege_type='EXECUTE';
--   --   -- her satırda rolname='service_role' BEKLENİR; anon/authenticated/public ÇIKMAMALI.
--   -- (3) Throwaway provider üzerinde karar akışı (veri yazıp ROLLBACK):
--   do $$
--   declare
--     v_u uuid := gen_random_uuid();
--     v_actor uuid := gen_random_uuid();
--     v_pid uuid; v_res jsonb; v_audit_before bigint; v_audit_after bigint;
--   begin
--     -- A için provider (077 RPC'siyle) — pending + unpublished başlar:
--     perform public.health_provider_upsert_profile(v_u,'doctor','Dr Onay','GP',
--       '{"en":"bio"}'::jsonb, null, array['en'], array[]::text[]);
--     select id into v_pid from health.providers where user_id=v_u;
--     -- kuyrukta pending olarak görünüyor mu?
--     v_res := public.health_admin_list_pending('en','pending');
--     raise notice 'pending kuyrukta = %', exists(
--       select 1 from jsonb_array_elements(v_res) e where (e->>'id')::uuid = v_pid);  -- t
--     -- karar öncesi audit sayımı:
--     select count(*) into v_audit_before from health.audit_log where target_id=v_pid;
--     -- ONAYLA → approved + is_published=true + verified_at + audit + userId döner:
--     v_res := public.health_admin_decide_provider(v_actor, v_pid, 'approve', null);
--     raise notice 'decide ok = %, userId set = %', v_res->>'ok', (v_res->>'userId') is not null;  -- true / t
--     -- (H8 audit refine) decide artık slug döndürüyor (action approve/reject CTA + public revalidate için):
--     raise notice 'decide slug anahtarı var = %', v_res ? 'slug';  -- t
--     raise notice 'approved+published = %', exists(
--       select 1 from health.providers
--       where id=v_pid and verification_status='approved' and is_published=true and verified_at is not null);  -- t
--     select count(*) into v_audit_after from health.audit_log where target_id=v_pid;
--     raise notice 'audit_log +1 satır = %', (v_audit_after = v_audit_before + 1);  -- t
--     raise notice 'audit action = %', (
--       select action from health.audit_log where target_id=v_pid order by id desc limit 1);  -- admin_provider_approve
--     -- pending DEĞİL → tekrar karar reddi:
--     begin perform public.health_admin_decide_provider(v_actor, v_pid, 'reject', 'x');
--       raise notice 'BEKLENMEDİK: approved→reject geçti';
--     exception when others then raise notice 'OK approved→decide reddedildi: %', sqlerrm; end;  -- INVALID_DECISION
--     -- unpublish → is_published=false + audit:
--     v_res := public.health_admin_set_published(v_actor, v_pid, false);
--     raise notice 'unpublished = %', exists(select 1 from health.providers where id=v_pid and is_published=false);  -- t
--     -- (H8 audit refine) set_published artık slug döndürüyor (public surface revalidate için):
--     raise notice 'set_published slug anahtarı var = %', v_res ? 'slug';  -- t
--     -- tier change (geçerli) → 'business'; geçersiz → INVALID_TIER:
--     v_res := public.health_admin_set_tier(v_actor, v_pid, 'business');
--     raise notice 'tier=business = %', exists(select 1 from health.providers where id=v_pid and subscription_tier='business');  -- t
--     begin perform public.health_admin_set_tier(v_actor, v_pid, 'platinum');
--       raise notice 'BEKLENMEDİK: geçersiz tier geçti';
--     exception when others then raise notice 'OK geçersiz tier reddedildi: %', sqlerrm; end;  -- INVALID_TIER
--     -- detay license_file_path alanını döndürüyor mu (admin-only):
--     v_res := public.health_admin_get_provider_detail(v_pid, 'en');
--     raise notice 'detay licenseFilePath anahtarı var = %', v_res ? 'licenseFilePath';  -- t
--     -- olmayan provider → NOT_FOUND:
--     begin perform public.health_admin_decide_provider(v_actor, gen_random_uuid(), 'approve', null);
--       raise notice 'BEKLENMEDİK: olmayan provider onaylandı';
--     exception when others then raise notice 'OK NOT_FOUND: %', sqlerrm; end;  -- NOT_FOUND
--   end $$;
--   -- (4) metrics + audit-log + appointments RPC'leri çalışıyor (şekil dönüyor):
--   --   select public.health_admin_metrics(now()) ? 'weeklyBookings';   -- t
--   --   select jsonb_typeof(public.health_admin_audit_log(10,0,null));   -- array
--   --   select jsonb_typeof(public.health_admin_list_appointments('en',null,null,null,null,50,0)); -- array
--   -- (5) 066-078 DEĞİŞMEDİ kanıtı (örnek):
--   --   \df public.health_provider_get_own   → hâlâ var
--   --   select pg_get_constraintdef(oid) from pg_constraint
--   --     where conrelid='health.providers'::regclass and conname like '%verification_status%';
-- rollback;  -- HİÇBİR ŞEY KALICI DEĞİL; main session BEGIN/COMMIT ile tekrar uygular.
--
-- ROLLBACK (kalıcı uygulandıysa geri-al):
--   drop function if exists public.health_admin_list_pending(text,text);
--   drop function if exists public.health_admin_get_provider_detail(uuid,text);
--   drop function if exists public.health_admin_decide_provider(uuid,uuid,text,text);
--   drop function if exists public.health_admin_set_published(uuid,uuid,boolean);
--   drop function if exists public.health_admin_set_tier(uuid,uuid,text);
--   drop function if exists public.health_admin_list_appointments(text,text,uuid,timestamptz,timestamptz,int,int);
--   drop function if exists public.health_admin_audit_log(int,int,text);
--   drop function if exists public.health_admin_metrics(timestamptz);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) DOĞRULAMA KUYRUĞU: verification_status'a göre provider listesi. p_status
--    'pending' (varsayılan) / 'approved' / 'rejected' / 'all'. PII YOK — public-yüzlü
--    provider alanları + licenseFileSet boolean (gizli path ASLA). Çoklu-uzmanlık →
--    primaryCity = ilk lokasyon şehri (yoksa null). Döner array.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_admin_list_pending(
  p_locale text, p_status text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  v_status := lower(coalesce(nullif(btrim(p_status), ''), 'pending'));
  if v_status not in ('pending','approved','rejected','all') then
    v_status := 'pending';
  end if;

  return (
    select coalesce(jsonb_agg(obj order by obj->>'createdAt' desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id',                 p.id,
        'fullName',           p.full_name,
        'providerType',       p.provider_type,
        'title',              p.title,
        'slug',               p.slug,
        'licenseFileSet',     (p.license_file_path is not null),
        'verificationStatus', p.verification_status,
        'isPublished',        p.is_published,
        'subscriptionTier',   coalesce(p.subscription_tier, 'free'),
        'createdAt',          p.created_at,
        'specialties', (
          select coalesce(jsonb_agg(
            jsonb_build_object('slug', s.slug, 'name', s.names ->> p_locale)
            order by s.sort_order), '[]'::jsonb)
          from health.provider_specialties ps
          join health.specialties s on s.id = ps.specialty_id
          where ps.provider_id = p.id
        ),
        'primaryCity', (
          select l.city
          from health.provider_locations pl
          join health.locations l on l.id = pl.location_id
          where pl.provider_id = p.id
          order by l.created_at
          limit 1
        )
      ) as obj
      from health.providers p
      where (v_status = 'all' or p.verification_status = v_status)
    ) t
  );
end $$;
revoke all on function public.health_admin_list_pending(text,text)
  from public, anon, authenticated;
grant execute on function public.health_admin_list_pending(text,text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) PROVIDER DETAY: tam profil + uzmanlık + lokasyon + hizmet + haftalık takvim +
--    ayarlar + user_id + license_number + chamber + license_file_path (YALNIZ admin —
--    068/077 path'i ASLA döndürmez; H8 burada imzalı-download üretmek için ihtiyaç duyar).
--    Reddedilmişse audit_log'dan en son rejection reason'ı da döndürür.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_admin_get_provider_detail(
  p_provider_id uuid, p_locale text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'providerId',         p.id,
    'userId',             p.user_id,
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
    -- ADMIN-ONLY: gizli bucket path'i (imzalı-download için). ASLA loglanmaz.
    'licenseFilePath',    p.license_file_path,
    'verificationStatus', p.verification_status,
    'verifiedAt',         p.verified_at,
    'isPublished',        p.is_published,
    'subscriptionTier',   coalesce(p.subscription_tier, 'free'),
    'createdAt',          p.created_at,
    'rejectionReason', (
      select al.payload ->> 'reason'
      from health.audit_log al
      where al.target_table = 'providers'
        and al.target_id = p.id
        and al.action = 'admin_provider_reject'
      order by al.id desc
      limit 1
    ),
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
  where p.id = p_provider_id;
$$;
revoke all on function public.health_admin_get_provider_detail(uuid,text)
  from public, anon, authenticated;
grant execute on function public.health_admin_get_provider_detail(uuid,text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) KARAR: ONAYLA / REDDET. Yalnız 'pending' karar verilebilir (yoksa INVALID_DECISION;
--    olmayan provider → NOT_FOUND). approve → verification_status='approved',
--    is_published=true, verified_at=now() (provider CANLI olur). reject →
--    verification_status='rejected', is_published=false, reason audit_log payload'ında.
--    HER karar health.audit_log yazar (action admin_provider_approve|admin_provider_reject;
--    PII YOK — yalnız id'ler + reason). Döner {ok, userId, fullName} → action notify e-postası
--    için. (Tüm satır FOR UPDATE — eşzamanlı çift-karar serileşir.)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_admin_decide_provider(
  p_actor_id uuid, p_provider_id uuid, p_decision text, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prov   health.providers;
  v_reason text;
begin
  if p_decision not in ('approve','reject') then
    raise exception 'INVALID_DECISION';
  end if;

  select * into v_prov from health.providers where id = p_provider_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  -- Yalnız pending karar verilebilir (terminal durumlar — approved/rejected — kilitli).
  if v_prov.verification_status <> 'pending' then
    raise exception 'INVALID_DECISION';
  end if;

  if p_decision = 'approve' then
    update health.providers
       set verification_status = 'approved',
           is_published        = true,
           verified_at         = now()
     where id = v_prov.id;
    insert into health.audit_log (actor_id, action, target_table, target_id, payload)
    values (p_actor_id, 'admin_provider_approve', 'providers', v_prov.id,
            jsonb_build_object('from', v_prov.verification_status, 'to', 'approved',
                               'isPublished', true));
  else
    v_reason := nullif(btrim(coalesce(p_reason, '')), '');
    update health.providers
       set verification_status = 'rejected',
           is_published        = false
     where id = v_prov.id;
    insert into health.audit_log (actor_id, action, target_table, target_id, payload)
    values (p_actor_id, 'admin_provider_reject', 'providers', v_prov.id,
            jsonb_build_object('from', v_prov.verification_status, 'to', 'rejected',
                               'reason', v_reason));
  end if;

  return jsonb_build_object('ok', true, 'userId', v_prov.user_id,
                            'fullName', v_prov.full_name, 'slug', v_prov.slug);
end $$;
revoke all on function public.health_admin_decide_provider(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.health_admin_decide_provider(uuid,uuid,text,text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) YAYIN DURUMU: unpublish (is_published=false) / re-publish (true). Yalnız
--    approved provider yayınlanabilir (re-publish güvenliği — pending/rejected'ı
--    yayına almaz → INVALID_DECISION). NOT_FOUND yoksa. audit_log
--    (admin_provider_unpublish | admin_provider_publish). Döner {ok}.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_admin_set_published(
  p_actor_id uuid, p_provider_id uuid, p_published boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prov health.providers;
begin
  select * into v_prov from health.providers where id = p_provider_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  -- Re-publish yalnız approved provider için (pending/rejected yayına alınamaz).
  if p_published = true and v_prov.verification_status <> 'approved' then
    raise exception 'INVALID_DECISION';
  end if;

  update health.providers set is_published = p_published where id = v_prov.id;

  insert into health.audit_log (actor_id, action, target_table, target_id, payload)
  values (p_actor_id,
          case when p_published then 'admin_provider_publish' else 'admin_provider_unpublish' end,
          'providers', v_prov.id,
          jsonb_build_object('from', v_prov.is_published, 'to', p_published));

  return jsonb_build_object('ok', true, 'isPublished', p_published, 'slug', v_prov.slug);
end $$;
revoke all on function public.health_admin_set_published(uuid,uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.health_admin_set_published(uuid,uuid,boolean) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) TIER DEĞİŞİMİ: subscription_tier güncelle. 066'da CHECK yok → izin verilen küme
--    RPC İÇİNDE doğrulanır: free / premium / business (plan ile hizalı). Geçersiz →
--    INVALID_TIER. NOT_FOUND yoksa. audit_log (admin_provider_set_tier, payload {from,to}).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_admin_set_tier(
  p_actor_id uuid, p_provider_id uuid, p_tier text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prov health.providers;
  v_tier text;
begin
  v_tier := lower(btrim(coalesce(p_tier, '')));
  if v_tier not in ('free','premium','business') then
    raise exception 'INVALID_TIER';
  end if;

  select * into v_prov from health.providers where id = p_provider_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  update health.providers set subscription_tier = v_tier where id = v_prov.id;

  insert into health.audit_log (actor_id, action, target_table, target_id, payload)
  values (p_actor_id, 'admin_provider_set_tier', 'providers', v_prov.id,
          jsonb_build_object('from', coalesce(v_prov.subscription_tier, 'free'), 'to', v_tier));

  return jsonb_build_object('ok', true, 'tier', v_tier);
end $$;
revoke all on function public.health_admin_set_tier(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.health_admin_set_tier(uuid,uuid,text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) RANDEVU GÖRÜNÜMÜ: TÜM provider'lar (owner filtresi YOK — admin geneli). Filtreler:
--    p_status (confirmed/cancelled/completed/no_show | null=hepsi), p_provider_id (null=
--    hepsi), p_from/p_to (slot aralığı | null=sınırsız), p_limit/p_offset sayfalama.
--    Her satır 078 list ile aynı şekil: telefon DEFINER İÇİNDE çözülür + son-3 maskelenir;
--    e-posta ASLA döndürülmez. Provider adı (admin için kim olduğu) eklenir. Döner array
--    (slotStart desc). Ham PII definer'dan çıkmaz.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_admin_list_appointments(
  p_locale text,
  p_status text,
  p_provider_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_limit int,
  p_offset int
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key    text;
  v_limit  int;
  v_offset int;
  v_rows   jsonb;
begin
  v_limit  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset := greatest(coalesce(p_offset, 0), 0);
  v_key := (select decrypted_secret from vault.decrypted_secrets where name = 'health_pii_key');

  select coalesce(jsonb_agg(obj order by obj->>'slotStart' desc), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'appointmentId',      a.id,
      'manageToken',        a.manage_token,
      'status',             a.status,
      'slotStart',          lower(a.slot_range),
      'slotEnd',            upper(a.slot_range),
      'source',             a.source,
      'providerId',         a.provider_id,
      'providerName',       prov.full_name,
      'serviceName',        coalesce(sv.name ->> p_locale, sv.name ->> 'en', sv.name ->> 'me'),
      'serviceDurationMin', sv.duration_min,
      'locationLabel',      l.label,
      'locationCity',       l.city,
      'patientNote',        a.patient_note,
      'patientName',        pat.full_name,
      -- MASKE: yalnız son-3 hane (078 ile birebir). Ham telefon transient — ASLA seçilmez.
      'patientPhoneMasked', '•••' || right(extensions.pgp_sym_decrypt(pat.phone_enc, v_key), 3),
      'createdAt',          a.created_at
      -- E-POSTA: kasıtlı YOK.
    ) as obj
    from health.appointments a
    join health.providers prov on prov.id = a.provider_id
    join health.services  sv   on sv.id = a.service_id
    join health.locations l    on l.id = a.location_id
    join health.patients  pat  on pat.id = a.patient_id
    where (p_status is null or a.status = p_status)
      and (p_provider_id is null or a.provider_id = p_provider_id)
      and (p_from is null or upper(a.slot_range) >= p_from)
      and (p_to   is null or lower(a.slot_range) <  p_to)
    order by lower(a.slot_range) desc
    limit v_limit offset v_offset
  ) t;

  return v_rows;
end $$;
revoke all on function public.health_admin_list_appointments(text,text,uuid,timestamptz,timestamptz,int,int)
  from public, anon, authenticated;
grant execute on function public.health_admin_list_appointments(text,text,uuid,timestamptz,timestamptz,int,int)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) AUDIT LOG GÖRÜNTÜLEYİCİ: health.audit_log salt-okunur. {id, actorId, action,
--    targetTable, targetId, payload, at}. p_action opsiyonel filtre; p_limit/p_offset
--    sayfalama; at desc sıralı. PII YOK (audit_log zaten PII tutmaz — yalnız id'ler/kod).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_admin_audit_log(
  p_limit int, p_offset int, p_action text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit  int;
  v_offset int;
  v_action text;
begin
  v_limit  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset := greatest(coalesce(p_offset, 0), 0);
  v_action := nullif(btrim(coalesce(p_action, '')), '');

  return (
    select coalesce(jsonb_agg(obj order by (obj->>'id')::bigint desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id',          al.id,
        'actorId',     al.actor_id,
        'action',      al.action,
        'targetTable', al.target_table,
        'targetId',    al.target_id,
        'payload',     al.payload,
        'at',          al.at
      ) as obj
      from health.audit_log al
      where (v_action is null or al.action = v_action)
      order by al.id desc
      limit v_limit offset v_offset
    ) t
  );
end $$;
revoke all on function public.health_admin_audit_log(int,int,text)
  from public, anon, authenticated;
grant execute on function public.health_admin_audit_log(int,int,text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) METRİK KARTLARI ham girdileri: weeklyBookings (son 7g created randevu), noShow vs
--    completed sayıları (oran TS admin-metrics.ts'te guard'lı hesaplanır), waitlistCount
--    (health.provider_waitlist), pendingCount (bekleyen provider). Ağır slot matematiği
--    SQL'de DEĞİL — doluluk TS motorunda (occupancy.ts) kalır; bu RPC yalnız sayımlar.
--    p_now referans instant (test edilebilirlik + UTC pencere). Döner jsonb.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_admin_metrics(p_now timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'now',            p_now,
    -- son 7 gün (inclusive boundary): created_at >= now-7d.
    'weeklyBookings', (
      select count(*) from health.appointments a
      where a.created_at >= p_now - interval '7 days'
    ),
    -- no-show oranı girdileri: BİTMİŞ randevular (completed + no_show), son 30 gün.
    'noShowCount', (
      select count(*) from health.appointments a
      where a.status = 'no_show'
        and lower(a.slot_range) >= p_now - interval '30 days'
    ),
    'completedCount', (
      select count(*) from health.appointments a
      where a.status = 'completed'
        and lower(a.slot_range) >= p_now - interval '30 days'
    ),
    -- doluluk girdileri: gelecek 7 gün confirmed randevu sayısı (TS motoru kapasiteyi
    -- generateAvailability ile ayrıca hesaplar; bu yalnız booked sayımı).
    'confirmedNext7d', (
      select count(*) from health.appointments a
      where a.status = 'confirmed'
        and lower(a.slot_range) >= p_now
        and lower(a.slot_range) < p_now + interval '7 days'
    ),
    'waitlistCount',  (select count(*) from health.provider_waitlist),
    'pendingCount',   (
      select count(*) from health.providers p where p.verification_status = 'pending'
    ),
    'approvedCount',  (
      select count(*) from health.providers p where p.verification_status = 'approved'
    ),
    'publishedCount', (
      select count(*) from health.providers p
      where p.is_published = true and p.verification_status = 'approved'
    )
  );
$$;
revoke all on function public.health_admin_metrics(timestamptz)
  from public, anon, authenticated;
grant execute on function public.health_admin_metrics(timestamptz) to service_role;
