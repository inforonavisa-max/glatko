-- ═══════════════════════════════════════════════════════════════
-- 065: H0 — health şeması temeli + doktor bekleme listesi (K2)
-- ═══════════════════════════════════════════════════════════════
-- docs/health/MASTER_PLAN.md H0 kapsamı: launch öncesi arz toplama.
-- Tam health şeması (specialties/providers/appointments/...) H1'de gelir;
-- bu migration yalnız şemayı açar + provider_waitlist mini tablosunu kurar.
--
-- Erişim modeli:
--   * health şeması PostgREST'e EXPOSE EDİLMEZ (API exposed schemas
--     listesine eklenmedi) — REST üzerinden doğrudan tablo erişimi yok.
--   * RLS açık + sıfır policy = anon/authenticated için deny-all.
--   * Tek yazma kapısı: public.health_waitlist_join SECURITY DEFINER RPC,
--     EXECUTE yalnız service_role (route handler: app/api/health/waitlist).
--   * Aynı telefonla tekrar başvuru upsert olur (idempotent, hata sızdırmaz).
--
-- Rollback (tam geri alma — H1 öncesi şemayı tümden kaldırır):
--   DROP SCHEMA IF EXISTS health CASCADE;   -- health.* tablo + index + RLS
--   -- Fonksiyon public şemasında olduğu için CASCADE onu DÜŞÜRMEZ; ayrıca:
--   DROP FUNCTION IF EXISTS public.health_waitlist_join(text,text,text,text,text,text);
-- (Yalnız waitlist'i geri almak istersen: DROP TABLE health.provider_waitlist + DROP FUNCTION yukarıdaki.)
--
-- Uygulama (2026-06-15, glatko-prod cjqappdfyxgytdyeytwv, Rohat onayı + 6 koşul):
--   additive-only (mevcut public tablolarda ALTER/DROP yok) · RPC search_path=''
--   pinli · get_advisors sonrası temiz · DB şeması bilinçli `health` (kod=saglik).

CREATE SCHEMA IF NOT EXISTS health;

CREATE TABLE health.provider_waitlist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name  text NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 120),
  specialty  text NOT NULL CHECK (specialty IN ('dentist','gp','psychologist','physio','other')),
  city       text NOT NULL CHECK (char_length(city) BETWEEN 2 AND 80),
  -- normalize edilmiş E.164-benzeri: opsiyonel + ve 6-15 rakam (route handler normalize eder)
  phone      text NOT NULL CHECK (phone ~ '^\+?[0-9]{6,15}$'),
  email      text CHECK (email IS NULL OR (char_length(email) <= 160 AND email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  locale     text NOT NULL DEFAULT 'tr' CHECK (locale IN ('tr','en','de','it','ru','uk','sr','me','ar')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX health_provider_waitlist_phone_uq
  ON health.provider_waitlist (phone);

ALTER TABLE health.provider_waitlist ENABLE ROW LEVEL SECURITY;
-- bilinçli: policy YOK → anon/authenticated deny-all (admin görünümü H8'de)

CREATE OR REPLACE FUNCTION public.health_waitlist_join(
  p_full_name text,
  p_specialty text,
  p_city      text,
  p_phone     text,
  p_email     text,
  p_locale    text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO health.provider_waitlist (full_name, specialty, city, phone, email, locale)
  VALUES (
    trim(p_full_name),
    p_specialty,
    trim(p_city),
    p_phone,
    nullif(trim(coalesce(p_email, '')), ''),
    coalesce(p_locale, 'tr')
  )
  ON CONFLICT (phone) DO UPDATE SET
    full_name  = excluded.full_name,
    specialty  = excluded.specialty,
    city       = excluded.city,
    email      = coalesce(excluded.email, health.provider_waitlist.email),
    locale     = excluded.locale,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.health_waitlist_join(text,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.health_waitlist_join(text,text,text,text,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.health_waitlist_join(text,text,text,text,text,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.health_waitlist_join(text,text,text,text,text,text) TO service_role;
