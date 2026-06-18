-- ═══════════════════════════════════════════════════════════════════════════
-- 071: H5b — atomik rezervasyon + onay + reminders + iptal (public wrapper'lar)
-- ═══════════════════════════════════════════════════════════════════════════
-- Sistemin tamamlanma anı: İLK GERÇEK YAZMA (health.appointments). H2/H4/H5a dersi:
-- health şeması PostgREST'e expose EDİLMEZ → service-role bile health.book_appointment'ı
-- doğrudan çağıramaz → İNCE PUBLIC WRAPPER. Wrapper, H1'in atomik book_appointment'ının
-- (FOR UPDATE hold + EXCLUDE son bekçi) ÜSTÜNE iki güvenlik katmanı ekler:
--   (1) hold'un çağıran session'a ait olduğu (başkasının hold'unu rezerve edemez),
--   (2) patient'ın OTP-verified olduğu (yalnız doğrulanmış hasta randevu alır).
-- Booking + reminders TEK transaction (appointment olursa reminders da olur, olmazsa hiçbiri).
--
-- GÜVENLİK: SECURITY DEFINER + SET search_path='' (066-070 deseni). EXECUTE yalnız
-- service_role (anon ASLA). PII (telefon/email) Vault anahtarıyla yalnız confirm-dispatch
-- için çözülür (book wrapper'ın dönüşünde, service-role route'a) — onay/yönetim read-RPC'si
-- PII DÖNDÜRMEZ. t24/t2 reminder DISPATCH'i H6'ya ait; H5b yalnız satır yazar + confirm'i
-- route'tan HEMEN gönderir.
--
-- ADDITIVE: health.* + book_appointment + 066-070 ALTER/DROP YOK. Yeni public wrapper'lar.
--
-- ROLLBACK:
--   drop function if exists public.health_book_appointment(uuid,uuid,text,text,text);
--   drop function if exists public.health_mark_reminder(uuid,text,text);
--   drop function if exists public.health_get_appointment(text,text);
--   drop function if exists public.health_cancel_appointment(text);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Atomik rezervasyon. Sahiplik + verified + book_appointment + reminders (tek tx).
--    Döner: appointment + manage_token + (route confirm dispatch'i için) PII payload +
--    PII'siz özet. book_appointment HOLD_EXPIRED / SLOT_TAKEN fırlatırsa yukarı taşınır.
-- ─────────────────────────────────────────────────────────────────────────────
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

  -- (2) patient var + OTP-verified
  select * into v_pat from health.patients where id = p_patient_id;
  if not found then raise exception 'PATIENT_INVALID'; end if;
  if not exists (
    select 1 from health.otp_codes o
    where o.phone_hash = v_pat.phone_hash and o.verified_at is not null
  ) then
    raise exception 'PATIENT_NOT_VERIFIED';
  end if;

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Reminder durumu işaretle (route confirm gönderdikten sonra). sent→sent_at set.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_mark_reminder(
  p_reminder_id uuid, p_status text, p_provider_msg_id text
)
returns void
language sql
security definer
set search_path = ''
as $$
  update health.reminders_outbox
  set status          = p_status,
      sent_at         = case when p_status = 'sent' then now() else sent_at end,
      provider_msg_id = coalesce(p_provider_msg_id, provider_msg_id)
  where id = p_reminder_id;
$$;
revoke all on function public.health_mark_reminder(uuid,text,text) from public, anon, authenticated;
grant execute on function public.health_mark_reminder(uuid,text,text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Randevu özeti (onay + yönetim sayfaları). manage_token ile. PII DÖNDÜRMEZ.
--    NULL → token yok (sayfa 404). status confirmed/cancelled döner.
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
    'manageToken',        a.manage_token
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
-- 4) İptal (token-bound). status='cancelled' → slot tekrar müsait (no_overlap EXCLUDE
--    yalnız confirmed'da) + pending t24/t2 reminders 'skipped'. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_cancel_appointment(p_manage_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_appt health.appointments;
begin
  select * into v_appt from health.appointments where manage_token = p_manage_token for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  end if;
  if v_appt.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'status', 'cancelled'); -- idempotent
  end if;
  if v_appt.status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'reason', 'NOT_CANCELLABLE', 'status', v_appt.status);
  end if;

  update health.appointments
  set status = 'cancelled', cancelled_at = now(), cancel_reason = 'patient'
  where id = v_appt.id;

  update health.reminders_outbox
  set status = 'skipped'
  where appointment_id = v_appt.id and status = 'pending';

  return jsonb_build_object('ok', true, 'status', 'cancelled');
end $$;
revoke all on function public.health_cancel_appointment(text) from public, anon, authenticated;
grant execute on function public.health_cancel_appointment(text) to service_role;
