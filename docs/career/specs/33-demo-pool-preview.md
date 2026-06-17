# Spec 33 — Demo-pool preview verification (make `/career/pool` look populated)

> Docs-only build spec. No app/lib/SQL code here. Read alongside `career-vertical-plan-v1.md`
> (PART 4 "Two-sided cold-start": an empty pool = no employer conversion), `BUILD-RULES.md`
> (R1, R2, R5, R7, R8, R15), Spec 05 (`05-pool-browse.md`), Spec 06 (worker detail), Spec 07
> (WorkerCard), and the cohort data in `demo-cohort.md` (this spec's data input).
>
> Purpose: wire the ~40 anonymized demo workers (`demo-cohort.md`) into the live pool so the
> employer-conversion funnel is **verifiable in preview** while the vertical is still dark.
> Everything stays flag-gated (`CAREER_VERTICAL_ENABLED` default OFF), `noindex`, gated-group
> quarantined. This spec does NOT redesign the pool — Specs 05/06/07 own the UI. It only makes
> that UI render non-empty and proves the gate holds.

## What this mirrors (read first)
- **Seed migration** — mirror `supabase/migrations/078_career_c0_seed.sql` (idempotent
  `ON CONFLICT ... DO UPDATE`, 9-locale where applicable, "no fixtures beyond the seed" header).
  New file `079_career_c0_demo_cohort.sql` (NOT YET WRITTEN). Health's analog is
  `067_health_h1_seed.sql`.
- **Showcase read path** — `public.career_worker_showcase` VIEW + `career_browse_showcase` /
  `career_get_showcase_worker` RPCs (mig 074). The demo rows flow through THIS path only; no new
  read surface. Health analog: `lib/saglik/queries.ts` over the health read-RPCs.
- **Pool/card/detail UI** — already specced (05/06/07). This spec adds NO components.

## Data source (single source of truth)
`docs/career/specs/demo-cohort.md` — 40 profiles, public-safe columns only. The seed author
transcribes that table verbatim. Constraints (enums, `worker_code` format, `text[]` literals)
are stated there and must match mig 073's CHECKs.

## The seed migration (079) — rules
1. **DEMO-labelled header**, idempotent, additive. Inserts into `career.worker_profiles`
   (073) the public-safe block ONLY: `worker_code, role, trade, skill_tier, experience_band,
   region, age_band, languages, skills, readiness_score, verification_status`, plus
   `is_showcased = true`, `user_id = NULL`.
2. **Every `_enc`/`_hash` private column stays NULL** (R2/R7: these demo workers have no
   identity, contact, or fee data — there is structurally nothing to leak; the gate can be
   exercised without ever minting fake PII).
3. **No** `worker_documents`, `consents`, `employer_accounts`, `requisitions`, `reveal_unlocks`
   rows. Pool population only. (Employer-side demos go through the write-RPCs, never hand-seeded
   gate rows — R3.)
4. **Distinguishable from real workers**: demo rows are exactly the `user_id IS NULL` showcase
   rows; real concierge-onboarded workers always carry a `user_id`. Teardown one-liner in the
   header comment.
5. **R15**: authored + dry-run (`BEGIN; … ROLLBACK;`) only; NOT applied to `glatko-prod`
   (`cjqappdfyxgytdyeytwv`) without the owner's explicit go.

## How it surfaces (no new code paths)
Once 079 is applied to the preview/branch DB, the existing read path lights up automatically:
- `/career/pool` (Spec 05) — `career_browse_showcase` now returns up to 40 rows → card grid,
  result count, working facets (sector/trade/tier/region/age/languages/readiness), readiness-desc
  default sort. The pool-empty "Havuz hazırlanıyor" state is replaced by real cards.
- `/career/sectors/[sector]` (Spec 04) — Construction shows 22, Hospitality 18.
- `/career/pool/[workerCode]` (Spec 06) — each demo code resolves to an anonymized detail page.

## UI states to verify in preview (every one)
- **Populated success** — pool grid renders cards; facet counts non-zero for all three regions,
  all three tiers, both sectors. Default sort = readiness desc (so `interview_passed` experts top).
- **Filter-empty** — apply a no-match filter combo (e.g. `region=africa` + `trade=crane-operator`,
  which the cohort intentionally lacks) → designed "no match" empty state (Spec 05), NOT a crash,
  NOT a pool-not-open message.
- **Pool-not-open empty** — before 079 (or on a DB without demo rows) the whole-pool-empty state
  shows; confirm the two empties are visually distinct (Spec 05).
- **Loading** — neutral skeleton grid during facet transitions (no amber).
- **Error** — kill/deny the RPC once → amber retry boundary (Spec 05 error), never fake-empty.
- **Locked (the gate)** — as an anon/non-employer viewer, the card `İlgi Göster`/`Talebe Ekle`
  actions are locked → route to `/career/login`; the detail page shows the locked dossier panel.
  Full name/phone/email/passport appear NOWHERE (these demo rows have none — but assert the page
  text contains zero private fields regardless; R8 #9).

## Amber-accent usage (unchanged from Specs 05/07)
`brandCareer` (amber-600 `#D97706`) is wayfinding only: verification badge, readiness pill, active
facet count, focus rings, retry button. Card code/title stays neutral gray. The career ramp is
ONLY `brandCareer-50` / `brandCareer` (DEFAULT) / `brandCareer-700` — no invented `-100`/`-200`
(text uses `-700` for AA contrast; bare DEFAULT is icons/large-UI only). Import segment + token
from `lib/kariyer/config.ts`; never hardcode `/career` or the hex.

## Gate-proof tests this enables (run on the seeded preview/branch DB)
- **R8 #1 column-set** — `career_browse_showcase` / `career_get_showcase_worker` as `service_role`
  return ZERO private columns even with 40 rows present.
- **R8 #5 view leaks nothing** — as `anon`, `SELECT * FROM public.career_worker_showcase` column
  set == public-safe set exactly; row count == count of `is_showcased=true` demo rows.
- **R8 #9 real-permission e2e** (flag ON, preview) — open `MNE-CH-0023` detail: NO name/phone/
  email/passport in page text; `İlgi Göster` while logged out → locked, no `reveal_unlocks` write.
- **Facet integrity** — each demo facet value (every tier/region/trade/verification/language used
  in `demo-cohort.md`) returns the expected subset; readiness-desc order matches the table.

## Edge cases
- **Verifiability ≠ production data** — these rows must never ship enabled to prod alongside real
  workers without an explicit decision; they exist for preview/QA. Keep `CAREER_VERTICAL_ENABLED`
  OFF in prod; the demo cohort is for the preview/branch DB and dark-launch QA.
- **Re-apply safety** — `ON CONFLICT (worker_code) DO UPDATE` makes 079 self-healing; editing a
  value in `demo-cohort.md` + re-applying corrects the row, never duplicates.
- **Unthrottled scrape surface (R12)** — populating the pool does not change the fact that
  `/career/pool` is a page route outside `lib/rateLimit.ts`'s `public-form` cap; the scrape-gap
  note from Spec 05 still stands. Do not treat a populated demo pool as "ready to expose publicly."
- **i18n parity (R8 #7)** — facet labels for the demo data come from the `careerVertical.*` subtree;
  keep nested parity across all 9 dictionaries (RTL for `ar`). The demo `role`/`skills`/`trade`
  strings are stored values, not translated keys — fine for QA; localized display labels are the
  dictionary's job, not the seed's.
