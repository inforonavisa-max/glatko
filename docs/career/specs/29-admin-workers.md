# Spec 29 — Admin Workers List (`/admin/career/workers` + `AdminCareerWorkersList`)

> Docs-only build spec. Downstream agent writes the code (NO app/lib/SQL here).
> Read alongside `career-vertical-plan-v1.md` (PART 2 §10 "talent curation: search full
> un-anonymized worker DB" + PART 3 RLS/showcase split) and `BUILD-RULES.md`
> (R1/R8 #2 caveat, R5/R11 dynamic, R7 no worker fee, R8 #1/#8 column-set + flag-off, R13 audit).
> The owner's RoNa Legal talent-curation entry point: a searchable, paginated list of EVERY worker
> with **UN-anonymized identity visible** (full name, country) — the ONE surface where PII is shown
> by design — each row linking into the per-worker curation detail (Spec 25, `/admin/career/workers/[id]`,
> not yet written). Admin-gated, service-role read, `noindex`.

## This is the exception to anonymization (read before anything else)
Every PUBLIC career surface hides identity (worker CODE only). THIS surface is the opposite: it is the
owner console's curation entry point and reads the **`career_admin_search_workers` RPC** (migration
`076` §1 — the ONLY read path that `pgp_sym_decrypt`s `full_name_enc` / `phone_enc` / `email_enc` /
`passport_no_enc` with `career_pii_key`). The two-layer defense is (1) the admin layout email allowlist
gates the human, (2) the RPC is `service_role`-EXECUTE only. **R1/R8 #2 exception applies**: admin RPCs
are owner-only and read ALL workers — there is no `p_worker_user_id` scoping and no cross-worker denial
here (that worker-self-isolation rule is for the worker dashboard RPCs, not this console).

## What this mirrors (read these first — do not invent a pattern)
- **Page route** — mirror `app/[locale]/admin/users/page.tsx` end to end → new
  `app/[locale]/admin/career/workers/page.tsx`: async server component, awaits `params` +
  `searchParams` (`q`, `status`, `page`), `createAdminClient()` to call the read RPC, maps the raw
  jsonb into a typed `AdminWorkerRow[]`, renders header + search/filter form + a divided row list +
  pager. Export the row type from the page so a client child (if any) imports it. `PAGE_SIZE = 50`
  (mirror users), derive `offset = (page-1)*PAGE_SIZE`.
- **Data source** — `career_admin_search_workers(p_q, p_verification, p_limit, p_offset)` (076 §1).
  Returns a jsonb array; each element already includes both public-safe fields AND decrypted PII.
  `p_q` ILIKE-matches workerCode/role/trade/region; `p_verification` filters by status (null = all);
  server-paginated via limit/offset. **GAP:** the RPC returns rows but NO total count → the pager
  cannot show "Sayfa X / Y". Mirror users' next/prev by fetching `PAGE_SIZE + 1` (request `p_limit =
  51`, render 50, show "Sonraki" only if a 51st came back) OR add a count-only companion RPC and
  coordinate the migration owner (**R15** — no prod apply without explicit go). Pick one; note it.
- **Auth gate** — inherited from `app/[locale]/admin/layout.tsx` (no user → `redirect(/login)`; not in
  `isAdminEmail` allowlist → `notFound()`). Do NOT re-implement; the layout already wraps. `noindex`
  comes from the layout `metadata.robots` — do not re-declare.
- **Sidebar** — the "Kariyer" admin nav item already added in Spec 23 points at `/admin/career`; no new
  top-level sidebar entry needed. Link into this list from the dashboard (Spec 23) and from the curation
  flow; the `startsWith` active logic already covers `/admin/career/*`.

## Route & rendering
- Path: `app/[locale]/admin/career/workers/page.tsx`. Internal English `career`/`workers` segment (NOT
  a localized public slug — admin console is not locale-public; mirror users/professionals).
- `export const dynamic = "force-dynamic"` (**R5/R11** — reads session + per-request `?q`/`?status`/
  `?page`; never ISR-cache a console view, and these rows carry PII — must never be cached/shared).
- No `setRequestLocale` needed (admin layout already called it); no `generateStaticParams`.

## Chrome language — TR-HARDCODED (admin-i18n-policy)
All visible strings are Turkish literals in the JSX, NOT dictionary keys (mirror users/professionals/
reviews). Do NOT route through `careerVertical.*` (that is employer/worker-public only). No RTL.
Title: "İşçi Küratörlüğü". Subtitle: "N işçi" (row count). Search placeholder: "Kod, rol, meslek veya
bölge ile ara…". Filter select: "Tüm Durumlar" + one option per verification status.

## Layout (mirror admin/users/page.tsx)
- `<header>` (`flex items-end justify-between`): `<h1 className="text-2xl font-semibold … md:text-3xl">`
  "İşçi Küratörlüğü" + subtitle muted "N işçi".
- **Search/filter form** (`<form method="GET">` inside a `Card` → `CardContent pt-6`,
  `flex flex-col gap-3 md:flex-row md:items-center`): text input `name="q"` with a `Search` icon
  (mirror users' relative label + `pl-9`), a `<select name="status">` (verification filter), and a
  submit button. **Accent swap:** the input/select focus ring + the submit button gradient are the
  one teal→amber swap — see Amber section. Preserve `q`/`status` as `defaultValue` so the form is
  sticky.
- **Row list** (`Card` → `CardContent p-0` → `divide-y divide-gray-100`): one row per worker, each
  `flex items-center gap-3 px-4 py-3 hover:bg-gray-50`, wrapping a `<Link>` to the curation detail.
- **Pager** (mirror users' Önceki/Sonraki + "Sayfa X / Y", or Önceki/Sonraki-only under the
  no-total GAP) — `flex items-center justify-center gap-2`, neutral bordered links, query-string
  carried via `URLSearchParams`.

## Row contents (per worker — UX level, PII VISIBLE here by design)
Each row's `<Link href={/${locale}/admin/career/workers/${id}}>` shows:
- **Primary line:** worker **full name** (decrypted) — bold; fall back to the **worker code** when
  `fullName` is null (early/unverified profile). To the right of the name, inline pills: the
  **verification-status badge** (see below) and an **`is_showcased` "Vitrinde" pill** (amber) when the
  worker is live in the public pool — the owner's at-a-glance "this identity is already showcased"
  signal.
- **Secondary line** (muted xs): worker **code** · **role/trade** · **region** · **experience band**.
  Optionally append **readiness score** (e.g. "Hazırlık 72"). Do NOT print phone/email/passport in the
  list row even though the RPC returns them — those belong on the detail (Spec 25); the list stays
  name+taxonomy to limit PII exposure per scroll. (The RPC returns them; the UI chooses not to render
  them here.)
- **Right edge:** a `ChevronRight` affordance (mirror users) — the whole row navigates to curation.
- No worker fee / price / payment anywhere (**R7** — structural; the worker side has no fee at all).

## Verification-status badge (`STATUS_BADGE` record — mirror reviews', keyed by enum)
Enum (RPC §3 `career_admin_set_worker_verification`): `pending` · `id_verified` · `skills_verified` ·
`documents_verified` · `interview_passed` · `rejected`. TR-hardcoded labels. Colors:
- `pending` → neutral gray (`bg-gray-100 text-gray-600` + dark) — not yet curated.
- `id_verified` / `skills_verified` / `documents_verified` → amber-tinted progress
  (`bg-amber-100 text-amber-700` + dark) — the "in curation, needs the owner" attention band (mirrors
  how reviews uses amber for `flagged` and the requisition spec uses amber for the act-now status).
- `interview_passed` → emerald (`bg-emerald-100 text-emerald-700` + dark) — fully vetted/terminal-positive.
- `rejected` → red (`bg-red-100 text-red-700` + dark).
- Unknown/future status → neutral gray fallback (mirror reviews' `?? STATUS_BADGE.published`); never crash.

## Every UI state
- **loading** — server `await` blocks; no `loading.tsx` (admin convention). If a Suspense skeleton is
  added keep it neutral gray, no amber.
- **empty** — `rows.length === 0`: centered muted text. Two messages (mirror users): with a query/filter
  active → "Sonuç bulunamadı"; with none active → "Henüz işçi yok" (pre-seeding day-1 state; must look
  intentional, not broken). NOT an error; no CTA (admins don't create workers from this list — onboarding
  is concierge per the plan's Phase 1).
- **error** — the page-level read failure is `console.error`'d and renders an empty list (mirror the
  admin convention of logging + falling through to `[]`); never a 500 white screen. A `PII_KEY_MISSING`
  RPC exception (vault `career_pii_key` absent on a fresh/staging DB) must be caught and surfaced as a
  small inline "Veriler yüklenemedi" note rather than crashing — flag this loudly to the owner because it
  means decryption is unavailable.
- **success** — populated list + sticky search/filter + pager.
- **locked / gated** — the admin layout returns **real HTTP 404** for non-allowlisted users
  (**R8 #8**: Next 14.2 `notFound()` is 200 in dev, 404 in prod). `CAREER_VERTICAL_ENABLED` does NOT
  gate `/admin/*` (admins curate before public launch — mirror Spec 23/24); do NOT import
  `isCareerVerticalEnabled` here unless the coordinator wants the console hidden pre-flag (then add a
  defense-in-depth `if (!isCareerVerticalEnabled()) notFound()` at the top — decide together). There is
  no per-row locked state on THIS surface — un-anonymized identity is the whole point of the owner view.

## Amber accent usage (`brandCareer` = amber-600 `#D97706`; swaps users' teal)
- **Search input + status select** focus ring/border: amber — swap users' `focus:border-teal-500
  focus:ring-teal-500/20` → `focus:border-brandCareer focus:ring-brandCareer/20`.
- **Submit ("Filtrele") button:** the one solid accent — swap users' teal gradient
  (`from-teal-500 to-teal-600`) → an amber gradient (`from-brandCareer to-brandCareer-700`) or a flat
  `bg-brandCareer text-white`. This is the single solid amber on the page.
- **`is_showcased` "Vitrinde" pill + the in-curation verification badges** use the `amber-100/700`
  Tailwind pair (already AA-safe), NOT the `brandCareer` token — matching reviews' literal
  `amber-100 text-amber-700 flagged` badge.
- Accent **text** (if any inline accent label is used) must be `brandCareer-700` / `text-amber-700`
  (DEFAULT amber-600 is below 4.5:1 AA per the tailwind-config note). Do NOT amber-tint every pill —
  reserve amber for the showcased/in-curation attention signal so it stays meaningful; `pending` is
  gray, `interview_passed` emerald, `rejected` red.

## Data it needs (UX level — exact field names live in the RPC payload)
- **Reads (all workers):** per row — id (link target), worker code, full name (decrypted; may be null),
  role/trade, region, experience band, readiness score, verification status, `is_showcased`. Page-level:
  the `q` search string, the `status` filter value, the current page/offset.
- **Sends:** nothing mutating from THIS list (read + navigate only). Search/filter/page are GET query
  params, re-read on the server. The mutations (set verification, verify document, toggle showcase) live
  on the curation **detail** (Spec 25) — keep this list read-only. (If a quick inline showcase toggle is
  ever added it becomes an action page; out of scope for C0.)
- **i18n:** TR-hardcoded admin chrome (no `careerVertical.*`, no RTL) — mirror reviews/users literals.

## Edge cases
- **PII exposure scope** — the RPC returns phone/email/passport/dob/address in clear; the list MUST NOT
  render them (name + taxonomy only). They are for the detail surface. Never log the decrypted payload
  (no `console.log(rows)` with PII). This is the highest-sensitivity surface in the vertical — treat the
  payload as special-category data (PART 3 / Part 6 GDPR scaffolding).
- **Null full name** — early profiles encrypt no name yet; fall back to worker code as the primary line
  so the row is never blank/"(isimsiz)"-only and is still clickable into curation.
- **No total count (the headline GAP)** — the RPC returns no count → either fetch `PAGE_SIZE+1` for a
  has-next probe (no "Sayfa X / Y", just Önceki/Sonraki) or add a count RPC (R15 coordinate). Pick one
  and state it in the page; do NOT fake a total.
- **`PII_KEY_MISSING`** — on a fresh/staging DB without the `career_pii_key` vault secret the RPC raises;
  catch → inline error note, not a crash. (On prod the key exists; this is the staging-branch failure
  mode the test plan exercises.)
- **Sticky search across pages** — carry `q`/`status` in every pager link via `URLSearchParams` (mirror
  users' `buildPageHref`) so paging doesn't drop the active filter.
- **Stale/empty query** — empty `q` and `status="all"` must pass `null`/empty to the RPC (it treats
  `null`/`''` as "no filter"), returning the full first page — never an error.
- **Audit (R13)** — this list is read-only → writes no `glatko_admin_audit_log` row. (Audit matters for
  the curation **mutations** on the detail/Spec 25, where confirming `target_table` accepts the
  schema-qualified `career.*` string matters; nothing to extend on this read-only page.)
- **Dark mode** — every amber/badge surface needs its `dark:` parity (mirror users' dark variants 1:1).

## Deps that must exist first (reference, do not block)
- `app/[locale]/admin/layout.tsx` + `isAdminEmail` gate — present (inherited).
- `createAdminClient()` (`@/supabase/server`), `@/components/ui/card`, `cn`, `lucide-react` — present.
- `career_admin_search_workers` RPC (migration `076` §1) + the `career_pii_key` vault secret — verify
  availability on the target DB (**R15** — no prod apply without explicit go; `inforonavisa-max` ≠
  `glatko-prod` `cjqappdfyxgytdyeytwv`).
- **Spec 25 (worker curation detail, `/admin/career/workers/[id]`)** — the row link target; NOT yet
  written. This list ships pointing at it; until 25 lands the link 404s (acceptable — coordinate order).
