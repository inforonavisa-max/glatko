-- ═══════════════════════════════════════════════════════════════════════════
-- 076: H9 erteleme — audit düzeltmeleri (additive CREATE OR REPLACE)
-- ═══════════════════════════════════════════════════════════════════════════
-- 075'in health_reschedule_appointment'ını CREATE OR REPLACE ile YERİNDE düzeltir
-- (DROP YOK, imza/dönüş şekli AYNI → çağıranlar değişmez). 066 health.book_
-- appointment hâlâ BİREBİR çağrılır (atomiklik tek kaynak, DUPLİKE EDİLMEZ).
--
-- DÜZELTİLEN BULGULAR:
--   (A) KİMLİK TAŞIMA + AUTHZ (bulgu #2/#9/#10/#12/#15/#16): 075 yeni randevuyu
--       cookie'deki TAZE patient'a (health_verify_otp her zaman YENİ placeholder
--       satır INSERT eder, ad="Hasta"/"Patient", email=NULL) bağlıyordu →
--         * hasta'nın AD'ı bildirimlerde "Hasta"ya düşüyordu,
--         * email_enc NULL → taşıma e-postası SESSİZCE düşüyordu (SMS-only),
--         * token sahibi başkasının slot'unu KENDİ telefonuyla taşıyabiliyordu
--           (kurban hiç haber almıyordu).
--       FIX: yeni randevu ESKİ randevunun patient_id'siyle (v_old.patient_id)
--       bookleniyor → orijinal ad/email/telefon taşınır. Re-verify OTP yalnız
--       CANLILIK kanıtı: re-verify eden patient'ın phone_hash'i ESKİ patient'ınkiyle
--       AYNI olmalı (RESCHEDULE_IDENTITY_MISMATCH) → token + ESKİ telefon ikisi de
--       gerekir, böylece token-sahibi yabancının randevusunu sessizce taşıyamaz.
--   (B) NOTE TAŞIMA (bulgu #17): p_note NULL ise yeni randevu ESKİ randevunun
--       patient_note'unu devralır (taşımada not kaybı yok).
--   (C) CRON CRASH-RECOVERY (bulgu #14): yeni randevunun hasta satırları artık
--       template='reschedule' kuyruğa girer (eski 'confirm' yerine). Process
--       RPC commit ile anlık dispatch arasında ölürse H6 cron DOĞRU "X'ten Y'ye
--       taşındı" kopyasını render eder (claim zaten oldSlotStart reverse-join'lu);
--       dispatchRescheduleConfirm reminder id'leriyle (şablondan bağımsız) işaretler.
--   (D) GÖZLEMLENEBİLİRLİK (bulgu #13): book_appointment exception bloğu artık
--       yalnız SLOT_TAKEN/HOLD_EXPIRED yakalar; beklenmeyen hata YUKARI fırlar →
--       route catch'i loglar (sessiz {ok:false} maskeleme yok).
--
-- GÜVENLİK/ADDITIVE: SECURITY DEFINER + SET search_path='' (066-075 deseni);
-- extensions.*/vault.* şema-qualified; EXECUTE yalnız service_role. health.*
-- tabloları + 066-075 nesneleri + book_appointment'ta DROP/destructive ALTER YOK.
--
-- ROLLBACK: 075'i yeniden uygula (CREATE OR REPLACE geri döner). 075 zaten prod'da
-- DEĞİL → bu dosya 075 ile BİRLİKTE uygulanmalı (main session). Bağımsız drop:
--   -- (yok — 076 yalnız 075'in fonksiyon gövdesini değiştirir, yeni nesne yaratmaz)

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
  -- NOT: minimal payload (dispatch/summary YOK + idempotent:true). Çağıran (booking.ts)
  -- bu varyantı AYRI ele alır → route dispatchRescheduleConfirm'ü ATLAR (ilk çağrı zaten yolladı).
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

  -- (2b) KİMLİK TAŞIMA + AUTHZ (bulgu #2/#9/#10/#12/#15/#16): erteleme ESKİ randevunun
  --      GERÇEK sahibine bağlı kalmalı. Re-verify eden patient (v_pat) yalnız CANLILIK
  --      kanıtıdır → telefonu (phone_hash) ESKİ patient'ınkiyle AYNI olmalı. Eşleşmezse
  --      token-sahibi yabancının slot'unu taşıyamaz (kurban sessizce kaybolmaz).
  select * into v_owner from health.patients where id = v_old.patient_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'PATIENT_INVALID');
  end if;
  if v_pat.phone_hash is distinct from v_owner.phone_hash then
    return jsonb_build_object('ok', false, 'reason', 'RESCHEDULE_IDENTITY_MISMATCH');
  end if;

  -- Kapsam: AYNI provider + AYNI service + AYNI location. (Hasta sadece zamanı taşır.)
  -- NOT: hedef slot ESKİ randevuyla AYNI provider'da çakışırsa book_appointment EXCLUDE
  --      (yalnız status='confirmed' satırlar) henüz iptal edilmemiş eski satıra takılır →
  --      SLOT_TAKEN. Slot'lar discrete (çakışmaz) tasarlandığından bu beklenen davranıştır;
  --      "kendi zamanına çakışan" taşıma SLOT_TAKEN olarak yüzeye çıkar (bulgu #20, kabul).
  if v_hold.provider_id is distinct from v_old.provider_id
     or v_hold.service_id is distinct from v_old.service_id
     or v_hold.location_id is distinct from v_old.location_id then
    return jsonb_build_object('ok', false, 'reason', 'RESCHEDULE_SCOPE_MISMATCH');
  end if;

  -- (B) Not taşıma (bulgu #17): p_note NULL ise eski randevunun not'unu devral.
  v_note := coalesce(p_note, v_old.patient_note);

  -- (3) YENİ randevuyu ÖNCE bookle (race-safety krizi). ESKİ patient_id ile (v_old.patient_id)
  --     → orijinal ad/email/telefon taşınır. book_appointment EXCLUDE son bekçisi SLOT_TAKEN
  --     fırlatırsa BU bloğunda yakalanır → tüm tx rollback → eski randevu confirmed kalır.
  --     (D, bulgu #13): yalnız SLOT_TAKEN/HOLD_EXPIRED yakala; beklenmeyen hata yukarı fırlar.
  begin
    v_new := health.book_appointment(p_new_hold_id, v_old.patient_id, v_note);
  exception
    when others then
      if sqlerrm in ('SLOT_TAKEN', 'HOLD_EXPIRED') then
        return jsonb_build_object('ok', false, 'reason', sqlerrm);
      end if;
      raise;  -- gerçek bir bug → yukarı fırlat (route catch'i loglar, sessiz maskeleme yok)
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

  -- (5) YENİ randevunun reminder satırları. Hasta kanalı artık template='reschedule'
  --     (C, bulgu #14): anlık dispatch zaten reschedule kopyası render eder; ayrıca cron
  --     crash-recovery'de DOĞRU "eski→yeni" kopyası gönderilir (claim oldSlotStart join'li).
  --     Confirm id'leri (artık 'reschedule' satırları) route'un anlık dispatch'ine döner.
  --     t24/t2 değişmez; ayrıca tek 'reschedule_provider' (email) satırı.
  insert into health.reminders_outbox (appointment_id, channel, template, send_at)
  values (v_new.id, 'sms', 'reschedule', now())
  returning id into v_confirm_sms_id;

  -- Kimlik artık ESKİ sahipten (v_owner): orijinal ad/telefon/email taşma bildirimine.
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

  -- Provider taşıma bildirimi (yeni randevuya iliştirilir; eski slot'u da taşır).
  perform public.health_enqueue_reschedule_provider(v_new.id, v_old.id);

  -- (6) Yeni randevunun render'ı için locale sidecar (cron t24/t2/reschedule doğru dilde).
  insert into health.reminder_locale (appointment_id, locale)
  values (v_new.id, p_locale)
  on conflict (appointment_id) do update set locale = excluded.locale;

  -- (7) Özet (PII'siz) + dispatch payload (PII — yalnız service-role route'a, taşma bildirimi için).
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
      'patientName',            v_owner.full_name,   -- orijinal ad (placeholder DEĞİL)
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

-- ═══════════════════════════════════════════════════════════════════════════
-- DRY-RUN DOĞRULAMA PLANI (PROD'A UYGULANMAZ — main session BEGIN/ROLLBACK ile koşar)
-- ═══════════════════════════════════════════════════════════════════════════
-- 075 + 076 AYNI tx'te uygulanır (076 yalnız 075'in gövdesini değiştirir). RAISE NOTICE
-- yalnız SAYI/boolean yazar — PII değeri ASLA loglanmaz. ROLLBACK her şeyi geri alır.
--
-- begin;
--   -- (0) 075'in TÜM CREATE bloklarını uygula, SONRA 076'nın CREATE OR REPLACE'ini uygula.
--
--   -- (1) Seed (075 planındaki gibi): Vault key + provider/service/location + ESKİ randevu'nun
--   --     GERÇEK sahibi = OTP-verified patient P1 (ad="Marko", email dolu). Gelecekteki confirmed
--   --     randevu A1 (patient=P1). YENİ serbest slot için hold H (AYNI provider/service/location,
--   --     hastanın session'ı). Re-verify: AYNI telefonla OTP → YENİ placeholder patient P2
--   --     (ad="Hasta", email NULL, phone_hash = P1.phone_hash).
--
--   -- (2) Mutlu yol (KİMLİK TAŞIMA): reschedule(A1.token, H, sess, P2.id, null, 'me')
--   do $$
--   declare v jsonb; v_new uuid; v_old uuid;
--   begin
--     v := public.health_reschedule_appointment(:old_token, :hold, :sess, :p2_id, null, 'me');
--     raise notice 'ok = %', (v->>'ok');                                   -- t
--     v_new := (v->>'newAppointmentId')::uuid; v_old := (v->>'oldAppointmentId')::uuid;
--     -- (A) Yeni randevu ESKİ sahibe (P1) bağlı, placeholder P2'ye DEĞİL:
--     raise notice 'new patient = old owner = %',
--       ((select patient_id from health.appointments where id=v_new) = :p1_id);   -- t
--     -- dispatch.patientName orijinal ad (placeholder değil):
--     raise notice 'dispatch name = %', (v#>>'{dispatch,patientName}');           -- Marko
--     -- email taşma bildirimi tekrar canlı (P1.email dolu → email satırı var):
--     raise notice 'email row exists = %', (select count(*) from health.reminders_outbox
--        where appointment_id=v_new and channel='email' and template='reschedule');  -- 1
--     -- (C) Hasta satırları template='reschedule' (cron crash-recovery doğru kopya):
--     raise notice 'patient reschedule rows = %', (select count(*) from health.reminders_outbox
--        where appointment_id=v_new and template='reschedule');                   -- 2 (sms+email)
--     raise notice 'NO patient confirm row = %', (select count(*) from health.reminders_outbox
--        where appointment_id=v_new and template='confirm');                      -- 0
--     -- Eski randevu cancelled[reason=reschedule] + skipped t24/t2 + NO 'cancelled' satırı:
--     raise notice 'old reason = %', (select cancel_reason from health.appointments where id=v_old); -- reschedule
--     raise notice 'old skipped = %', (select count(*) from health.reminders_outbox
--        where appointment_id=v_old and template in ('t24','t2') and status='skipped');  -- 2
--     raise notice 'no cancelled row = %', (select count(*) from health.reminders_outbox
--        where appointment_id=v_old and template='cancelled');                    -- 0
--   end $$;
--
--   -- (3) AUTHZ (bulgu #12/#15): FARKLI telefonla re-verify eden patient P3 (phone_hash≠P1)
--   --     → reschedule(A2.token, H2, sess, P3.id, ...) → reason RESCHEDULE_IDENTITY_MISMATCH +
--   --     ESKİ A2 HÂLÂ confirmed (token-sahibi yabancının slot'unu taşıyamadı).
--   --   select public.health_reschedule_appointment(:t2,:h2,:sess,:p3_id,null,'me')->>'reason';
--   --     → RESCHEDULE_IDENTITY_MISMATCH
--   --   select status from health.appointments where manage_token=:t2; → confirmed
--
--   -- (4) NOTE taşıma (bulgu #17): A3.patient_note='ESKI NOT', reschedule p_note=null →
--   --     yeni randevu patient_note='ESKI NOT' (devralındı).
--   --   select patient_note from health.appointments where id=:new3; → 'ESKI NOT'
--
--   -- (5) Idempotent replay (bulgu #1/#4/#7): AYNI A1.token'ı TEKRAR ertele →
--   --     {ok:true, idempotent:true, newManageToken} (dispatch/summary YOK) + 0 yeni satır.
--   --   select public.health_reschedule_appointment(:old_token,:hold,:sess,:p2_id,null,'me');
--   --     → 'idempotent' = true
--
--   -- (6) (D) Beklenmeyen-hata yukarı fırlar (yalnız SLOT_TAKEN/HOLD_EXPIRED yakalanır) —
--   --     statik gözden geçirme; book_appointment yalnız bu iki kodu fırlatır.
--
--   -- (7) 066/071/073/075 DEĞİŞMEDİ (additive teyidi):
--   --   \df health.book_appointment        → hâlâ 3-arg (uuid,uuid,text)
--   --   \df public.health_reschedule_appointment → hâlâ 6-arg (imza aynı)
--
-- rollback;  -- HİÇBİR ŞEY KALICI DEĞİL.
