-- ═══════════════════════════════════════════════════════════════════════════
-- 078: H7b — provider GÜNLÜK operasyon RPC'leri (randevu yönetimi + manuel kayıt)
-- ═══════════════════════════════════════════════════════════════════════════
-- H7a (077) onboarding/profil/takvim KURDU; H7b doktorun GÜNÜNÜ yönetmesini sağlar:
-- dashboard (bugün+yarın + doluluk girdileri), kendi randevu listesi (ad + MASKELİ tel),
-- durum aksiyonları (completed/no_show/cancel→hasta 'cancelled' bildirimi + pending t24/t2
-- skip), schedule_override CRUD (tatil/mola/ekstra) ve telefonla gelen hasta için MANUEL
-- rezervasyon (provider-vouched hasta + book, OTP YOK — provider güvenilir aktör).
--
-- ÖZNEL GÜVENLİK MODELİ (077 birebir): health.owns_provider() auth.uid() okur → service-role
-- çağrıda NULL olduğu için KULLANILAMAZ. Her RPC sunucu-DOĞRULANMIŞ p_user_id alır (cookie-auth
-- user.id; client veremez); v_pid := (select id from health.providers where user_id=p_user_id);
-- yoksa RAISE 'NOT_A_PROVIDER'. Çocuk-satır (appointment/override) mutasyonları, hedef satırın
-- provider_id = v_pid olduğunu mutasyondan ÖNCE doğrular (yoksa APPOINTMENT_NOT_OWNED/NOT_OWNER).
--
-- PII (RLS §2.2 'ad + maskeli tel'): list/dashboard RPC'leri telefonu DEFINER İÇİNDE çözer ve
-- YALNIZ maskeli string döndürür (son-3 hane: '•••' || right(decrypt,3)). Ham telefon yalnız
-- definer içinde transient local; ASLA seçilmez/loglanmaz/Sentry'ye gitmez. E-posta provider'a
-- HİÇ döndürülmez (maskeli bile). Manuel-book RPC'si telefonu INPUT alır (provider yazdı) ve
-- şifreler; almadığı PII'yi döndürmez.
--
-- GÜVENLİK DURUŞU (066-077 deseni): her fonksiyon SECURITY DEFINER + SET search_path='' ;
-- tüm health.*/extensions.*/vault.* objeleri şema-qualified. EXECUTE yalnız service_role
-- (anon/authenticated ASLA). RAISE EXCEPTION '<CODE>' iş hataları → PostgREST error.message ==
-- kod → lib/saglik/provider.ts stable union'a parse eder.
--
-- ADDITIVE: health.* tabloları + 066-077 objelerine ALTER/DROP YOK. Şema mutasyonu YOK
-- (source CHECK zaten 'web','admin','provider' içeriyor; audit_log/schedule_overrides/patients
-- kolonları zaten var — prod'da doğrulandı). YALNIZ yeni public RPC'ler.
--
-- 066 appointments_guard_provider_update trigger'ı yalnız non-service_role için kilitli alanları
-- engeller; bu definer'lar service_role olarak koştuğu için BYPASS eder → RPC'ler durum
-- güncellemesinde provider/service/location/patient/slot/source/manage_token alanlarını KENDİ
-- ELLERİYLE değiştirmeyerek trigger'ın niyetini onurlandırır (yalnız status + cancel alanları).
--
-- ───────────────────────── DRY-RUN PLANI (prod-safe; MAIN session uygular) ──────────────────
-- begin;
--   -- (1) Bu dosyanın tüm CREATE FUNCTION bloklarını bu tx içinde yükle.
--   -- (2) İki sahte kullanıcı A/B; A'ya provider+service+location+confirmed appt:
--   do $$
--   declare
--     v_a uuid := gen_random_uuid(); v_b uuid := gen_random_uuid();
--     v_pid uuid; v_loc uuid; v_svc uuid; v_pat uuid; v_appt uuid;
--     v_key text; v_res jsonb; v_masked text;
--   begin
--     v_key := (select decrypted_secret from vault.decrypted_secrets where name='health_pii_key');
--     -- A için provider (077 RPC'siyle):
--     perform public.health_provider_upsert_profile(v_a,'doctor','Dr A','GP',
--       '{"en":"bio"}'::jsonb, null, array['en'], array[]::text[]);
--     select id into v_pid from health.providers where user_id=v_a;
--     update health.providers set is_published=true, verification_status='approved' where id=v_pid;
--     perform public.health_provider_upsert_location(v_a,null,'Klinika','Adresa 1','Podgorica',42.44,19.26);
--     select location_id into v_loc from health.provider_locations where provider_id=v_pid limit 1;
--     perform public.health_provider_upsert_service(v_a,null,'{"en":"Konsultacija"}'::jsonb,30,20,'in_person',true);
--     select id into v_svc from health.services where provider_id=v_pid limit 1;
--     -- manuel-book (provider-vouched) → patient + appointment source='provider' + reminders:
--     v_res := public.health_provider_manual_book(
--       v_a, v_svc, v_loc,
--       (now() + interval '2 days')::timestamptz, (now() + interval '2 days' + interval '30 min')::timestamptz,
--       'Marko Markovic', '+38267123456', 'deadbeef', null, 'telefonla');
--     raise notice 'manual_book appointmentId set = %', (v_res->>'appointmentId') is not null;  -- t
--     v_appt := (v_res->>'appointmentId')::uuid;
--     raise notice 'source=provider = %', exists(select 1 from health.appointments where id=v_appt and source='provider');  -- t
--     raise notice 'patient row created = %', exists(select 1 from health.patients where phone_hash='deadbeef');  -- t
--     raise notice 'reminders seeded (>=3) = %', (select count(*) from health.reminders_outbox where appointment_id=v_appt) >= 3;  -- t
--     -- (3) Çift-book → SLOT_TAKEN:
--     begin
--       perform public.health_provider_manual_book(v_a, v_svc, v_loc,
--         (now()+interval '2 days')::timestamptz,(now()+interval '2 days'+interval '30 min')::timestamptz,
--         'Ana Anic','+38267999999','cafef00d',null,null);
--       raise notice 'BEKLENMEDİK: çift-book geçti';
--     exception when others then raise notice 'OK çift-book reddedildi: %', sqlerrm; end;  -- SLOT_TAKEN
--     -- (4) list RPC MASKELİ tel döndürür (son-3 — TAM tel ASLA loglanmaz):
--     v_res := public.health_provider_list_appointments(v_a,'en','all',null);
--     v_masked := v_res->0->>'patientPhoneMasked';
--     raise notice 'masked tail-3 = %', right(v_masked,3);                       -- 456 (yalnız son-3)
--     raise notice 'masked starts redacted = %', left(v_masked,3) = chr(8226)||chr(8226)||chr(8226);  -- t
--     raise notice 'email NOT in list = %', not (v_res->0 ? 'patientEmail');      -- t
--     -- (5) B (sahip değil) izolasyon:
--     begin perform public.health_provider_list_appointments(v_b,'en','all',null);
--       raise notice 'BEKLENMEDİK: B listeledi';
--     exception when others then raise notice 'OK B list reddedildi: %', sqlerrm; end;  -- NOT_A_PROVIDER
--     begin perform public.health_provider_set_appointment_status(v_b,v_appt,'completed',null);
--       raise notice 'BEKLENMEDİK: B durum değiştirdi';
--     exception when others then raise notice 'OK B status reddedildi: %', sqlerrm; end;  -- NOT_A_PROVIDER
--     -- B'ye provider ver, sonra A'nın appt'ine dokunsun → APPOINTMENT_NOT_OWNED:
--     perform public.health_provider_upsert_profile(v_b,'doctor','Dr B',null,'{}'::jsonb,null,array['en'],array[]::text[]);
--     begin perform public.health_provider_set_appointment_status(v_b,v_appt,'completed',null);
--       raise notice 'BEKLENMEDİK: B (provider) A appt değiştirdi';
--     exception when others then raise notice 'OK B(provider) status reddedildi: %', sqlerrm; end;  -- APPOINTMENT_NOT_OWNED
--     -- (6) status confirmed→completed (idempotent), sonra completed→cancel reddi:
--     v_res := public.health_provider_set_appointment_status(v_a,v_appt,'completed',null);
--     raise notice 'completed ok = %', v_res->>'status';                          -- completed
--     v_res := public.health_provider_set_appointment_status(v_a,v_appt,'completed',null);  -- idempotent
--     raise notice 'idempotent completed = %', v_res->>'status';                  -- completed
--     begin perform public.health_provider_set_appointment_status(v_a,v_appt,'cancelled','x');
--       raise notice 'BEKLENMEDİK: completed→cancel geçti';
--     exception when others then raise notice 'OK completed→cancel reddedildi: %', sqlerrm; end;  -- INVALID_STATUS
--     -- (7) override CRUD owner-check:
--     v_res := public.health_provider_upsert_override(v_a,null,(now()+interval '5 days')::date,'holiday',null,null);
--     raise notice 'override created = %', (v_res->>'overrideId') is not null;     -- t
--     begin perform public.health_provider_upsert_override(v_b,(v_res->>'overrideId')::uuid,(now())::date,'holiday',null,null);
--       raise notice 'BEKLENMEDİK: B override güncelledi';
--     exception when others then raise notice 'OK B override reddedildi: %', sqlerrm; end;  -- NOT_OWNER
--   end $$;
--   -- (8) 066-077 DEĞİŞMEDİ kanıtı:
--   --   \df health.book_appointment           → hâlâ 3-arg (uuid,uuid,text)
--   --   \df public.health_book_appointment    → hâlâ 5-arg
--   --   select pg_get_constraintdef(oid) from pg_constraint
--   --     where conrelid='health.appointments'::regclass and conname like '%source%';  → 'web','admin','provider'
-- rollback;  -- HİÇBİR ŞEY KALICI DEĞİL; main session BEGIN/COMMIT ile tekrar uygular.
--
-- ROLLBACK (kalıcı uygulandıysa geri-al):
--   drop function if exists public.health_provider_list_appointments(uuid,text,text,text);
--   drop function if exists public.health_provider_dashboard(uuid,timestamptz,timestamptz,text);
--   drop function if exists public.health_provider_set_appointment_status(uuid,uuid,text,text);
--   drop function if exists public.health_provider_manual_book(uuid,uuid,uuid,timestamptz,timestamptz,text,text,text,text,text);
--   drop function if exists public.health_provider_list_overrides(uuid);
--   drop function if exists public.health_provider_upsert_override(uuid,uuid,date,text,time,time);
--   drop function if exists public.health_provider_delete_override(uuid,uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- yardımcı: telefonu DEFINER İÇİNDE çöz + maskele (yalnız son-3 hane görünür).
--   v_masked := '•••' || right(<cleartext>, 3). Ham telefon ASLA dışarı çıkmaz.
--   Bu mantık list + dashboard RPC'lerinde tekrarlanır; TS aynası lib/saglik/occupancy.ts
--   maskPhone() ile unit-test edilir.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) LİSTE: çağıranın KENDİ randevuları (v_pid filtresi). p_scope upcoming/past/all;
--    p_status opsiyonel (confirmed/completed/cancelled/no_show veya null=hepsi).
--    Her satır: {appointmentId, manageToken, status, slotStart, slotEnd, source,
--    serviceName(yerelleştirilmiş), locationLabel/City, patientName, patientPhoneMasked}.
--    Telefon DEFINER İÇİNDE çözülür + son-3 maskelenir; e-posta ASLA döndürülmez.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_provider_list_appointments(
  p_user_id uuid, p_locale text, p_scope text, p_status text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pid uuid;
  v_key text;
  v_rows jsonb;
begin
  select id into v_pid from health.providers where user_id = p_user_id;
  if v_pid is null then
    raise exception 'NOT_A_PROVIDER';
  end if;
  v_key := (select decrypted_secret from vault.decrypted_secrets where name = 'health_pii_key');

  select coalesce(jsonb_agg(obj order by obj->>'slotStart' desc), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'appointmentId',     a.id,
      'manageToken',       a.manage_token,
      'status',            a.status,
      'slotStart',         lower(a.slot_range),
      'slotEnd',           upper(a.slot_range),
      'source',            a.source,
      -- serviceName: locale → en → me → HERHANGİ kalan dil → '' (TS lib/saglik tarafındaki
      -- s.name[l] ?? en ?? me ?? Object.values(s.name)[0] ?? '' fallback'ını birebir aynalar;
      -- yalnız off-list bir dilde (örn. {"de":...}) adlandırılmış hizmet boş HÜCRE göstermesin).
      'serviceName',       coalesce(
                             sv.name ->> p_locale, sv.name ->> 'en', sv.name ->> 'me',
                             (select v from jsonb_each_text(sv.name) as e(k, v) limit 1), ''),
      'serviceDurationMin', sv.duration_min,
      'locationLabel',     l.label,
      'locationCity',      l.city,
      'patientNote',       a.patient_note,
      'patientName',       pat.full_name,
      -- MASKE: yalnız son-3 hane. Ham çözülmüş telefon transient — ASLA seçilmez.
      'patientPhoneMasked',
        '•••' || right(extensions.pgp_sym_decrypt(pat.phone_enc, v_key), 3)
      -- E-POSTA: kasıtlı YOK (RLS §2.2 'ad + maskeli tel' only).
    ) as obj
    from health.appointments a
    join health.services  sv on sv.id = a.service_id
    join health.locations l   on l.id = a.location_id
    join health.patients  pat on pat.id = a.patient_id
    where a.provider_id = v_pid
      and (p_status is null or a.status = p_status)
      and (
        p_scope = 'all'
        or (p_scope = 'upcoming' and upper(a.slot_range) >= now())
        or (p_scope = 'past'     and upper(a.slot_range) <  now())
      )
  ) t;

  return v_rows;
end $$;
revoke all on function public.health_provider_list_appointments(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.health_provider_list_appointments(uuid,text,text,text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) DASHBOARD: TEK çağrıda (N+1 yok) {appointments:[pencere içi randevular, maskeli
--    tel — list RPC ile aynı kural], availabilityInputs:{settings, schedules(TÜM kendi
--    lokasyonları), overrides, busy, holds}}. availabilityInputs ŞEKLİ 069 ile birebir
--    → saf generateAvailability() sayfada server-side koşar (doluluk hesabı). p_from/p_to
--    pencere instant'ları (rpc-geniş; ±1 gün çağıran tarafında verilir).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_provider_dashboard(
  p_user_id uuid, p_from timestamptz, p_to timestamptz, p_locale text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pid uuid;
  v_key text;
  v_dur int;
begin
  select id into v_pid from health.providers where user_id = p_user_id;
  if v_pid is null then
    raise exception 'NOT_A_PROVIDER';
  end if;
  v_key := (select decrypted_secret from vault.decrypted_secrets where name = 'health_pii_key');
  -- Doluluk motoru için temsili süre = en kısa AKTİF hizmet (kart "grid" ile tutarlı).
  select min(duration_min) into v_dur from health.services
   where provider_id = v_pid and is_active = true;

  return jsonb_build_object(
    'appointments', (
      select coalesce(jsonb_agg(obj order by obj->>'slotStart'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'appointmentId',     a.id,
          'manageToken',       a.manage_token,
          'status',            a.status,
          'slotStart',         lower(a.slot_range),
          'slotEnd',           upper(a.slot_range),
          'source',            a.source,
          -- serviceName: list RPC ile aynı locale→en→me→herhangi-kalan→'' zinciri (boş hücre yok).
          'serviceName',       coalesce(
                                 sv.name ->> p_locale, sv.name ->> 'en', sv.name ->> 'me',
                                 (select v from jsonb_each_text(sv.name) as e(k, v) limit 1), ''),
          'serviceDurationMin', sv.duration_min,
          'locationLabel',     l.label,
          'locationCity',      l.city,
          'patientNote',       a.patient_note,
          'patientName',       pat.full_name,
          'patientPhoneMasked',
            '•••' || right(extensions.pgp_sym_decrypt(pat.phone_enc, v_key), 3)
        ) as obj
        from health.appointments a
        join health.services  sv on sv.id = a.service_id
        join health.locations l   on l.id = a.location_id
        join health.patients  pat on pat.id = a.patient_id
        where a.provider_id = v_pid
          and a.status = 'confirmed'
          and a.slot_range && tstzrange(p_from, p_to)
      ) t
    ),
    'availabilityInputs', jsonb_build_object(
      'serviceDurationMin', coalesce(v_dur, 0),
      -- settings yoksa 069 ile aynı default'lar (LEFT JOIN + coalesce; satır olmasa da
      -- jsonb_build_object her zaman üretilir — 069'daki coalesce default'larıyla birebir).
      'settings', (
        select jsonb_build_object(
          'bufferMin',    coalesce(st.buffer_min, 0),
          'minNoticeMin', coalesce(st.min_notice_min, 120),
          'horizonDays',  coalesce(st.horizon_days, 60),
          'dailyCap',     st.daily_cap,
          'slotGridMin',  coalesce(st.slot_grid_min, 15)
        )
        from (select v_pid as pid) base
        left join health.provider_settings st on st.provider_id = base.pid
      ),
      -- TÜM kendi lokasyonlarının schedule'ları (dashboard provider-geneli doluluk).
      'schedules', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'weekday',    s.weekday,
          'startTime',  s.start_time,
          'endTime',    s.end_time,
          'validFrom',  s.valid_from,
          'validUntil', s.valid_until
        ) order by s.weekday, s.start_time), '[]'::jsonb)
        from health.schedules s
        where s.provider_id = v_pid
          and (s.valid_from  is null or s.valid_from  <= (p_to   at time zone 'Europe/Podgorica')::date)
          and (s.valid_until is null or s.valid_until >= (p_from at time zone 'Europe/Podgorica')::date)
      ),
      'overrides', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'date', o.date, 'startTime', o.start_time, 'endTime', o.end_time, 'kind', o.kind
        ) order by o.date), '[]'::jsonb)
        from health.schedule_overrides o
        where o.provider_id = v_pid
          and o.date between (p_from at time zone 'Europe/Podgorica')::date - 1
                         and (p_to   at time zone 'Europe/Podgorica')::date + 1
      ),
      'busy', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'start', lower(a.slot_range), 'end', upper(a.slot_range)
        ) order by lower(a.slot_range)), '[]'::jsonb)
        from health.appointments a
        where a.provider_id = v_pid and a.status = 'confirmed'
          and a.slot_range && tstzrange(p_from, p_to)
      ),
      'holds', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'start', lower(h.slot_range), 'end', upper(h.slot_range)
        ) order by lower(h.slot_range)), '[]'::jsonb)
        from health.slot_holds h
        where h.provider_id = v_pid and h.expires_at > now()
          and h.slot_range && tstzrange(p_from, p_to)
      )
    )
  );
end $$;
revoke all on function public.health_provider_dashboard(uuid,timestamptz,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.health_provider_dashboard(uuid,timestamptz,timestamptz,text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) DURUM AKSİYONU: completed/no_show/cancelled. v_pid lookup (NOT_A_PROVIDER) →
--    appointment FOR UPDATE (NOT_FOUND) → a.provider_id=v_pid (APPOINTMENT_NOT_OWNED) →
--    yalnız 'confirmed' completed/no_show/cancelled'a geçebilir (yoksa INVALID_STATUS;
--    zaten hedefte ise idempotent no-op). cancel: status='cancelled' + cancelled_at +
--    cancel_reason; pending t24/t2 'skipped' (071 cancel ile aynı). HER aksiyon audit_log
--    yazar (PII YOK — yalnız id'ler + reason + old/new status). Döner {ok,status,manageToken}
--    (manageToken H6 cancelled enqueue için). Kilitli alanlara (provider/service/location/
--    patient/slot/source/manage_token) DOKUNMAZ → 066 trigger niyetini onurlandırır.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_provider_set_appointment_status(
  p_user_id uuid, p_appointment_id uuid, p_status text, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pid    uuid;
  v_appt   health.appointments;
  v_reason text;
begin
  if p_status not in ('completed','no_show','cancelled') then
    raise exception 'INVALID_STATUS';
  end if;

  select id into v_pid from health.providers where user_id = p_user_id;
  if v_pid is null then
    raise exception 'NOT_A_PROVIDER';
  end if;

  select * into v_appt from health.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_appt.provider_id <> v_pid then
    raise exception 'APPOINTMENT_NOT_OWNED';
  end if;

  -- Idempotent: zaten hedef durumda → no-op (manage_token ile döner).
  if v_appt.status = p_status then
    return jsonb_build_object('ok', true, 'status', v_appt.status, 'manageToken', v_appt.manage_token);
  end if;
  -- Yalnız confirmed'dan geçiş (terminal durumlar kilitli).
  if v_appt.status <> 'confirmed' then
    raise exception 'INVALID_STATUS';
  end if;

  if p_status = 'cancelled' then
    v_reason := coalesce(nullif(btrim(p_reason), ''), 'provider');
    update health.appointments
       set status = 'cancelled', cancelled_at = now(), cancel_reason = v_reason
     where id = v_appt.id;
    -- pending t24/t2 (+route'tan gönderilememiş confirm) skip (071 cancel deseni).
    update health.reminders_outbox
       set status = 'skipped'
     where appointment_id = v_appt.id and status = 'pending';
  else
    -- completed / no_show: yalnız status. confirmed'dan çıkması no_overlap EXCLUDE'unu
    -- otomatik serbest bırakır (EXCLUDE yalnız status='confirmed'da ısırır).
    update health.appointments set status = p_status where id = v_appt.id;
  end if;

  -- Audit (PII YOK — yalnız id'ler + reason + old/new status).
  insert into health.audit_log (actor_id, action, target_table, target_id, payload)
  values (p_user_id, 'provider_appointment_' || p_status, 'appointments', v_appt.id,
          jsonb_build_object('oldStatus', v_appt.status, 'newStatus', p_status,
                             'reason', case when p_status = 'cancelled' then v_reason else null end));

  return jsonb_build_object('ok', true, 'status', p_status, 'manageToken', v_appt.manage_token);
end $$;
revoke all on function public.health_provider_set_appointment_status(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.health_provider_set_appointment_status(uuid,uuid,text,text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) MANUEL REZERVASYON (telefonla gelen hasta; OTP YOK — provider güvenilir aktör).
--    Public health_book_appointment (071) REUSE EDİLMEZ: o, hold + PATIENT_NOT_VERIFIED
--    (OTP) ŞART koşar; provider yolunda OTP yok. Onun yerine H1 ATOMİKLİĞİ DOĞRUDAN:
--    (1) v_pid lookup (NOT_A_PROVIDER); (2) service v_pid'e ait+aktif (SERVICE_INVALID),
--    location v_pid'e bağlı (LOCATION_INVALID), slot_start<slot_end & gelecek (SLOT_INVALID/
--    SLOT_PAST); (3) provider-vouched şifreli hasta satırı in-tx (070/075 deseni; consent
--    şimdi damgalanır çünkü provider vouch ediyor — OTP/otp_codes YOK); v1 phone_hash ile
--    mevcut hastayı YENİDEN KULLANIR (mükerrer önler); (4) INSERT appointment source='provider'
--    — no_overlap EXCLUDE tek atomik bekçi (exclusion_violation→SLOT_TAKEN); (5) reminders
--    seed (confirm sms[+email] now() + t24 + t2) — 071 ile aynı; (6) audit_log (PII YOK).
--    Döner {appointmentId, manageToken, dispatch{...}, summary{...}} → action HEMEN confirm
--    SMS gönderir + reminder_locale yazar.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_provider_manual_book(
  p_user_id     uuid,
  p_service_id  uuid,
  p_location_id uuid,
  p_slot_start  timestamptz,
  p_slot_end    timestamptz,
  p_patient_name text,
  p_phone_e164  text,
  p_phone_hash  text,
  p_email       text,
  p_note        text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pid      uuid;
  v_key      text;
  v_pat      uuid;
  v_appt     health.appointments;
  v_provider health.providers;
  v_service  health.services;
  v_location health.locations;
  v_confirm_sms_id   uuid;
  v_confirm_email_id uuid;
  v_email_clean text;
begin
  select id into v_pid from health.providers where user_id = p_user_id;
  if v_pid is null then
    raise exception 'NOT_A_PROVIDER';
  end if;

  -- (2) ownership + giriş doğrulaması
  if coalesce(length(btrim(p_patient_name)), 0) < 2 then
    raise exception 'PATIENT_INPUT_INVALID';
  end if;
  if p_phone_e164 is null or p_phone_hash is null
     or btrim(p_phone_e164) = '' or btrim(p_phone_hash) = '' then
    raise exception 'PATIENT_INPUT_INVALID';
  end if;
  if not exists (
    select 1 from health.services s
    where s.id = p_service_id and s.provider_id = v_pid and s.is_active = true
  ) then
    raise exception 'SERVICE_INVALID';
  end if;
  if not exists (
    select 1 from health.provider_locations pl
    where pl.provider_id = v_pid and pl.location_id = p_location_id
  ) then
    raise exception 'LOCATION_INVALID';
  end if;
  if p_slot_start is null or p_slot_end is null or p_slot_start >= p_slot_end then
    raise exception 'SLOT_INVALID';
  end if;
  if p_slot_start < now() then
    raise exception 'SLOT_PAST';
  end if;

  v_key := (select decrypted_secret from vault.decrypted_secrets where name = 'health_pii_key');
  if v_key is null then
    raise exception 'PII_KEY_MISSING';
  end if;
  v_email_clean := nullif(btrim(coalesce(p_email, '')), '');

  -- (3) provider-vouched hasta: phone_hash ile mevcut varsa REUSE (mükerrer önler),
  --     yoksa şifreli yeni satır (070/075 deseni; consent_health şimdi damgalı).
  select id into v_pat from health.patients where phone_hash = p_phone_hash limit 1;
  if v_pat is null then
    insert into health.patients (full_name, phone_enc, email_enc, phone_hash, consent_health_data_at)
    values (
      btrim(p_patient_name),
      extensions.pgp_sym_encrypt(p_phone_e164, v_key),
      case when v_email_clean is not null
           then extensions.pgp_sym_encrypt(v_email_clean, v_key) else null end,
      p_phone_hash,
      now()
    )
    returning id into v_pat;
  end if;

  -- (4) appointment source='provider' — no_overlap EXCLUDE tek atomik bekçi.
  begin
    insert into health.appointments
      (provider_id, service_id, location_id, patient_id, slot_range, source, patient_note)
    values
      (v_pid, p_service_id, p_location_id, v_pat,
       tstzrange(p_slot_start, p_slot_end, '[)'),
       'provider', nullif(btrim(coalesce(p_note, '')), ''))
    returning * into v_appt;
  exception when exclusion_violation then
    raise exception 'SLOT_TAKEN';
  end;

  -- (5) reminders (aynı tx): confirm(sms) + confirm(email varsa) + t24 + t2 (pending).
  insert into health.reminders_outbox (appointment_id, channel, template, send_at)
  values (v_appt.id, 'sms', 'confirm', now())
  returning id into v_confirm_sms_id;

  if v_email_clean is not null then
    insert into health.reminders_outbox (appointment_id, channel, template, send_at)
    values (v_appt.id, 'email', 'confirm', now())
    returning id into v_confirm_email_id;
  end if;

  insert into health.reminders_outbox (appointment_id, channel, template, send_at)
  values (v_appt.id, 'sms', 't24', lower(v_appt.slot_range) - interval '24 hours');
  insert into health.reminders_outbox (appointment_id, channel, template, send_at)
  values (v_appt.id, 'sms', 't2',  lower(v_appt.slot_range) - interval '2 hours');

  -- (6) audit (PII YOK — yalnız id'ler).
  insert into health.audit_log (actor_id, action, target_table, target_id, payload)
  values (p_user_id, 'provider_manual_book', 'appointments', v_appt.id,
          jsonb_build_object('patientId', v_pat, 'serviceId', p_service_id,
                             'locationId', p_location_id, 'source', 'provider'));

  -- (özet + dispatch payload — dispatch PII yalnız service-role action'a, confirm için)
  select * into v_provider from health.providers where id = v_pid;
  select * into v_service  from health.services  where id = p_service_id;
  select * into v_location from health.locations where id = p_location_id;

  return jsonb_build_object(
    'appointmentId', v_appt.id,
    'manageToken',   v_appt.manage_token,
    'slotStart',     lower(v_appt.slot_range),
    'slotEnd',       upper(v_appt.slot_range),
    'dispatch', jsonb_build_object(
      'phoneE164',              p_phone_e164,
      'email',                  v_email_clean,
      'patientName',            btrim(p_patient_name),
      'confirmSmsReminderId',   v_confirm_sms_id,
      'confirmEmailReminderId', v_confirm_email_id
    ),
    'summary', jsonb_build_object(
      'providerName',       v_provider.full_name,
      'providerTitle',      v_provider.title,
      'providerSlug',       v_provider.slug,
      -- serviceName burada locale'siz (en→me→herhangi-kalan dil) döner; action confirm SMS'i
      -- KENDİ locale'inde başka bir alandan değil bu özetten render eder → bu yüzden
      -- manuel-book RPC'sine p_locale param'ı eklemeye gerek yok (action zaten kendi
      -- locale'ini biliyor; service adının tam-yerelleştirmesi confirm SMS için kritik
      -- değil, en/me yedek yeterli ve dispatchConfirm doctor+date'i locale'de formatlar).
      -- Fallback zinciri list/dashboard ile hizalı (stray 'tr' tier kaldırıldı); off-list
      -- tek-dil hizmet adı bile boş kalmasın diye son çare any-key.
      'serviceName',        coalesce(
                              v_service.name ->> 'en', v_service.name ->> 'me',
                              (select v from jsonb_each_text(v_service.name) as e(k, v) limit 1), ''),
      'serviceDurationMin', v_service.duration_min,
      'servicePriceEur',    v_service.price_eur,
      'locationLabel',      v_location.label,
      'locationAddress',    v_location.address,
      'locationCity',       v_location.city
    )
  );
end $$;
revoke all on function public.health_provider_manual_book(uuid,uuid,uuid,timestamptz,timestamptz,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.health_provider_manual_book(uuid,uuid,uuid,timestamptz,timestamptz,text,text,text,text,text)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) OVERRIDE LİSTE: çağıranın schedule_overrides'ı ({id,date,startTime,endTime,kind}).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_provider_list_overrides(p_user_id uuid)
returns jsonb
language plpgsql
stable
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
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',        o.id,
      'date',      o.date,
      'startTime', to_char(o.start_time, 'HH24:MI'),
      'endTime',   to_char(o.end_time, 'HH24:MI'),
      'kind',      o.kind
    ) order by o.date, o.start_time nulls first), '[]'::jsonb)
    from health.schedule_overrides o
    where o.provider_id = v_pid
  );
end $$;
revoke all on function public.health_provider_list_overrides(uuid) from public, anon, authenticated;
grant execute on function public.health_provider_list_overrides(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) OVERRIDE UPSERT: p_override_id null → INSERT (provider_id=v_pid); doluysa mevcut
--    satır.provider_id=v_pid doğrula (NOT_OWNER) + UPDATE. kind holiday/break/extra;
--    break/extra start<end ŞART (OVERRIDE_INVALID); holiday saatleri yok sayar (null).
--    Döner {overrideId}.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_provider_upsert_override(
  p_user_id     uuid,
  p_override_id uuid,
  p_date        date,
  p_kind        text,
  p_start_time  time,
  p_end_time    time
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pid uuid;
  v_oid uuid;
  v_st  time;
  v_et  time;
begin
  select id into v_pid from health.providers where user_id = p_user_id;
  if v_pid is null then
    raise exception 'NOT_A_PROVIDER';
  end if;
  if p_kind is null or p_kind not in ('holiday','break','extra') then
    raise exception 'OVERRIDE_INVALID';
  end if;
  if p_date is null then
    raise exception 'OVERRIDE_INVALID';
  end if;

  if p_kind = 'holiday' then
    v_st := null;
    v_et := null;
  else
    -- break/extra: saat ŞART + start<end.
    if p_start_time is null or p_end_time is null or p_start_time >= p_end_time then
      raise exception 'OVERRIDE_INVALID';
    end if;
    v_st := p_start_time;
    v_et := p_end_time;
  end if;

  if p_override_id is null then
    insert into health.schedule_overrides (provider_id, date, start_time, end_time, kind)
    values (v_pid, p_date, v_st, v_et, p_kind)
    returning id into v_oid;
  else
    if not exists (
      select 1 from health.schedule_overrides o
      where o.id = p_override_id and o.provider_id = v_pid
    ) then
      raise exception 'NOT_OWNER';
    end if;
    update health.schedule_overrides
       set date = p_date, start_time = v_st, end_time = v_et, kind = p_kind
     where id = p_override_id;
    v_oid := p_override_id;
  end if;

  return jsonb_build_object('overrideId', v_oid);
end $$;
revoke all on function public.health_provider_upsert_override(uuid,uuid,date,text,time,time)
  from public, anon, authenticated;
grant execute on function public.health_provider_upsert_override(uuid,uuid,date,text,time,time) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) OVERRIDE SİL: provider_id=v_pid doğrula (yoksa NOT_OWNER). Döner boolean.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_provider_delete_override(
  p_user_id uuid, p_override_id uuid
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
    select 1 from health.schedule_overrides o
    where o.id = p_override_id and o.provider_id = v_pid
  ) then
    raise exception 'NOT_OWNER';
  end if;
  delete from health.schedule_overrides where id = p_override_id;
  return true;
end $$;
revoke all on function public.health_provider_delete_override(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.health_provider_delete_override(uuid,uuid) to service_role;
