-- ═══════════════════════════════════════════════════════════════════════════
-- 084: H6 — close the two residuals 083 documented.
--   R1: route-vs-cron CONFIRM double-send → a by-id CAS claim the booking route uses
--       to take ownership of a confirm row BEFORE sending (pending->'sending'), mutually
--       exclusive with the 083 cron claim.
--   R2: cancel/reschedule vs mid-'sending' reminder → widen the suppression UPDATE in the
--       three live cancel/reschedule RPCs from WHERE status='pending' to
--       WHERE status IN ('pending','sending'), so a row 083's recovery moved to 'sending'
--       is also flipped to 'skipped' on cancel and cannot deliver after the cancel.
-- ═══════════════════════════════════════════════════════════════════════════
-- ADDITIVE: 1 new RPC (R1) + 3 CREATE OR REPLACE (R2, ONLY the suppression WHERE widened,
-- everything else byte-identical to the live 071/078/082 bodies). Does NOT touch
-- health_book_appointment atomicity or the 083 claim/recovery/retry-cap state machine.
-- All functions search_path=''. Flag prod=false (dark). Dry-run proven (BEGIN/ROLLBACK).
--
-- Live count is THREE functions (not the "five" the 082 header guessed): the 075/076 file
-- refs were superseded by 082's CREATE OR REPLACE, so the live suppression lives only in
-- health_cancel_appointment (071), health_provider_set_appointment_status (078), and
-- health_reschedule_appointment (082). Verified against the live DB.
--
-- R1 design: the confirm rows are inserted status='pending', send_at=now() by the book/
-- reschedule/manual-book wrappers; the booking route (lib/saglik/booking.ts dispatchConfirm
-- / dispatchRescheduleConfirm; dispatchManualConfirm delegates) sends them immediately. The
-- route now calls health_claim_reminder_for_send(id) BEFORE each send: it flips the row
-- pending->'sending' iff still 'pending' and reports whether THIS caller won it. Won → send;
-- not won (cron already claimed it) OR RPC error → skip the send (fail-safe — favors
-- no-duplicate; the row stays pending/sending and the cron, or the 083 15-min recovery if
-- the route dies after the CAS, delivers it). The route also marks a transient send failure
-- RETRYABLE ('pending' + retry bump) rather than terminal 'failed', so the H6 cron actually
-- retries it — matching the cron route's documented "fallback for any confirm whose
-- immediate send failed" intent (adversarial-review confirm-loss fix).
--
-- NOTE (out-of-band drift reconciled): during design these three functions were widened on
-- prod via an untracked path; this migration is the AUTHORITATIVE tracked source — it
-- rewrites each to the exact body below (the live 071/078/082 definition with only the
-- suppression WHERE widened) and records 084 in the ledger.
--
-- ROLLBACK:
--   -- R1: drop function public.health_claim_reminder_for_send(uuid);
--   --     + revert lib/saglik/booking.ts to the fe5909a confirm-dispatch (no CAS gate).
--   -- R2: restore the three bodies' suppression UPDATE to WHERE status = 'pending'
--   --     (drain any 'sending' rows first if a row is mid-flight: not applicable while dark).

-- ── R1: by-id CAS claim for the route's immediate confirm send. ───────────────────────
-- Single-row conditional UPDATE...RETURNING: races are impossible (one writer wins the
-- 'pending'->'sending' transition; the loser sees 0 rows). Mirrors the 083 cron claim's
-- flip (sets claimed_at so a route-claimed row is treated consistently by the recovery).
create or replace function public.health_claim_reminder_for_send(p_reminder_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update health.reminders_outbox
     set status = 'sending', claimed_at = now()
   where id = p_reminder_id and status = 'pending'
   returning id into v_id;
  return v_id is not null;
end $$;

revoke all on function public.health_claim_reminder_for_send(uuid) from public, anon, authenticated;
grant execute on function public.health_claim_reminder_for_send(uuid) to service_role;

-- ── R2: widen the suppression WHERE in the three live cancel/reschedule RPCs. ──────────
-- (1) patient cancel (071 body; only the suppression WHERE widened).
create or replace function public.health_cancel_appointment(p_manage_token text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_appt health.appointments;
begin
  select * into v_appt from health.appointments where manage_token = p_manage_token for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'NOT_FOUND'); end if;
  if v_appt.status = 'cancelled' then return jsonb_build_object('ok', true, 'status', 'cancelled'); end if;
  if v_appt.status <> 'confirmed' then return jsonb_build_object('ok', false, 'reason', 'NOT_CANCELLABLE', 'status', v_appt.status); end if;
  update health.appointments set status = 'cancelled', cancelled_at = now(), cancel_reason = 'patient' where id = v_appt.id;
  update health.reminders_outbox set status = 'skipped' where appointment_id = v_appt.id and status in ('pending', 'sending'); -- R2 widened
  return jsonb_build_object('ok', true, 'status', 'cancelled');
end $function$;

-- (2) provider status change / cancel (078 body; only the suppression WHERE widened).
create or replace function public.health_provider_set_appointment_status(p_user_id uuid, p_appointment_id uuid, p_status text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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

  if v_appt.status = p_status then
    return jsonb_build_object('ok', true, 'status', v_appt.status, 'manageToken', v_appt.manage_token);
  end if;
  if v_appt.status <> 'confirmed' then
    raise exception 'INVALID_STATUS';
  end if;

  if p_status = 'cancelled' then
    v_reason := coalesce(nullif(btrim(p_reason), ''), 'provider');
    update health.appointments
       set status = 'cancelled', cancelled_at = now(), cancel_reason = v_reason
     where id = v_appt.id;
    update health.reminders_outbox
       set status = 'skipped'
     where appointment_id = v_appt.id and status in ('pending', 'sending'); -- R2 widened
  else
    update health.appointments set status = p_status where id = v_appt.id;
  end if;

  insert into health.audit_log (actor_id, action, target_table, target_id, payload)
  values (p_user_id, 'provider_appointment_' || p_status, 'appointments', v_appt.id,
          jsonb_build_object('oldStatus', v_appt.status, 'newStatus', p_status,
                             'reason', case when p_status = 'cancelled' then v_reason else null end));

  return jsonb_build_object('ok', true, 'status', p_status, 'manageToken', v_appt.manage_token);
end $function$;

-- (3) reschedule (LIVE 082 body; ONLY the v_old suppression WHERE widened — the otp-recheck
--     removal, the RESCHEDULE_IDENTITY_MISMATCH guard, and the atomic book-new/cancel-old
--     are all preserved byte-identical to 082).
create or replace function public.health_reschedule_appointment(
  p_old_manage_token text, p_new_hold_id uuid, p_session_key text,
  p_patient_id uuid, p_note text, p_locale text
) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_old health.appointments; v_hold health.slot_holds; v_pat health.patients;
  v_owner health.patients; v_new health.appointments; v_provider health.providers;
  v_service health.services; v_location health.locations; v_key text; v_phone text;
  v_email text; v_note text; v_confirm_sms_id uuid; v_confirm_email_id uuid;
begin
  select * into v_old from health.appointments where manage_token = p_old_manage_token for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'NOT_FOUND'); end if;
  if v_old.status = 'cancelled' and v_old.rescheduled_to is not null then
    return jsonb_build_object('ok', true, 'oldAppointmentId', v_old.id, 'newAppointmentId', v_old.rescheduled_to,
      'newManageToken', (select manage_token from health.appointments where id = v_old.rescheduled_to), 'idempotent', true);
  end if;
  if v_old.status <> 'confirmed' then return jsonb_build_object('ok', false, 'reason', 'OLD_NOT_CANCELLABLE', 'status', v_old.status); end if;
  if lower(v_old.slot_range) <= now() then return jsonb_build_object('ok', false, 'reason', 'OLD_SLOT_PASSED'); end if;
  select * into v_hold from health.slot_holds where id = p_new_hold_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'HOLD_EXPIRED'); end if;
  if v_hold.session_key is distinct from p_session_key then return jsonb_build_object('ok', false, 'reason', 'HOLD_NOT_OWNED'); end if;
  if v_hold.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'HOLD_EXPIRED'); end if;
  select * into v_pat from health.patients where id = p_patient_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'PATIENT_INVALID'); end if;
  -- step 9 (otp_codes existence re-check) REMOVED in 082 — patient existence is the durable
  -- verification proof; security is the phone_hash match below.
  select * into v_owner from health.patients where id = v_old.patient_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'PATIENT_INVALID'); end if;
  if v_pat.phone_hash is distinct from v_owner.phone_hash then return jsonb_build_object('ok', false, 'reason', 'RESCHEDULE_IDENTITY_MISMATCH'); end if;
  if v_hold.provider_id is distinct from v_old.provider_id or v_hold.service_id is distinct from v_old.service_id
     or v_hold.location_id is distinct from v_old.location_id then return jsonb_build_object('ok', false, 'reason', 'RESCHEDULE_SCOPE_MISMATCH'); end if;
  v_note := coalesce(p_note, v_old.patient_note);
  begin v_new := health.book_appointment(p_new_hold_id, v_old.patient_id, v_note);
  exception when others then if sqlerrm in ('SLOT_TAKEN','HOLD_EXPIRED') then return jsonb_build_object('ok', false, 'reason', sqlerrm); end if; raise; end;
  update health.appointments set status='cancelled', cancelled_at=now(), cancel_reason='reschedule', rescheduled_to=v_new.id where id=v_old.id;
  update health.reminders_outbox set status='skipped' where appointment_id = v_old.id and status in ('pending', 'sending'); -- R2 widened
  insert into health.reminders_outbox (appointment_id, channel, template, send_at) values (v_new.id,'sms','reschedule',now()) returning id into v_confirm_sms_id;
  v_key := (select decrypted_secret from vault.decrypted_secrets where name='health_pii_key');
  v_phone := extensions.pgp_sym_decrypt(v_owner.phone_enc, v_key);
  v_email := case when v_owner.email_enc is not null then extensions.pgp_sym_decrypt(v_owner.email_enc, v_key) else null end;
  if v_email is not null then insert into health.reminders_outbox (appointment_id, channel, template, send_at) values (v_new.id,'email','reschedule',now()) returning id into v_confirm_email_id; end if;
  insert into health.reminders_outbox (appointment_id, channel, template, send_at) values (v_new.id,'sms','t24', lower(v_new.slot_range)-interval '24 hours');
  insert into health.reminders_outbox (appointment_id, channel, template, send_at) values (v_new.id,'sms','t2', lower(v_new.slot_range)-interval '2 hours');
  perform public.health_enqueue_reschedule_provider(v_new.id, v_old.id);
  insert into health.reminder_locale (appointment_id, locale) values (v_new.id, p_locale) on conflict (appointment_id) do update set locale=excluded.locale;
  select * into v_provider from health.providers where id=v_new.provider_id;
  select * into v_service from health.services where id=v_new.service_id;
  select * into v_location from health.locations where id=v_new.location_id;
  return jsonb_build_object('ok', true, 'oldAppointmentId', v_old.id, 'newAppointmentId', v_new.id,
    'newManageToken', v_new.manage_token, 'slotStart', lower(v_new.slot_range), 'slotEnd', upper(v_new.slot_range),
    'oldSlotStart', lower(v_old.slot_range),
    'dispatch', jsonb_build_object('phoneE164', v_phone, 'email', v_email, 'patientName', v_owner.full_name,
      'confirmSmsReminderId', v_confirm_sms_id, 'confirmEmailReminderId', v_confirm_email_id),
    'summary', jsonb_build_object('providerName', v_provider.full_name, 'providerTitle', v_provider.title,
      'providerSlug', v_provider.slug, 'serviceName', v_service.name ->> p_locale, 'serviceDurationMin', v_service.duration_min,
      'servicePriceEur', v_service.price_eur, 'locationLabel', v_location.label, 'locationAddress', v_location.address,
      'locationCity', v_location.city));
end $function$;
