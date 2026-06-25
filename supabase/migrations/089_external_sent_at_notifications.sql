-- G-NOTIFICATION-RESILIENCE-01
-- Durable record of external (SMS/WhatsApp) delivery on the in-app notification
-- row. NULL = external send not (yet) confirmed; set to NOW() only on a
-- successful Infobip send (lib/supabase/glatko.server.ts createNotification).
--
-- Why: until now a silently-dropped SMS was invisible — only Sentry saw it — and
-- the match queue (glatko_request_notifications.email_sent_at) looked "delivered"
-- even when the SMS never went out. This column makes a dropped external send
-- observable and lets a future sweep retry NULL rows.
--
-- Additive + nullable + no backfill = backward compatible. Old code ignores it.
-- Applied to prod via apply_migration (add_external_sent_at_to_glatko_notifications).

ALTER TABLE public.glatko_notifications
  ADD COLUMN IF NOT EXISTS external_sent_at timestamptz;
