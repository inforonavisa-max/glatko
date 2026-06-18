-- ═══════════════════════════════════════════════════════════════════════════
-- 082: H9 hardening — public.health_reschedule_appointment'tan gereksiz +
--      kırılgan otp_codes re-check'ini kaldır (072'nin reschedule karşılığı).
-- ═══════════════════════════════════════════════════════════════════════════
-- SORUN (075/076'daki PATIENT_NOT_VERIFIED gate'i — 072'nin booking'te
--   düzelttiğinin AYNISI, reschedule wrapper'ında kalmış):
--     if not exists (select 1 from health.otp_codes o
--                    where o.phone_hash = v_pat.phone_hash
--                      and o.verified_at is not null) then PATIENT_NOT_VERIFIED
--   Wrapper, hastanın "doğrulanmış" olduğunu hayatta kalan bir otp_codes
--   (verified_at not null) satırının VARLIĞIYLA kanıtlıyor. Ama:
--     • health_verify_otp doğrulama sonrası otp satırını TÜKETİR (silinir),
--     • health.cleanup_expired() cron'u (*/5) satırı expires_at'te siler
--       (verified_at'e bakmadan, otp ömrü 10dk).
--   Booking'te 5dk'lık hold bunu GÖLGELER (geç booking önce HOLD_EXPIRED alır).
--   Reschedule'da ise GÖLGE YOK: kullanıcı randevusunu günler önceden erteler,
--   o ana kadar otp satırı çoktan gitmiştir → her MEŞRU erteleme
--   PATIENT_NOT_VERIFIED ile REDDEDİLİR. Reschedule gerçek kullanıcılar için
--   FİİLEN ÇALIŞMIYOR. Ayrıca bu gate, asıl IDOR bekçisini (step 10,
--   RESCHEDULE_IDENTITY_MISMATCH) MASKELİYOR — saldırgan da meşru sahip de
--   step 9'da takılıyor, gerçek kimlik kontrolüne hiç ulaşılmıyor.
--
-- DÜZELTME (072 ile birebir tutarlı):
--   otp_codes existence re-check'ini KALDIR. Kalıcı doğrulama kanıtı =
--   health.patients satırının VARLIĞI (patient YALNIZCA doğrulanmış OTP ile
--   yaratılır — health_verify_otp). PATIENT_INVALID (step 8) bu varlığı zaten
--   kontrol ediyor. GÜVENLİK step 10'da: v_pat.phone_hash == v_owner.phone_hash
--   (eski randevunun gerçek sahibi). Patient'lar yalnız doğrulanmış OTP ile
--   yaratıldığından, hash eşleşmesi doğrulanmışlığı transitif olarak garanti
--   eder → step 9 hem kırılgan hem gereksiz. Kaldırılması IDOR korumasını
--   ZAYIFLATMAZ (step 10 aynen durur).
--
-- Fonksiyon gövdesinin geri kalanı 075/076 ile BİREBİR AYNI; tek fark step 9
-- bloğunun çıkarılması. Additive CREATE OR REPLACE; flag prod=false.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.health_reschedule_appointment(
  p_old_manage_token text,
  p_new_hold_id uuid,
  p_session_key text,
  p_patient_id uuid,
  p_note text,
  p_locale text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_old        health.appointments;
  v_hold       health.slot_holds;
  v_pat        health.patients;   -- re-verify eden (canlılık kanıtı)
  v_owner      health.patients;   -- ESKİ randevunun gerçek sahibi (kimlik kaynağı)
  v_new        health.appointments;
  v_provider   health.providers;
  v_service    health.services;
  v_location   health.locations;
  v_key        text;
  v_phone      text;
  v_email      text;
  v_note       text;
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

  -- (2) Kimlik bekçileri (071 deseni): hold sahipliği + süresi.
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
  -- (072 ile tutarlı) otp_codes existence re-check KALDIRILDI: patient varlığı
  -- (PATIENT_INVALID) kalıcı doğrulama kanıtıdır; güvenlik step 2b'deki
  -- phone_hash eşleşmesinde (RESCHEDULE_IDENTITY_MISMATCH).

  -- (2b) KİMLİK TAŞIMA + AUTHZ: erteleme ESKİ randevunun GERÇEK sahibine bağlı kalmalı.
  select * into v_owner from health.patients where id = v_old.patient_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'PATIENT_INVALID');
  end if;
  if v_pat.phone_hash is distinct from v_owner.phone_hash then
    return jsonb_build_object('ok', false, 'reason', 'RESCHEDULE_IDENTITY_MISMATCH');
  end if;

  -- Kapsam: AYNI provider + AYNI service + AYNI location.
  if v_hold.provider_id is distinct from v_old.provider_id
     or v_hold.service_id is distinct from v_old.service_id
     or v_hold.location_id is distinct from v_old.location_id then
    return jsonb_build_object('ok', false, 'reason', 'RESCHEDULE_SCOPE_MISMATCH');
  end if;

  -- (B) Not taşıma (bulgu #17): p_note NULL ise eski randevunun not'unu devral.
  v_note := coalesce(p_note, v_old.patient_note);

  -- (3) YENİ randevuyu ÖNCE bookle. ESKİ patient_id ile (v_old.patient_id).
  begin
    v_new := health.book_appointment(p_new_hold_id, v_old.patient_id, v_note);
  exception
    when others then
      if sqlerrm in ('SLOT_TAKEN', 'HOLD_EXPIRED') then
        return jsonb_build_object('ok', false, 'reason', sqlerrm);
      end if;
      raise;
  end;

  -- (4) ESKİ randevuyu AYNI tx'te iptal et + zinciri kur.
  update health.appointments
  set status = 'cancelled', cancelled_at = now(),
      cancel_reason = 'reschedule', rescheduled_to = v_new.id
  where id = v_old.id;

  update health.reminders_outbox
  set status = 'skipped'
  where appointment_id = v_old.id and status = 'pending';

  -- (5) YENİ randevunun reminder satırları. Hasta kanalı template='reschedule'.
  insert into health.reminders_outbox (appointment_id, channel, template, send_at)
  values (v_new.id, 'sms', 'reschedule', now())
  returning id into v_confirm_sms_id;

  -- Kimlik artık ESKİ sahipten (v_owner).
  v_key   := (select decrypted_secret from vault.decrypted_secrets where name = 'health_pii_key');
  v_phone := extensions.pgp_sym_decrypt(v_owner.phone_enc, v_key);
  v_email := case when v_owner.email_enc is not null
                  then extensions.pgp_sym_decrypt(v_owner.email_enc, v_key) else null end;

  if v_email is not null then
    insert into health.reminders_outbox (appointment_id, channel, template, send_at)
    values (v_new.id, 'email', 'reschedule', now())
    returning id into v_confirm_email_id;
  end if;

  insert into health.reminders_outbox (appointment_id, channel, template, send_at)
  values (v_new.id, 'sms', 't24', lower(v_new.slot_range) - interval '24 hours');
  insert into health.reminders_outbox (appointment_id, channel, template, send_at)
  values (v_new.id, 'sms', 't2',  lower(v_new.slot_range) - interval '2 hours');

  -- Provider taşıma bildirimi.
  perform public.health_enqueue_reschedule_provider(v_new.id, v_old.id);

  -- (6) Locale sidecar.
  insert into health.reminder_locale (appointment_id, locale)
  values (v_new.id, p_locale)
  on conflict (appointment_id) do update set locale = excluded.locale;

  -- (7) Özet (PII'siz) + dispatch payload (PII).
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
      'patientName',            v_owner.full_name,
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
end $function$;
