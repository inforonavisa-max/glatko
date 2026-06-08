-- 059_profiles_messaging_opt_in.sql
-- Sprint (Messaging Opt-in) — WhatsApp+Viber bildirim onayını topla & sakla.
-- ADDITIVE, idempotent. Gönderim YOK (Faz 3-B). Mevcut kullanıcılar default false.
--
--   messaging_opt_in     — WhatsApp+Viber onayı (ikisini birden kapsar).
--   messaging_opt_in_at  — son onay/iptal (revoke) zamanı (null = hiç dokunulmadı).
--   opt_in_source        — onayın kaynağı: signup | settings | manual.
--
-- RLS değişikliği YOK: public.profiles owner-scoped politikalar tüm sütunları kapsar;
-- yazımlar authenticated session altında server-side yapılır.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS messaging_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS messaging_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS opt_in_source text
    CHECK (opt_in_source IN ('signup', 'settings', 'manual'));

COMMENT ON COLUMN public.profiles.messaging_opt_in IS
  'True if user consented to WhatsApp/Viber messaging (covers both channels). Faz 3-B gating.';
COMMENT ON COLUMN public.profiles.messaging_opt_in_at IS
  'Timestamp of the most recent opt-in/opt-out (revoke) change; null if never set.';
COMMENT ON COLUMN public.profiles.opt_in_source IS
  'Origin of the most recent opt-in change: signup | settings | manual.';
