# Spec 14 — RequisitionWizard (`RequisitionWizard`, client, multi-step)

> Docs-only build contract. The downstream agent writes the code. Read with
> `docs/career/career-vertical-plan-v1.md` (PART 2 §5 "Create bulk requisition", PART 3
> `career_requisitions` shape, PART 6 §A MNE disclosure) and `docs/career/BUILD-RULES.md`
> (esp. R1, R7, R11, R14, R8 #7/#8). This is the demand-side conversion surface: an employer
> turns a hiring need into a `career_requisitions` row (`status='submitted'`). Gated + `noindex`.

## Mirror target (structure, verbatim)
- **Component:** `components/glatko/request-service/RequestServiceWizard.tsx` — copy its skeleton
  exactly: `"use client"` + `Suspense` outer wrapper, `useState` step index + `direction` (1/-1),
  `framer-motion` `AnimatePresence mode="wait" initial={false}` with the `x: direction*40 → 0 →
  direction*-40` slide, the `STEPS[]` icon/key array driving the step-indicator rail, `goNext`/
  `goBack`, per-step `canAdvance()` gate, `useTransition` submit, `isNarrow` matchMedia for reduced
  motion duration. Mirror its 5-component split: parent wizard + one `Step*` component per step +
  a `RequisitionConfirmation` success screen (analog of `RequestConfirmation`).
- **New files:** `components/glatko-kariyer/requisition/RequisitionWizard.tsx` (+ `StepRoles`,
  `StepRequirements`, `StepTerms`, `StepServicePath`, `StepReview`, `RequisitionConfirmation`).
- **Rendered by:** `app/[locale]/career/(gated)/employer/dashboard/requisitions/new/page.tsx`
  (route under `CAREER_ROUTES.employerDashboard`). The page wrapper reads `auth.getUser()` →
  `force-dynamic` (R11), redirects non-employers to `/career/login`, and passes the employer's id +
  the seeded sector list down as props (identity resolved server-side, never in client — R1).

## Difference from the mirror (read carefully)
- **5 steps, not 4.** STEPS = `[Briefcase "roles", ClipboardCheck "requirements", FileText "terms",
  Coins "servicePath", CheckCircle2 "review"]` (lucide icons). The review step is its own step here
  (the health wizard folds review into step 4); the final motion.button submits from inside StepReview.
- **No anonymous flow, no localStorage-only fallback** — the employer is always authed (gated route).
  Draft persistence is STILL required (long form) but keyed per-employer; see Draft persistence below.
- **POSTs JSON to `/api/career/requisitions`** (not a server action). Mirror health's `holds`/
  `interest` route idiom: flag-guard → `auth.getUser()` (401 if none) → validate body →
  service-role RPC → map business codes → JSON. The id is in the cookie session, never the body (R1).

## Layout
- Same chrome as the mirror: `mx-auto max-w-3xl`, centered serif `h1` + amber accent underline
  (`from-brandCareer to-transparent`, swaps the health `from-teal-500`), the horizontal step-indicator
  rail (circles + connectors), and the glassmorphism card (`rounded-3xl border bg-white/80
  backdrop-blur-sm` + dark variants) holding the animated step body and the back/next nav row.
- Each `Step*` renders inside the `AnimatePresence` `motion.div` keyed by `step`. Back button hidden
  on step 0; Next is amber until the last step; the last step's primary button is Submit.

## Steps & the data each collects (UX-level — exact column names live in the API/RPC spec)
1. **StepRoles** — sector `<select>` (required; options from the seeded `career.sectors` list,
   Construction + Hospitality at launch, 9-locale labels — same source as Spec 11) + a repeatable
   role-row builder: each row = role/trade (required, from the sector's trade list) + headcount
   (required integer ≥ 1). "Add role" appends a row; each row has a remove control; ≥ 1 complete row
   required to advance. Collected as the `roles` map (role→count). `canAdvance`: sector set AND ≥ 1
   valid role row.
2. **StepRequirements** — minimum experience band (`<select>`), required certifications (multi-select
   /chips), required languages (multi-select), minimum skill tier (`<select>`). All OPTIONAL (an
   employer may leave requirements open) → `canAdvance` always true. Drives owner-side curation.
3. **StepTerms** — **the terms shown to workers; mirror MNE Law on Employment Mediation Arts. 30–34
   disclosure fields** (plan PART 6 §A): wage range min/max + currency (EUR default), working hours
   (per week or shift pattern), accommodation/board provided (yes/no + note), contract duration,
   start date. Wage range is REQUIRED and load-bearing (the worker-facing offer must state pay);
   show a short legal note "These terms are disclosed to candidates before placement (MNE mediation
   law)." `canAdvance`: wage min/max present and min ≤ max, start date valid.
4. **StepServicePath** — two selectable cards: **Commission-only** (RoNa curates + brokers; fee on
   placement) vs **Full-service** (legal/permit handling, escrow, guarantee bundled). Radio-style,
   exactly one selected, default none → `canAdvance` requires a choice. Maps to `service_path`
   (`commission` | `full_service`). **R7: this is the EMPLOYER's service choice — it is the ONLY
   money-adjacent UI in this wizard and it is employer-side; no worker fee/price field exists anywhere.**
5. **StepReview** — read-only summary of steps 1–4 (roles+headcount, requirements, terms, chosen path)
   with an "Edit" affordance per section that jumps back to that step (`setStep`). Holds the Submit
   button. Optional free-text note to RoNa. On submit → POST `/api/career/requisitions`.

## Every UI state (the load-bearing list)
- **loading** — outer `Suspense` fallback = centered `Loader2` in `text-brandCareer` (mirror the
  mirror's `RequestServiceWizard` Suspense fallback, amber-swapped). The sector list is passed as a
  prop from the server page, so there is no per-step data fetch / skeleton inside the wizard.
- **idle / in-progress** — the step body; Next is a solid-amber CTA, enabled only when `canAdvance()`
  for the current step (disabled = `opacity-50 cursor-not-allowed`). Back visible from step 1+.
- **empty** — StepRoles with zero role rows shows one empty starter row + an "Add role" prompt; Next
  stays disabled until one valid row exists. Empty requirements (step 2) is a valid, advanceable state.
- **submitting** (`isPending` from `useTransition`) — Submit shows `Loader2` + submitting label,
  `disabled`; the whole wizard is non-interactive (no double-submit — the transition guards re-entry).
- **error** (validation OR API non-2xx OR network throw) — a red `role="alert"` line at the top of the
  card (`text-sm text-red-600`, mirror the mirror's `error` motion.div); fields/steps retained for
  retry. Client-side step validation surfaces inline before any POST (mirror `goNext`'s validate gate).
  Map API business codes to messages (below). Errors stay red — never amber-tint danger.
- **success** (API `{ ok: true, requisitionId }`) — replace the wizard with `RequisitionConfirmation`
  (analog of `RequestConfirmation`): amber success panel (`bg-brandCareer-50 text-brandCareer-700`,
  `CheckCircle2`), "Requirement submitted — RoNa Legal will curate a shortlist," a summary recap, and
  two actions: "View requisition" (→ `.../requisitions/[id]`) + "Create another" (resets the wizard +
  clears the draft, mirror `resetWizard`). Fire a `trackEventWithMeta("career_requisition_submitted",
  { requisition_id })` on server-confirmed success, before the UI flips (mirror the mirror's
  `customer_job_posted` event).
- **locked / not-an-employer** — there is NO in-component locked state: the page is gated behind
  `CAREER_VERTICAL_ENABLED` (OFF → middleware quarantine → real HTTP 404, R8 #8) and the page wrapper
  redirects non-employers to `/career/login`. The wizard only ever renders for a logged-in employer.

## Amber accent usage (`brandCareer`, swaps health's sky/teal — ramp `50 / DEFAULT / 700` only)
- Step-indicator active/past circles + connectors, the title underline, the Next CTA, and the Submit
  CTA use `brandCareer` (the mirror's `from-teal-500 to-teal-600` gradient → solid amber-600
  `bg-brandCareer` deepening to `brandCareer-700` on hover; or an amber gradient if matching the
  mirror's gradient geometry — keep it the ONE prominent CTA color).
- Selected service-path card (step 4) gets an `border-brandCareer ring-brandCareer/20 bg-brandCareer-50/40`
  selected treatment; focus rings on inputs/selects = `focus:border-brandCareer focus:ring-brandCareer/20`.
- Accent **text** (labels, links, the success-panel copy) uses `brandCareer-700` — DEFAULT (#D97706)
  is below the 4.5:1 AA text floor; DEFAULT is for icons/large UI only (mirror the tailwind token
  comment + Spec 11 §"Amber accent"). Spinner inherits CTA white; red stays red.

## Draft persistence (long-form requirement)
- Mirror the mirror's `useFormPersistence` (`lib/hooks/useFormPersistence`) with a single
  `draftSnapshot` memo covering all step state + a `restoreDraft`. Enabled always (employer is authed),
  but **key the storage per-employer** (e.g. `career-requisition-v1:<employerId>`) so a shared browser
  doesn't cross-contaminate drafts. On restore, show the same dismissible "draft restored / start
  fresh" banner (amber-tinted, not teal). `clearDraft()` on successful submit and on `resetWizard`.

## Data the wizard needs / sends (UX-level — not exact field names)
- **Reads (props from the server page):** the employer's id (for the per-employer draft key + passed
  to the route via session, not body), and the seeded sector list with its per-sector trade options
  (9-locale labels). No client-side DB read inside the wizard.
- **Sends (POST `/api/career/requisitions`, JSON):** sector, roles map (role→headcount), requirements
  (experience band, certs[], languages[], min tier), terms (wage min/max + currency, hours,
  accommodation, duration, start date), service_path, optional note, `locale`. The employer id is
  derived server-side from the cookie session (R1) — NEVER in the body.
- **Route → RPC:** the route calls a `SECURITY DEFINER` RPC (migration `075`,
  `career_create_requisition` or equivalent) via `createAdminClient()` (career schema not exposed to
  PostgREST — mirror the health write path). The employer id is passed as an explicit
  `p_employer_user_id` arg and the RPC **re-verifies the caller owns the `career_employer_accounts`
  row** before inserting (R1; mirror R3's ownership re-check). Insert is `status='submitted'`.

## Edge cases
- **Step validation before advance** — `goNext` runs the current step's validator and refuses to
  advance on failure (mirror the mirror's `detailsValidateRef` gate); surface inline, not server-side.
- **Wage min > max** (step 3) → block advance with a field-level message; currency mismatch defaults to EUR.
- **Zero valid role rows / headcount < 1 or non-integer** (step 1) → Next disabled; sanitize headcount
  input to positive integers client-side.
- **Empty requirements** (step 2) is intentionally valid — an open requisition is allowed; don't block.
- **API 400** (server re-validation, defense-in-depth) → `error` line; **401** (session expired
  mid-form) → route to `/career/login` preserving the draft (it's persisted, so the employer returns
  to a restored wizard); **403** (`NOT_OWNED` — employer id doesn't own the account) → generic "not
  authorized" (this is the cross-employer denial, R8 #2); **503**/network → generic retry message.
- **Double-submit** — `useTransition` pending blocks the second click; the route/RPC should be safe to
  retry (no partial requisition).
- **Flag OFF** — the route returns real HTTP 404 (R8 #8) and the page is middleware-quarantined; the
  wizard never renders.
- **RTL (`ar`)** — step rail direction, the slide `direction` math, role-row add/remove controls, and
  the review-section "Edit" affordances must mirror correctly; reuse RTL-safe utilities.
- **i18n** — ALL copy (step labels, field labels, service-path card copy, the MNE terms legal note,
  success panel, errors) under the `careerVertical.*` dictionary subtree with deep 9-locale parity
  (R8 #7 — CI `i18n-check.sh` only checks top-level keys; nested drift ships silently). No
  TR-hardcoded strings on this employer-facing surface.
- **R7 reminder** — no worker-side fee/price/payment field appears anywhere in this wizard; the only
  money-adjacent control is the employer's commission-vs-full-service path choice (step 4).
