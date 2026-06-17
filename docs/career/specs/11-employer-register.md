# Spec 11 — Employer Registration Form (`EmployerRegisterForm`, client)

> Read `docs/career/career-vertical-plan-v1.md` (PART 2 §6, PART 5 employer tiers) +
> `docs/career/BUILD-RULES.md` (esp. R7, R11, R14) first. **No app/lib/SQL code is written here —
> this is the build contract.** This surface is the employer-side counterpart to the Health doctor
> waitlist intake.

## Mirror target
- **Component to mirror (verbatim structure):** `components/glatko-saglik/HealthWaitlistForm.tsx`
  — `"use client"`, `useTranslations`, a single `status` state machine, manual validation, `fetch`
  POST, `role="alert"` errors, success-replaces-form pattern, privacy disclosure footer.
- **API contract to mirror:** `app/api/health/waitlist/route.ts` (JSON parse → `parsePayload` →
  400 on bad payload / 500 on server error / `{ ok: true }` on success). The career API route
  (`/api/career/employer/register`) is specced separately; this doc covers ONLY the client form and
  the request/response shape it depends on.
- **New file:** `components/glatko-kariyer/EmployerRegisterForm.tsx`. Rendered by the page at
  `app/[locale]/career/employer/register/page.tsx` (Spec covering the page is separate; the page is
  `force-dynamic` per R11 because the wrapper reads `auth.getUser()` to redirect already-authed
  employers to the dashboard).

## Difference from the mirror (read carefully)
The health form reads values via `FormData` on submit. This SURFACE is specified as **plain
`useState` + manual validation** — hold each field in `useState` (controlled inputs), validate in a
single `validate()` helper on submit, and POST a JSON object. Keep everything else (status machine,
error rendering, success state, disabled-while-submitting) identical to the health form.

## Fields (UX-level — exact column names live in the API spec)
Two labeled groups inside the same `<form>`, mirroring the health `grid gap-4 sm:grid-cols-2`:
- **Company** — company name (required, 2–160), sector of interest (required `<select>`; options
  sourced from the seeded `career.sectors` list — Construction + Hospitality at launch, mirror
  health's `SPECIALTY_KEYS` constant pattern), expected hiring volume (optional select: 1–5 / 6–20 /
  20+), city/country of operation (required, 2–80).
- **Contact** — contact full name (required, 2–120), work email (required, valid email, ≤160),
  phone (required, `+382 6x xxx xxx` placeholder, E.164-ish), preferred contact language (optional;
  defaults to the active `locale`).
- **Consent** — a required checkbox: GDPR/PDPA processing consent with a link to the localized
  privacy policy (next-intl resolves the slug, mirror the health footer `<Link href="/privacy">`).
  Submit is blocked until checked (this is a B2B contact, not worker PII, but consent is still
  load-bearing — see PART 6 §D).
- `locale` is sent in the payload (same as health).

## Layout
- Card/section wrapper consistent with other career marketing surfaces (Spec 01/06 use
  `bg-brandCareer-50/40` tints); the form itself = `space-y-4`, `noValidate`, the two-column
  responsive grid for paired fields, full-width rows for email/consent.
- Input class = the health `inputClass` string with the focus ring swapped sky/teal → amber:
  `focus:border-brandCareer focus:ring-brandCareer/20` (keep neutral gray borders + dark-mode
  variants verbatim).
- Field labels: `text-xs font-medium text-gray-700`; required fields get a trailing `*`.

## Every UI state (status machine: `idle | submitting | success | error | invalid`)
- **idle** — the form, all fields editable, amber submit CTA enabled.
- **loading / submitting** — CTA shows `Loader2` spinner + submitting label, `disabled`,
  `opacity-70 cursor-not-allowed`; inputs remain mounted (no full skeleton — this is a short form).
- **invalid** (client-side validation failed, OR API returned 400) — render the red
  `role="alert"` line (`text-sm text-red-600`) with the validation message; do NOT clear fields.
  Set this synchronously before any fetch when `validate()` fails (mirror health's early `return`).
- **error** (network throw OR API 500) — same `role="alert"` line with the generic error message;
  fields retained so the user can retry.
- **success** (API `{ ok: true }`) — replace the form with the amber success panel
  (`bg-brandCareer-50 text-brandCareer-700`, `CheckCircle2` icon, mirror health's success block):
  "Registration received — RoNa Legal will verify your account and grant pool access." Optionally a
  secondary link to `/career/employer` or `/career/login`. Call `form`-equivalent reset is moot
  since the form unmounts.
- **locked / gated** — there is no in-form locked state: the page itself is gated behind
  `CAREER_VERTICAL_ENABLED` (default OFF → middleware quarantine → real HTTP 404; BUILD-RULES R8 #8).
  Newly-registered employers land in the **Free** tier (browse anonymized pool only); the *product*
  gate (express-interest, unlock) lives downstream, not in this form.

## Amber accent usage (`brandCareer`, swaps health's sky/teal)
- The submit CTA is the conversion event → **solid amber-600** (`bg-brandCareer`, white text),
  NOT the health `from-teal-500 to-teal-600` gradient. This is the analog of the teal CTA the
  SURFACE references; per the plan + BUILD-RULES, teal/sky → amber everywhere in this vertical.
  Hover deepens toward `brandCareer-700`. This is the ONE solid amber button on the surface.
- Focus rings, the success panel, the `CheckCircle2` icon, and any helper-icon accents use
  `brandCareer` (DEFAULT for icons/large UI, `brandCareer-700` for any accent *text* — DEFAULT is
  below the 4.5:1 AA text floor, mirror the health token comment).
- Errors stay red (`text-red-600`), spinner inherits CTA white. Do not amber-tint danger states.

## Data the form needs / sends (UX-level — not exact field names)
- **Reads:** the seeded sector list for the sector `<select>` (Construction + Hospitality, 9-locale
  labels from `career.sectors`); the active `locale` (from `useTranslations`/prop). No auth read in
  the component itself — the page wrapper handles the already-authed redirect.
- **Sends (POST `/api/career/employer/register`, JSON):** company name, sector, hiring volume,
  city/country, contact name, work email, phone (separators stripped client-side like health),
  consent flag, contact language, `locale`. The route writes via a `SECURITY DEFINER` RPC over the
  service-role client (career schema not exposed to PostgREST — mirror the health waitlist write
  path) and links/creates the `auth` user + `career_employer_accounts` row (`verified=false`,
  `tier='free'`). Idempotent on duplicate email (upsert, mirror health's same-phone idempotency) —
  do NOT leak "account already exists" (return `{ ok: true }` either way to avoid account
  enumeration).
- **R7 — Worker is NEVER charged; this is the EMPLOYER side.** No fee/price/payment field appears
  here, but note: employers are the only side that ever sees payment UI, and that UI is downstream
  (unlock/commission), never on this registration form.

## Edge cases
- Missing required field / invalid email / bad phone → `invalid` state set client-side BEFORE
  fetch; no request is sent (mirror health's `if (!payload...) { setStatus("invalid"); return; }`).
- Consent checkbox unchecked → treat as `invalid` (blocks submit) with a consent-specific message.
- API 400 (server re-validation, defense-in-depth) → also `invalid`; API 500 / network throw →
  `error`. Status mapping mirrors health exactly (`res.status === 400 ? "invalid" : "error"`).
- Duplicate email → API returns `{ ok: true }` (idempotent, anti-enumeration); form shows the same
  success panel.
- Double-submit guard: CTA `disabled` while `submitting` (the status machine prevents re-entry).
- RTL (`ar`): labels, the `*` required marker, the success panel icon, and consent link must mirror
  correctly; reuse the dark-mode + RTL-safe utility classes from the health form.
- i18n: ALL copy under the `careerVertical.*` dictionary subtree (deep 9-locale parity — BUILD-RULES
  R8 #7; the CI `i18n-check.sh` only checks top-level keys). No TR-hardcoded strings on this
  PUBLIC-facing form (admin-only forms are the i18n carve-out, not this one).
- Rate limiting: `/api/career/employer/register` is under `/api/`, so `lib/rateLimit.ts`'s
  `public-form` cap DOES apply (unlike the pool browse page, R12) — note it in the API spec.
