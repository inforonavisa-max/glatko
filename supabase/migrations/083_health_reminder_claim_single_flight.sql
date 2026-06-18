-- ═══════════════════════════════════════════════════════════════════════════
-- 083: H6 — reminder double-send fix (cron-vs-cron): atomic 'sending' claim +
--      claimed_at + NULL-guarded, retry-capped stuck-recovery. (TEST 7 finding.)
-- ═══════════════════════════════════════════════════════════════════════════
-- ROOT CAUSE: public.health_claim_due_reminders selected due 'pending' rows with
-- FOR UPDATE SKIP LOCKED but did NOT change their status. The claim is one PostgREST
-- call = its own transaction that COMMITS when the jsonb returns, RELEASING the locks
-- while the rows are STILL 'pending'. The dispatcher then sends + marks in SEPARATE
-- later transactions. In that post-claim/pre-mark window an OVERLAPPING cron run (a slow
-- drain crossing the */5-min boundary, or a manual run alongside the scheduled one)
-- re-claims the SAME 'pending' rows → double SMS/email. SKIP LOCKED only guards
-- transactions that are SIMULTANEOUSLY OPEN; it does nothing for a run that starts
-- AFTER the first claim commits.
--
-- FIX — give the claim a transient 'sending' status (two complementary guards):
--   * FOR UPDATE SKIP LOCKED  → guards DURING the claim tx (locks held to commit).
--   * 'pending'→'sending' flip → guards AFTER commit: the row is no longer 'pending',
--                                so the next run's predicate excludes it.
-- The flip cannot race: 'due' takes FOR UPDATE and the data-modifying 'claimed' CTE
-- updates the SAME rows in the SAME statement, so two claims can never both flip a row.
-- A 15-minute recovery clause re-admits rows stranded in 'sending' (a dispatch that died
-- before mark()), preserving at-least-once delivery.
--
-- RETRY-CAPPED RECOVERY (adversarial-review fix, HIGH): recovery re-admits a 'sending'
-- row but MUST bump retry_count, else a row that always dies AFTER the external send but
-- BEFORE mark() — or whose mark() RPC error is swallowed by the dispatcher
-- (reminders-dispatch.ts only console.error's a failed mark) — would re-send every 15 min
-- FOREVER, escaping the retry_count<3 poison cap (retry_count is otherwise only bumped by
-- recordFailure on a send FAILURE). The 'claimed' CTE therefore adds
--   retry_count = o.retry_count + (1 when the row was admitted via the 'sending' arm else 0)
-- so a chronically-stranded row converges to retry_count>=3 and is permanently excluded
-- after ~3 recoveries (bounded duplicates) instead of looping. Normal 'pending' claims add
-- 0, so the happy path is unchanged.
--
-- THRESHOLD INVARIANT (enforced, not assumed): recovery duplicate-suppression for a
-- SLOW-BUT-ALIVE run depends on (per-send timeout < cron maxDuration < recovery interval).
-- app/api/cron/health-reminders/route.ts now sets `export const maxDuration = 60`, far
-- below this 15-min recovery interval, so a hung run is platform-killed long before its
-- claimed rows become recovery-eligible — an overlapping run can never re-claim a row a
-- live run still holds. Do NOT raise maxDuration toward 15 min or lower this interval
-- below maxDuration without re-checking this ordering.
--
-- WHY THE 073 "ALTER FORBIDDEN" STANCE NO LONGER HOLDS: 073 forbade itself an ALTER on the
-- status CHECK (assuming no transient state). reminders_outbox is currently EMPTY (0 rows);
-- the new CHECK is a STRICT SUPERSET (adds only 'sending', keeps all 4 existing values), so
-- drop+add is instant and validates even on a populated table. A CHECK has NO dependent
-- objects in Postgres; the (status, send_at) index health_reminders_outbox_status_sendat_idx
-- is column-bound, survives the swap untouched, and its leading status column still serves
-- the new 'sending' recovery branch.
--
-- RETURN PAYLOAD BYTE-IDENTICAL to the LIVE 075 body (all keys incl. oldSlotStart, same
-- order, same expressions); claimed_at is NOT added to the JSON. The data-modifying CTE
-- writes only status/claimed_at/retry_count, none emitted, so the dispatch consumer
-- (lib/saglik/reminders-dispatch.ts ClaimedReminder) is UNCHANGED. (MVCC: the payload's
-- "join reminders_outbox r" reads the statement-start snapshot — pre-flip status — but
-- since status/claimed_at/retry-as-claimed are not emitted, returned bytes are identical.)
--
-- IMMEDIATE-CONFIRM PATH (lib/saglik/booking.ts dispatchConfirm) UNAFFECTED: it sends the
-- 'confirm' row directly and marks it BY ID, never calling the claim RPC; the by-id UPDATE
-- has no status guard so 'sending'->'sent'/'failed' still works.
--
-- KNOWN RESIDUALS (documented follow-ups — NOT regressions; deliberately out of this
-- minimal, additive migration):
--   (R1) Route-vs-cron CONFIRM double-send (PRE-EXISTING): the booking route sends the
--        'confirm' immediately while the row is still 'pending', so a cron firing in that
--        sub-second window can also claim+send it. 083 closes cron-vs-cron ONLY. Closing
--        R1 needs a dispatch-side change (route CAS-flips 'confirm' pending->'sending'
--        before sending, or 071 inserts confirm rows non-claimable). Acceptable pre-launch
--        (dark flag, idempotent content). Tracked for a follow-up.
--   (R2) Cancel/reschedule vs mid-'sending' (071:cancel, 075/076/082:reschedule,
--        078:provider-cancel flip reminders WHERE status='pending' ONLY): a row mid-'sending'
--        at cancel stays 'sending' and, if recovered, could deliver after the cancel. For
--        t24/t2/followup the dispatcher's isStaleOrIrrelevant() guard catches it; for
--        confirm/cancelled/provider_new_booking/reschedule_provider it does not. A follow-up
--        should widen those five UPDATEs to WHERE status in ('pending','sending').
--
-- ADDITIVE: 1 new column (claimed_at, nullable, no default), 1 CHECK swap (strict superset),
-- 1 CREATE OR REPLACE (claim). health_mark_reminder (3-arg + 4-arg) UNCHANGED. No backfill
-- (table empty). Flag prod=false (vertical dark). Dry-run proven before apply (BEGIN/ROLLBACK).
--
-- ROLLBACK (clean while no row is mid-'sending' — true pre-launch, table empty):
--   -- (1) Restore the LIVE 075 body of public.health_claim_due_reminders(int) — the version
--   --     WITH 'oldSlotStart' (migration 075). Do NOT restore the 073 body: it predates
--   --     oldSlotStart and would regress the H9 reschedule SMS/email rendering.
--   -- (2) update health.reminders_outbox set status='pending', claimed_at=null
--   --       where status='sending';                        -- drain transient state FIRST
--   --     alter table health.reminders_outbox drop constraint reminders_outbox_status_check;
--   --     alter table health.reminders_outbox add constraint reminders_outbox_status_check
--   --       check (status = any (array['pending','sent','failed','skipped']));
--   -- (3) alter table health.reminders_outbox drop column if exists claimed_at;

-- ── 1) claimed_at — set only when a row is flipped to 'sending'; drives recovery. ──────
alter table health.reminders_outbox
  add column if not exists claimed_at timestamptz;

-- ── 2) status CHECK — add transient 'sending' (strict superset of the old 4 values). ──
alter table health.reminders_outbox
  drop constraint reminders_outbox_status_check;
alter table health.reminders_outbox
  add constraint reminders_outbox_status_check
    check (status = any (array['pending','sending','sent','failed','skipped']));

-- ── 3) health_claim_due_reminders — atomic claim + retry-capped, NULL-guarded recovery. ─
--      Only the 'due' filter, the data-modifying 'claimed' CTE, and "from claimed" differ
--      from 075; the RETURN payload is byte-identical.
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
    where (
            r.status = 'pending'
            or ( r.status = 'sending'
                 and ( r.claimed_at is null                                -- NULL guard: a 'sending'
                       or r.claimed_at < now() - interval '15 minutes' ) ) -- row with NULL claimed_at
          )                                                                -- must stay recoverable
      and r.send_at <= now()
      and r.retry_count < 3
    order by r.send_at
    limit greatest(p_limit, 0)
    for update skip locked
  ),
  claimed as (
    update health.reminders_outbox o
    set status     = 'sending',
        claimed_at = now(),
        -- retry-cap the recovery arm so a chronically-stranded 'sending' row converges to
        -- poison after ~3 recoveries instead of re-sending forever. 'pending' claims add 0.
        retry_count = o.retry_count + case when o.status = 'sending' then 1 else 0 end
    from due
    where o.id = due.id
    returning o.id
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
      'oldSlotStart',   (select lower(old.slot_range) from health.appointments old
                          where old.rescheduled_to = a.id order by old.cancelled_at desc limit 1),
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
  from claimed cl
  join health.reminders_outbox r on r.id = cl.id
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
