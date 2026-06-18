# Spec 09 — ExpressInterestButton + `/api/career/interest`

> Docs-only build contract. Downstream agent writes the code. Read with
> `docs/career/career-vertical-plan-v1.md` (PART 4: express-interest → owner-approve → unlock flow)
> and `docs/career/BUILD-RULES.md` (R1, R3, R5, R10, R7). This surface is the conversion event of the
> vertical: the client island on the worker-detail aside (Spec 06 §"RIGHT column") + the endpoint it
> POSTs to. **No identity is ever revealed by this surface.** Gated + `noindex`.

## What this mirrors (read these first)
- **Client island** — `components/glatko-kariyer/ExpressInterestButton.tsx`, a `"use client"` button
  modeled on the action half of `components/glatko-saglik/BookingWidget.tsx` (the `reserve` callback:
  POST → branch on status → set busy/error). Use `useTransition` (not a manual `busy` state) since
  there's no fetch sequencing/abort to manage. Import `useRouter`/`Link` from `@/i18n/navigation`
  (NOT `next/navigation`) so the login redirect is locale-correct — exactly as the health components do.
- **Toast** — `sonner` is already a dependency (`^2.0.7`). The `<Toaster />` must be mounted once near
  the gated-group root layout if not already; the button calls `toast.error(...)` on failure. Health
  does NOT use sonner (it renders inline `<p role="alert">`); this surface deliberately uses a toast per
  the task contract — keep the inline-error fallback out, toast is the only failure channel.
- **API route** — `app/api/career/interest/route.ts`, modeled on `app/api/health/holds/route.ts`
  (flag-guard → parse/validate body → service-role RPC call → map business codes to HTTP status →
  JSON). POST only.
- **Data layer** — `lib/kariyer/booking.ts` (new, `server-only`, `createAdminClient()`), mirroring
  `lib/saglik/booking.ts`: a `careerExpressInterest(...)` wrapper around the `career_express_interest`
  RPC (migration `075`) + a best-effort `dispatchInterestNotice(...)` (R10), mirroring health's
  fire-and-forget owner-dispatch idiom (never throws, logs no PII).
- **Token** — accent is `brandCareer` (amber-600 `#D97706`; ramp = `50 / DEFAULT / 700` only — do not
  invent shades). This is the ONE place a solid amber button is correct (the conversion CTA, analogous
  to health's solid-teal CTA).

## Component contract — `ExpressInterestButton`
Props (passed from the server worker-detail page; identity/role resolved server-side, never in client):
`workerCode` (string, already validated), `requisitionId?` (string | undefined — folds add-to-requisition
per R10), `isEmployer` (bool — viewer is a logged-in employer), `alreadyExpressed` (bool — an existing
`reveal_unlocks` row exists for this employer+worker), `locale`. All visible strings come from the
`careerVertical.*` dictionary (deep 9-locale parity, R8 #7); RTL-correct for `ar`.

Behavior:
- Label `İlgi Göster` (express interest). When a `requisitionId` is present the label/secondary action
  reads `Talebe Ekle` (add-to-requisition) — SAME endpoint, the id rides in the body (R10, no separate
  route). The component may render both as one primary + one secondary button, or a single button whose
  label depends on `requisitionId` — either is fine; both POST the same payload shape.
- On click: `startTransition(async () => { POST /api/career/interest })`. Body =
  `{ workerCode, requisitionId? }`. No identity in the body — the employer is derived server-side from
  the cookie session (R1). `Content-Type: application/json`.
- Success → flip to the disabled "interest sent" pill (see states) AND `router.refresh()` so the
  server re-reads `reveal_unlocks` state; optionally a `toast.success`.
- Failure → `toast.error(<mapped message>)`, button returns to idle (re-clickable).

## Every UI state (the load-bearing list)
- **idle** — solid amber CTA `bg-brandCareer text-white` (mirror health's teal-gradient CTA geometry:
  `w-full rounded-xl px-4 py-3 text-sm font-semibold`, amber-swapped), enabled. Heart/Send-style lucide
  icon in white. This is the resting employer-logged-in state.
- **loading** (`isPending` from `useTransition`) — disabled, `Loader2` spinner + "Gönderiliyor…" label,
  `disabled:opacity-60` (mirror BookingWidget `reserving`). No double-submit (transition pending guards it).
- **success** — replace the CTA with a disabled pill "İlgi gönderildi — RoNa Legal incelemesi bekleniyor"
  (interest sent, pending review), `brandCareer-50 / brandCareer-700`, `BadgeCheck`/`Clock` icon. Dossier
  stays LOCKED (`owner_approved=false`); this is NOT an unlock. Persists after `router.refresh()`.
- **error** — `toast.error(...)`. Messages map from the endpoint's business code (below). Generic
  fallback toast "Bir şeyler ters gitti, tekrar deneyin." Button stays clickable.
- **locked / not-an-employer** (`isEmployer === false`) — the CTA does NOT POST. Clicking routes to
  `/career/login` via `router.push` (locale-aware) OR renders as an inline "İşveren girişi gerekli"
  (employer login required) prompt that links to login. Never a silent no-op (Spec 05/06 locked rule).
  Anonymous viewers reach this state; the page already rendered all anonymized facts.
- **already-expressed** (`alreadyExpressed === true`, server-provided) — renders the success pill
  directly on first paint (no POST). Idempotent with the post-success state.

## API contract — `POST /api/career/interest`
1. **Flag guard** — `if (!isCareerVerticalEnabled()) return 404` (mirror holds route line 1). `runtime
   = "nodejs"`, `dynamic = "force-dynamic"` (reads session/cookies — R5/R11).
2. **Auth** — derive the employer from the cookie session server-side (`createClient().auth.getUser()`),
   NOT from the body. No user → `401`. The client treats 401 as "route to login" (defense in depth; the
   button already gates on `isEmployer`, but the route must not trust the client).
3. **Body** — `{ workerCode: string, requisitionId?: string }`. Validate `workerCode` with
   `WORKER_CODE_RE` (`lib/kariyer/worker-code.ts`); validate `requisitionId` as a UUID when present.
   Bad input → `400 { error: "invalid_payload" }`. Reject unknown extra keys defensively.
4. **RPC** — call `careerExpressInterest({ workerCode, requisitionId, employerUserId })` →
   `career_express_interest` (service-role). The user id is passed as an explicit `p_employer_user_id`
   arg (R1 — never `auth.uid()` inside the RPC). The RPC (R3) re-verifies (a) the requisition's
   `employer_id` is owned by `p_employer_user_id` AND (b) the `worker_code` resolves to an
   `is_showcased = true` worker; else it `RAISE`s `NOT_OWNED`.
5. **Owner notification (R10)** — on success, call `dispatchInterestNotice(...)` best-effort
   (`void dispatch().catch(()=>{})`, never blocks/throws — mirror health's dispatch idiom) so the owner
   is alerted a new interest arrived (the approval gate needs a human trigger). Failure of the notice
   must NOT fail the request.
6. **Response** — success `200 { ok: true, status: "interest" }` (the new/existing `reveal_unlocks`
   state is `interest`, dossier still locked). The endpoint never returns identity/contact/doc data.

### Business-code → HTTP/toast mapping
- `NOT_OWNED` (R3 violation: req not owned, or worker not showcased) → `403` → toast "Bu işlem için
  yetkiniz yok."
- already-interested (RPC reports an existing row — idempotent, NOT an error) → `200 { ok: true,
  status: "interest", existing: true }` → client shows the success pill, no error toast.
- unknown worker / invalid req → `404`/`400` per the RPC's raised code → toast "Bu işçi/talep
  bulunamadı."
- RPC/infra failure → `503 { error: "unavailable" }` (mirror holds `catch` → 503) → toast generic.
- missing/expired session → `401` → client routes to `/career/login`.

## Anonymization & safety invariants (do not break)
- **No identity in, no identity out.** Body carries only `workerCode` (+ optional `requisitionId`);
  response carries only a status. The worker's name/phone/email/passport/exact-location are NEVER on
  this path — this endpoint creates a *gate row*, it does not unlock anything (PART 4 step 1).
- **R7 — worker is never charged.** No fee/price/payment field appears in this request, response, or
  button copy. Payment UI is employer-side and lives in the dashboard unlock center, not here.
- **Symmetric gate.** This action does not expose the employer's identity to the worker either; the
  owner brokers all contact downstream.

## Edge cases
- **Double-click / rapid re-submit** — `useTransition` pending state blocks the second click; the RPC is
  idempotent (existing-interest → 200), so a race produces no duplicate gate row.
- **Anonymous user bypassing the client** (POST without session) → `401`, no row created.
- **Employer A POSTing employer B's `requisitionId`** → RPC `NOT_OWNED` → `403` (R3; this is the
  cross-employer denial proven by R8 #2).
- **`requisitionId` for a worker not in any showcase** → `NOT_OWNED` (worker not `is_showcased`).
- **Flag OFF** → route returns real HTTP 404 (R8 #8); the button is never rendered because the whole
  vertical is middleware-quarantined.
- **Dispatch failure** (owner email/WhatsApp down) → swallowed; interest still recorded; surfaced only in
  server logs (no PII).
- **RTL (`ar`)** — button icon/label order and the success-pill layout mirror correctly.
- **Unthrottled note** — `/api/career/interest` IS under `/api/`, so unlike `/career/pool` (R12) it can
  use `lib/rateLimit.ts`'s `public-form`/auth'd cap; apply a lightweight per-employer cap so a logged-in
  account can't spray interest rows across the whole pool.
