# Career Vertical — BUILD RULES (authoritative corrections)

> Read this together with `docs/career/career-vertical-plan-v1.md` (the SSOT).
> These rules supersede any conflicting framing. They come from an adversarial security
> review of the implementation blueprint and encode the load-bearing invariants.
> Every implementation agent MUST obey these.

## The single most important truth about this codebase
Production data reads do **NOT** go through Postgres RLS. They run as **`service_role`** via
**`SECURITY DEFINER` RPCs** over a **VIEW** (the `career` schema is NOT exposed to PostgREST, and
employers/workers never get a base-table grant). Therefore:

- **THE GATE = (a) the `career_worker_showcase` VIEW's SELECT column list + (b) each RPC's SQL body
  + (c) `career_can_access_document` at signing time.** RLS policies are **defense-in-depth only**
  and are never on the production read path. Do not call RLS "the gate."
- A single RPC selecting a private column, or the view accidentally including an `_enc`/`_hash`
  column, leaks identity **with every RLS policy still green**. The tests must target the RPC/VIEW
  column projection, not a pure TS function.

## R1 — No `auth.uid()` inside any `career_*` RPC. EVER.
Every career RPC is invoked via `createAdminClient()` (service_role), where `auth.uid()` is **NULL**.
Scope EXCLUSIVELY via explicit `p_*_user_id` arguments, and **re-verify ownership inside the RPC**:
```sql
-- identity comes from the route/action layer (auth.getUser()) and is PASSED as an arg
create function career_employer_requisitions(p_employer_user_id uuid) ...
  -- re-verify the caller owns the employer account before returning anything
  where exists (select 1 from career.employer_accounts ea
                where ea.id = r.employer_id and ea.user_id = p_employer_user_id)
```
This mirrors health's `book_appointment(... p_session_key ...)` which compares the passed key, never
`auth.uid()`. The route/action derives identity from the cookie session and passes it down.

## R2 — The showcase VIEW
`public.career_worker_showcase` is a **standard view (NOT `security_invoker`)**, owned by `postgres`,
`GRANT SELECT TO anon, authenticated`. Its SELECT list contains ONLY public-safe columns and
**excludes every `_enc` / `_hash` / private column**. (A `security_invoker=true` view would return
zero rows to `anon` because the schema grants `anon` nothing — do not use it.)

## R3 — `career_express_interest` validation
Before inserting a `reveal_unlocks` row it MUST verify: (a) the requisition's `employer_id` is owned
by `p_employer_user_id`, AND (b) the `worker_code` resolves to an `is_showcased = true` worker.
Else `RAISE` `NOT_OWNED`. (Otherwise an employer can seed gate rows for arbitrary workers/reqs.)

## R4 — `is_admin()` self-containment
`public.is_admin()` is referenced by the storage admin-read policy but is defined **only in prod**,
so the migration set is not self-contained and **fails to apply on any fresh DB (the staging branch
we test on)**. FIX: in `073`, add an idempotent `CREATE OR REPLACE FUNCTION public.is_admin()`
matching prod's definition (fails-closed). Do NOT ship a storage policy that breaks on a fresh DB.

## R5 — Pool pages are `force-dynamic`
`/career/pool` and `/career/pool/[workerCode]` render employer-gated / per-viewer state (interest
markers, per-session watermark). They are `noindex` (zero SEO value) so **make them `force-dynamic`**
— never ISR-cache an employer-personalized render and serve it to another employer. Static marketing
pages (landing/how-it-works/sectors) keep `revalidate=3600`.

## R6 — Showcase-variant signer authorization
`signShowcaseVariant(path)` MUST verify the path belongs to a `worker_documents` row with
`visibility = 'public_anonymized'` before minting a signed URL. Never sign a gated original's path.
The gated-original signer (`/api/career/documents/sign`) MUST re-check the
`owner_approved && payment_status='paid'` gate via `career_can_access_document` and write a
`career_document_access_log` row on every issuance.

## R7 — Worker is NEVER charged
ILO Employer Pays + MNE €500–20 000 fine. No fee/price/payment column or UI may attach to the worker
side. All payment UI is employer-only. Enforce structurally (no worker fee columns).

## R8 — Tests that actually prove the gate (the ones that matter)
1. **Real-path column-set test**: call `career_browse_showcase` / `career_get_showcase_worker` as
   `service_role` (the prod path) and assert the returned column set contains ZERO private columns.
   (A pure-TS projection test is NOT sufficient — it isn't the prod path.)
2. **Cross-employer denial**: via the service_role RPCs, pass employer A's uid and assert it cannot
   read employer B's requisitions / unlocks / shortlist (the NULL-`auth.uid()` failure mode).
3. **Worker-self isolation**: worker A's uid cannot read worker B's profile/documents via the RPC.
4. **Gate equivalence**: `career_can_access_document` and the `worker_documents` gated-SELECT policy
   encode the SAME `(owner_approved && paid)` predicate — assert they agree (no drift).
5. **View leaks nothing**: as `anon`, `SELECT * FROM public.career_worker_showcase` column set ==
   public-safe set exactly.
6. **Deny-all tables**: as authenticated employer/worker, SELECT/INSERT on `career.commission_records`,
   `career.consents`, `career.document_access_log`, `career.waitlist` → denied.
7. **i18n nested parity** (vitest): deep-diff the `careerVertical` subtree across all 9 dictionaries
   (CI `i18n-check.sh` only checks top-level keys — nested drift ships silently otherwise).
8. **Flag-off prod status** (e2e, prod build): gated routes → real **HTTP 404 status** (not just a
   404 body — Next 14.2 `notFound()` returns 200 in dev), and `/career/coming-soon` → **200 for
   every one of the 9 localized slugs** (kariyer, karriere, carriera, karera, kariera, karijera,
   al-wazaif, zaposlenje variants…).
9. **Real-permission employer e2e** (flag ON, preview): log in as employer, open a worker detail →
   assert NO full name / phone / email / passport in page text; express interest → `reveal_unlocks`
   row created but dossier STILL locked (`owner_approved=false`).

All `_verify_*` SQL uses `BEGIN; … ROLLBACK;` and leaves no fixtures (local/preview point at the
PROD DB until a staging branch exists). Run RLS asserts as `authenticated`/`anon`, NEVER
`service_role` (which bypasses RLS).

## R9 — Seed migration
Add `078_career_c0_seed.sql` seeding `career.sectors` with Construction + Hospitality (9-locale
`name_jsonb`), mirroring `067_health_h1_seed.sql`. Otherwise the sectors hub renders empty.

## R10 — Owner notification trigger
`career_express_interest` has no human trigger today. Wire `lib/kariyer/booking.ts:dispatchInterestNotice`
(best-effort, never throws — mirror health's dispatch) and call it from `/api/career/interest` so the
owner is notified a new interest arrived (the approval gate needs a trigger). Also fold
**add-to-requisition** into the interest endpoint (pass `requisitionId`) — there is no separate route.

## R11 — `force-dynamic` vs auth: all employer/worker dashboard + register + login + profile +
documents pages read `auth.getUser()` → `force-dynamic`. Anything reading cookies/session is dynamic.

## R12 — Pool browse throttling
`/career/pool` is a **page route**, not under `/api/`, so `lib/rateLimit.ts`'s `public-form` cap does
NOT apply to it. Add an explicit lightweight throttle/bot guard on the browse surface OR document the
gap loudly. (At minimum: server-side pagination, no bulk export, and a `log()`/comment noting the
unthrottled scrape surface so it isn't mistaken for covered.)

## R13 — Audit table compatibility
Before relying on `lib/admin/audit.ts` union extension for `career.*` targetTable values, confirm
`glatko_admin_audit_log` has no CHECK/enum constraint on `target_table` that would reject schema-
qualified `career.*` strings at runtime. If constrained, add a migration to extend it. Smoke-test one
career admin action produces an audit row.

## R14 — Ordering on the shared tree (build-break avoidance)
1. `lib/kariyer/config.ts` (Group A) lands BEFORE the coordinator edits `lib/verticals/config.ts`
   (which imports `CAREER_ROUTES`).
2. Within the coordinator: edit `i18n/routing.ts` (register `/career/coming-soon` + ~20 keys) →
   THEN `lib/verticals/slugs.ts` (derive `CAREER_COMING_SOON_BARE_PATHS` from
   `routing.pathnames['/career/coming-soon']`) → THEN `lib/verticals/config.ts`.
3. `lib/admin/audit.ts` union extension lands before any admin action type-checks.
4. Reference `GlatkoHeader.tsx` edits by ANCHOR (the `{isHealth && (` desktop-nav + mobile-drawer
   blocks), not by line number; add `const isCareer = activeVertical === 'career'` beside
   `isServices`/`isHealth`.

## R15 — Migrations apply to PROD only on explicit human go
Author + adversarially review the SQL as files; validate via `BEGIN/ROLLBACK` dry-runs and (if a
staging branch exists) on the branch DB. Do NOT `apply_migration` to `glatko-prod`
(`cjqappdfyxgytdyeytwv`) without the owner's explicit confirmation. `inforonavisa-max` is a different
project — confirm the ref.
