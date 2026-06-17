# Career Vertical — INTEGRATION & VERIFICATION CHECKLIST

> Run this after the build lands and before any PR / before any human go on migrations.
> Read alongside `docs/career/career-vertical-plan-v1.md` (SSOT) and `docs/career/BUILD-RULES.md`
> (R1–R15). The career vertical mirrors HEALTH; accent amber-600 via the `brandCareer*` token group;
> flag `CAREER_VERTICAL_ENABLED` default **OFF**; everything noindex + gated.
> All `_verify_*` SQL uses `BEGIN; … ROLLBACK;` and leaves no fixtures (local/preview point at the
> PROD DB until a staging branch exists). RLS asserts run as `authenticated`/`anon`, NEVER `service_role`.

## Run order (each gate must pass before the next)
```
1. npx tsc --noEmit          # types compile across the new tree
2. npm run i18n-check          # top-level dict parity (CI gate)
3. npm test                    # vitest: R8 §1–§7 unit/integration (incl. nested i18n diff)
4. npm run build               # prod build succeeds, RSC/route segments valid
5. npm run smoke               # build + prod server + critical-page HTTP 200s
6. npx playwright test         # e2e: R8 §8 flag-OFF 404/200; R8 §9 needs flag-ON preview
```
Stop at the first failure; do not paper over a red gate by skipping. `npm run smoke` re-runs the
build internally — run step 4 first so a pure build break is diagnosed without the server noise.

## What each command must PROVE
- **`npx tsc --noEmit`** — zero type errors. Proves `lib/kariyer/*`, the `career` route segments, the
  `careerVertical` dict typing, and the `lib/admin/audit.ts` union extension (R13) all compile. Must
  run AFTER `lib/kariyer/config.ts` and the `lib/verticals/config.ts` edit land in the R14 order, or
  the `CAREER_ROUTES` import fails to resolve.
- **`npm run i18n-check`** — all 9 `dictionaries/*.json` are valid JSON with identical **top-level**
  key sets and no empty values. NOTE: this script (`scripts/i18n-check.sh`) only diffs `Object.keys`
  at depth 1 — it CANNOT see nested `careerVertical.*` drift. That gap is covered by `npm test` §7;
  i18n-check alone is NOT sufficient for the career subtree.
- **`npm test`** — vitest (`vitest.config.ts` includes `lib/**/*.test.ts` + `test/**/*.test.ts`,
  node env, `server-only` stubbed). Proves the R8 §1–§7 gate-targeting suite below is green. These
  are the tests that matter: they target the RPC/VIEW column projection and the cross-tenant denial
  paths, not pure-TS helpers.
- **`npm run build`** — `next build` completes. Proves every `career` page compiles with the correct
  render mode: pool pages + employer/worker dashboards/register/login/profile/documents are
  `force-dynamic` (R5/R11); landing/how-it-works/sectors keep `revalidate=3600`. A build that
  statically prerenders a pool/dashboard page is a FAIL (would serve one employer's render to another).
- **`npm run smoke`** — builds, starts the prod server on :3001, asserts homepage locales return 200.
  EXTEND `scripts/smoke-test.sh` with career flag-OFF checks (see §8 below) so smoke proves the
  quarantine, not just the homepage.
- **`npx playwright test`** — e2e. Flag-OFF run proves R8 §8 (real 404 status + coming-soon 200 for
  all 9 slugs). R8 §9 (real-permission employer dossier-lock) requires a **flag-ON preview** env and
  is gated separately — it does NOT run in the default flag-OFF CI pass.

---

## Rule R8 — Test inventory as ACCEPTANCE CRITERIA
Every item below must exist and pass. Items §1–§7 are vitest (`npm test`); §8–§9 are e2e
(`npx playwright test`). Gate-equivalence and column-set items are the load-bearing ones.

| # | Test | Runner | Proves | Done when |
|---|---|---|---|---|
| §1 | Real-path column-set | vitest, calls `career_browse_showcase` / `career_get_showcase_worker` as `service_role` | the PROD read path returns ZERO private columns | returned column set ∩ {`full_name`,`dob`,`exact_country`,`phone`,`email`,`address`,`passport_no`, any `_enc`/`_hash`} = ∅ |
| §2 | Cross-employer denial | vitest, RPCs with employer A's uid | NULL-`auth.uid()` failure mode cannot leak B's data | A's uid reading B's requisitions / unlocks / shortlist → empty/`NOT_OWNED`, never B's rows |
| §3 | Worker-self isolation | vitest, RPC with worker A's uid | a worker cannot read another worker | A's uid → B's profile/documents → denied/empty |
| §4 | Gate equivalence | vitest | `career_can_access_document` and the `worker_documents` gated-SELECT policy encode the SAME `(owner_approved && payment_status='paid')` predicate | both agree on a paired truth table; no drift |
| §5 | View leaks nothing | vitest, as `anon`, `SELECT * FROM public.career_worker_showcase` | the view projects only public-safe columns | column set == public-safe set EXACTLY (R2) |
| §6 | Deny-all tables | vitest, as authenticated employer/worker | sensitive tables are ungranted | SELECT/INSERT on `career.commission_records`, `career.consents`, `career.document_access_log`, `career.waitlist` → denied |
| §7 | i18n nested parity | vitest | the `careerVertical` subtree is identical-keyed across all 9 dicts | deep-diff of `careerVertical` over tr/en/de/it/me/ru/sr/ar/uk → empty diff |
| §8 | Flag-OFF prod status | playwright, prod build, flag OFF | quarantine returns REAL HTTP statuses | every `/career/**` (non-coming-soon) → **404 status** (not a 200 body); `/career/coming-soon` → **200 for all 9 localized slugs** (kariyer, karriere, carriera, karera, kariera, karijera, al-wazaif, zaposlenje variants) |
| §9 | Real-permission employer e2e | playwright, **flag ON, preview** | the gate holds for a logged-in employer | worker detail page text contains NO full name / phone / email / passport; express-interest creates a `reveal_unlocks` row yet dossier STAYS locked (`owner_approved=false`) |

### Extra acceptance ties (from R-rules, verify alongside R8)
- **R7 (worker never charged):** grep the worker-side tree + `careerVertical` worker copy — zero
  price/fee/payment field or string on any worker surface. A worker fee column anywhere = hard FAIL.
- **R4 (self-contained migrations):** the migration set applies on a FRESH DB (`is_admin()` redefined
  in `073`). Verify via `BEGIN; \i 073…\i 077; ROLLBACK;` on a clean target — no missing-function error.
- **R9 (seed):** after `078`, `career.sectors` has Construction + Hospitality with 9-locale
  `name_jsonb`; the sectors hub does not render empty.
- **R13 (audit compat):** one career admin action writes a `glatko_admin_audit_log` row with a
  schema-qualified `career.*` target_table and is NOT rejected by a CHECK/enum.

---

## Per-GROUP "done" definitions
Mark a group done only when ALL its gates are green.

- **Group A — `lib/kariyer/*` + config wiring (R14):** `npx tsc --noEmit` clean; `lib/kariyer/config.ts`
  landed before `lib/verticals/config.ts`; `npm test` green for any `lib/kariyer/*.test.ts`.
- **Group B — i18n / dictionaries:** `npm run i18n-check` green (top-level) AND R8 §7 green (nested
  `careerVertical` parity across all 9). No empty values. RTL (`ar`) keys present.
- **Group C — Public marketing pages (landing/how-it-works/sectors):** `npm run build` keeps them at
  `revalidate=3600`; all noindex; amber-only (zero teal/sky leakage); render with seeded sectors (R9).
- **Group D — Pool + worker-detail (gated, employer-personalized):** `npm run build` confirms
  `force-dynamic` (R5); R8 §1/§5/§9 green; per-session watermark + interest markers are per-viewer.
- **Group E — Employer surfaces (register/dashboard/requisitions/unlocks):** `force-dynamic` (R11);
  R8 §2 green; express-interest → `reveal_unlocks` row, dossier stays locked (R3, §9).
- **Group F — Worker surfaces (register/profile/documents/dashboard):** `force-dynamic` (R11);
  R8 §3 green; R7 grep clean (no money on worker side); per-document consent/visibility writes verified.
- **Group G — Gate & storage (RPCs, signers, docs):** R8 §1/§4/§5/§6 green; `signShowcaseVariant`
  only signs `public_anonymized` paths; gated-original signer re-checks the paid gate and writes a
  `career_document_access_log` row per issuance (R6).
- **Group H — Flag-OFF quarantine:** `npm run smoke` + R8 §8 green — every `/career/**` → 404,
  `/career/coming-soon` → 200 for all 9 slugs. This is the launch-blocking gate.
- **Group I — Migrations (R15):** SQL authored + adversarially reviewed as files; `BEGIN/ROLLBACK`
  dry-run clean on a fresh target (R4). **NOT applied to `glatko-prod` (`cjqappdfyxgytdyeytwv`)
  without explicit human go.** `inforonavisa-max` is a different project — confirm the ref first.

## Final sign-off
All six commands green in order; all 9 R8 items green (§9 on a flag-ON preview); every group's "done"
met; flag remains OFF in prod env; migrations un-applied pending human go. Only then is the build
PR-ready.
