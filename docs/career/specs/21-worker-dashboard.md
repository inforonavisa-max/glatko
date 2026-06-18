# Spec 21 — Worker Dashboard / Status (`/career/worker/dashboard`) + `WorkerStatusBoard`

> Docs-only build contract. Downstream agent writes the code. Read with
> `docs/career/career-vertical-plan-v1.md` (PART 2 §"Page-by-page" item 9 + "Worker nav"; PART 4
> "symmetric gate" step 5) and `docs/career/BUILD-RULES.md` (R1, R5, R7, R8, R11, R14) FIRST. This is
> the worker's single status surface: it tells a logged-in worker where they are in the lifecycle —
> **showcased → interest expressed → pending RoNa → matched (legal processing)** — and reinforces that
> **RoNa Legal is the single point of contact**. SYMMETRIC GATE: this page NEVER shows employer
> identity/contact, just as the employer side (Spec 16) never shows the worker's pre-unlock identity.

## What this mirrors (read these first)
- **Server page to mirror:** `app/[locale]/health/(gated)/randevu/[holdId]/page.tsx` — a
  `force-dynamic`, `noindex`, session-reading gated page that reads a cookie session, resolves rows
  via a service-role data fn, renders a graceful "not found / no session" fallback, then a list of
  summary `<section>` cards. Mirror that shape exactly: read session → service-role read fn → designed
  empty/error screen, never crash.
- **New page path:** `app/[locale]/career/(gated)/worker/dashboard/page.tsx` (gated route group;
  internal/dashboard segments stay English-identity like health's `randevu`, per plan §IA — do NOT
  localize `worker/dashboard`). `noindex` inherited from the `(gated)` group + page metadata.
- **Client island to mirror:** none required for interactivity, but if a refresh/poll affordance is
  added, model the busy/error idiom on `components/glatko-saglik/BookingForm.tsx`. New island (if any):
  `components/glatko-kariyer/WorkerStatusBoard.tsx` (`"use client"`). Default: render server-side; the
  status list is read-only, so an island is optional (prefer a pure server render + `aria-live` region).
- **Data layer:** `lib/kariyer/queries.ts` (`server-only`, `createAdminClient()`, SECURITY DEFINER
  RPC) — add `careerWorkerStatus({ workerUserId, locale })` (R1: worker id is an explicit
  `p_worker_user_id` arg, re-verified inside the RPC; never `auth.uid()`).
- **Boundary files** (`(gated)/layout.tsx` gate, `loading.tsx`, `error.tsx`) are shared across
  `app/[locale]/career/(gated)/` and defined in Spec 01 — do NOT duplicate them here.
- **Token:** accent is `brandCareer` (amber-600 `#D97706`; ramp `50 / DEFAULT / 700` only — invent no
  shades) wherever health uses sky/`brandHealth`/teal.

## Rendering contract
- `export const dynamic = "force-dynamic";` (R5/R11 — reads `auth.getUser()` + per-worker status; never
  ISR-cache one worker's status and serve it to another). `runtime = "nodejs"`.
- `export const metadata = { robots: { index: false, follow: false } };` plus the `(gated)` group.
- Behind `CAREER_VERTICAL_ENABLED` (default OFF) → middleware quarantine + defensive
  `(gated)/layout.tsx` (`isCareerVerticalEnabled()` → `notFound()`). Flag off ⇒ real HTTP 404 (R8 #8).
- No session / no worker profile → redirect to `CAREER_ROUTES.login` (locale-aware `@/i18n/navigation`),
  same as health's session-gated pages. Never render status without a verified worker session.
- All copy from the `careerVertical.workerDashboard.*` dictionary subtree, 9 locales, RTL for `ar`
  (deep parity — R8 #7). `setRequestLocale(locale)` + `notFound()` on unknown locale.
- **Routing:** every internal link uses `Link` from `@/i18n/navigation` with route KEYS from
  `lib/kariyer/config.ts` (`CAREER_ROUTES.workerProfile`, `.workerDocuments`) — never hardcode slugs.

## Lifecycle state model (the load-bearing list)
The worker's overall status is the **furthest-advanced** state across their reveal/match records,
derived server-side. Five states, in flow order (PART 2 §9 + PART 4):

1. **showcased** ("You are showcased") — profile is `is_showcased=true`, no interest yet. Pill
   `brandCareer-50 / brandCareer-700` + `Eye`/`BadgeCheck` icon. Body: "Your anonymized profile is
   live in the talent pool. Employers can find you; your identity stays private until you and RoNa
   approve." Encouraging, steady-state.
2. **interest expressed** ("An employer expressed interest") — ≥1 `reveal_unlocks` row exists for this
   worker. Pill amber + `Sparkles`/`Handshake` icon. Body: "An employer is interested in your profile.
   RoNa Legal is reviewing the match — we'll contact you." **No employer name/contact** (symmetric
   gate). Count may be shown as an anonymized tally ("2 employers interested") but NEVER who.
3. **pending RoNa** ("Pending RoNa Legal approval") — interest is under RoNa review / awaiting the
   worker's own consent confirmation. Pill amber + `Clock`/`ShieldCheck`. Body: "RoNa Legal is
   verifying the match and your consent. No action needed unless we reach out." Resting/wait state.
4. **matched — legal processing** ("Matched — legal processing") — a placement/unlock advanced
   (`owner_approved=true` and the match is progressing toward placement). Pill GREEN/success (NOT
   amber — completion, not a call-to-action) + `BadgeCheck`. Body: "You've been matched. RoNa Legal is
   handling contracts, permits, and onboarding and is your single point of contact." Still no employer
   contact surfaced here — RoNa brokers all contact (PART 4 step 5).
5. **not showcased / incomplete** — profile exists but `is_showcased=false` (pending verification or
   incomplete). Pill neutral gray + `Lock`. Body: "Your profile isn't live yet. Complete it and get
   verified to appear in the pool." with a `brandCareer` link to `CAREER_ROUTES.workerProfile` /
   `.workerDocuments`. NOT an error.

State is server-authoritative; the page reads it fresh on every request (`force-dynamic`). The client
never fabricates a state transition.

## Layout (top → bottom)
Outer wrapper `bg-brandCareer-50/40 dark:bg-transparent`, inner `mx-auto max-w-3xl px-4 pt-28 pb-16`.
1. **Header**: serif `h1` (`font-serif text-3xl font-light tracking-tight`) =
   `careerVertical.workerDashboard.title` ("Your status") + short subhead
   (`careerVertical.workerDashboard.subtitle`). Optional `<VerticalBrand vertical="career" size="sm" />`
   above it (already amber-aware).
2. **Primary status banner** — ONE prominent card (rounded-2xl, `shadow-premium-sm`, white /
   `dark:bg-white/5`, border) showing the worker's furthest-advanced state: big state pill + icon +
   one-line plain-language body (states above). This is the page's signature element — the worker sees
   their stage at a glance. Wrap its status region in `aria-live="polite"`.
3. **"RoNa Legal is your single point of contact" reassurance band** — full-width amber-tinted callout
   (`bg-brandCareer-50 dark:bg-brandCareer/10`, `ShieldCheck`/`BadgeCheck` icon) directly under the
   banner. Copy (`careerVertical.workerDashboard.singleContact.*`): "RoNa Legal handles every employer
   on your behalf — you never chase anyone, and no employer ever contacts you directly." This is the
   symmetric-gate promise, visually weighted, on EVERY state.
4. **Profile-readiness strip** (optional, when status is `showcased`/`not-showcased`): a small
   readiness/completeness summary (meter or 2–3 pills: profile complete · docs verified · readiness
   score) + links to `CAREER_ROUTES.workerProfile` and `.workerDocuments` to improve it. Static text +
   server-provided readiness number; no employer data.
5. **Next-steps / what-happens-next list** — 2–3 short bullet lines tailored to the current state
   (e.g. showcased → "keep your docs current"; interest → "RoNa will reach out — watch your phone";
   matched → "RoNa is handling paperwork"). All `careerVertical.workerDashboard.nextSteps.*`.

## Every UI state (loading / empty / error / success / locked)
- **loading** — shared `(gated)/loading.tsx` neutral pulse skeleton (Suspense during navigation). This
  page does one read-RPC; the skeleton shows while it resolves. No accent noise.
- **empty** — worker has NO interest/match records yet but IS showcased → this is the **showcased**
  state (#1), NOT a blank/empty screen. A worker with a profile always has a rendered status banner.
  If the worker has a session but no career worker profile row at all → redirect to
  `CAREER_ROUTES.workerProfile` (start the builder), not a dead empty page.
- **error** — `careerWorkerStatus` THROWS on genuine infra failure → caught by `(gated)/error.tsx`
  designed error screen (mirror health: throw on RPC error; return a real status object for any
  legitimate state, never `null`-as-error). Never a blank page or fake 404.
- **success** — the full page: header → status banner (correct state) → single-contact band →
  readiness strip → next-steps. The "matched — legal processing" green banner is the terminal success.
- **locked** — this surface is itself behind the worker auth gate. It shows NO employer-side data and
  NO worker dossier-unlock affordance (those live on the employer's Spec 16). The SYMMETRIC GATE is the
  locked behavior: employer identity/contact is structurally absent from the payload (R8 — see Data).
  States #2/#3 are the "locked from the worker's view of the employer" resting states.

## R7 — worker is NEVER charged (audit every string)
- ZERO fee/price/payment/commission/invoice wording may appear on this surface. No "amount due", no
  "pay", no balance — none of it. The worker-side lifecycle has no money step at all.
- The `careerWorkerStatus` payload MUST carry no fee/amount/currency field (structural enforcement —
  no worker fee columns exist, plan PART 3 + R7). Audit every final string against R7.

## Amber accent usage (`brandCareer`, swaps health's teal/sky/`brandHealth`)
- Accent is **wayfinding + state signaling**: status pills for `showcased`/`interest`/`pending` use
  `brandCareer-50 / brandCareer-700`; icons (`Eye`, `Clock`, `ShieldCheck`, `Handshake`) use amber.
- The **matched — legal processing** completion pill is GREEN/success, not amber (completion ≠ CTA),
  exactly as Spec 16's `unlocked` pill is green. The **not-showcased** pill is neutral gray.
- The single-contact band + readiness links use `bg-brandCareer-50 text-brandCareer-700
  dark:bg-brandCareer/15 dark:text-brandCareer`. Any ghost/secondary link uses `brandCareer-700` text.
- Body/label text uses `brandCareer-700` (AA-safe); `DEFAULT` only for icons / large UI / pill & circle
  backgrounds — same rule as health's `brandHealth-700`. Stick to the `50 / DEFAULT / 700` ramp only.
- Full dark-mode parity on every amber surface (mirror the health page's dark variants 1:1).

## Data the page needs (UX-level — not exact field names)
From `careerWorkerStatus({ workerUserId, locale })` (service-role RPC; R1 — worker id is an explicit
`p_worker_user_id` arg derived from the cookie session and re-verified inside the RPC before returning
anything; mirror health's session-scoped read, NEVER `auth.uid()`):
- The worker's **overall lifecycle state** (one of the five above), derived server-side from
  `is_showcased` + the worker's `reveal_unlocks`/placement records (furthest-advanced wins).
- A **readiness/completeness summary** for the readiness strip (profile-complete, docs-verified,
  readiness score) — all the worker's own data.
- An **anonymized interest tally** for state #2 (e.g. how many employers expressed interest) — a COUNT
  only. **MUST NOT** include any employer identity, company name, contact, or which requisition (the
  symmetric gate, PART 4 step 5; R8 worker-self-isolation #3 — worker A's id never returns worker B's
  data, and no row exposes employer identity to the worker).
- NO fee/amount/payment field anywhere in the payload (R7).
- Worker-self isolation (R8 #3): the RPC returns only this worker's status; passing worker A's id never
  returns worker B's profile/records.

## Edge cases
- **Flag OFF** → real HTTP 404 (R8 #8); page never renders (whole vertical quarantined).
- **Anonymous / no session** → redirect to `CAREER_ROUTES.login`; no status read.
- **Session but no worker profile row** → redirect to `CAREER_ROUTES.workerProfile` (start builder),
  not an empty dashboard.
- **Multiple concurrent interests/matches** → show the furthest-advanced state in the banner; the
  anonymized tally may reflect the count, but never enumerate employers.
- **Worker de-showcased after a match** (consent revoke / verification lapse) → status falls back to
  `not-showcased` with the consent/verification explanation + builder links; never crash.
- **RTL (`ar`)** → header, status banner, single-contact band, readiness strip, next-steps list mirror
  correctly (logical-direction classes; no hardcoded left/right). `ar` is a primary worker-facing
  locale, so RTL is load-bearing.
- **Dark-mode parity** on every amber/green/gray surface, matching the health page 1:1.
- **i18n** — all visible strings under `careerVertical.workerDashboard.*` (deep 9-locale parity, R8 #7;
  CI `i18n-check.sh` only checks top-level keys — nested drift ships silently otherwise). Dates/numbers
  via `Intl` with the locale (mirror health's `intlLocale`).

## Deps that must exist first (reference, do not block)
- `lib/kariyer/config.ts` (`CAREER_ROUTES.workerDashboard`, `.workerProfile`, `.workerDocuments`,
  `.login`) — present.
- `lib/kariyer/flags.ts` (`isCareerVerticalEnabled`) — present.
- `brandCareer` tailwind token + `VerticalBrand` career support — present.
- Shared `(gated)/layout.tsx` + `loading.tsx` + `error.tsx` (Spec 01) — must land with/before this page.
- Needed but NOT yet present: `careerWorkerStatus` read-RPC + `lib/kariyer/queries.ts` wrapper
  (migrations `074`/`075` RPC family); `careerVertical.workerDashboard.*` dictionary keys in all 9
  locales (RTL `ar`), including `title`, `subtitle`, the five state bodies/pills, `singleContact.*`,
  `nextSteps.*`; `/career/worker/dashboard` route key registered in `i18n/routing.ts` pathnames
  (R14 ordering — internal segment stays English-identity, not localized).
