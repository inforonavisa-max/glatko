-- Rollback for 089_external_sent_at_notifications.sql
-- Safe: the column is additive + nullable, read/written only best-effort by
-- createNotification. Dropping it reverts to Sentry-only visibility of failed
-- external sends.

ALTER TABLE public.glatko_notifications
  DROP COLUMN IF EXISTS external_sent_at;
