-- 052_glatko_phone_verified.sql
-- Sprint A (Phone Verification / SMS OTP): track whether a user has proven
-- ownership of their phone number via the Infobip SMS one-time-code flow.
--
-- profiles.phone already exists (migrations 001 / 004). These two columns are
-- additive and nullable-safe:
--   • phone_verified     — false until the user completes the OTP challenge.
--   • phone_verified_at  — timestamp of the most recent successful verification.
--
-- No RLS change: public.profiles already has owner-scoped row policies that
-- cover every column, and the verification write happens server-side under the
-- user's authenticated session (lib/actions/phone.ts). Sprint B reads
-- phone_verified to gate SMS-channel notification toggles.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

COMMENT ON COLUMN public.profiles.phone_verified IS
  'True once the user confirmed their phone via SMS OTP (Sprint A). Drives Sprint B SMS-channel gating.';
COMMENT ON COLUMN public.profiles.phone_verified_at IS
  'Timestamp of the most recent successful phone verification; NULL if never verified.';
