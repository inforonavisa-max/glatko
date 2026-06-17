# Spec 19 — WorkerProfileWizard (`WorkerProfileWizard`, client, multi-step)

> Docs-only build contract. The downstream agent writes the code. Read with
> `docs/career/career-vertical-plan-v1.md` (PART 2 §7 "Worker registration + profile builder", PART 3
> `career_worker_profiles` public/private split + `career_worker_documents`, PART 4 anonymization,
> PART 5 readiness score) and `docs/career/BUILD-RULES.md` (esp. **R1, R7, R11, R5, R8 #7**). This is
> the supply-side profile builder: a worker turns their account into a `career_worker_profiles` row +
> linked docs. Gated + `noindex`. The worker is **NEVER charged** (R7) — no fee/price/payment UI may
> appear anywhere in this wizard.

## Mirror target (structure, verbatim)
- **Component:** `components/glatko/become-a-pro/BecomeAProWizard.tsx` — copy its skeleton exactly:
  `"use client"`, `useState` step index, `framer-motion` `AnimatePresence mode="wait"` with the
  `opacity/x: 30 → 0 → -30` slide, the `STEPS[]` icon/key array driving the horizontal step-indicator
  rail (circles + animated connectors), per-step `step{n}Ok` boolean gate + `tryAdvance()`,
  `useTransition` submit, `isNarrow` matchMedia for reduced-motion duration, the smooth scroll-to-top
  on step change, and the `useFormPersistence` draft-restore banner. Mirror its split: parent wizard +
  one `Step*` per step + an inline success screen (the `submitState.success` early return).
- **Mirror sub-components:** `StepPersonalInfo`, `StepReview`, `ProWizardAvatarUpload`,
  `DocumentsUploader`/`PortfolioUploader` (uploaders), and `ProfileCompletionGauge`
  (`components/glatko/pro-dashboard/ProfileCompletionGauge.tsx`) — this IS the readiness/completeness
  meter; reuse it amber-swapped.
- **New files:** `components/glatko-kariyer/worker/WorkerProfileWizard.tsx` (+ `StepAccountConsent`,
  `StepBasics`, `StepSkills`, `StepCertsEducation`, `StepPhotosDocs`, `StepVideo`, `StepReview`).
- **Rendered by:** `app/[locale]/career/(gated)/worker/profile/page.tsx` (route key
  `CAREER_ROUTES.workerProfile`). The page reads `auth.getUser()` → **`force-dynamic` (R11)**,
  redirects unauthed → `CAREER_ROUTES.login`, and passes the worker's user id + email + any existing
  profile draft down as props (identity resolved server-side, never in client — R1).

## Difference from the mirror (read carefully)
- **6 steps (not become-a-pro's 6 service-pro steps — different content).** STEPS =
  `[ShieldCheck "accountConsent", User "basics", Wrench "skills", GraduationCap "certsEducation",
  Camera "photosDocs", Video "video"]` (lucide). **Review is folded into the last step's footer** OR a
  7th compact review block — match the mirror's pattern (mirror has a dedicated `StepReview`; keep it
  as the final step so the readiness gauge has a home → 6 collection steps + a Review = 7 indicators,
  OR fold review into step 6. Pick the dedicated-Review variant to match `BecomeAProWizard` 1:1).
- **POSTs to `/api/career/worker/profile`** (JSON) OR a server action mirroring
  `submitProfessionalApplication` — match the health write idiom: flag-guard → `auth.getUser()` (401
  if none) → validate → service-role RPC (migration `075`, `career_upsert_worker_profile` or equiv.)
  via `createAdminClient()`. The worker user id is derived server-side and passed as an explicit
  `p_worker_user_id` arg; the RPC re-verifies ownership (R1). NEVER in the body.
- **No service-area / pricing steps** — those are service-pro-only. **R7: there is NO money step,
  no rate field, no pricing card anywhere in this wizard.**

## Layout
- Same chrome as the mirror: `mx-auto max-w-2xl px-4`, glassmorphism card (`rounded-3xl border
  bg-white/80 backdrop-blur-sm` + dark variants), centered `h1` + subtitle, the horizontal
  step-indicator rail, animated step body, and the back/next nav row (Back hidden on step 0; Next
  amber until last step; last step = Submit).
- Each `Step*` renders inside the `AnimatePresence` `motion.div` keyed by `step`.

## Steps & the data each collects (UX-level — exact column names live in the API/RPC spec)
1. **StepAccountConsent** — explicit GDPR/PDPA consent (plan PART 3 `career_consents`): a required
   checkbox block granting purpose-bound, revocable consent to process special-category data
   (passport/cert/biometric — PART 6 §D). Show the worker exactly what they grant. `step1Ok`: consent
   checkbox checked. (Account creation itself is the register step / global auth — this step is the
   in-wizard consent gate.) Link to a privacy note. **No fee/payment language (R7).**
2. **StepBasics** — role/trade (`<select>`, from the seeded `career.sectors` trade list, 9-locale
   labels — same source as Spec 14 StepRoles), years of experience (→ experience band), source
   region/country (worker enters country; **only region is shown publicly** — PART 4), languages
   (multi-select chips), age (→ age band publicly). `step2Ok`: role/trade set AND experience set.
   Note inline that exact country/age are private and only a *region/band* is shown publicly.
3. **StepSkills** — **structured per-trade skill picker**: when a trade is chosen in step 2, render
   that trade's skill checklist (grouped chips/checkboxes — mirror `StepServiceAreas` selection UX,
   amber-swapped) so skills are structured, not free-text. PLUS a **work-history** repeatable builder:
   each row = employer type/sector + region/country + duration (years) + role (the *redacted*
   timeline "Hospitality employer, UAE, 3 yrs" — PART 2 §4); "Add entry" appends, each row removable.
   `step3Ok`: ≥ 1 skill selected (work history optional but recommended for readiness).
4. **StepCertsEducation** — repeatable certifications/education builder: each = title/credential +
   issuer + year (+ optional "file to upload in step 5" marker). The *fact* of a cert is public
   (badge); the file is gated (PART 4). All optional → `step4Ok` always true (but feeds readiness).
5. **StepPhotosDocs** — **photo + document HANDOFF, not the full upload center.** Mirror
   `ProWizardAvatarUpload` + `PortfolioUploader`/`DocumentsUploader` for: profile photo + work photos
   (these become face-blurred/watermarked showcase variants — R6), and the gated docs set
   (ID/passport, diplomas, skill certs, insurance/medical, references). This step COLLECTS uploads
   and per-item visibility intent (`public_anonymized | gated | internal_only`); the full
   consent-per-document management lives on the **Document & Photo Upload Center** (`/career/worker/
   documents`, the separate spec 18 surface — link to it; do NOT re-implement its per-doc consent
   revoke here). `step5Ok`: optional (profile photo strongly recommended → readiness, not a hard gate).
6. **StepVideo** — OPTIONAL video intro (URL or upload). One short hands-only skills clip MAY be
   public; the full face/voice intro is GATED until unlock (PART 4). Clearly label which is which.
   `step6Ok`: always true (optional).
7. **StepReview** (final) — read-only summary of steps 1–6 grouped into cards (mirror `StepReview`'s
   `SummaryCard` grid) + the **`ProfileCompletionGauge`** (readiness meter) showing score +
   `missingFields` list. Per-section "Edit" affordance jumps back (`setStep`). Holds the Submit button.

## Completeness + readiness meter (the signature element)
- Reuse `ProfileCompletionGauge` (amber-swapped). Compute a **live client-side `completionScore`**
  (0–100) and a `missingFields[]` list exactly like the mirror's `completionScore`/`missingFields`
  memos — weighted: consent given, role/trade, ≥ 2 languages, ≥ 1 skill, work history present,
  ≥ 1 cert, profile photo, ≥ N work photos, docs uploaded, video present. **The DB RPC is canonical
  post-save (PART 5 readiness composite: completeness + verified docs + language level + deployment
  readiness); this gauge is a UX hint only** (mirror the mirror's comment). Render the gauge on
  StepReview and optionally a compact inline meter in the rail. Verification-derived readiness
  (RoNa-set badges) is NOT computed client-side — it's owner-set; show only the self-completable part.

## Every UI state (the load-bearing list)
- **loading** — page-level `Suspense`/`(gated)/loading.tsx` neutral skeleton during navigation; the
  wizard itself does no per-step DB fetch (trade/skill lists passed as props from the server page).
- **idle / in-progress** — the step body; Next is a solid-amber CTA, enabled only when `step{n}Ok`
  for the current step (disabled = `opacity-50 cursor-not-allowed`). Back visible from step 1+.
- **empty** — StepSkills with zero skills selected shows the empty trade checklist + prompt; Next
  disabled until ≥ 1 skill. Work-history/certs/photos/video empty are valid, advanceable states.
- **draft-restored** — `useFormPersistence` keyed **per-worker** (`career-worker-profile-v1:<userId>`)
  surfaces the dismissible "draft restored / start fresh" banner (**amber-tinted, not teal**);
  `clearDraft()` on successful submit and on "start fresh".
- **submitting** (`isPending`) — Submit shows `Loader2` + label, `disabled`; transition guards
  re-entry (no double-submit). Upload widgets disabled while a file is in flight (mirror uploader UX).
- **error** (validation OR API non-2xx OR network throw OR upload failure) — a red `role="alert"`
  line at the top of the card (`text-sm text-red-600`); fields/uploads retained for retry. Client
  step validation surfaces inline before any POST. Map API codes (below). **Errors stay red — never
  amber-tint danger.**
- **success** (`{ ok: true }`) — replace the wizard with the inline success panel (mirror the
  `submitState.success` early return): amber `CheckCircle` panel
  (`bg-brandCareer-50 text-brandCareer-700`), "Profile submitted — RoNa Legal will verify and
  showcase you anonymously," a one-line "you'll be notified" reassurance, and a link to
  `CAREER_ROUTES.workerDashboard`. (Status copy like "You are showcased" lives on the dashboard, not
  here.) Optionally fire `trackEventWithMeta("career_worker_profile_submitted")` before the UI flips.
- **locked / not-a-worker** — NO in-component locked state: page gated behind `CAREER_VERTICAL_ENABLED`
  (OFF → middleware quarantine → real HTTP 404, R8 #8) and the page redirects unauthed →
  `CAREER_ROUTES.login`. The wizard only ever renders for a logged-in worker.

## Amber accent usage (`brandCareer`, swaps health/become-a-pro teal — ramp `50 / DEFAULT / 700` only)
- Step-indicator active/past circles + connectors, the title underline, the Next CTA, and the Submit
  CTA use `brandCareer` (the mirror's `from-teal-500 to-teal-600` gradient → `from-amber-500 to-amber-600`
  with `shadow-amber-500/25`; keep it the ONE prominent CTA color). Success panel = amber.
- Selected skill chips (step 3) get `border-brandCareer ring-brandCareer/20 bg-brandCareer-50/40`;
  input/select focus rings = `focus:border-brandCareer focus:ring-brandCareer/20`. Gauge fill = amber.
- Accent **text** (labels, links, success copy, consent note) uses `brandCareer-700` — DEFAULT
  (#D97706) is below the 4.5:1 AA text floor → DEFAULT only for icons / large UI / chip & circle
  backgrounds (mirror the tailwind token comment + Spec 14/17 §"Amber accent"). Spinner inherits CTA
  white; red stays red. Draft banner amber-tinted (not teal).

## Draft persistence (long-form requirement)
- Mirror `useFormPersistence` with a single `snapshot` memo covering ALL step state (consent, basics,
  skills, work history, certs, upload references, video, `step`) + a `restore`. **Key per-worker**
  (`career-worker-profile-v1:<userId>`) so a shared browser doesn't cross-contaminate. Restore the
  current `step`. `clearDraft()` on submit + "start fresh". Persist upload *references* (storage
  paths/ids), not raw files.

## Data the wizard needs / sends (UX-level — not exact field names)
- **Reads (props from the server page):** the worker's user id (draft key + passed via session to the
  route), email/display name (prefill), the seeded trade list with per-trade skill options (9-locale
  labels), and any existing profile/doc draft to prefill (resume editing). No client-side DB read.
- **Sends (POST/action, JSON):** consent flag(s), role/trade, experience, region/country (private),
  languages, age (private), skills[], work-history entries, certs/education entries, uploaded-doc
  references + per-item visibility intent, video reference, `locale`. **Worker user id derived
  server-side (R1) — NEVER in the body. NO fee/price/payment field anywhere (R7).**
- **Route → RPC:** service-role RPC (migration `075`) via `createAdminClient()` (career schema not
  exposed to PostgREST — mirror the health write path), `p_worker_user_id` passed explicitly and
  ownership re-verified inside the RPC (R1). Profile written to `career_worker_profiles`
  (public/private columns split — PART 3), docs to `career_worker_documents` with `visibility` +
  `consent_status`, consent rows to `career_consents`.

## Edge cases
- **Step validation before advance** — `tryAdvance` checks `step{n}Ok` and refuses to advance on
  failure (mirror the wizard's gate); surface inline, not server-side.
- **Trade change after skills picked** (step 2 → 3) — changing the trade invalidates the prior trade's
  skill selection; clear/re-prompt the skill checklist (don't silently keep orphaned skills).
- **Private-vs-public confusion** — basics step must make clear exact country/DOB are PRIVATE and only
  region/age-band are shown publicly (PART 4); never imply the public card shows their name/contact.
- **Upload failure mid-step** (step 5/6) — surface a per-file error, keep the rest, allow retry; a
  failed upload must NOT block advancing if that doc is optional. Disable Submit while any upload is
  in flight.
- **Resume/edit existing profile** — if the page passed an existing draft, prefill all steps and the
  draft banner reflects "resuming"; submitting upserts (no duplicate profile).
- **API 401** (session expired mid-form) → route to `CAREER_ROUTES.login` preserving the draft (it's
  persisted → worker returns to a restored wizard); **403** (`NOT_OWNED` — uid mismatch, the R1/R8 #3
  worker-self-isolation failure mode) → generic "not authorized"; **503**/network → generic retry.
- **Double-submit** — `useTransition` pending blocks the second click; the RPC upsert is idempotent.
- **Flag OFF** — route returns real HTTP 404 (R8 #8); page middleware-quarantined; wizard never renders.
- **RTL (`ar`)** — step rail, slide direction math, repeatable-row add/remove, skill-chip grid, and
  review "Edit" affordances mirror correctly (logical-direction classes; no hardcoded left/right).
  `ar` + source-region languages are the primary worker-facing locales (plan §"Brand & system
  inheritance") → RTL is load-bearing.
- **i18n** — ALL copy (step labels, field labels, consent block, the private-vs-public notes, skill
  group labels, gauge `missingFields`, success panel, errors) under the `careerVertical.worker.*`
  dictionary subtree with deep 9-locale parity (**R8 #7** — CI `i18n-check.sh` only checks top-level
  keys; nested drift ships silently). No TR-hardcoded strings on this worker-facing surface.
- **R7 reminder** — audit every final string: no fee/price/payment/commission/owes language may
  attach to the worker. There is no money-adjacent control in this entire wizard.

## Deps that must exist first (reference, do not block)
- `lib/kariyer/config.ts` (`CAREER_ROUTES.workerProfile`, `workerDashboard`, `login`,
  `workerDocuments`) — present.
- `lib/kariyer/flags.ts` (`isCareerVerticalEnabled`) — present. `brandCareer` token — present.
- `useFormPersistence` (`lib/hooks/useFormPersistence`) + `ProfileCompletionGauge` — present (reuse).
- Seeded `career.sectors` + per-trade skill taxonomy (migration `078` seed — R9) so the skill picker
  and trade `<select>` aren't empty.
- Write RPC `career_upsert_worker_profile` (migration `075`) + the worker-profile API route/action.
- Spec 18 (Document & Photo Upload Center, `/career/worker/documents`) — this wizard HANDS OFF to it;
  do not duplicate its per-document consent-revoke UI. Spec 17 (worker landing) is the funnel into here.
- Needed but NOT yet present: `careerVertical.worker.*` profile-wizard dictionary keys in all 9
  locales (RTL `ar`); `/career/worker/profile` route key registered in `i18n/routing.ts` (R14 order).
