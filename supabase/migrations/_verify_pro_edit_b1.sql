-- ═══════════════════════════════════════════════════════════════════════════
-- Sprint B1 — POST-MIGRATION VERIFICATION (run manually in Supabase Studio)
-- ═══════════════════════════════════════════════════════════════════════════
-- NOT a migration. The leading underscore keeps the Supabase migration runner
-- from picking it up. Run these AFTER applying 050 + 051 and paste the output
-- back for review.
-- ═══════════════════════════════════════════════════════════════════════════

-- VERIFY 1: Yeni kolonlar geldi mi?
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'glatko_professional_profiles'
  AND column_name IN
    ('admin_notes', 'subscription_plan', 'subscription_started_at', 'subscription_end_date')
ORDER BY column_name;
-- Beklenen: 4 satır.

-- VERIFY 2: CHECK constraint
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'glatko_professional_profiles'::regclass
  AND contype = 'c'
  AND conname LIKE '%subscription_plan%';
-- Beklenen: 1 satır, plan whitelist'li.

-- VERIFY 3: Index
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'glatko_professional_profiles'
  AND indexname = 'idx_pro_subscription_end_date';
-- Beklenen: 1 satır, partial index (WHERE is_active = true ...).

-- VERIFY 4: RPC var mı?
SELECT proname, pg_get_function_arguments(oid),
       prosecdef AS security_definer
FROM pg_proc
WHERE proname = 'glatko_admin_update_provider';
-- Beklenen: 1 satır, security_definer = true.

-- VERIFY 5: RPC yetkileri (yalnızca service_role)
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_name = 'glatko_admin_update_provider';
-- Beklenen: yalnızca service_role (anon/authenticated YOK).

-- VERIFY 6: Mevcut satırlar bozulmadı mı?
SELECT count(*) FILTER (WHERE admin_notes IS NULL) AS null_notes,
       count(*) FILTER (WHERE subscription_plan IS NULL) AS null_plan,
       count(*) AS total_rows
FROM glatko_professional_profiles;
-- Beklenen: null_notes = total_rows, null_plan = total_rows (yeni eklendiğinden hepsi NULL).

-- VERIFY 7: Existence-check semantiği (boş payload mevcut değerleri korur)
-- Bu blok yalnızca migration uygulandıktan SONRA, gerçek bir test row'la
-- elle koşulmalı. Otomatik koşulmaz (DO bloğu yok), referans amaçlı.

-- Test (yorumlu — kullanıcı manuel çalıştırır):
-- 1. Bir test provider'ın mevcut business_name'ini not et
-- 2. SELECT glatko_admin_update_provider('<uuid>'::uuid, '{}'::jsonb);
-- 3. business_name değişmediğini doğrula (boş payload → no-op olmalı)
-- 4. SELECT glatko_admin_update_provider('<uuid>'::uuid, '{"subscription_end_date": null}'::jsonb);
-- 5. subscription_end_date'in NULL olduğunu doğrula


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (acil durum — yalnızca kullanıcı talimatıyla)
-- ═══════════════════════════════════════════════════════════════════════════
-- DROP FUNCTION IF EXISTS public.glatko_admin_update_provider(UUID, JSONB);
-- DROP INDEX IF EXISTS idx_pro_subscription_end_date;
-- ALTER TABLE glatko_professional_profiles
--   DROP COLUMN IF EXISTS subscription_end_date,
--   DROP COLUMN IF EXISTS subscription_started_at,
--   DROP COLUMN IF EXISTS subscription_plan,
--   DROP COLUMN IF EXISTS admin_notes;
