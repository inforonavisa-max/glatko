# Spec 12 — Employer Dashboard (root)

> Docs-only build spec. Downstream agent writes the code (NO app/lib/SQL here).
> Read alongside `career-vertical-plan-v1.md` (PART 2 §6 "Employer dashboard") and
> `BUILD-RULES.md` (R1, R5, R7, R8 #2/#9, R11, R14). This is the employer's authenticated
> home: a list of requisitions with lifecycle status pills, links into sub-pages, an unlock-center
> summary, and a placement + guarantee tracker. Gated + `noindex`.

## What this mirrors (read these first)
- **Page route** — mirror `app/[locale]/health/(gated)/page.tsx` for the server-component shape
  (locale guard → `setRequestLocale` → `getTranslations` → call read-RPC wrapper → render header +
  sections + designed empty state) and `.../randevu/[holdId]/page.tsx` for the **auth/cookie →
  graceful-screen** pattern (read session cookie, if missing/invalid render a designed sign-in
  prompt, never crash). This page is `force-dynamic` (reads `auth.getUser()`; **R11**), NOT
  `revalidate` like the health home.
- **Loading / error** — reuse the shared `(gated)/loading.tsx` skeleton + `(gated)/error.tsx`
  boundary defined in spec 01. Do not duplicate.
- **Status pills** — new tiny presentational helper `components/glatko-kariyer/RequisitionStatusPill.tsx`
  (sync server component, label + color passed in). No health analog ships a pill set; model the
  visual on health's small badge chips (rounded-full, tinted bg + text).
- **Token** — accent is `brandCareer` (amber-600 `#D97706`) everywhere health uses `brandHealth`
  (sky/teal). Page tint `bg-brandCareer-50/40 dark:bg-transparent`. CTA gradient
  `from-amber-500 to-amber-600 shadow-amber-500/25`. Import segment/routes/token from
  `lib/kariyer/config.ts`; never hardcode `/career/...` or hex.

## Route & rendering
- Path: `app/[locale]/career/(gated)/employer/dashboard/page.tsx` (route key
  `CAREER_ROUTES.employerDashboard`, localized via `i18n/routing.ts`).
- `export const dynamic = "force-dynamic"` (**R5/R11**: per-employer auth state; never ISR-cache one
  employer's dashboard and serve it to another). `noindex` inherited from the gated group metadata —
  keep it. No `generateStaticParams`.
- **Auth:** server reads `auth.getUser()` (server Supabase client). No user → render a designed
  "sign in as employer" screen linking `CAREER_ROUTES.login` (mirror the randevu "expired/not-found"
  graceful block; do NOT throw). Authed-but-no-employer-account → "complete employer registration"
  screen linking `CAREER_ROUTES.employerRegister`.
- **Data:** via a `lib/kariyer/queries.ts` wrapper (mirror `lib/saglik/queries.ts`) that calls the
  read-RPCs through `createAdminClient()` (service_role) and **passes the user id explicitly** as
  `p_employer_user_id` (**R1**: never `auth.uid()` inside the RPC; identity is derived in the route
  and passed down). RPCs:
  - `career_employer_requisitions(p_employer_user_id)` — requisitions list (id, sector, rolesJsonb,
    requirements, termsJsonb, servicePath, status, createdAt). Cross-employer rows return empty
    (**R8 #2**).
  - `career_employer_unlocks(p_employer_user_id)` — reveal/unlock rows (id, requisitionId,
    workerCode, interestAt, ownerApproved, paymentStatus, unlockedAt) → drives the unlock-center
    summary tiles.
  - Placement + guarantee data: the placement tracker reads placement/guarantee state. **GAP:** there
    is no `career_employer_placements` read-RPC in `074` yet — placement/guarantee status is only
    derivable today from the requisition `status` (`placed` / `in_guarantee`) and the unlocks list.
    Either (a) add a follow-up read-RPC returning `placedAt` + `guaranteeUntil` per placement, or
    (b) ship the guarantee countdown derived from requisition status only, with the explicit
    `guaranteeUntil` date shown "—" until the RPC exists. Pick one and note it; coordinate with the
    migration owner (**R15**: no prod apply without explicit go).

## Status model (the pills — the SURFACE's spine)
The lifecycle, in order, maps to `career.requisitions.status` + derived unlock/placement state:
`Submitted → Under curation → Shortlist ready → Interest expressed → Approved / Unlocked → Placed →
In guarantee`. Render each as a tinted pill via `RequisitionStatusPill`:
- Submitted — neutral gray.
- Under curation — amber-tinted (`brandCareer-50` bg / `brandCareer-700` text) = "owner is working it".
- Shortlist ready — amber **solid-ish** (stronger amber) = action available (view shortlist).
- Interest expressed — blue/indigo-tinted (employer acted, awaiting owner).
- Approved / Unlocked — green-tinted (gate cleared; dossier released).
- Placed — green solid.
- In guarantee — amber-tinted with a small countdown affixed.
Every label comes from `careerVertical.employer.dashboard.status.*` (9 locales, **R8 #7** nested
parity). Map any unknown/future status string to the neutral pill (never crash on an unmapped value).
Amber is wayfinding only — do not color non-amber states amber.

## Layout (top → bottom, single column, `max-w-5xl px-4 pb-24 pt-28`)
1. **Header** — `<VerticalBrand vertical="career" size="sm" />` + serif `h1`
   (`careerVertical.employer.dashboard.title`) + a primary amber-gradient CTA
   `careerVertical.employer.dashboard.newRequisitionCta` → requisition-create route (see deps). On
   the right, a quick "Browse the talent pool" ghost link → `CAREER_ROUTES.pool`.
2. **Summary tiles row** (`grid sm:grid-cols-2 lg:grid-cols-4`, amber-tinted icon chips): Active
   requisitions count · Shortlists ready (count needing review) · Pending unlocks (interest/approved
   awaiting payment) · Active placements (in guarantee). Each tile is a deep-link into the relevant
   section/sub-page. Counts derived from the two RPC payloads.
3. **Requisitions list** — the primary block. Each row: requisition title (sector + summarized roles
   from `rolesJsonb`, e.g. "Construction · 12 workers, 3 roles"), created date, service-path label
   (commission vs full-service), and the **status pill**. Row links to the requisition detail
   sub-page (`.../requisitions/[id]`). Rows ordered newest-first (the RPC already orders by
   `created_at desc`).
4. **Unlock center summary** — a compact panel summarizing reveal-unlock state from
   `career_employer_unlocks`: small grouped counts (Interest expressed / Approved – fee due /
   Unlocked) + the 1–3 most recent unlock rows (workerCode + state badge), and a "View unlock
   center" link → `.../unlocks` sub-page (full reveal/payment list). **R7:** any fee/payment wording
   here is employer-direction ONLY; never attach a fee to the worker side. Worker stays anonymized
   (workerCode only) until the dossier is unlocked — never render name/contact here (**R8 #9**).
5. **Placement + guarantee tracker** — placements in their 90-day guarantee window: per placement a
   workerCode (still code, not name, unless that requisition is unlocked), placed date, and a
   **guarantee countdown** ("47 of 90 days remaining") with a thin amber progress bar. Each offers a
   "Request replacement" action (links/POSTs to the replacement flow; if that endpoint isn't built
   yet, render the button disabled-with-tooltip rather than dead). Expired guarantees show
   "Guarantee ended" neutral, no countdown.

## UI states (every one)
- **Loading** — shared `(gated)/loading.tsx` neutral skeleton (rows + tiles as gray pulse blocks, no
  amber) during the server fetch / navigation.
- **Empty** — first-time employer, zero requisitions: a designed empty state (dashed-border block,
  amber-tinted icon, NOT a fake row): "You have no requisitions yet" + primary
  `newRequisitionCta`. Unlock-center + placement sections collapse to a one-line "nothing here yet"
  muted note (not a broken panel). Distinguish from a fetch returning `[]` for a real employer
  (same empty copy) vs an error (below).
- **Error** — read-RPC failure bubbles to the shared `(gated)/error.tsx` boundary (graceful screen +
  amber retry). Never a crash, blank page, or fake-empty masquerading as "no requisitions".
- **Success** — header + tiles + requisitions list + unlock summary + placement tracker, all
  populated.
- **Locked** — this dashboard never shows unlocked worker identity inline; the gate lives in the
  reveal-unlock flow. Any not-yet-unlocked worker is shown by `workerCode` only. The "locked" state
  visible here is the unlock-center rows reading "Approved — fee due" (gate not yet cleared:
  `ownerApproved=true && paymentStatus!='paid'`) → the dossier stays locked until payment. Do not
  surface a signed-URL or any gated doc here.
- **Unauthenticated / no-account** — the two designed graceful screens described under Auth above
  (sign-in prompt; complete-registration prompt). Real prod behavior, not a 500.

## Data it needs (UX level — exact field names live in the RPCs)
- **Per requisition:** an id/key to link to detail; sector; a roles summary (headcount + role count);
  created date; service-path label; lifecycle status (→ pill).
- **Unlock center:** per reveal row — a worker code (NOT name), the interest/approval/payment state,
  and unlocked-or-not, enough to render the grouped counts + recent rows + deep link.
- **Placement tracker:** per placement — worker code, placed date, guarantee end (or days remaining),
  and whether a replacement was already requested (to disable the action).
- **Page-level:** the authed employer's identity (derived in the route, passed to RPCs as
  `p_employer_user_id`); locale for all labels (`careerVertical.employer.dashboard.*` subtree, 9
  locales, RTL `ar`); derived counts for the summary tiles (compute in the route/wrapper from the two
  payloads — do not add a third RPC just for counts unless the placement RPC lands).
- **Never** any name / phone / email / passport / exact location in markup, hidden fields, or JSON
  props (**R8 #9**) — the read-RPCs return only anonymized + owner-scoped fields; never fetch a base
  table or join private rows here.

## Edge cases
- **Cross-employer isolation (R8 #2):** the RPCs re-verify ownership via `career.owns_employer(...)`;
  passing another employer's data returns empty. The page must not attempt any client-side employer
  scoping — trust the server-scoped RPC, and never accept an `employerId` from the URL/searchParams.
- **Status drift / unknown value:** map unrecognized `status` to the neutral pill; never throw on an
  unmapped enum (forward-compat with future statuses).
- **Guarantee countdown timezone/hydration:** compute remaining days server-side against
  `Europe/Podgorica` (the booking convention) and pass a plain number/label to the client — do NOT
  init a countdown from `Date.now()` at module/render top (health's hydration lesson: init null +
  client effect, or render a static "X days remaining" string server-side). Negative/zero remaining →
  "Guarantee ended", never a negative number.
- **Empty roles/terms JSON:** a requisition with malformed/empty `rolesJsonb` must still render a row
  (fall back to sector + "—"), not blow up the list.
- **Flag OFF:** the gated group middleware quarantines the route to a real HTTP 404 (**R8 #8**); this
  page assumes the flag gate already ran — do not re-implement the flag check.
- **RTL (`ar`):** tiles grid, status pills, progress bars, and the countdown text must mirror
  (logical-direction classes; progress bar fills from the inline-start edge). No hardcoded left/right.
- **Dark mode:** every amber surface needs a `dark:` parity variant
  (`dark:bg-brandCareer/15 dark:text-brandCareer`), matching health's dark variants 1:1.

## Deps that must exist first (reference, do not block)
- `lib/kariyer/config.ts` — `employerDashboard` route key present; **NOT yet present:**
  `requisitions`, `requisitionsNew`, `requisitionDetail`, `unlocks` sub-route keys → add to
  `CAREER_ROUTES` + register in `i18n/routing.ts` pathnames (all 9 locales) per **R14** ordering
  (routing.ts → slugs.ts → verticals/config.ts).
- `lib/kariyer/flags.ts` (`isCareerVerticalEnabled`), `brandCareer` token, `VerticalBrand` career
  support — present.
- Read-RPCs `career_employer_requisitions` / `career_employer_unlocks` (migration `074`) — present;
  placement read-RPC — **not present** (see GAP above).
- `lib/kariyer/queries.ts` server wrapper (service_role + explicit user-id arg) — must land with this
  page (mirror `lib/saglik/queries.ts`).
- `careerVertical.employer.dashboard.*` dictionary keys (status labels, tiles, empty states, CTAs) in
  all 9 locales (RTL `ar`) — **not yet present**; required before this page type-checks/renders.
- Shared `(gated)/layout.tsx` + `loading.tsx` + `error.tsx` (spec 01) — land with/before this page.
