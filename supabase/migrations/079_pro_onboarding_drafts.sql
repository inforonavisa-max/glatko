-- ═══════════════════════════════════════════════════════════════════════════
-- G-VOICE-1 migration 079: Sesli AI Pro Onboarding (Faz 1) — draft store +
-- temp audio bucket. ADDITIVE: hiçbir mevcut tabloya/akışa dokunmaz; manuel
-- become-a-pro wizard tamamen izole kalır.
-- ═══════════════════════════════════════════════════════════════════════════
-- pro_onboarding_drafts: majstorun sesli notu + fotoğraflarından çıkarılan
-- ön-doldurulmuş profil taslağı. İçerik PII'dir (ham transcript + foto + ses
-- URL'leri + telefon) → RLS ANON/AUTHENTICATED DENY-ALL. Erişim YALNIZCA
-- service_role (admin client) üzerinden; PostgREST/anon hiçbir satır göremez
-- (career schema deny-all idiomu, exemplar 073: RLS enable + ZERO policy).
--
-- user_id: spec'teki şemaya EKLENEN sütun. /become-a-pro auth arkasında olduğu
-- için (page.tsx redirect login), taslak oturum-sahibine bağlanır; confirm
-- adımı draft.user_id == session.user.id eşitliğini doğrular (R1: kimlik
-- gövdeden değil oturumdan).
--
-- DO NOT apply to glatko-prod without the owner's explicit confirmation
-- (BUILD-RULES R15). Files-only until approved.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Draft tablosu ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pro_onboarding_drafts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL DEFAULT 'draft',  -- draft | confirmed | expired
  detected_language text,
  transcript        text,
  extracted         jsonb,                          -- yapısal profil (display_name, category_slug, ...)
  photo_urls        text[] NOT NULL DEFAULT ARRAY[]::text[],
  audio_url         text,
  phone             text,                           -- confirm/OTP'de dolar
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '7 days',
  CONSTRAINT pro_onboarding_drafts_status_chk
    CHECK (status IN ('draft', 'confirmed', 'expired'))
);

COMMENT ON TABLE public.pro_onboarding_drafts IS
  'G-VOICE-1: voice pro-onboarding taslakları. PII — yalnız service_role erişir (RLS deny-all). Manuel wizard ile ilişkisi yok.';

CREATE INDEX IF NOT EXISTS pro_onboarding_drafts_user_idx
  ON public.pro_onboarding_drafts (user_id);
CREATE INDEX IF NOT EXISTS pro_onboarding_drafts_expires_idx
  ON public.pro_onboarding_drafts (expires_at);

-- ─── 2. RLS — DENY-ALL (service_role bypass) ───────────────────────────────
-- Enable RLS + ZERO permissive policy = anon/authenticated için deny-all.
-- Ek savunma: anon/authenticated rollerinden tüm table grant'lerini geri al
-- (Supabase public şemada default grant verebiliyor; RLS zaten bloklar ama
-- defense-in-depth). service_role BYPASSRLS olduğu için etkilenmez.
ALTER TABLE public.pro_onboarding_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pro_onboarding_drafts FROM anon, authenticated;
-- access exclusively via service_role (voice + confirm route handlers).
-- No policy is intentional.

-- ─── 3. Temp audio bucket (private, service_role-only erişim) ───────────────
-- Ham ses notu PII; kısa ömürlü. public=false. Erişim service_role (admin
-- client) ile; foldername[1] = user_id path idiomu (029/077 ile aynı).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pro-voice-audio', 'pro-voice-audio', FALSE,
  26214400,  -- 25 MiB (spec <20MB ses + tampon)
  ARRAY[
    'audio/webm','audio/mp4','audio/mpeg','audio/mp3',
    'audio/wav','audio/x-wav','audio/x-m4a','audio/m4a','audio/ogg','audio/aac'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Owner (authenticated, kendi path'i) yazabilir/okuyabilir — fallback. Asıl
-- yol service_role; ama RLS policy'leri yine de owner-scope ile sınırlı tutulur
-- ki hiçbir authenticated başka birinin sesini okuyamasın.
DROP POLICY IF EXISTS "Voice audio owner manage" ON storage.objects;
CREATE POLICY "Voice audio owner manage"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'pro-voice-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'pro-voice-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
-- NB: public read policy YOK — ses notu hiçbir zaman herkese açık değil.
