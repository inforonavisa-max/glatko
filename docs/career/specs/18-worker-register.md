# Spec 18 — Worker Registration Form (`WorkerRegisterForm`, client)

> Read `docs/career/career-vertical-plan-v1.md` (PART 2 §7 worker registration, PART 4
> anonymization, PART 6 §C/§D ILO Employer-Pays + PDPL/GDPR) + `docs/career/BUILD-RULES.md`
> (esp. **R7**, R11, R14) first. **No app/lib/SQL code is written here — this is the build contract.**
> This is the worker-side intake: the entry point into the multi-step profile builder. It is the
> structural twin of Spec 11 (employer register) but on the side the platform NEVER charges.

## Mirror targets (read these first)
- **Component (verbatim structure):** `components/glatko-saglik/HealthWaitlistForm.tsx` —
  `"use client"`, `useTranslations`, a single `status` state machine, manual validation, `fetch`
  POST, `role="alert"` errors, success-replaces-form, privacy disclosure footer.
- **API contract to mirror:** `app/api/health/waitlist/route.ts` (JSON parse → `parsePayload` →
  400 bad payload / 500 server error / `{ ok: true }` success, write via a `SECURITY DEFINER` RPC on
  the service-role client because the `career` schema is NOT exposed to PostgREST). The career route
  `/api/career/worker/register` is specced separately; this doc covers ONLY the client form and the
  request/response shape it depends on.
- **New file:** `components/glatko-kariyer/WorkerRegisterForm.tsx`. Rendered by
  `app/[locale]/career/worker/register/page.tsx` (page spec separate; the page is `force-dynamic`
  per R11 — its wrapper reads `auth.getUser()` to redirect an already-authed worker straight to
  `/career/worker/profile`).

## Difference from the mirror (read carefully)
The health form reads values via `FormData` on submit. This SURFACE uses **plain `useState` +
manual validation** — hold each field in `useState` (controlled inputs), validate in one
`validate()` helper on submit, POST a JSON object. Everything else (status machine, error
rendering, success state, disabled-while-submitting) stays identical to the health form.

## Fields (UX-level — exact column names live in the API spec)
Step 1 of the profile builder (account creation) only — keep it short; deep profile data
(skills, history, docs) lives in later steps (PART 2 §7 steps 2–6), NOT here.
Two labeled groups in one `<form>`, mirroring health's `grid gap-4 sm:grid-cols-2`:
- **Account** — work email (required, valid email, ≤160), password (required, min 8) OR
  passwordless per the global auth pattern the page wrapper uses (mirror however the health auth
  flow creates the `auth` user; if OTP-based, this collapses to email/phone only — follow the page
  spec). Phone (required, `+382 6x xxx xxx` placeholder, E.164-ish, separators stripped client-side).
- **Basics (minimal)** — primary role/trade (required `<select>`; options from seeded
  `career.sectors` / trade list, mirror health's `SPECIALTY_KEYS` constant pattern), source region
  (required `<select>`: Far East / Middle East / Africa / Europe — **region, never exact country**;
  exact country is collected later in the gated profile, PART 4), preferred language (optional;
  defaults to active `locale`).
- **Consent (REQUIRED, load-bearing — NOT optional)** — a required checkbox: explicit GDPR/PDPA
  processing consent for special-category data (passport/biometric/cert handling, Art. 9), with a
  link to the localized privacy policy (next-intl resolves the slug — mirror health footer
  `<Link href="/privacy">`). Submit is BLOCKED until checked. Copy must state the worker grants
  consent for anonymized showcase + RoNa Legal verification, and may revoke per-document later
  (`/career/worker/documents`). This consent is the lawful basis — see Edge cases.
- `locale` is sent in the payload (same as health).

## Layout
- Card/section wrapper consistent with career marketing surfaces (Spec 01/06 use
  `bg-brandCareer-50/40` tints); form = `space-y-4`, `noValidate`, two-column responsive grid for
  paired fields, full-width rows for email/consent.
- Input class = health `inputClass` string with the focus ring swapped teal/sky → amber:
  `focus:border-brandCareer focus:ring-brandCareer/20` (keep neutral gray borders + dark-mode
  variants verbatim).
- Field labels `text-xs font-medium text-gray-700`; required fields get a trailing `*`.
- **"Free for you" reassurance strip** above or beside the CTA (PART 2 worker nav messaging):
  "Always free for you — the employer pays" — small `text-brandCareer-700` line or chip. This is
  the worker-side trust signal that has no employer-side counterpart.

## Every UI state (status machine: `idle | submitting | success | error | invalid`)
- **idle** — form, all fields editable, amber submit CTA enabled, consent unchecked.
- **submitting / loading** — CTA shows `Loader2` spinner + submitting label, `disabled`,
  `opacity-70 cursor-not-allowed`; inputs stay mounted (short form, no skeleton).
- **invalid** (client validation failed OR API 400) — red `role="alert"` line
  (`text-sm text-red-600`) with the validation message; do NOT clear fields. Set synchronously
  before any fetch when `validate()` fails (mirror health's early `return`).
- **error** (network throw OR API 500) — same `role="alert"` line, generic error message; fields
  retained for retry.
- **success** (API `{ ok: true }`) — replace the form with the amber success panel
  (`bg-brandCareer-50 text-brandCareer-700`, `CheckCircle2` icon, mirror health success block):
  "Account created — let's build your profile." with a primary **amber CTA → `/career/worker/profile`**
  (continue to the profile builder, step 2). This is the one place success ROUTES ONWARD rather than
  just confirming (unlike the employer form, which dead-ends on a confirmation).
- **locked / gated** — no in-form locked state: the page is gated behind `CAREER_VERTICAL_ENABLED`
  (default OFF → middleware quarantine → real HTTP 404; BUILD-RULES R8 #8). The worker has no tier
  gate and no payment gate — there is NOTHING the worker pays for, ever (R7).

## Amber accent usage (`brandCareer`, swaps health's sky/teal)
- The submit CTA is the conversion event → **solid amber-600** (`bg-brandCareer`, white text), NOT
  the health `from-teal-500 to-teal-600` gradient (the SURFACE calls this the "teal CTA" → it maps
  to amber here; teal/sky → amber everywhere in this vertical per plan + BUILD-RULES). Hover deepens
  toward `brandCareer-700`. This is the ONE solid amber button on the surface.
- Focus rings, the success panel, `CheckCircle2`, the "free for you" line, and any helper-icon
  accents use `brandCareer`. **Accent TEXT uses `brandCareer-700`** (DEFAULT amber-600 is below the
  4.5:1 AA text floor — mirror the `brandHealth` token comment in `tailwind.config.ts`); DEFAULT is
  fine for icons/large UI only.
- Errors stay red (`text-red-600`), spinner inherits CTA white. Never amber-tint danger states.

## Data the form needs / sends (UX-level — not exact field names)
- **Reads:** seeded role/trade list for the role `<select>` (9-locale labels from `career.sectors`);
  the active `locale`. No auth read in the component — the page wrapper handles the already-authed
  redirect.
- **Sends (POST `/api/career/worker/register`, JSON):** email, password/credential, phone
  (separators stripped client-side like health), role/trade, source region, consent flag,
  preferred language, `locale`. The route writes via a `SECURITY DEFINER` RPC over the service-role
  client (career schema not on PostgREST — mirror the health waitlist write path), creates/links the
  `auth` user + a `career_worker_profiles` row (public-safe columns only at this step;
  `is_showcased=false`, `verification_status='unverified'`) and writes a `career_consents` audit row
  (PART 6 §D, the lawful-basis record). Idempotent on duplicate email (upsert, mirror health's
  same-phone idempotency) and **must NOT leak "account exists"** → return `{ ok: true }` either way
  (anti-enumeration).
- **R7 — Worker is NEVER charged.** No fee/price/payment field, no tier upsell, no payment copy may
  appear anywhere on this surface or its API. ILO Employer-Pays + the MNE €500–20 000 jobseeker-fee
  fine make this structural, not cosmetic. All payment UI is employer-only and downstream.

## Edge cases
- Missing required field / invalid email / bad phone → `invalid` set client-side BEFORE fetch; no
  request sent (mirror health `if (!payload...) { setStatus("invalid"); return; }`).
- **Consent unchecked → `invalid`** with a consent-specific message; submit blocked. This is harder
  than the employer form: worker data is Art. 9 special-category, so consent is the lawful basis —
  there is no fallback legitimate-interest path. Never submit without it.
- API 400 (server re-validation, defense-in-depth) → `invalid`; API 500 / network throw → `error`.
  Status mapping mirrors health exactly (`res.status === 400 ? "invalid" : "error"`).
- Duplicate email → API `{ ok: true }` (idempotent, anti-enumeration); show the same success panel
  with the continue-to-profile CTA (an existing worker re-landing is routed forward harmlessly).
- Double-submit guard: CTA `disabled` while `submitting` (status machine blocks re-entry).
- RTL (`ar`): labels, the `*` marker, success icon, consent link, and the "free for you" line must
  mirror correctly — `ar` is a launch-priority worker-side locale (PART 2). Reuse the dark-mode +
  RTL-safe utility classes from the health form.
- i18n: ALL copy under the `careerVertical.*` dictionary subtree (deep 9-locale parity — BUILD-RULES
  R8 #7; CI `i18n-check.sh` only checks top-level keys). No TR-hardcoded strings on this PUBLIC
  worker-facing form (admin-only forms are the i18n carve-out, not this one).
- Rate limiting: `/api/career/worker/register` is under `/api/`, so `lib/rateLimit.ts`'s
  `public-form` cap DOES apply (unlike the pool browse page, R12) — note it in the API spec.
