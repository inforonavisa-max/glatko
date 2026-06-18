-- ═══════════════════════════════════════════════════════════════════════════
-- 081: Strict-QA düzeltmeleri (additive) — health_enqueue_followups 42P01 fix +
--      health.data_requests RLS deny-all.
-- ═══════════════════════════════════════════════════════════════════════════
-- (A) BUG (strict-QA high, atomicity-correctness): 073'teki health_enqueue_followups,
--     seed_email CTE'sinde `returning s.appointment_id` kullanıyor — INSERT...RETURNING
--     yalnız HEDEF tablonun (reminders_outbox) kolonlarını referans alabilir, CTE
--     alias'ını (s) DEĞİL → her çağrıda 42P01 "missing FROM-clause entry for table s"
--     → followup hatırlatma boru hattı %100 ÖLÜ (hata dispatcher'da yutuluyor, kuyruğun
--     gerisi akıyor ama followup hiç kuyruğa girmiyor). FIX: `returning appointment_id`
--     (reminders_outbox.appointment_id). CREATE OR REPLACE (additive, imza/dönüş aynı).
--
-- (B) RLS (strict-QA medium, migration-safety): 080'de health.data_requests RLS ENABLE
--     EDİLMEMİŞTİ → §2.2 deny-all invariant'ını bozuyordu (diğer tüm hassas health
--     tabloları RLS-on + policy-yok = deny-all). FIX: enable RLS (policy yok → deny-all,
--     yalnız service_role erişir; health zaten PostgREST'e expose değil). Additive.
--
-- ADDITIVE: CREATE OR REPLACE + ALTER ENABLE RLS. health.* + 066-080 nesnelerinde
-- DROP/destructive ALTER YOK. SECURITY DEFINER + search_path='' korunur.
-- ROLLBACK: 073'ün enqueue_followups gövdesini yeniden uygula; data_requests RLS:
--   alter table health.data_requests disable row level security;

-- (A) enqueue_followups fix ----------------------------------------------------
create or replace function public.health_enqueue_followups(p_lookahead_min int default 60)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_count int;
begin
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
    returning appointment_id   -- FIX: hedef tablo kolonu (CTE alias 's' DEĞİL → 42P01 giderildi)
  )
  select count(*) into v_count from seed;
  return v_count;
end $$;
revoke all on function public.health_enqueue_followups(int) from public, anon, authenticated;
grant execute on function public.health_enqueue_followups(int) to service_role;

-- (B) data_requests deny-all RLS ----------------------------------------------
alter table health.data_requests enable row level security;
