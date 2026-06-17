# Demo Worker Cohort — pool seed data shape (for migration `079`)

> **DEMO / SEED-ONLY. NO REAL PII.** Every value below is fabricated for preview/QA.
> These ~40 anonymized showcase profiles exist to make `/career/pool` (Spec 05) look
> populated so the employer-conversion funnel is verifiable before the concierge MVP
> onboards real workers. An empty pool = no employer conversion (plan §"Two-sided cold-start").
>
> **Flag-gated:** only reachable when `CAREER_VERTICAL_ENABLED=true` (gated + `noindex`).
> **Seed-only:** consumed by `supabase/migrations/079_career_c0_demo_cohort.sql` (NOT YET
> WRITTEN — this doc is its input). That migration must be **clearly labelled DEMO**, be
> **idempotent** (`ON CONFLICT (worker_code) DO UPDATE`), insert ONLY the public-safe
> showcase block of `career.worker_profiles` (073), leave ALL `_enc`/`_hash` private
> columns **NULL** (these demo workers have no identity/contact — there is nothing to leak),
> set `is_showcased = true`, and write **no** `worker_documents` / `consents` / employer rows.
> Per **R7** no fee/payment column attaches to any of this. Per **R15** do NOT apply to
> `glatko-prod` (`cjqappdfyxgytdyeytwv`) without the owner's explicit go.

## Why these columns
Exactly the public-safe block the `public.career_worker_showcase` VIEW projects (mig 074):
`worker_code, role, trade, skill_tier, experience_band, region, age_band, languages,
skills, readiness_score, verification_status` (+ `is_showcased=true`, `created_at`).
A demo worker that sets any private column would be a (harmless here, but forbidden)
drift — keep them NULL.

## Enum / format constraints (must match 073)
- `worker_code` — `MNE-<TRADECODE>-NNNN` (`lib/kariyer/worker-code.ts` `WORKER_CODE_RE`,
  ≥4 padded digits, uppercase). Sequence pools below keep codes unique.
- `skill_tier` — `entry` | `skilled` | `expert` (UI-faceted; 073 has no CHECK, keep these 3).
- `experience_band` — `0-2` | `3-5` | `6-10` | `10+` (years; banded, never exact).
- `region` — `far_east` | `middle_east` | `africa` **ONLY** (region, never country/city — PART 4).
- `age_band` — `18-24` | `25-34` | `35-44` | `45-54` (banded, never DOB).
- `verification_status` — one of the 073 CHECK set: `pending` | `id_verified` |
  `skills_verified` | `documents_verified` | `interview_passed`. (Skip `rejected`: a
  rejected worker would not be showcased.)
- `readiness_score` — int 40–95 (drives default sort `readiness_score desc`).
- `languages` / `skills` — text[]; skills 4–6 per worker.

## Trade-code map (the `<TRADECODE>` in the worker_code)
**Construction** (trade slug → code): `mason`→MA, `welder`→WE, `electrician`→EL,
`plumber`→PL, `steel-fixer`→SF, `carpenter`→CA, `painter`→PA, `crane-operator`→CO,
`general-labour`→CW (construction worker). **Hospitality:** `chef`→CH, `cook`→CK,
`waiter`→WT, `housekeeper`→HK, `barista`→BA, `bartender`→BT, `receptionist`→RC,
`kitchen-steward`→KS. (Trade slugs are sector-scoped; sector is implied by the trade,
mirroring how Spec 04 derives the trades row per sector.)

## Spread (so the pool reads realistically across filters)
- **Sectors:** 22 Construction / 18 Hospitality (40 total).
- **Tiers:** 10 entry / 20 skilled / 10 expert (expert skews higher readiness).
- **Regions:** 16 far_east / 12 middle_east / 12 africa (all 3 facets non-empty).
- **Age bands:** spread across all 4 (most 25–44).
- **Verification:** a realistic funnel — a few `pending`/`id_verified`, more
  `skills_verified`/`documents_verified`, a cluster of `interview_passed` (top of pool).
- **Readiness:** correlates with tier+verification (interview_passed experts 85–95;
  pending/entry 40–60) so the default readiness-desc sort produces a sensible order.

## The cohort (40 profiles)

### Construction (22)
| worker_code | role | trade | tier | exp | region | age | languages | skills (4–6) | readiness | verification |
|---|---|---|---|---|---|---|---|---|---|---|
| MNE-MA-0001 | Mason | mason | expert | 10+ | middle_east | 35-44 | en,ar | bricklaying,plastering,blueprint-reading,concrete-forming,scaffolding | 92 | interview_passed |
| MNE-MA-0002 | Mason | mason | skilled | 6-10 | africa | 25-34 | en,fr | bricklaying,rendering,tiling,concrete-forming | 78 | documents_verified |
| MNE-WE-0003 | Welder | welder | expert | 10+ | far_east | 35-44 | en | mig-welding,tig-welding,arc-welding,blueprint-reading,metal-fabrication,safety | 94 | interview_passed |
| MNE-WE-0004 | Welder | welder | skilled | 3-5 | middle_east | 25-34 | en,ar | mig-welding,arc-welding,grinding,metal-cutting | 71 | skills_verified |
| MNE-WE-0005 | Welder | welder | entry | 0-2 | africa | 18-24 | en | arc-welding,grinding,workshop-safety,material-handling | 52 | id_verified |
| MNE-EL-0006 | Electrician | electrician | expert | 10+ | far_east | 35-44 | en,tl | industrial-wiring,panel-installation,fault-diagnosis,blueprint-reading,plc-basics | 90 | interview_passed |
| MNE-EL-0007 | Electrician | electrician | skilled | 6-10 | middle_east | 25-34 | en,ar | domestic-wiring,conduit-fitting,fault-diagnosis,lighting-install | 80 | documents_verified |
| MNE-PL-0008 | Plumber | plumber | skilled | 6-10 | far_east | 35-44 | en | pipe-fitting,leak-repair,drainage,fixture-install,soldering | 76 | documents_verified |
| MNE-PL-0009 | Plumber | plumber | entry | 0-2 | africa | 18-24 | en,fr | pipe-fitting,fixture-install,material-handling,site-safety | 48 | pending |
| MNE-SF-0010 | Steel Fixer | steel-fixer | expert | 10+ | middle_east | 45-54 | en,ar | rebar-tying,cutting-bending,blueprint-reading,formwork,crane-signalling | 88 | interview_passed |
| MNE-SF-0011 | Steel Fixer | steel-fixer | skilled | 3-5 | far_east | 25-34 | en | rebar-tying,cutting-bending,formwork,site-safety | 69 | skills_verified |
| MNE-CA-0012 | Carpenter | carpenter | expert | 10+ | far_east | 35-44 | en | formwork,framing,finishing,joinery,blueprint-reading,measuring | 89 | interview_passed |
| MNE-CA-0013 | Carpenter | carpenter | skilled | 6-10 | africa | 25-34 | en,fr | framing,formwork,door-fitting,measuring | 74 | documents_verified |
| MNE-PA-0014 | Painter | painter | skilled | 3-5 | middle_east | 25-34 | en,ar | surface-prep,spray-painting,roller-finishing,plastering | 66 | skills_verified |
| MNE-PA-0015 | Painter | painter | entry | 0-2 | africa | 18-24 | en | surface-prep,roller-finishing,site-cleanup,site-safety | 45 | pending |
| MNE-CO-0016 | Crane Operator | crane-operator | expert | 10+ | middle_east | 35-44 | en,ar | tower-crane,mobile-crane,load-charts,rigging,signalling | 91 | interview_passed |
| MNE-CO-0017 | Crane Operator | crane-operator | skilled | 6-10 | far_east | 35-44 | en | mobile-crane,rigging,signalling,load-charts | 79 | documents_verified |
| MNE-CW-0018 | General Labourer | general-labour | entry | 0-2 | africa | 18-24 | en,fr | material-handling,site-cleanup,concrete-pouring,site-safety | 50 | id_verified |
| MNE-CW-0019 | General Labourer | general-labour | entry | 0-2 | far_east | 25-34 | en | material-handling,scaffolding-assist,site-cleanup,manual-excavation | 47 | pending |
| MNE-CW-0020 | General Labourer | general-labour | skilled | 3-5 | middle_east | 25-34 | en,ar | scaffolding,material-handling,concrete-pouring,site-safety,formwork-assist | 64 | skills_verified |
| MNE-EL-0021 | Electrician | electrician | entry | 0-2 | africa | 18-24 | en,fr | domestic-wiring,conduit-fitting,material-handling,site-safety | 54 | id_verified |
| MNE-WE-0022 | Welder | welder | skilled | 6-10 | far_east | 25-34 | en,tl | tig-welding,mig-welding,metal-fabrication,blueprint-reading,grinding | 82 | documents_verified |

### Hospitality (18)
| worker_code | role | trade | tier | exp | region | age | languages | skills (4–6) | readiness | verification |
|---|---|---|---|---|---|---|---|---|---|---|
| MNE-CH-0023 | Head Chef | chef | expert | 10+ | far_east | 35-44 | en | menu-planning,mediterranean-cuisine,kitchen-management,food-safety,plating,cost-control | 93 | interview_passed |
| MNE-CH-0024 | Chef | chef | expert | 6-10 | middle_east | 25-34 | en,ar | mediterranean-cuisine,grill,food-safety,plating,prep | 86 | interview_passed |
| MNE-CK-0025 | Cook | cook | skilled | 6-10 | far_east | 25-34 | en | line-cooking,prep,food-safety,grill,frying | 77 | documents_verified |
| MNE-CK-0026 | Cook | cook | skilled | 3-5 | africa | 25-34 | en,fr | prep,line-cooking,sauces,food-safety | 68 | skills_verified |
| MNE-CK-0027 | Cook | cook | entry | 0-2 | far_east | 18-24 | en | prep,dishwashing-support,food-safety,kitchen-hygiene | 49 | id_verified |
| MNE-WT-0028 | Waiter | waiter | skilled | 6-10 | far_east | 25-34 | en,it | fine-dining-service,order-taking,wine-service,upselling,pos-systems | 81 | documents_verified |
| MNE-WT-0029 | Waiter | waiter | skilled | 3-5 | middle_east | 25-34 | en,ar | table-service,order-taking,pos-systems,customer-care | 70 | skills_verified |
| MNE-WT-0030 | Waiter | waiter | entry | 0-2 | africa | 18-24 | en,fr | table-service,clearing,customer-care,hygiene | 46 | pending |
| MNE-HK-0031 | Housekeeper | housekeeper | skilled | 6-10 | far_east | 35-44 | en | room-cleaning,linen-management,inventory,deep-cleaning,guest-care | 75 | documents_verified |
| MNE-HK-0032 | Housekeeper | housekeeper | entry | 0-2 | africa | 25-34 | en,fr | room-cleaning,laundry,restocking,hygiene | 51 | id_verified |
| MNE-HK-0033 | Housekeeper | housekeeper | skilled | 3-5 | middle_east | 25-34 | en,ar | room-cleaning,linen-management,deep-cleaning,guest-care | 63 | skills_verified |
| MNE-BA-0034 | Barista | barista | skilled | 3-5 | far_east | 18-24 | en | espresso,latte-art,grinder-calibration,pos-systems,customer-care | 72 | skills_verified |
| MNE-BT-0035 | Bartender | bartender | expert | 6-10 | middle_east | 25-34 | en,ar | cocktail-mixing,wine-knowledge,inventory,upselling,pos-systems,flair | 84 | interview_passed |
| MNE-BT-0036 | Bartender | bartender | skilled | 3-5 | africa | 25-34 | en,fr | cocktail-mixing,bar-service,inventory,customer-care | 67 | skills_verified |
| MNE-RC-0037 | Receptionist | receptionist | expert | 6-10 | far_east | 25-34 | en,ru | front-desk,reservations,pms-systems,guest-relations,complaint-handling,multilingual-service | 87 | interview_passed |
| MNE-RC-0038 | Receptionist | receptionist | skilled | 3-5 | middle_east | 25-34 | en,ar | front-desk,reservations,pms-systems,guest-relations | 73 | documents_verified |
| MNE-KS-0039 | Kitchen Steward | kitchen-steward | entry | 0-2 | africa | 18-24 | en,fr | dishwashing,kitchen-hygiene,waste-management,equipment-cleaning | 44 | pending |
| MNE-KS-0040 | Kitchen Steward | kitchen-steward | skilled | 3-5 | far_east | 25-34 | en | dishwashing,kitchen-hygiene,inventory,equipment-cleaning,prep-support | 62 | skills_verified |

## Tallies (for the seed author to verify against)
- **Count:** 40 (Construction 22, Hospitality 18).
- **Tiers:** entry 10, skilled 20, expert 10.
- **Regions:** far_east 16, middle_east 12, africa 12.
- **Verification:** pending 5, id_verified 5, skills_verified 10, documents_verified 10, interview_passed 10.
- **Readiness:** 44–94; every tier present at multiple readiness levels.
- **Languages:** en universal; ar/fr/it/ru/tl mixed in for the languages-filter facet.

## Notes for the seed migration (079)
- Insert into `career.worker_profiles` (073) public-safe columns only; `user_id` NULL
  (no auth user — demo), all `_enc`/`_hash` NULL, `is_showcased=true`. The showcase VIEW
  (074) will pick them up; `/career/pool` (Spec 05) and `/career/sectors/[sector]`
  (Spec 04) then render a populated grid.
- `languages` / `skills` are Postgres `text[]` literals (e.g. `'{en,ar}'`,
  `'{bricklaying,plastering,...}'`).
- Keep it idempotent: `ON CONFLICT (worker_code) DO UPDATE SET ...` (mirror 078's pattern)
  so re-applying is safe and self-healing.
- Optional teardown comment in the migration header:
  `delete from career.worker_profiles where worker_code like 'MNE-%' and user_id is null;`
  (demo rows are exactly the `user_id IS NULL` showcase rows — distinguishable from real
  concierge-onboarded workers, which always have a `user_id`).
- This cohort populates the pool ONLY; requisition/unlock/placement demos (if needed) are
  a separate concern and must use the employer-side RPCs, never hand-seeded gate rows (R3).
