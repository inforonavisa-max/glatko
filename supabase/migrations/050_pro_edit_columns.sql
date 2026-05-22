-- ═══════════════════════════════════════════════════════════════════════════
-- Sprint B1 migration 050: pro edit columns
-- ═══════════════════════════════════════════════════════════════════════════
-- Adds admin-managed subscription + note columns to glatko_professional_profiles
-- so the upcoming admin "edit pro" flow (Sprint B2) can manage them. The
-- companion update RPC lives in migration 051.
--
--   admin_notes             — admin-only free-text note (not shown to the pro)
--   subscription_plan       — trial/monthly/quarterly/annual/lifetime, NULL=unset
--   subscription_started_at — subscription start
--   subscription_end_date   — subscription end (NULL = open-ended / unspecified)
--
-- ── SAFETY ───────────────────────────────────────────────────────────────
--   - Additive only. No existing column is touched, no RLS policy changed
--     (admin writes keep going through the service_role RPC, see migration
--     051 / the 048 create-RPC precedent).
--   - All statements idempotent (ADD COLUMN IF NOT EXISTS, CREATE INDEX IF
--     NOT EXISTS). Safe to re-run.
--   - The subscription_plan CHECK permits NULL so existing rows (all NULL on
--     add) and "no plan assigned" stay valid.
--
-- DO NOT re-apply by hand once it's in glatko-prod beyond what idempotency
-- already guarantees.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE glatko_professional_profiles
  ADD COLUMN IF NOT EXISTS admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT
    CHECK (subscription_plan IS NULL OR subscription_plan IN
      ('trial', 'monthly', 'quarterly', 'annual', 'lifetime')),
  ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMPTZ;

-- Partial index for "upcoming subscription expiry" queries — only active pros
-- with a concrete end date are interesting to scan.
CREATE INDEX IF NOT EXISTS idx_pro_subscription_end_date
  ON glatko_professional_profiles(subscription_end_date)
  WHERE is_active = true AND subscription_end_date IS NOT NULL;

COMMENT ON COLUMN glatko_professional_profiles.admin_notes IS
  'Admin-only free-text not. Pro tarafından görülmez.';
COMMENT ON COLUMN glatko_professional_profiles.subscription_plan IS
  'Abonelik plan tipi. NULL = plan atanmamış.';
COMMENT ON COLUMN glatko_professional_profiles.subscription_end_date IS
  'Abonelik bitiş tarihi. NULL = süresiz veya belirtilmemiş.';
