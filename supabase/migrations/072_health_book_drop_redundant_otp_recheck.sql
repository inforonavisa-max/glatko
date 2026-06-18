-- ═══════════════════════════════════════════════════════════════════════════
-- 072: H5b hardening — public.health_book_appointment'tan gereksiz + kırılgan
--      otp_codes re-check'ini kaldır (Finding #2, pre-merge adversarial review).
-- ═══════════════════════════════════════════════════════════════════════════
-- SORUN (071'deki PATIENT_NOT_VERIFIED gate'i):
--   Wrapper, hastanın "doğrulanmış" olduğunu, hayatta kalan bir
--   health.otp_codes (verified_at not null) satırının VARLIĞIYLA kanıtlıyordu.
--   Ama health.cleanup_expired() cron'u (*/5) o satırı `expires_at < now()`'da
--   siler (066:358) — verified_at'e BAKMADAN, otp ömrü 10dk. glatko_hpatient
--   doğrulama cookie'si ise 1 SAAT yaşıyor. Yani gate'in dayanağının ömrü (10dk)
--   < koruduğu kimlik bilgisinin ömrü (1sa). Bugün 5dk'lık hold bunu GÖLGELİYOR
--   (geç booking PATIENT_NOT_VERIFIED'den önce HOLD_EXPIRED alır), ama latent bir
--   kırılganlık: hold süresi uzar/cleanup değişirse meşru booking'ler 403 alır.
--
-- ÇÖZÜM (güvenlik AZALMADAN):
--   health.patients satırı YALNIZCA health_verify_otp içinde, başarılı kod + rıza
--   sonrası INSERT edilir (070:262) ve cleanup_expired patients'a DOKUNMAZ (yalnız
--   slot_holds + otp_codes). Dolayısıyla "patient VAR" = "bu telefon OTP doğruladı"
--   garantisidir ve KALICIDIR. Wrapper bunu zaten PATIENT_INVALID olarak kontrol
--   ediyor → otp_codes re-check'i GEREKSİZ. Kaldırıyoruz; doğrulama garantisi
--   patient'ın varlığıyla aynen korunur, yalnız kırılgan kupling kalkar.
--
-- DEĞİŞMEYEN: book_appointment'ın atomikliği (FOR UPDATE hold + appointments
--   EXCLUDE son bekçi + hold sil), HOLD_NOT_OWNED session-sahipliği kontrolü,
--   reminders/dispatch/özet, PII Vault şifre çözümü — HEPSİ AYNI. Yalnızca
--   071'deki `if not exists (... otp_codes ...) then raise PATIENT_NOT_VERIFIED`
--   bloğu çıkar.
--
-- ADDITIVE: CREATE OR REPLACE; health.* + book_appointment + 066-071 ALTER/DROP YOK.
-- GÜVENLİK: SECURITY DEFINER + SET search_path='' (066-071 deseni); EXECUTE yalnız
--   service_role (anon ASLA). Grant'lar CREATE OR REPLACE'te korunur; yine de açıkça
--   yeniden uygulanır.
--
-- ROLLBACK: 071'deki sürümü yeniden uygula (otp_codes bloğu geri gelir).

create or replace function public.health_book_appointment(
  p_hold_id uuid, p_patient_id uuid, p_note text, p_session_key text, p_locale text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold       health.slot_holds;
  v_pat        health.patients;
  v_appt       health.appointments;
  v_provider   health.providers;
  v_service    health.services;
  v_location   health.locations;
  v_key        text;
  v_phone      text;
  v_email      text;
  v_confirm_sms_id   uuid;
  v_confirm_email_id uuid;
begin
  -- (1) hold sahipliği
  select * into v_hold from health.slot_holds where id = p_hold_id;
  if not found then raise exception 'HOLD_EXPIRED'; end if;
  if v_hold.session_key is distinct from p_session_key then raise exception 'HOLD_NOT_OWNED'; end if;

  -- (2) patient VAR. NOT: health.patients yalnızca health_verify_otp içinde, başarılı
  --     OTP + rıza sonrası INSERT edilir (070) ve cleanup_expired patients'ı SİLMEZ
  --     (yalnız slot_holds + otp_codes). Bu yüzden "patient var" = "doğrulanmış"tır ve
  --     KALICIDIR → ayrı bir otp_codes re-check'i GEREKSİZ + kırılgandı (cron 10dk'da
  --     siler, cookie 1sa yaşar). Kaldırıldı (Finding #2); garanti patient varlığıyla aynı.
  select * into v_pat from health.patients where id = p_patient_id;
  if not found then raise exception 'PATIENT_INVALID'; end if;

  -- (3) H1 atomik booking (FOR UPDATE hold + INSERT appointment + EXCLUDE → SLOT_TAKEN + hold sil)
  v_appt := health.book_appointment(p_hold_id, p_patient_id, p_note);

  -- (4) reminders (aynı tx): confirm(sms) + confirm(email, varsa) + t24 + t2 (hepsi pending)
  insert into health.reminders_outbox (appointment_id, channel, template, send_at)
  values (v_appt.id, 'sms', 'confirm', now())
  returning id into v_confirm_sms_id;

  v_key   := (select decrypted_secret from vault.decrypted_secrets where name = 'health_pii_key');
  v_phone := extensions.pgp_sym_decrypt(v_pat.phone_enc, v_key);
  v_email := case when v_pat.email_enc is not null
                  then extensions.pgp_sym_decrypt(v_pat.email_enc, v_key) else null end;

  if v_email is not null then
    insert into health.reminders_outbox (appointment_id, channel, template, send_at)
    values (v_appt.id, 'email', 'confirm', now())
    returning id into v_confirm_email_id;
  end if;

  insert into health.reminders_outbox (appointment_id, channel, template, send_at)
  values (v_appt.id, 'sms', 't24', lower(v_appt.slot_range) - interval '24 hours');
  insert into health.reminders_outbox (appointment_id, channel, template, send_at)
  values (v_appt.id, 'sms', 't2',  lower(v_appt.slot_range) - interval '2 hours');

  -- (5) özet (PII'siz) + dispatch payload (PII — yalnız service-role route'a, confirm için)
  select * into v_provider from health.providers where id = v_appt.provider_id;
  select * into v_service  from health.services  where id = v_appt.service_id;
  select * into v_location from health.locations where id = v_appt.location_id;

  return jsonb_build_object(
    'appointmentId', v_appt.id,
    'manageToken',   v_appt.manage_token,
    'slotStart',     lower(v_appt.slot_range),
    'slotEnd',       upper(v_appt.slot_range),
    'dispatch', jsonb_build_object(
      'phoneE164',             v_phone,
      'email',                 v_email,
      'patientName',           v_pat.full_name,
      'confirmSmsReminderId',  v_confirm_sms_id,
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
revoke all on function public.health_book_appointment(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.health_book_appointment(uuid,uuid,text,text,text) to service_role;
