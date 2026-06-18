-- ═══════════════════════════════════════════════════════════════════════════
-- 073: H6 — reminder dispatch (cron-driven outbox drain + enqueue tamamlayıcıları)
-- ═══════════════════════════════════════════════════════════════════════════
-- H5b (071) sadece confirm(sms)+confirm(email)+t24(sms)+t2(sms) satırlarını YAZAR ve
-- confirm'i route'tan HEMEN gönderir. H6 = KALAN due reminder'ları CRON ile gönderir
-- (t24, t2 + route dispatch'i başarısız olmuş confirm), retry'lı; ayrıca 071'in HİÇ
-- kuyruğa ALMADIĞI 3 şablonu (cancelled / provider_new_booking / followup) additive
-- olarak kuyruğa ekler. Gönderim TEK yerden (Vercel cron → lib/saglik/reminders-dispatch)
-- yapılır; bu migration yalnız DB kontratını sağlar.
--
-- health şeması PostgREST'e EXPOSE EDİLMEZ (066) → service_role bile health.* satırlarına
-- REST üzerinden erişemez → her şey public SECURITY DEFINER wrapper. 066-072 deseni:
-- SECURITY DEFINER + SET search_path='' + EXECUTE yalnız service_role (anon/authenticated
-- ASLA). pgcrypto `extensions` şemasında → tüm fonksiyon çağrıları şema-qualified.
--
-- ADDITIVE: health.* tabloları + health.book_appointment + 066-072 objelerinde ALTER/DROP
-- YOK. Yeni: 1 tablo (health.reminder_locale sidecar), 1 index, 6 public RPC. Locale
-- sidecar GEREKLİ çünkü health.patients + reminders_outbox'ta locale kolonu YOK ve bu
-- tablolara ALTER YASAK — hasta UI locale'i book-zamanında route'tan yazılır, claim
-- LEFT JOIN'ler, fallback 'en'.
--
-- ÇİFT-GÖNDERİM DURUŞU (at-least-once, mükerrer-azaltıcı — MUTLAK değil): reminders_outbox.status
-- CHECK'i ('pending','sent','failed','skipped') ile sabit; ALTER yasak olduğundan claim-zamanında
-- yeni bir 'sending'/'claimed' transient status EKLENEMEZ. Bunun yerine claim, satırları
-- FOR UPDATE SKIP LOCKED ile kilitler (paralel cron çakışmasında ikinci koşu kilitli
-- satırları ATLAR) ve dispatcher her satırı gönderdikten HEMEN sonra (aynı mantıksal
-- akış içinde) health_mark_reminder ile işaretler. DİKKAT: kilit yalnız CLAIM tx'i boyunca
-- tutulur — claim COMMIT olunca (jsonb dönerken) kilit BIRAKILIR ama satır hâlâ 'pending'tir;
-- gönderim+mark sonraki ayrı tx'lerde olur. Bu post-claim/pre-mark penceresinde üst üste
-- binen bir koşu satırı yeniden claim edip mükerrer gönderebilir. Vercel schedule başına
-- at-most-one koşu normalde örtüşmeyi engeller; bir koşu */5 dk'yı aşarsa tek risk budur.
-- İçerik idempotent → en kötü ihtimal hastaya 1 mükerrer SMS/email. Küçük batch (p_limit ~25)
-- pencereyi küçük tutar. (Oturum-bazlı advisory lock pooled bağlantılarda koşu boyunca güvenilir
-- span ETMEZ → kasıtlı olarak EKLENMEDİ; yanlış bir "kesin koruma" garantisi vermekten kaçınıldı.)
--
-- RETRY (correctness): başarısız gönderim satırı 'pending' bırakır + retry_count'u artırır;
-- claim filtresi retry_count<3 → bir sonraki cron yeniden dener, 3 denemede teslim olmazsa
-- terminal 'failed' + Sentry (poison satır artık claim edilmez).
--
-- ROLLBACK:
--   drop function if exists public.health_claim_due_reminders(int);
--   drop function if exists public.health_mark_reminder(uuid,text,text,boolean);
--   drop function if exists public.health_set_reminder_locale(uuid,text);
--   drop function if exists public.health_enqueue_cancelled(text);
--   drop function if exists public.health_enqueue_provider_new_booking(uuid);
--   drop function if exists public.health_enqueue_followups(int);
--   drop table if exists health.reminder_locale;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) Locale sidecar — hasta UI locale'i (reminders'ı doğru dilde render etmek için).
--    health.patients/reminders_outbox'a ALTER YASAK → ayrı additive tablo. Booking
--    route bookAppointment'tan SONRA health_set_reminder_locale ile yazar; yoksa 'en'.
--    appointment silinince (cascade) düşsün diye FK on delete cascade.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists health.reminder_locale (
  appointment_id uuid primary key references health.appointments(id) on delete cascade,
  locale         text not null
);

-- service_role full DML (066 default privileges yeni tabloyu otomatik kapsar ama açık ol).
grant all privileges on table health.reminder_locale to service_role;
-- RLS enable + policy YOK = deny-all (anon/authenticated). Erişim yalnız service_role.
alter table health.reminder_locale enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) health_set_reminder_locale — booking route'tan çağrılır (book sonrası, additive).
--    Idempotent upsert. Geçersiz appointment_id sessizce no-op (FK ihlali fırlatmaz:
--    yalnızca var olan appointment için yaz). Locale doğrulaması route'ta yapılır.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_set_reminder_locale(
  p_appointment_id uuid, p_locale text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into health.reminder_locale (appointment_id, locale)
  values (p_appointment_id, p_locale)
  on conflict (appointment_id) do update set locale = excluded.locale;
exception when foreign_key_violation then
  -- Appointment yoksa sessizce yut (route hatası asla booking'i kırmasın).
  null;
end $$;
revoke all on function public.health_set_reminder_locale(uuid,text) from public, anon, authenticated;
grant execute on function public.health_set_reminder_locale(uuid,text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) health_claim_due_reminders(p_limit) — due pending reminder'ları ATOMİK claim et
--    + render+gönderim için gereken PII'yi çöz. FOR UPDATE SKIP LOCKED → paralel cron
--    koşusu kilitli satırı atlar (çift-gönderim koruması, lock penceresi boyunca).
--    Status DEĞİŞTİRİLMEZ (CHECK'e yeni transient status eklenemez); dispatcher her
--    satırı gönderdikten hemen sonra health_mark_reminder çağırır.
--
--    Döner: jsonb array. Her satır render+send için yeterli alanı taşır. PII (telefon/
--    email/hasta adı) yalnız service_role çağırana döner — ASLA loglanmaz. Provider
--    iletişimi health.providers'da YOK (066) → providerPhoneE164/providerEmail NULL;
--    provider_new_booking gönderimi dispatcher'da auth.users'tan türetilir + yoksa skip.
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

  -- retry_count < 3: bir satır 3 başarısız denemeden sonra POISON kabul edilir ve artık
  -- claim EDİLMEZ (recordFailure satırı 'pending' bırakıp retry_count'u artırır → bir
  -- sonraki cron koşusu yeniden dener; sayaç 3'e ulaşınca terminal kalır + Sentry).
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
      -- Hasta-locale (patient e-postaları/SMS) + provider-locale (provider e-postası)
      -- ayrı çözülür; ikisinde de key yoksa value-level fallback (en → me). services.name
      -- seed'i yalnız me/en/tr key taşır → ru/uk/de/it/sr/ar booking'lerde key absent.
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
-- 3) health_mark_reminder (4-arg additive overload) — retry-aware.
--    071'in 3-arg sürümü DOKUNULMADAN durur. p_bump_retry=true iken retry_count++
--    (dispatcher başarısız gönderimde geçer → sayaç tırmanır). status='sent' → sent_at.
--    RETRY DESENİ: dispatcher retryable hatada p_status='pending'+p_bump_retry=true geçer
--    (satır 'pending' kalır → bir sonraki cron retry_count<3 filtresiyle yeniden claim
--    eder); retry_count 3'e ulaşınca terminal p_status='failed' geçer. Teslim edilemeyen
--    no-op kapanışlarda p_status='skipped' (sent ≠ skipped, outbox doğru kalır).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_mark_reminder(
  p_reminder_id uuid, p_status text, p_provider_msg_id text, p_bump_retry boolean
)
returns void
language sql
security definer
set search_path = ''
as $$
  update health.reminders_outbox
  set status          = p_status,
      sent_at         = case when p_status = 'sent' then now() else sent_at end,
      provider_msg_id = coalesce(p_provider_msg_id, provider_msg_id),
      retry_count     = case when p_bump_retry then retry_count + 1 else retry_count end
  where id = p_reminder_id;
$$;
revoke all on function public.health_mark_reminder(uuid,text,text,boolean) from public, anon, authenticated;
grant execute on function public.health_mark_reminder(uuid,text,text,boolean) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) health_enqueue_cancelled(token) — iptal route'undan çağrılır. 071'in cancel RPC'si
--    t24/t2'yi 'skipped' yapar ama 'cancelled' satırı YAZMAZ → H6 burada ekler.
--    Yalnız cancelled appointment için + bu appointment'a daha önce cancelled satırı
--    yoksa (idempotent). send_at=now() → cron bir sonraki koşuda gönderir.
--    email satırı yalnız hasta email'i varsa (email_enc not null).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_enqueue_cancelled(p_manage_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt    health.appointments;
  v_has_email boolean;
begin
  select * into v_appt from health.appointments where manage_token = p_manage_token;
  if not found or v_appt.status <> 'cancelled' then
    return;  -- yalnız iptal edilmiş randevu için
  end if;
  if exists (
    select 1 from health.reminders_outbox
    where appointment_id = v_appt.id and template = 'cancelled'
  ) then
    return;  -- idempotent
  end if;

  insert into health.reminders_outbox (appointment_id, channel, template, send_at)
  values (v_appt.id, 'sms', 'cancelled', now());

  select pat.email_enc is not null into v_has_email
  from health.patients pat where pat.id = v_appt.patient_id;
  if v_has_email then
    insert into health.reminders_outbox (appointment_id, channel, template, send_at)
    values (v_appt.id, 'email', 'cancelled', now());
  end if;
end $$;
revoke all on function public.health_enqueue_cancelled(text) from public, anon, authenticated;
grant execute on function public.health_enqueue_cancelled(text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) health_enqueue_provider_new_booking(appointmentId) — booking route'undan çağrılır
--    (book sonrası, additive). Provider'a yeni randevu özeti. Provider iletişimi
--    health.providers'da YOK → kanal=email satırı kuyruğa eklenir; dispatcher email'i
--    auth.users'tan (provider.user_id) türetir + yoksa zarifçe skip. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_enqueue_provider_new_booking(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_exists boolean;
begin
  if not exists (select 1 from health.appointments where id = p_appointment_id) then
    return;
  end if;
  select exists (
    select 1 from health.reminders_outbox
    where appointment_id = p_appointment_id and template = 'provider_new_booking'
  ) into v_exists;
  if v_exists then return; end if;  -- idempotent

  insert into health.reminders_outbox (appointment_id, channel, template, send_at)
  values (p_appointment_id, 'email', 'provider_new_booking', now());
end $$;
revoke all on function public.health_enqueue_provider_new_booking(uuid) from public, anon, authenticated;
grant execute on function public.health_enqueue_provider_new_booking(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) health_enqueue_followups(p_lookahead_min) — cron'un kendisi tarafından çağrılır.
--    071 followup satırı YAZMAZ (yalnız confirm/t24/t2). Bu fonksiyon, slot'u biten
--    (slot bitişi + 24h <= now) hâlâ 'confirmed' randevular için followup(sms[+email])
--    satırlarını self-seed eder. send_at = slotEnd + 24h. Idempotent (NOT EXISTS).
--    İptal/no-show/completed-dışı durumlar dahil edilmez (yalnız confirmed = gerçekten
--    katılmış varsayımı v1; H7 completed işaretleyince daraltılabilir). followup =
--    yalnız özel geri bildirim linki (public yorum YOK — K5).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.health_enqueue_followups(p_lookahead_min int default 60)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_count int;
begin
  -- Tek statement: her iki data-modifying CTE de tam bir kez çalışır (Postgres garantisi),
  -- seed_email final SELECT'te referans edilmese bile. seed_email, sms satırı eklenmiş
  -- appointment'lara email satırı ekler (yalnız hasta email'i varsa).
  with seed as (
    insert into health.reminders_outbox (appointment_id, channel, template, send_at)
    select a.id, 'sms', 'followup', upper(a.slot_range) + interval '24 hours'
    from health.appointments a
    where a.status = 'confirmed'
      and upper(a.slot_range) + interval '24 hours'
            <= now() + make_interval(mins => greatest(p_lookahead_min, 0))
      and not exists (
        select 1 from health.reminders_outbox r
        where r.appointment_id = a.id and r.template = 'followup'
      )
    returning appointment_id
  ),
  seed_email as (
    insert into health.reminders_outbox (appointment_id, channel, template, send_at)
    select s.appointment_id, 'email', 'followup',
           upper(a.slot_range) + interval '24 hours'
    from seed s
    join health.appointments a on a.id = s.appointment_id
    join health.patients pat   on pat.id = a.patient_id
    where pat.email_enc is not null
    returning s.appointment_id
  )
  select count(*) into v_count from seed;
  return v_count;
end $$;
revoke all on function public.health_enqueue_followups(int) from public, anon, authenticated;
grant execute on function public.health_enqueue_followups(int) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- DRY-RUN DOĞRULAMA PLANI (PROD'A UYGULANMAZ — main session BEGIN/ROLLBACK ile koşar)
-- ═══════════════════════════════════════════════════════════════════════════
-- Amaç: 073'ü uygulamadan ÖNCE kontratı kanıtlamak + 066/071 objelerinin DOKUNULMADIĞINI
-- doğrulamak. RAISE NOTICE yalnız SAYI yazar — PII değeri ASLA loglanmaz. ROLLBACK her şeyi
-- geri alır. (Önce 073'ün CREATE bloklarını aynı tx içinde uygula, sonra bu probu koş.)
--
-- begin;
--   -- (0) 073 fonksiyonlarını bu tx içinde yarat (yukarıdaki CREATE OR REPLACE blokları).
--
--   -- (1) Vault anahtarı + seed: 1 provider/service/location/patient + 1 confirmed appointment.
--   --     (Mevcut seed 067 verisini kullanabilir; aksi halde minimal satırlar ekle.)
--   --     patient phone_enc/email_enc = extensions.pgp_sym_encrypt(<test>, <health_pii_key>).
--   --     reminders_outbox'a send_at GEÇMİŞTE 2 pending satır (t24 + t2).
--
--   -- (2) Claim 2 due satır döndürmeli + çözülmüş telefon seed ile eşleşmeli (yalnız SAYI logla):
--   do $$
--   declare v jsonb; v_n int; v_match boolean;
--   begin
--     v := public.health_claim_due_reminders(10);
--     v_n := jsonb_array_length(v);
--     raise notice 'claimed rows = %', v_n;                    -- beklenen: 2
--     v_match := (v->0->>'phoneE164') is not null;             -- PII DEĞERİ loglanmaz, yalnız varlık
--     raise notice 'phone decrypted (non-null) = %', v_match;  -- beklenen: t
--   end $$;
--
--   -- (3) FOR UPDATE SKIP LOCKED kanıtı: 2. (eşzamanlı) oturum sim'inde claim kilitli satırları
--   --     ATLAR. Aynı tx içinde ikinci kez claim => 0 (satırlar hâlâ kilitli + pending).
--   do $$ declare v2 jsonb; begin
--     v2 := public.health_claim_due_reminders(10);
--     raise notice 're-claim within same tx (locked) = %', jsonb_array_length(v2);  -- beklenen: 0
--   end $$;
--
--   -- (4) retry bump + re-claim: retryable hata 'pending'+bump → bir sonraki claim yeniden
--   --   görür; retry_count=3 olunca claim ARTIK döndürmez (poison).
--   --   select id from health.reminders_outbox where status='pending' limit 1  → :rid
--   --   select retry_count from health.reminders_outbox where id = :rid;        → R0 (0 varsay)
--   --   select public.health_mark_reminder(:rid,'pending',null,true);           -- retryable fail
--   --   select retry_count, status from health.reminders_outbox where id = :rid;→ R0+1, 'pending'
--   --   -- retry_count'u 3'e it → claim filtresi onu DIŞLAMALI:
--   --   update health.reminders_outbox set retry_count=3 where id=:rid;
--   --   select jsonb_path_query_array(public.health_claim_due_reminders(50),'$[*].reminderId')
--   --     ? (:rid)::text;                                                       → false (claim etmez)
--
--   -- (5) 066/071 DEĞİŞMEDİ kanıtı (additive teyidi):
--   --   \df health.book_appointment            → hâlâ 3-arg (uuid,uuid,text)
--   --   \df public.health_book_appointment     → hâlâ 5-arg
--   --   \df public.health_mark_reminder        → 2 overload (3-arg 071 + 4-arg 073)
--   --   select conname from pg_constraint where conrelid='health.reminders_outbox'::regclass
--   --     and contype='c';                     → status CHECK hâlâ ('pending','sent','failed','skipped')
--
-- rollback;  -- HİÇBİR ŞEY KALICI DEĞİL.
