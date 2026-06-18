-- ═══════════════════════════════════════════════════════════════════════════
-- 075: H9 — hasta self-servis randevu erteleme (atomik public wrapper'lar)
-- ═══════════════════════════════════════════════════════════════════════════
-- Erteleme = TAŞIMA, iptal+yeniden-rezervasyon DEĞİL. H5b/H6 desenleri yeniden
-- kullanılır: health şeması PostgREST'e EXPOSE EDİLMEZ → her şey public SECURITY
-- DEFINER wrapper. 071'in atomik primitifi health.book_appointment (066) YENİ
-- randevu için BİREBİR çağrılır (atomiklik DUPLİKE EDİLMEZ). Erteleme TEK
-- transaction'da: YENİ randevu önce bookle (race-safe) → SLOT_TAKEN ise eski
-- randevu DOKUNULMADAN confirmed kalır (veri kaybı YOK) → sonra ESKİ'yi iptal et.
--
-- SIRA (load-bearing — no-data-loss krizi): book-new-THEN-cancel-old. Tersi
-- (cancel-first) SLOT_TAKEN penceresinde hastayı SIFIR randevuyla bırakır.
--
-- BİLDİRİM SEMANTİĞİ (docs): erteleme tek tutarlı bildirim üretir:
--   * HASTA: yeni randevu için 'confirm' (071 deseni — fresh booking gibi). Eski
--     randevu için 'cancelled' satırı ASLA kuyruğa girmez (cancel_reason='reschedule'
--     + cancel ROUTE'u çağrılmaz → health_enqueue_cancelled tetiklenmez). Hasta
--     'iptal edildi — yeniden rezerve et' SMS'i ALMAZ.
--   * PROVIDER: tek 'reschedule_provider' (email) satırı (taşımayı taşır). 'provider_
--     new_booking' kuyruğa GİRMEZ (provider çift bildirim almasın). H6 cron sağlayıcı
--     e-postasını auth.users'tan çözer + yoksa zarifçe skip eder.
-- Eski randevunun pending t24/t2'si 'skipped' yapılır (terk edilen slot için stale yok).
--
-- TOKEN INERTNESS: erteleme/iptal RPC'leri slot başlamışsa (lower(slot_range)<=now())
-- graceful reason döner — mutation YOK. Eski token READ için geçerli kalır (cancelled/
-- moved terminal ekranı), WRITE için inert (status<>'confirmed' → reddedilir).
--
-- GÜVENLİK: SECURITY DEFINER + SET search_path='' (066-074 deseni). extensions.*/
-- vault.* şema-qualified. EXECUTE yalnız service_role (write path); list-RPC user_id
-- filtreli + service_role'a verilir (account sayfası server-component'ten user_id geçer).
--
-- ADDITIVE: health.* tabloları + book_appointment + 066-074 nesnelerinde DROP/destructive
-- ALTER YOK. Tek istisna: health.appointments'a `rescheduled_to` ADD COLUMN IF NOT EXISTS
-- (saf additive — mevcut kolon/constraint'e dokunmaz; var olan satırlar NULL). 070'in
-- public wrapper'ı health_verify_otp CREATE OR REPLACE ile p_user_id eklenerek genişletilir
-- (tablo değişmez — patients.user_id zaten 066'da var, sadece STAMP edilir).
--
-- ROLLBACK:
--   drop function if exists public.health_reschedule_appointment(text,uuid,text,uuid,text,text);
--   drop function if exists public.health_enqueue_reschedule_provider(uuid,uuid);
--   drop function if exists public.health_list_user_appointments(uuid,text);
--   -- health_verify_otp: 7-arg sürüme geri dön (070'i yeniden uygula) VEYA 8-arg'ı bırak.
--   -- alter table health.appointments drop column if exists rescheduled_to;  -- (yalnız tam geri-alımda)

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) Additive kolon: eski randevu → yeni randevu bağlantısı (erteleme zinciri).
--    ADD COLUMN IF NOT EXISTS = saf additive; mevcut satırlar NULL. Eski manage
--    sayfası bu kolonla yeni token'a deep-link edebilir (status-driven terminal).
-- ─────────────────────────────────────────────────────────────────────────────
alter table health.appointments
  add column if not exists rescheduled_to uuid references health.appointments(id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 0b) health_get_appointment — CREATE OR REPLACE (additive: +serviceId/locationId/
--    rescheduledTo). 071'in özeti birebir korunur; erteleme widget'ı orijinal
--    service/location'ı ön-seçebilsin + eski sayfa yeni token'a deep-link edebilsin
--    diye id'ler eklenir. İmza (text,text) + dönüş şekli aynı; mevcut çağıranlar
--    (onay/manage sayfaları) eklenen alanları yok sayar. PII DÖNDÜRMEZ.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_get_appointment(p_manage_token text, p_locale text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status',             a.status,
    'slotStart',          lower(a.slot_range),
    'slotEnd',            upper(a.slot_range),
    'providerName',       p.full_name,
    'providerTitle',      p.title,
    'providerSlug',       p.slug,
    'serviceName',        sv.name ->> p_locale,
    'serviceDurationMin', sv.duration_min,
    'servicePriceEur',    sv.price_eur,
    'locationLabel',      l.label,
    'locationAddress',    l.address,
    'locationCity',       l.city,
    'manageToken',        a.manage_token,
    -- H9 additive: erteleme widget ön-seçimi + zincir deep-link.
    'serviceId',          a.service_id,
    'locationId',         a.location_id,
    'rescheduledTo',      (select rn.manage_token from health.appointments rn
                           where rn.id = a.rescheduled_to)
  )
  from health.appointments a
  join health.providers p  on p.id  = a.provider_id
  join health.services  sv on sv.id = a.service_id
  join health.locations l  on l.id  = a.location_id
  where a.manage_token = p_manage_token;
$$;
revoke all on function public.health_get_appointment(text,text) from public, anon, authenticated;
grant execute on function public.health_get_appointment(text,text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Atomik erteleme. book-new-THEN-cancel-old (tek tx = ya hep ya hiç).
--    071 health_book_appointment'ın ÇEKİRDEK güvenlik katmanlarını (hold sahipliği +
--    OTP-verified patient) tekrar uygular, AMA YENİ randevu için 066 health.book_
--    appointment'ı BİREBİR çağırır (atomiklik tek kaynak). Kapsam kilidi: yeni hold'un
--    provider/service/location'ı ESKİ randevuyla AYNI olmalı (RESCHEDULE_SCOPE_MISMATCH).
--
--    Döner jsonb:
--      {ok:false, reason:<CODE>[, status]}  — graceful (NOT_FOUND/OLD_NOT_CANCELLABLE/
--                                              OLD_SLOT_PASSED/RESCHEDULE_SCOPE_MISMATCH/
--                                              HOLD_NOT_OWNED/HOLD_EXPIRED/PATIENT_*)
--      {ok:true, oldAppointmentId, newAppointmentId, newManageToken, slotStart, slotEnd,
--       oldSlotStart, dispatch{...PII...}, summary{...}}
--    book_appointment SLOT_TAKEN/HOLD_EXPIRED FIRLATIRSA → tüm tx rollback → eski randevu
--    confirmed INTACT; bu exception'lar yakalanıp {ok:false,reason} olarak döndürülür.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_reschedule_appointment(
  p_old_manage_token text,
  p_new_hold_id      uuid,
  p_session_key      text,
  p_patient_id       uuid,
  p_note             text,
  p_locale           text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old        health.appointments;
  v_hold       health.slot_holds;
  v_pat        health.patients;
  v_new        health.appointments;
  v_provider   health.providers;
  v_service    health.services;
  v_location   health.locations;
  v_key        text;
  v_phone      text;
  v_email      text;
  v_confirm_sms_id   uuid;
  v_confirm_email_id uuid;
begin
  -- (1) Eski randevu — FOR UPDATE ile serialize et (provider'ın eşzamanlı iptaliyle yarış).
  select * into v_old
  from health.appointments
  where manage_token = p_old_manage_token
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  end if;

  -- Idempotent re-return: zaten ertelenmiş (cancelled + rescheduled_to dolu) → çocuğun token'ı.
  if v_old.status = 'cancelled' and v_old.rescheduled_to is not null then
    return jsonb_build_object(
      'ok', true,
      'oldAppointmentId', v_old.id,
      'newAppointmentId', v_old.rescheduled_to,
      'newManageToken', (select manage_token from health.appointments where id = v_old.rescheduled_to),
      'idempotent', true
    );
  end if;

  if v_old.status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'reason', 'OLD_NOT_CANCELLABLE', 'status', v_old.status);
  end if;

  -- Slot başlamışsa erteleme INERT (graceful).
  if lower(v_old.slot_range) <= now() then
    return jsonb_build_object('ok', false, 'reason', 'OLD_SLOT_PASSED');
  end if;

  -- (2) Kimlik bekçileri (071 deseni): hold sahipliği + süresi + OTP-verified patient.
  select * into v_hold from health.slot_holds where id = p_new_hold_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'HOLD_EXPIRED');
  end if;
  if v_hold.session_key is distinct from p_session_key then
    return jsonb_build_object('ok', false, 'reason', 'HOLD_NOT_OWNED');
  end if;
  if v_hold.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'HOLD_EXPIRED');
  end if;

  select * into v_pat from health.patients where id = p_patient_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'PATIENT_INVALID');
  end if;
  if not exists (
    select 1 from health.otp_codes o
    where o.phone_hash = v_pat.phone_hash and o.verified_at is not null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'PATIENT_NOT_VERIFIED');
  end if;

  -- Kapsam: AYNI provider + AYNI service + AYNI location. (Hasta sadece zamanı taşır.)
  if v_hold.provider_id is distinct from v_old.provider_id
     or v_hold.service_id is distinct from v_old.service_id
     or v_hold.location_id is distinct from v_old.location_id then
    return jsonb_build_object('ok', false, 'reason', 'RESCHEDULE_SCOPE_MISMATCH');
  end if;

  -- (3) YENİ randevuyu ÖNCE bookle (race-safety krizi). book_appointment EXCLUDE son
  --     bekçisi SLOT_TAKEN fırlatırsa BU exception bloğunda yakalanır → tüm tx rollback
  --     → eski randevu confirmed kalır (no-data-loss). Aynı şekilde HOLD_EXPIRED.
  begin
    v_new := health.book_appointment(p_new_hold_id, p_patient_id, p_note);
  exception
    when others then
      -- book_appointment yalnız 'SLOT_TAKEN' / 'HOLD_EXPIRED' fırlatır (066). Mesajı
      -- aynen yukarı taşı; route HTTP'ye map'ler. Eski randevu DOKUNULMADI.
      return jsonb_build_object('ok', false, 'reason', sqlerrm);
  end;

  -- (4) ESKİ randevuyu AYNI tx'te iptal et + zinciri kur. cancel_reason='reschedule'
  --     → cron/enqueue bunu standalone 'cancelled' SANMAZ. Eski pending t24/t2 → skipped.
  update health.appointments
  set status = 'cancelled', cancelled_at = now(),
      cancel_reason = 'reschedule', rescheduled_to = v_new.id
  where id = v_old.id;

  update health.reminders_outbox
  set status = 'skipped'
  where appointment_id = v_old.id and status = 'pending';

  -- (5) YENİ randevunun reminder satırları (071 birebir): confirm(sms)+confirm(email,varsa)
  --     +t24+t2. Confirm id'leri route'un anlık dispatch'i için döner. AYRICA tek
  --     'reschedule_provider' (email) satırı (provider'a taşıma bildirimi).
  insert into health.reminders_outbox (appointment_id, channel, template, send_at)
  values (v_new.id, 'sms', 'confirm', now())
  returning id into v_confirm_sms_id;

  v_key   := (select decrypted_secret from vault.decrypted_secrets where name = 'health_pii_key');
  v_phone := extensions.pgp_sym_decrypt(v_pat.phone_enc, v_key);
  v_email := case when v_pat.email_enc is not null
                  then extensions.pgp_sym_decrypt(v_pat.email_enc, v_key) else null end;

  if v_email is not null then
    insert into health.reminders_outbox (appointment_id, channel, template, send_at)
    values (v_new.id, 'email', 'confirm', now())
    returning id into v_confirm_email_id;
  end if;

  insert into health.reminders_outbox (appointment_id, channel, template, send_at)
  values (v_new.id, 'sms', 't24', lower(v_new.slot_range) - interval '24 hours');
  insert into health.reminders_outbox (appointment_id, channel, template, send_at)
  values (v_new.id, 'sms', 't2',  lower(v_new.slot_range) - interval '2 hours');

  -- Provider taşıma bildirimi (yeni randevuya iliştirilir; eski slot'u da taşır).
  -- Idempotent: enqueue fonksiyonu çift satırı engeller. Burada doğrudan insert
  -- yerine fonksiyonu çağır (tek kaynak) — ama RPC çağrısı search_path='' güvenli.
  perform public.health_enqueue_reschedule_provider(v_new.id, v_old.id);

  -- (6) Yeni randevunun render'ı için locale sidecar (cron t24/t2 doğru dilde) — additive.
  insert into health.reminder_locale (appointment_id, locale)
  values (v_new.id, p_locale)
  on conflict (appointment_id) do update set locale = excluded.locale;

  -- (7) Özet (PII'siz) + dispatch payload (PII — yalnız service-role route'a, confirm için).
  select * into v_provider from health.providers where id = v_new.provider_id;
  select * into v_service  from health.services  where id = v_new.service_id;
  select * into v_location from health.locations where id = v_new.location_id;

  return jsonb_build_object(
    'ok', true,
    'oldAppointmentId', v_old.id,
    'newAppointmentId', v_new.id,
    'newManageToken',   v_new.manage_token,
    'slotStart',        lower(v_new.slot_range),
    'slotEnd',          upper(v_new.slot_range),
    'oldSlotStart',     lower(v_old.slot_range),
    'dispatch', jsonb_build_object(
      'phoneE164',              v_phone,
      'email',                  v_email,
      'patientName',            v_pat.full_name,
      'confirmSmsReminderId',   v_confirm_sms_id,
      'confirmEmailReminderId', v_confirm_email_id
    ),
    'summary', jsonb_build_object(
      'providerName',       v_provider.full_name,
      'providerTitle',      v_provider.title,
      'providerSlug',       v_provider.slug,
      'serviceName',        v_service.name ->> p_locale,
      'serviceDurationMin', v_service.duration_min,
      'servicePriceEur',    v_service.price_eur,
      'locationLabel',      v_location.label,
      'locationAddress',    v_location.address,
      'locationCity',       v_location.city
    )
  );
end $$;
revoke all on function public.health_reschedule_appointment(text,uuid,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.health_reschedule_appointment(text,uuid,text,uuid,text,text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) health_enqueue_reschedule_provider — provider'a taşıma bildirimi (tek email satırı).
--    073 health_enqueue_provider_new_booking deseni: provider iletişimi providers'ta YOK
--    → channel=email satırı; dispatcher email'i auth.users'tan (provider.user_id) türetir
--    + yoksa skip. Idempotent (yeni randevuya 1 reschedule_provider satırı). p_old_appointment_id
--    şablona "eski→yeni" zamanını taşımak için kullanılır (dispatcher join'ler).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_enqueue_reschedule_provider(
  p_new_appointment_id uuid, p_old_appointment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from health.appointments where id = p_new_appointment_id) then
    return;
  end if;
  if exists (
    select 1 from health.reminders_outbox
    where appointment_id = p_new_appointment_id and template = 'reschedule_provider'
  ) then
    return;  -- idempotent
  end if;

  insert into health.reminders_outbox (appointment_id, channel, template, send_at)
  values (p_new_appointment_id, 'email', 'reschedule_provider', now());
end $$;
revoke all on function public.health_enqueue_reschedule_provider(uuid,uuid) from public, anon, authenticated;
grant execute on function public.health_enqueue_reschedule_provider(uuid,uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) health_list_user_appointments — "Randevularım" (giriş yapmış kullanıcı).
--    PII'siz upcoming+past özet (provider/service/location join + manage_token →
--    her satır /health/r/[token]'a deep-link). YALNIZ patients.user_id = p_user_id
--    (telefon/phone_hash ile ASLA listeleme — başkasının randevusunu görmemek için).
--    Server-component getUser().id'yi geçer (client değeri ASLA). STABLE read.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_list_user_appointments(p_user_id uuid, p_locale text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'manageToken',        a.manage_token,
      'status',             a.status,
      'slotStart',          lower(a.slot_range),
      'slotEnd',            upper(a.slot_range),
      'providerName',       p.full_name,
      'providerTitle',      p.title,
      'providerSlug',       p.slug,
      'serviceName',        sv.name ->> p_locale,
      'serviceDurationMin', sv.duration_min,
      'servicePriceEur',    sv.price_eur,
      'locationLabel',      l.label,
      'locationCity',       l.city
    )
    order by lower(a.slot_range) desc
  ), '[]'::jsonb)
  from health.appointments a
  join health.patients  pat on pat.id = a.patient_id
  join health.providers p   on p.id  = a.provider_id
  join health.services  sv  on sv.id = a.service_id
  join health.locations l   on l.id  = a.location_id
  where pat.user_id = p_user_id
    and p_user_id is not null;
$$;
revoke all on function public.health_list_user_appointments(uuid,text) from public, anon, authenticated;
grant execute on function public.health_list_user_appointments(uuid,text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3b) health_claim_due_reminders — CREATE OR REPLACE (additive: +oldSlotStart).
--    073'ün claim'i birebir korunur; TEK ek: reschedule/reschedule_provider satırları
--    "eski → yeni" zamanı render edebilsin diye ESKİ randevunun slot başlangıcı çözülür.
--    Eski randevu YENİ randevuya rescheduled_to = new.id ile bağlıdır → reverse LEFT JOIN.
--    Diğer şablonlar için oldSlotStart NULL (kullanılmaz). İmza/dönüş şekli aynı (jsonb array);
--    dispatcher yeni alanı opsiyonel okur. FOR UPDATE SKIP LOCKED + retry_count<3 korunur.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_claim_due_reminders(p_limit int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key  text;
  v_rows jsonb;
begin
  v_key := (select decrypted_secret from vault.decrypted_secrets where name = 'health_pii_key');

  with due as (
    select r.id
    from health.reminders_outbox r
    where r.status = 'pending'
      and r.send_at <= now()
      and r.retry_count < 3
    order by r.send_at
    limit greatest(p_limit, 0)
    for update skip locked
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'reminderId',     r.id,
      'appointmentId',  a.id,
      'channel',        r.channel,
      'template',       r.template,
      'sendAt',         r.send_at,
      'retryCount',     r.retry_count,
      'appointmentStatus', a.status,
      'slotStart',      lower(a.slot_range),
      'slotEnd',        upper(a.slot_range),
      -- H9: erteleme bildirimlerinde "eski → yeni"; eski randevu rescheduled_to=a.id ile bağlı.
      'oldSlotStart',   (select lower(old.slot_range)
                         from health.appointments old where old.rescheduled_to = a.id
                         order by old.cancelled_at desc limit 1),
      'manageToken',    a.manage_token,
      'patientLocale',  coalesce(rl.locale, 'en'),
      'providerLocale', coalesce((p.languages)[1], 'en'),
      'phoneE164',      extensions.pgp_sym_decrypt(pat.phone_enc, v_key),
      'email',          case when pat.email_enc is not null
                             then extensions.pgp_sym_decrypt(pat.email_enc, v_key) else null end,
      'patientName',    pat.full_name,
      'providerName',   p.full_name,
      'providerTitle',  p.title,
      'providerSlug',   p.slug,
      'providerUserId', p.user_id,
      'serviceName',         coalesce(sv.name ->> coalesce(rl.locale, 'en'),
                                      sv.name ->> 'en', sv.name ->> 'me'),
      'serviceNameProvider', coalesce(sv.name ->> coalesce((p.languages)[1], 'en'),
                                      sv.name ->> 'en', sv.name ->> 'me'),
      'locationLabel',  l.label,
      'locationAddress', l.address,
      'locationCity',   l.city
    )
    order by r.send_at
  ), '[]'::jsonb)
  into v_rows
  from due
  join health.reminders_outbox r on r.id = due.id
  join health.appointments a     on a.id = r.appointment_id
  join health.patients pat       on pat.id = a.patient_id
  join health.providers p        on p.id = a.provider_id
  join health.services sv        on sv.id = a.service_id
  join health.locations l        on l.id = a.location_id
  left join health.reminder_locale rl on rl.appointment_id = a.id;

  return v_rows;
end $$;
revoke all on function public.health_claim_due_reminders(int) from public, anon, authenticated;
grant execute on function public.health_claim_due_reminders(int) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) health_verify_otp (8-arg additive overload) — patients.user_id STAMP.
--    070'in 7-arg sürümü DOKUNULMADAN durur (guest flow). Bu overload, OTP-verify
--    anında authenticated session VARSA route'tan p_user_id alır + patients.user_id'yi
--    damgalar (→ "Randevularım" çalışır). patients tablosuna ALTER YOK — user_id zaten
--    066'da var. Aynı 070 mantığı + tek fark: INSERT'e user_id eklenir.
--    NOT: overload (8-arg) eklenir; 070'in 7-arg'ı SİLİNMEZ (geri uyumluluk; mevcut
--    bookings route 7-arg çağırır → değişmez). Yeni OTP route p_user_id geçince 8-arg seçilir.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_verify_otp(
  p_phone_hash        text,
  p_code_hash         text,
  p_full_name         text,
  p_phone_e164        text,
  p_email             text,
  p_consent_health    boolean,
  p_consent_marketing boolean,
  p_user_id           uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_otp   health.otp_codes;
  v_key   text;
  v_pid   uuid;
begin
  select * into v_otp
  from health.otp_codes
  where phone_hash = p_phone_hash and verified_at is null and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'OTP_EXPIRED');
  end if;

  if coalesce(v_otp.attempts, 0) >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'TOO_MANY_ATTEMPTS');
  end if;

  if v_otp.code_hash <> p_code_hash then
    update health.otp_codes set attempts = coalesce(attempts, 0) + 1 where id = v_otp.id;
    if coalesce(v_otp.attempts, 0) + 1 >= 3 then
      return jsonb_build_object('ok', false, 'reason', 'TOO_MANY_ATTEMPTS', 'attemptsLeft', 0);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'WRONG_CODE',
                              'attemptsLeft', 3 - (coalesce(v_otp.attempts, 0) + 1));
  end if;

  if p_consent_health is not true then
    return jsonb_build_object('ok', false, 'reason', 'CONSENT_REQUIRED');
  end if;

  v_key := (select decrypted_secret from vault.decrypted_secrets where name = 'health_pii_key');
  if v_key is null then
    raise exception 'PII_KEY_MISSING';
  end if;

  update health.otp_codes set verified_at = now() where id = v_otp.id;

  insert into health.patients (user_id, full_name, phone_enc, email_enc, phone_hash,
                               consent_health_data_at, consent_marketing_at)
  values (
    p_user_id,  -- NULL guest, non-null authenticated → "Randevularım" linkler
    p_full_name,
    extensions.pgp_sym_encrypt(p_phone_e164, v_key),
    case when p_email is not null and length(btrim(p_email)) > 0
         then extensions.pgp_sym_encrypt(p_email, v_key) else null end,
    p_phone_hash,
    now(),
    case when p_consent_marketing is true then now() else null end
  )
  returning id into v_pid;

  return jsonb_build_object('ok', true, 'patientId', v_pid);
end $$;
revoke all on function public.health_verify_otp(text,text,text,text,text,boolean,boolean,uuid) from public, anon, authenticated;
grant execute on function public.health_verify_otp(text,text,text,text,text,boolean,boolean,uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- DRY-RUN DOĞRULAMA PLANI (PROD'A UYGULANMAZ — main session BEGIN/ROLLBACK ile koşar)
-- ═══════════════════════════════════════════════════════════════════════════
-- Amaç: 075'i uygulamadan ÖNCE erteleme kontratını kanıtlamak + 066/071/073 nesnelerinin
-- DOKUNULMADIĞINI doğrulamak. RAISE NOTICE yalnız SAYI yazar — PII değeri ASLA loglanmaz.
-- ROLLBACK her şeyi geri alır. (Önce 075'in CREATE bloklarını aynı tx içinde uygula.)
--
-- begin;
--   -- (0) 075 fonksiyonlarını + rescheduled_to kolonunu bu tx içinde yarat.
--
--   -- (1) Seed: Vault key (070'ten var) + 1 provider/service/location + 1 OTP-verified patient +
--   --     1 confirmed appointment (gelecekteki slot) + bu randevuya t24+t2 pending satırları.
--   --     YENİ serbest slot için bir hold (AYNI provider/service/location, hastanın session'ı).
--
--   -- (2) Mutlu yol: reschedule çağır → YENİ confirmed + ESKİ cancelled[reason=reschedule] +
--   --     eski t24/t2 'skipped' + yeni confirm/t24/t2 + 1 reschedule_provider + rescheduled_to dolu.
--   do $$
--   declare v jsonb; v_new uuid; v_old uuid;
--   begin
--     v := public.health_reschedule_appointment(:old_token, :new_hold, :sess, :pid, null, 'me');
--     raise notice 'reschedule ok = %', (v->>'ok');                       -- t
--     v_new := (v->>'newAppointmentId')::uuid; v_old := (v->>'oldAppointmentId')::uuid;
--     raise notice 'new status = %',  (select status from health.appointments where id=v_new);  -- confirmed
--     raise notice 'old status = %',  (select status from health.appointments where id=v_old);  -- cancelled
--     raise notice 'old reason = %',  (select cancel_reason from health.appointments where id=v_old); -- reschedule
--     raise notice 'old skipped t24/t2 = %', (select count(*) from health.reminders_outbox
--        where appointment_id=v_old and template in ('t24','t2') and status='skipped');           -- 2
--     raise notice 'new reminders = %', (select count(*) from health.reminders_outbox where appointment_id=v_new); -- confirm[+email]+t24+t2+reschedule_provider
--     raise notice 'reschedule_provider rows = %', (select count(*) from health.reminders_outbox
--        where appointment_id=v_new and template='reschedule_provider');                          -- 1
--     raise notice 'NO patient cancelled row = %', (select count(*) from health.reminders_outbox
--        where appointment_id=v_old and template='cancelled');                                    -- 0
--     raise notice 'rescheduled_to set = %', (select rescheduled_to is not null from health.appointments where id=v_old); -- t
--     raise notice 'tokens differ = %', ((select manage_token from health.appointments where id=v_new)
--        <> :old_token);                                                                          -- t
--   end $$;
--
--   -- (3) Race: provider eski'yi ÖNCE iptal eder → reschedule OLD_NOT_CANCELLABLE + sıfır yeni satır.
--   --   update health.appointments set status='cancelled', cancel_reason='provider' where manage_token=:t2;
--   --   select public.health_reschedule_appointment(:t2, :hold2, :sess, :pid, null, 'me')->>'reason'; → OLD_NOT_CANCELLABLE
--
--   -- (4) SLOT_TAKEN: hedef slot'a 2. confirmed randevu koy, sonra oraya ertele → SLOT_TAKEN +
--   --     ESKİ HÂLÂ confirmed (no-data-loss).
--   --   select public.health_reschedule_appointment(...)->>'reason'; → SLOT_TAKEN
--   --   select status from health.appointments where manage_token=:old3; → confirmed
--
--   -- (5) Past-slot: eski slot'u geçmişe al → OLD_SLOT_PASSED (inert).
--   --   update health.appointments set slot_range=tstzrange(now()-interval'2h', now()-interval'1h')
--   --     where manage_token=:t4;  → reason OLD_SLOT_PASSED
--
--   -- (6) Scope mismatch: farklı service'in hold'una ertele → RESCHEDULE_SCOPE_MISMATCH.
--
--   -- (7) "Randevularım": patient.user_id = :uid set et → health_list_user_appointments(:uid,'me')
--   --   jsonb_array_length >= 1; başka user_id (:uid2) → 0.
--
--   -- (8) 066/071/073 DEĞİŞMEDİ (additive teyidi):
--   --   \df health.book_appointment            → hâlâ 3-arg (uuid,uuid,text)
--   --   \df public.health_book_appointment     → hâlâ 5-arg
--   --   \df public.health_verify_otp           → 2 overload (7-arg 070 + 8-arg 075)
--   --   select conname from pg_constraint where conrelid='health.reminders_outbox'::regclass
--   --     and contype='c';                     → template CHECK YOK (yeni şablon ALTER gerektirmez)
--
-- rollback;  -- HİÇBİR ŞEY KALICI DEĞİL.
