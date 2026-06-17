# Spec 16 — Unlock / Reveal Center (`/career/employer/dashboard/unlocks`) + `UnlockCenter`

> Docs-only build contract. Downstream agent writes the code. Read with
> `docs/career/career-vertical-plan-v1.md` (PART 2 §6, PART 4 "express-interest → owner-approve →
> unlock-after-payment flow", steps 1–5) and `docs/career/BUILD-RULES.md` (R1, R5, R6, R7, R8, R10,
> R11). This is the **terminal surface of the reveal flow**: the only place an employer ever sees a
> worker's FULL dossier (identity + gated documents). Gated + `noindex`. There is NO unlocked variant
> on the pool/detail pages (Spec 05/06) — the unlocked dossier renders here and ONLY here.

## What this mirrors (read these first)
- **Server page to mirror:** `app/[locale]/health/(gated)/randevu/[holdId]/page.tsx` — a
  `force-dynamic`, `noindex`, session-reading gated page that renders a graceful "expired/not found"
  fallback then a list of summary cards. Mirror its shape: read cookie session → resolve rows via a
  service-role data fn → render a designed empty/locked screen, never crash.
- **New page path:** `app/[locale]/career/(gated)/employer/dashboard/unlocks/page.tsx` (gated route
  group; internal/dashboard segments stay English-identity like health's `randevu`, per plan §IA — do
  NOT localize `employer/dashboard/unlocks`). `noindex` inherited from the `(gated)` group.
- **Client island to mirror:** `components/glatko-saglik/BookingForm.tsx` (the POST → branch on
  status → busy/error idiom) + the `reserve` callback half of `BookingWidget.tsx`. New island:
  `components/glatko-kariyer/UnlockCenter.tsx` (`"use client"`). Use `useTransition` for the pay
  action and per-document `useState` for the signed-URL fetch (no countdown — unlocks don't expire).
- **Data layer:** `lib/kariyer/queries.ts` (`server-only`, `createAdminClient()`, SECURITY DEFINER
  RPC) — add `careerListEmployerUnlocks({ employerUserId, locale })`. Signed-URL fetch goes through
  the gated-original signer route from Spec covering documents (`/api/career/documents/sign`, R6),
  NOT a direct Storage call.
- **Token:** accent is `brandCareer` (amber-600 `#D97706`; ramp `50 / DEFAULT / 700` only — invent no
  shades). The **Pay** button is the one solid amber CTA here (mirrors health's solid-teal CTA).

## Rendering contract
- `export const dynamic = "force-dynamic";` (R5/R11 — reads `auth.getUser()` + per-employer unlock
  state; never ISR-cache one employer's dossiers and serve to another). `runtime = "nodejs"`.
- `export const metadata = { robots: { index: false, follow: false } };` plus the `(gated)` group.
- Behind `CAREER_VERTICAL_ENABLED` (default OFF) → middleware quarantine; flag-off ⇒ real HTTP 404.
- No session / no employer account → redirect to `/career/login` (locale-aware `@/i18n/navigation`),
  same as health's session-gated pages. Never render dossier data without a verified session.

## Layout
Outer wrapper `bg-brandCareer-50/40`, `max-w-3xl px-4 pt-28 pb-16`. `<h1>` (`font-serif text-3xl
font-light`) = "Unlock Center" + short subhead ("Reveal requests & payment status"). Below: a single
column of **unlock cards**, one per `reveal_unlocks` row, newest first. Each card is a rounded-2xl
white card with `shadow-premium-sm` (mirror health's summary `<section>`), showing: worker code +
role/trade (anonymized header, always safe to show), a **gate-state pill**, and a state-specific body
(see states). `UnlockCenter` is the client island wrapping the per-card pay/reveal interactivity; the
server page passes it the fully-resolved row list (identity fields are ONLY present in the list for
rows already `unlocked` — never ship locked identity to the client, R8 #1).

## Gate-state model (the load-bearing list)
Each card's state derives from the `reveal_unlocks` row: `(owner_approved, payment_status,
unlocked_at)`. Five states, in flow order (PART 4 steps 1→4):

1. **interest** (`owner_approved=false`) — pill "Pending RoNa Legal review" in
   `brandCareer-50 / brandCareer-700` with a `Clock` icon. Body: "Your interest is under review; we'll
   notify you when approved." NO pay button, NO identity. This is the resting state right after
   Spec 09 express-interest. (`aria-live` announces nothing yet — static.)
2. **approved — fee due** (`owner_approved=true AND payment_status != 'paid'`) — pill "Approved — fee
   due" (amber). Body shows the fee summary (amount + currency + commission-vs-full-service path label,
   employer-direction only per R7) and a **solid amber Pay button** (`bg-brandCareer text-white
   w-full rounded-xl px-4 py-3 text-sm font-semibold`, mirror health CTA geometry). This is the
   conversion/payment step.
3. **paying** (`isPending` from `useTransition` on the Pay action) — Pay button disabled, `Loader2`
   spinner + "Processing…" label, `disabled:opacity-60` (mirror BookingForm `busy`). No double-submit
   (transition guards it). **Phase-0: this is a STUB** — see "Payment (Phase-0 stub)".
4. **unlocked** (`payment_status='paid' AND unlocked_at != null`) — pill "Unlocked" in green/success
   (NOT amber — completion, not a call-to-action), `BadgeCheck` icon. Body reveals the **full
   dossier** (see "Unlocked dossier"). This is the only state with identity/contact/document access.
5. **locked / error** — see "Every UI state" below (a genuine failure or a denied/stale row).

State transitions are server-authoritative: after a successful pay, `router.refresh()` re-reads the
row and the card re-renders into **unlocked** from fresh server data — the client never fabricates the
unlock locally (defense in depth; the gate is the RPC + signer, R6/R8 #1).

## Payment (Phase-0 stub — real escrow deferred)
Per plan §Phase 2 (escrow held until placement) is OUT OF SCOPE here. Phase-0:
- The Pay button POSTs to a **stub endpoint** (`/api/career/unlocks/pay`, modeled on
  `app/api/health/holds/route.ts`: flag-guard → session auth → validate `{ unlockId }` →
  service-role RPC). The RPC (migration `075`, e.g. `career_mark_unlock_paid`) flips
  `payment_status='paid'` + sets `unlocked_at` **only when `owner_approved=true`** for an unlock the
  caller owns. No real money moves; a TODO marks where escrow/PSP integration lands in Phase 2.
- **R1:** the employer identity is derived server-side from the cookie session and passed as an
  explicit `p_employer_user_id` arg; the RPC re-verifies the `reveal_unlocks` row's `employer_id` is
  owned by that user before flipping anything (else `RAISE NOT_OWNED` → `403`). Never `auth.uid()`
  inside the RPC.
- **R7:** every fee/price/payment string here is EMPLOYER-direction only. No worker-charging wording.
- Edge: paying an unlock whose `owner_approved=false` → RPC `RAISE NOT_APPROVED` → `409` → toast
  "This request isn't approved yet." (the button shouldn't render in that state, but the route never
  trusts the client).

## Unlocked dossier (state 4 — the only place identity appears)
When `unlocked`, the card body reveals: full name, phone/email, exact country/city, plus a
**documents list** (passport/ID, original diplomas/certs, references, un-blurred photos/video). Each
document row is a **client-side signed-URL fetch on demand** (do not pre-mint URLs server-side into
the initial payload — mint per click so URLs stay short-lived and each access is logged):
- Each row renders a "View / Download" button → on click, `fetch('/api/career/documents/sign', {
  body: { unlockId, documentId } })` → receives a short-lived signed URL → opens it. Per-row
  `loading`/`error` state (small inline spinner; `role="alert"` on failure).
- **R6:** the signer re-checks the `owner_approved && payment_status='paid'` gate via
  `career_can_access_document` and writes a `career_document_access_log` row on EVERY issuance. The
  client never holds a persistent URL. The signer rejects any non-gated path / unowned unlock → the
  row shows an error, not a broken link.
- **Symmetric gate (PART 4 step 5):** even unlocked, the worker never sees the employer's contact;
  this surface only reveals worker→employer. No reverse exposure.

## Every UI state
- **loading** — route-group `loading.tsx` skeleton (mirror `(gated)/loading.tsx`): a few card-shaped
  shimmer blocks with amber-tinted accents.
- **empty** — employer has zero `reveal_unlocks` rows → designed empty state (mirror health's
  "expired/not found" graceful screen geometry: centered icon + title + body + amber link). Copy:
  "No unlock requests yet — express interest in a worker to start." with a `brandCareer` link back to
  `/career/pool`. NOT an error.
- **error** — the list RPC THROWS on genuine infra failure → caught by `(gated)/error.tsx` designed
  error screen (mirror health: throw on RPC error, return `[]`/empty only for a legitimately empty
  list). Per-action failures (pay, sign) surface as **toasts** (`sonner`, already mounted at the
  gated-group root per Spec 09) + the affected card returns to its prior state.
- **success** (per-card) — after pay: `router.refresh()`, card flips to **unlocked**, optional
  `toast.success`. After a doc sign: the file opens; the row returns to idle (re-clickable).
- **locked** — states 1–2 ARE the locked resting states (no identity present client-side). A row that
  is `owner_approved=true` but a later consent-revoke / de-showcase invalidated the worker → render a
  muted "This profile is no longer available" note instead of dossier/pay (RPC reports it; never crash).
- **aria-live** — wrap the card list (or each card's status region) in `aria-live="polite"` so a
  pending→approved→unlocked transition (after `router.refresh()`) and pay-success/error are announced
  to screen readers. The pay button's busy label change is also announced. (Task contract requirement.)

## Amber accent usage (`brandCareer`, swaps health's teal/`brandHealth`)
- Accent is **wayfinding + the single Pay CTA**: state pills for `interest`/`approved` use
  `brandCareer-50 / brandCareer-700`; the **Pay** button is solid `bg-brandCareer text-white` (the one
  solid amber here, analogous to health's solid-teal CTA). Icons (`Clock`, `Lock`, document glyphs)
  use amber to signal the unlock path, never red/danger.
- The **unlocked** completion pill is GREEN/success, not amber — completion is not a call-to-action.
- Body/label text uses `brandCareer-700`; stick to the `50 / DEFAULT / 700` ramp only.

## Data the page needs (UX-level — not exact field names)
From `careerListEmployerUnlocks({ employerUserId, locale })` (service-role RPC, R1 — employer id is an
explicit `p_employer_user_id` arg, re-verified inside; mirror health's session-scoped read):
- One entry per `reveal_unlocks` row owned by this employer: worker code + role/trade (always-safe
  anonymized header), gate state derived from `(owner_approved, payment_status, unlocked_at)`,
  optional requisition reference, the fee summary (amount/currency/path label) for `approved`+ rows.
- For `unlocked` rows ONLY: the revealed identity (name, contact, exact location) + a document
  manifest (id + category + label per gated doc) so each row can request a signed URL on demand.
  **MUST NOT** ship identity/document data for any row that is not yet `unlocked` (R8 #1 column-set
  test asserts zero private fields reach the client on locked rows).
- Cross-employer denial (R8 #2): the RPC returns only rows owned by `p_employer_user_id`; passing
  employer A's id never returns employer B's unlocks.

## Edge cases
- **Flag OFF** → real HTTP 404 (R8 #8); island never renders (whole vertical quarantined).
- **Anonymous / no employer account** → redirect to `/career/login`; no rows read.
- **Double-click Pay** → `useTransition` pending blocks the second click; the pay RPC is idempotent
  (already-paid → returns the unlocked state, no error) so a race produces no double charge / no error.
- **Pay on an unapproved row** → RPC `NOT_APPROVED` → `409` → toast; row stays in `interest`.
- **Sign a doc on a non-unlocked row** → signer's gate re-check fails → row shows error, no URL minted,
  no `career_document_access_log` row (R6).
- **Consent revoked / worker de-showcased after unlock** → list RPC flags the row; render the muted
  "no longer available" note, suppress dossier + doc buttons.
- **Stale `unlocked_at` but missing doc variant** → row-level error on that document only; the rest of
  the dossier still renders.
- **RTL (`ar`)** → card header, pill, and document-row button order mirror correctly.
- **i18n** — all visible strings under the `careerVertical.*` dictionary subtree (deep 9-locale
  parity, R8 #7); dashboard/internal-only strings follow the admin i18n policy. Dates/amounts via
  `Intl` with the locale (mirror health's `intlLocale`).
- **Unthrottled note** — this is `/api/`-backed for pay/sign, so `lib/rateLimit.ts` caps apply
  (unlike `/career/pool`, R12); apply a lightweight per-employer cap on the sign endpoint so an
  unlocked employer can't enumerate-spam signed URLs.
