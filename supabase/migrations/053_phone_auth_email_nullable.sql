-- ═══════════════════════════════════════════════════════════════════════════
-- 053_phone_auth_email_nullable.sql
-- Sprint A → Phone-OTP LOGIN prerequisite: make phone-only signup possible.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY
--   profiles.email is NOT NULL and the signup→profile bridge handle_new_user()
--   inserts new.email into it. A phone-only signup (auth.users.email = NULL)
--   therefore violates the NOT NULL constraint and the entire signup
--   transaction rolls back — the user can never be created. Verified live on
--   glatko-prod 2026-06-03 (read-only introspection): email is_nullable = NO,
--   trigger inserts new.email verbatim.
--
-- WHAT (additive, reversible — no data touched)
--   1. profiles.email: DROP NOT NULL  → phone-only rows may keep email NULL.
--   2. handle_new_user(): tolerate a NULL email (insert as-is, no synthetic
--      placeholder) + broaden the full_name fallback to a neutral default.
--
-- SAFETY
--   • ADDITIVE / non-destructive. No row is UPDATEd or DELETEd, no column is
--     dropped. Only a column constraint is relaxed and one function body is
--     replaced (CREATE OR REPLACE).
--   • Existing users untouched. Every current profile already has email
--     populated (G-EMAIL-AUDIT-01: 44/44 matched auth.users.email); relaxing
--     NOT NULL changes no existing row. Pre-apply check expects
--     COUNT(*) FILTER (WHERE email IS NULL) = 0.
--   • handle_new_user keeps SECURITY DEFINER EXACTLY as the live definition.
--     The live function has NO `SET search_path` clause; we deliberately do
--     NOT add one here so the security/name-resolution semantics are byte-for-
--     byte unchanged (privilege-escalation regressions have happened before
--     when this was altered). Hardening search_path is a SEPARATE decision
--     tracked outside this migration.
--   • glatko_populate_profile_email (BEFORE INSERT backfill) is already
--     NULL-safe: for a phone-only user auth.users.email is also NULL, so it
--     leaves NEW.email = NULL without raising. Left UNCHANGED on purpose.
--   • on_auth_user_created (AFTER INSERT ON auth.users) is unchanged and stays
--     active; it simply now succeeds for NULL-email users.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   Step 1 — restore the trigger function to its EXACT pre-053 body
--            (captured live from glatko-prod 2026-06-03):
--
--     CREATE OR REPLACE FUNCTION public.handle_new_user()
--      RETURNS trigger
--      LANGUAGE plpgsql
--      SECURITY DEFINER
--     AS $function$
--     BEGIN
--       INSERT INTO public.profiles (id, email, full_name, role)
--       VALUES (
--         new.id,
--         new.email,
--         COALESCE(new.raw_user_meta_data->>'full_name', 'Kurucu VIP'),
--         'user'
--       );
--       RETURN NEW;
--     END;
--     $function$;
--
--   Step 2 — re-add NOT NULL (ONLY safe while NO NULL-email rows exist):
--     ALTER TABLE public.profiles ALTER COLUMN email SET NOT NULL;
--   If any phone-only (NULL-email) users exist by then, SET NOT NULL will fail
--   until those rows are backfilled or removed — that failure is the intended
--   guard, not a bug. Decide separately.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Relax the NOT NULL constraint on profiles.email (reversible).
ALTER TABLE public.profiles
  ALTER COLUMN email DROP NOT NULL;

-- 2) Make the signup→profile bridge tolerate a NULL email (phone-only signup).
--    Email is inserted as-is — NULL stays NULL, NO synthetic placeholder.
--    Only the full_name fallback chain is broadened + made neutral
--    ('Kurucu VIP' → display_name → 'Glatko User'). SECURITY DEFINER and the
--    absence of a search_path clause are preserved exactly as the live def.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,                                   -- may be NULL for phone-only signup (constraint now relaxed)
    COALESCE(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'display_name',
      'Glatko User'
    ),
    'user'
  );
  RETURN NEW;
END;
$function$;
