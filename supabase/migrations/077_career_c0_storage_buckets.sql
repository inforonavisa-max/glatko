-- ═══════════════════════════════════════════════════════════════════════════
-- 077: C0 — storage buckets (career-worker private originals + career-showcase variants)
-- ═══════════════════════════════════════════════════════════════════════════
-- Mirrors the pro-documents private-bucket pattern (029_glatko_pro_storage_buckets.sql).
-- Two buckets, BOTH private (public=false):
--   * career-worker   — gated ORIGINALS (passport/ID, diplomas, un-blurred photos,
--                       insurance/medical, references). NEVER served pre-unlock. Path:
--                       {worker_user_id}/{category}/{filename}. Owner read/write +
--                       admin read. Gated-original signing re-checks the
--                       owner_approved && paid gate via career_can_access_document (R6).
--   * career-showcase — face-blurred + watermarked PUBLIC_ANONYMIZED variants. Still a
--                       PRIVATE bucket (signed via signShowcaseVariant, which verifies
--                       the path belongs to a visibility='public_anonymized' doc — R6).
--                       Owner write + admin read; no public read policy (no anonymous
--                       hot-link; the showcase signer mints short-lived URLs).
--
-- RULE R4: public.is_admin() is defined idempotently in 073 → these admin-read policies
-- apply cleanly on a fresh DB. file_size_limit 5 MiB; pdf/jpeg/png only.
--
-- ROLLBACK:
--   delete from storage.objects where bucket_id in ('career-worker','career-showcase');
--   drop policy if exists "career_worker owner manage"   on storage.objects;
--   drop policy if exists "career_worker admin read"      on storage.objects;
--   drop policy if exists "career_showcase owner manage"  on storage.objects;
--   drop policy if exists "career_showcase admin read"    on storage.objects;
--   delete from storage.buckets where id in ('career-worker','career-showcase');

-- ─── 1. Buckets ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('career-worker',   'career-worker',   false, 5242880,
   array['application/pdf','image/jpeg','image/png']),
  ('career-showcase', 'career-showcase', false, 5242880,
   array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;

-- ─── 2. RLS — career-worker (private originals: owner manage + admin read) ──────
drop policy if exists "career_worker owner manage" on storage.objects;
create policy "career_worker owner manage" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'career-worker'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'career-worker'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "career_worker admin read" on storage.objects;
create policy "career_worker admin read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'career-worker'
    and public.is_admin()
  );

-- ─── 3. RLS — career-showcase (anonymized variants: owner manage + admin read) ──
drop policy if exists "career_showcase owner manage" on storage.objects;
create policy "career_showcase owner manage" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'career-showcase'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'career-showcase'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "career_showcase admin read" on storage.objects;
create policy "career_showcase admin read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'career-showcase'
    and public.is_admin()
  );
