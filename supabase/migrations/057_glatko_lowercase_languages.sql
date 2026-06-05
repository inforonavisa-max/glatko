-- 057_glatko_lowercase_languages.sql
-- Canonicalize glatko_professional_profiles.languages to lowercase.
--
-- Background: `languages` is a text[] with no DB enum; Zod is the only
-- validation gate. A historical write path (the become-a-pro wizard) stored
-- uppercase codes (e.g. 'TR', 'EN'). The live prod data was already normalized
-- to lowercase (2026-05-30); this migration exists for repo parity and
-- fresh-DB (`supabase db reset`) reproducibility — DO NOT re-apply to prod.
--
-- Idempotent: the WHERE guard makes it a no-op once every element is lowercase.

UPDATE public.glatko_professional_profiles
SET languages = (SELECT array_agg(lower(elem) ORDER BY ord)
  FROM unnest(languages) WITH ORDINALITY AS t(elem, ord))
WHERE EXISTS (SELECT 1 FROM unnest(languages) AS e WHERE e <> lower(e));
