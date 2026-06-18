-- ═══════════════════════════════════════════════════════════════════════════
-- 080: H10 — veri-sahibi hakları (silme/dışa-aktarma talebi) + onay-kayıtları görünümü
-- ═══════════════════════════════════════════════════════════════════════════
-- H10 (docs/health/MASTER_PLAN.md §H10) uyum + sertleştirme pass'i. PDPL/AZLP veri-
-- sahibi hakları (15 günlük SLA) için: (1) hasta-yüzlü silme/dışa-aktarma TALEBİ
-- alımı (manage_token ile kimlik kanıtlı) + (2) admin KUYRUĞU (manuel ifa yeterli —
-- otomasyon GEREKMEZ) + (3) admin ONAY-KAYITLARI görünümü (hasta sağlık-veri onay
-- damgaları). Hiçbir hasta PII'si (telefon/e-posta/ad ham) talep kuyruğundan ÇIKMAZ;
-- export İÇERİĞİ admin tarafından bant-dışı manuel ifa edilir — kuyruk yalnız talebi
-- + SLA saatini izler.
--
-- ÖZNEL GÜVENLİK MODELİ (079 birebir, KRİTİK SAPMA NOTU):
--   * health.owns_provider() / public.is_admin() auth.uid()'i İÇERİDEN okur → service-role
--     çağrıda auth.uid() NULL + prod admin'leri profiles.role='user' → BURADA KULLANILAMAZ.
--     Bu yüzden bu RPC'ler profiles.role/is_admin() ÜZERİNE KAPI KOYMAZ. Admin RPC'lerinin
--     yetkisi = (a) EXECUTE yalnız service_role + (b) UYGULAMA katmanında isAdminEmail(
--     user.email) — çağıran server action/sayfa RPC'den ÖNCE kontrol eder (079 + glatko_admin_*
--     ile birebir aynı duruş). resolve RPC sunucu-DOĞRULANMIŞ p_actor_id alır (audit iz; yetki
--     kapısı DEĞİL).
--   * health_request_data_action HASTA-yüzlü ama admin-gated DEĞİL: kimlik kanıtı = appointment
--     manage_token (48-hex; appointment'ın tek kimlik bilgisi). RPC token→patient'i KENDİ çözer
--     (client patient_id'ye ASLA güvenmez). EXECUTE yine yalnız service_role (route service-role
--     client'la çağırır + middleware public-form rate-limit + flag guard).
--
-- GÜVENLİK DURUŞU (066-079 deseni): her fonksiyon SECURITY DEFINER + SET search_path='' ;
-- tüm health.*/extensions.* objeleri şema-qualified. EXECUTE yalnız service_role
-- (anon/authenticated/public ASLA). RAISE EXCEPTION '<CODE>' iş hataları → PostgREST
-- error.message == kod → lib/saglik kararlı union'a parse eder.
--
-- PII: onay görünümü + talep kuyruğu telefonu DEFINER İÇİNDE çözer + YALNIZ maskeli string
-- döndürür ('•••' || right(decrypt,3) — 078/079 ile birebir); e-posta ASLA döndürülmez; ham
-- telefon transient local. data_requests tablosu PII TUTMAZ (yalnız patient_id + tür + durum +
-- damgalar). audit_log payload'ı yalnız {type, patientId} — ham PII YOK.
--
-- ADDITIVE: health.* tabloları + 066-079 objelerine ALTER/DROP YOK. YALNIZ yeni
-- health.data_requests tablosu + yeni public RPC'ler. (065 İKİ dosya taşır
-- [065_admin_create_provider_phone_otp + 065_health_h0_provider_waitlist] → 080 sıradaki
-- serbest numara, çakışma yok.)
--
-- ───────────────────────── DRY-RUN PLANI (prod-safe; MAIN session uygular) ──────────────
-- begin;
--   -- (1) Bu dosyanın CREATE TABLE + tüm CREATE FUNCTION bloklarını bu tx içinde yükle.
--   -- (2) EXECUTE yalnız service_role'a verildi mi? (anon/authenticated/public ASLA):
--   --   select p.proname, r.rolname
--   --   from pg_proc p
--   --   join pg_namespace n on n.oid = p.pronamespace
--   --   cross join lateral aclexplode(p.proacl) a
--   --   join pg_roles r on r.oid = a.grantee
--   --   where n.nspname='public'
--   --     and p.proname in ('health_request_data_action','health_admin_list_data_requests',
--   --                       'health_admin_resolve_data_request','health_admin_list_consents')
--   --     and a.privilege_type='EXECUTE';
--   --   -- her satırda rolname='service_role' BEKLENİR; anon/authenticated/public ÇIKMAMALI.
--   -- (3) Throwaway hasta + appointment üzerinde talep→listele→çöz akışı (veri yazıp ROLLBACK):
--   do $$
--   declare
--     v_key text := (select decrypted_secret from vault.decrypted_secrets where name='health_pii_key');
--     v_pid uuid; v_tok text := encode(extensions.gen_random_bytes(24),'hex');
--     v_actor uuid := extensions.gen_random_uuid();
--     v_prov uuid; v_svc uuid; v_loc uuid; v_aid uuid;
--     v_res jsonb; v_audit_before bigint; v_audit_after bigint; v_req_id uuid;
--   begin
--     -- minimal hasta (şifreli telefon — onay damgalı):
--     insert into health.patients (full_name, phone_enc, phone_hash, consent_health_data_at, consent_marketing_at)
--     values ('Talep Hasta', extensions.pgp_sym_encrypt('+38267000111', v_key), 'hash-throwaway', now(), null)
--     returning id into v_pid;
--     -- talep alımı için bir appointment lazım (manage_token→patient). Mevcut bir provider/service/
--     -- location FK'sını kullan (yoksa bu blok atlanır — şema-only doğrulama yine geçer):
--     select id into v_prov from health.providers limit 1;
--     if v_prov is not null then
--       select id into v_svc from health.services where provider_id=v_prov limit 1;
--       select location_id into v_loc from health.provider_locations where provider_id=v_prov limit 1;
--       if v_svc is not null and v_loc is not null then
--         insert into health.appointments (provider_id, service_id, location_id, patient_id, slot_range, manage_token, status, source)
--         values (v_prov, v_svc, v_loc, v_pid,
--                 tstzrange(now()+interval '2 days', now()+interval '2 days 30 min'),
--                 v_tok, 'confirmed', 'web')
--         returning id into v_aid;
--         -- TALEP: delete → data_requests'e satır + audit (PII YOK):
--         select count(*) into v_audit_before from health.audit_log where action='patient_data_request';
--         v_res := public.health_request_data_action(v_tok, 'delete');
--         raise notice 'request ok = %', v_res->>'ok';  -- true
--         select count(*) into v_audit_after from health.audit_log where action='patient_data_request';
--         raise notice 'audit +1 = %', (v_audit_after = v_audit_before + 1);  -- t
--         raise notice 'audit payloadında ham PII YOK = %', (
--           select (payload ? 'patientId') and (payload ? 'type') and not (payload ? 'phone') and not (payload ? 'email')
--           from health.audit_log where action='patient_data_request' order by id desc limit 1);  -- t
--         -- geçersiz tür → INVALID_TYPE:
--         begin perform public.health_request_data_action(v_tok, 'wipe');
--           raise notice 'BEKLENMEDİK: geçersiz tür geçti';
--         exception when others then raise notice 'OK INVALID_TYPE: %', sqlerrm; end;
--         -- olmayan token → NOT_FOUND:
--         begin perform public.health_request_data_action(encode(extensions.gen_random_bytes(24),'hex'), 'export');
--           raise notice 'BEKLENMEDİK: olmayan token geçti';
--         exception when others then raise notice 'OK NOT_FOUND: %', sqlerrm; end;
--         -- KUYRUK: pending listede maskeli telefon + e-posta YOK:
--         v_res := public.health_admin_list_data_requests('pending', 50, 0);
--         select (e->>'id')::uuid into v_req_id
--           from jsonb_array_elements(v_res) e where (e->>'patientId')::uuid = v_pid limit 1;
--         raise notice 'kuyrukta görünür = %', v_req_id is not null;  -- t
--         raise notice 'maskeli telefon (•••) = %', (
--           select (e->>'patientPhoneMasked') like '•••%' and not (e ? 'email') and not (e ? 'phone')
--           from jsonb_array_elements(v_res) e where (e->>'id')::uuid = v_req_id limit 1);  -- t
--         -- ÇÖZ: fulfilled → resolved_at/by + audit:
--         v_res := public.health_admin_resolve_data_request(v_actor, v_req_id, 'fulfilled');
--         raise notice 'resolve ok = %', v_res->>'ok';  -- true
--         raise notice 'fulfilled+resolved_at = %', exists(
--           select 1 from health.data_requests where id=v_req_id and status='fulfilled' and resolved_at is not null and resolved_by=v_actor);  -- t
--         -- geçersiz durum → INVALID_STATUS; olmayan talep → NOT_FOUND:
--         begin perform public.health_admin_resolve_data_request(v_actor, v_req_id, 'banana');
--           raise notice 'BEKLENMEDİK: geçersiz durum geçti';
--         exception when others then raise notice 'OK INVALID_STATUS: %', sqlerrm; end;
--       end if;
--     end if;
--     -- ONAY GÖRÜNÜMÜ: hasta onay damgaları + maskeli telefon, e-posta YOK:
--     v_res := public.health_admin_list_consents(50, 0);
--     raise notice 'consents array = %', jsonb_typeof(v_res);  -- array
--     raise notice 'consent satırında maske + e-posta YOK = %', (
--       select bool_and((e->>'patientPhoneMasked') like '•••%') and bool_and(not (e ? 'email'))
--       from jsonb_array_elements(v_res) e);  -- t (en az throwaway hasta var)
--   end $$;
--   -- (4) 066-079 DEĞİŞMEDİ kanıtı (örnek): \df public.health_admin_metrics  → hâlâ var
-- rollback;  -- HİÇBİR ŞEY KALICI DEĞİL; main session BEGIN/COMMIT ile tekrar uygular.
--
-- ROLLBACK (kalıcı uygulandıysa geri-al):
--   drop function if exists public.health_request_data_action(text,text);
--   drop function if exists public.health_admin_list_data_requests(text,int,int);
--   drop function if exists public.health_admin_resolve_data_request(uuid,uuid,text);
--   drop function if exists public.health_admin_list_consents(int,int);
--   drop table if exists health.data_requests;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) TABLO: health.data_requests — veri-sahibi silme/dışa-aktarma talepleri.
--    PII TUTMAZ (yalnız patient_id FK + tür + durum + damgalar + opsiyonel admin notu).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists health.data_requests (
  id           uuid primary key default extensions.gen_random_uuid(),
  patient_id   uuid not null references health.patients(id),
  request_type text not null check (request_type in ('delete','export')),
  status       text not null default 'pending' check (status in ('pending','fulfilled','rejected')),
  requested_at timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid,
  note         text
);
create index if not exists health_data_requests_status_idx
  on health.data_requests (status, requested_at);
create index if not exists health_data_requests_patient_idx
  on health.data_requests (patient_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) TALEP ALIMI (hasta-yüzlü; manage_token kimlik kanıtı). p_manage_token →
--    appointment → patient_id (RPC KENDİ çözer; client patient_id'ye güvenmez).
--    p_type 'delete'|'export' (yoksa INVALID_TYPE). Olmayan token → NOT_FOUND.
--    data_requests'e satır ekler + health.audit_log yazar (action='patient_data_request',
--    payload YALNIZ {type, patientId} — ham PII YOK). Döner {ok, requestId}.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_request_data_action(
  p_manage_token text, p_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type    text;
  v_patient uuid;
  v_req_id  uuid;
begin
  v_type := lower(btrim(coalesce(p_type, '')));
  if v_type not in ('delete','export') then
    raise exception 'INVALID_TYPE';
  end if;

  -- Token → patient (appointment'ın tek kimlik bilgisi). Client patient_id ASLA güvenilmez.
  select a.patient_id into v_patient
  from health.appointments a
  where a.manage_token = p_manage_token;
  if v_patient is null then
    raise exception 'NOT_FOUND';
  end if;

  insert into health.data_requests (patient_id, request_type)
  values (v_patient, v_type)
  returning id into v_req_id;

  -- Audit — PII YOK (yalnız id'ler + tür).
  insert into health.audit_log (actor_id, action, target_table, target_id, payload)
  values (null, 'patient_data_request', 'data_requests', v_req_id,
          jsonb_build_object('type', v_type, 'patientId', v_patient));

  return jsonb_build_object('ok', true, 'requestId', v_req_id);
end $$;
revoke all on function public.health_request_data_action(text,text)
  from public, anon, authenticated;
grant execute on function public.health_request_data_action(text,text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) ADMIN KUYRUK: veri-sahibi talepleri. p_status 'pending'(varsayılan)/'fulfilled'/
--    'rejected'/'all'. Her satır: id, patientId, type, status, requested_at, resolved_at,
--    maskeli telefon ('•••'||son-3 — 078/079 ile birebir) + maskeli ad (baş harf + '•••').
--    E-POSTA + ham telefon ASLA. Döner array (requested_at desc).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_admin_list_data_requests(
  p_status text, p_limit int, p_offset int
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_limit  int;
  v_offset int;
  v_key    text;
begin
  v_status := lower(coalesce(nullif(btrim(p_status), ''), 'pending'));
  if v_status not in ('pending','fulfilled','rejected','all') then
    v_status := 'pending';
  end if;
  v_limit  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset := greatest(coalesce(p_offset, 0), 0);
  v_key := (select decrypted_secret from vault.decrypted_secrets where name = 'health_pii_key');

  return (
    select coalesce(jsonb_agg(obj order by obj->>'requestedAt' desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id',           dr.id,
        'patientId',    dr.patient_id,
        'type',         dr.request_type,
        'status',       dr.status,
        'requestedAt',  dr.requested_at,
        'resolvedAt',   dr.resolved_at,
        -- MASKE: yalnız son-3 hane (078/079 ile birebir). Ham telefon transient — ASLA seçilmez.
        'patientPhoneMasked', '•••' || right(extensions.pgp_sym_decrypt(pat.phone_enc, v_key), 3),
        -- MASKE: yalnız ilk harf (ad/soyad ham döndürülmez).
        'patientNameMasked',  left(coalesce(pat.full_name, '?'), 1) || '•••'
        -- E-POSTA: kasıtlı YOK.
      ) as obj
      from health.data_requests dr
      join health.patients pat on pat.id = dr.patient_id
      where (v_status = 'all' or dr.status = v_status)
      order by dr.requested_at desc
      limit v_limit offset v_offset
    ) t
  );
end $$;
revoke all on function public.health_admin_list_data_requests(text,int,int)
  from public, anon, authenticated;
grant execute on function public.health_admin_list_data_requests(text,int,int) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) ADMIN ÇÖZ: talebi fulfilled/rejected işaretle (manuel ifa yeterli — otomasyon
--    GEREKMEZ). p_status 'fulfilled'|'rejected' (yoksa INVALID_STATUS). Olmayan talep →
--    NOT_FOUND. Yalnız 'pending' çözülebilir (yoksa INVALID_STATUS — çift-çözüm kilitli).
--    resolved_at=now() + resolved_by=p_actor_id (sunucu-doğrulanmış admin) + audit. Döner {ok}.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_admin_resolve_data_request(
  p_actor_id uuid, p_request_id uuid, p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req    health.data_requests;
  v_status text;
begin
  v_status := lower(btrim(coalesce(p_status, '')));
  if v_status not in ('fulfilled','rejected') then
    raise exception 'INVALID_STATUS';
  end if;

  select * into v_req from health.data_requests where id = p_request_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'INVALID_STATUS';
  end if;

  update health.data_requests
     set status = v_status, resolved_at = now(), resolved_by = p_actor_id
   where id = v_req.id;

  insert into health.audit_log (actor_id, action, target_table, target_id, payload)
  values (p_actor_id, 'admin_data_request_resolve', 'data_requests', v_req.id,
          jsonb_build_object('type', v_req.request_type, 'from', 'pending', 'to', v_status));

  return jsonb_build_object('ok', true, 'status', v_status);
end $$;
revoke all on function public.health_admin_resolve_data_request(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.health_admin_resolve_data_request(uuid,uuid,text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) ADMIN ONAY-KAYITLARI GÖRÜNÜMÜ: hasta sağlık-veri onay damgaları (PDPL ispat).
--    Her satır: id, maskeli telefon ('•••'||son-3), maskeli ad (baş harf), consentHealthAt,
--    consentMarketingAt, createdAt. E-POSTA + ham telefon ASLA. Döner array (createdAt desc).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_admin_list_consents(
  p_limit int, p_offset int
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
  v_key    text;
begin
  v_limit  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset := greatest(coalesce(p_offset, 0), 0);
  v_key := (select decrypted_secret from vault.decrypted_secrets where name = 'health_pii_key');

  return (
    select coalesce(jsonb_agg(obj order by obj->>'createdAt' desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id',                pat.id,
        'patientPhoneMasked','•••' || right(extensions.pgp_sym_decrypt(pat.phone_enc, v_key), 3),
        'patientNameMasked', left(coalesce(pat.full_name, '?'), 1) || '•••',
        'consentHealthAt',    pat.consent_health_data_at,
        'consentMarketingAt', pat.consent_marketing_at,
        'createdAt',          pat.created_at
        -- E-POSTA: kasıtlı YOK.
      ) as obj
      from health.patients pat
      order by pat.created_at desc
      limit v_limit offset v_offset
    ) t
  );
end $$;
revoke all on function public.health_admin_list_consents(int,int)
  from public, anon, authenticated;
grant execute on function public.health_admin_list_consents(int,int) to service_role;
