# Spec 15 — Requisition Detail + Presented Shortlist (`.../requisitions/[id]`)

> Read `docs/career/career-vertical-plan-v1.md` (PART 2 §6 employer dashboard, PART 3 tables, PART 4
> express-interest flow) + `docs/career/BUILD-RULES.md` (R1, R2, R5, R8, R10, R11, R12) first.
> **No app/lib/SQL code is written here — this is the build contract.** This is the employer-scoped
> requisition detail screen: requisition facts + the owner-curated **anonymized** shortlist (only
> items the owner has `presented_to_employer = true`), each row carrying an `ExpressInterestButton`.
> Gated + `noindex`. NO identity is ever revealed by this surface.

## Mirror targets (read these first)
- **Page to mirror (strongest):** `app/[locale]/health/(gated)/randevu/[holdId]/page.tsx` — a
  session/owner-scoped detail page: `force-dynamic`, page-level `noindex`, reads identity from the
  cookie session, renders a graceful "not found / not yours" screen (never crashes), then a summary
  card + an action area. Mirror its skeleton exactly, amber-swapped.
- **Shortlist row card:** reuse the worker card from **Spec 07** (`components/glatko-kariyer/WorkerCard.tsx`)
  — the same anonymized card used on `/career/pool` (worker code, role/trade, skill tier, experience
  band, region, top skill badges, "Verified by RoNa Legal" pill, blurred+watermarked thumb).
- **Per-row action:** reuse `ExpressInterestButton` from **Spec 09** with the `requisitionId` prop set
  (this is the `Talebe Ekle` / add-to-requisition fold — SAME `/api/career/interest` endpoint, the id
  rides in the body; BUILD-RULES R10). No new endpoint.
- **Data layer to mirror:** `lib/saglik/queries.ts` / `lib/saglik/booking.ts` → add a read wrapper in
  `lib/kariyer/queries.ts` (`server-only`, `createAdminClient()`, SECURITY DEFINER RPC). UUID validation
  for the `[id]` segment lives next to `lib/kariyer/worker-code.ts` conventions.
- **Token:** accent is `brandCareer` (amber-600 `#D97706`; ramp `50 / DEFAULT / 700` ONLY — do not
  invent shades). Health's sky/`brandHealth` → amber/`brandCareer` everywhere.

## New file path
`app/[locale]/career/employer/dashboard/requisitions/[id]/page.tsx`. This is an **internal/identity**
segment (employer dashboard), NOT a per-locale-slug public route — like health's `randevu`, the path
stays English. Behind `CAREER_VERTICAL_ENABLED` (default OFF) → middleware quarantine → flag-off = real
HTTP 404 (R8 #8).

## Rendering contract
- **`export const dynamic = "force-dynamic";`** + page-level `robots: { index: false, follow: false }`
  (mirror `randevu` lines 19–21). Per-employer, per-requisition, per-viewer state — never ISR-cached
  (R5/R11). The page reads `auth.getUser()` for the viewing employer's identity.
- Identity (the employer's `user.id`) is derived from the cookie session in the page/action layer and
  passed as an explicit `p_employer_user_id` arg into every RPC (R1 — never `auth.uid()` inside an RPC).
- Validate the `[id]` segment as a UUID BEFORE any RPC; malformed → `notFound()`.

## Layout (single-column detail, mirrors `randevu` `max-w-xl/5xl` centered)
Outer wrapper tinted `bg-brandCareer-50/40`, `max-w-3xl`, `pt-28`. Top "← back to requisitions" link
(`text-brandCareer-700`, mirror `randevu`'s back-to-directory link), pointing at
`/career/employer/dashboard/requisitions`.

1. **Header** — `<h1>` (`font-serif text-3xl font-light`) = requisition title/sector + short ref/id.
   Beside it a **status pill** (see status list) in `brandCareer-50 / brandCareer-700`.
2. **Requisition summary card** (mirror `randevu`'s PII-free summary `<section>`: rounded-2xl border
   bg-white shadow-premium-sm) — sector, role(s) + headcount per role, requirements (experience band,
   skill tier, certs, languages), terms shown to workers (wage range, hours, accommodation/board,
   contract duration, start date — the MNE-disclosure fields), and service path (commission-only vs
   full-service). Read-only. NO worker identity here.
3. **Presented shortlist** `<section>` — heading (uppercase-tracked label, mirror health's section
   headings) + a stack/grid of `WorkerCard`s, ONE per `career_shortlist_items` row where
   `presented_to_employer = true` for this requisition. Each card carries an `ExpressInterestButton`
   with `requisitionId = [id]` and per-card `alreadyExpressed` state. Cards are anonymized exactly as
   on the pool (Spec 06/07) — worker code, no name/contact/exact-location.

## Every UI state (the load-bearing list)
- **loading** — route-group `loading.tsx` skeleton (mirror `(gated)/loading.tsx`): header bar + summary
  block + a few card skeletons, amber shimmer accents.
- **not-found / invalid id** — `!isUuid(id)` OR RPC returns null (unknown requisition) → `notFound()`
  (real 404 under the flag/middleware). A `null` requisition is a 404, NOT an error screen.
- **not-owned (the load-bearing auth case)** — the RPC re-verifies `requisition.employer_id` is owned by
  `p_employer_user_id` (R1/R3 pattern). Employer B opening employer A's requisition → RPC returns null
  → `notFound()` (do NOT reveal existence of another employer's req; this is BUILD-RULES R8 #2 cross-
  employer denial). Same surface as unknown-id, by design.
- **not-logged-in** — wrapper redirects to `/career/login` (locale-aware) BEFORE rendering (R11; the
  dashboard is employer-only). Never render req facts without a session.
- **error** — a genuine RPC THROW → caught by `(gated)/error.tsx` designed retry screen (mirror health:
  throw on RPC failure, return null only for not-found/not-owned).
- **empty shortlist** — requisition resolves but ZERO `presented_to_employer = true` items (status is
  Submitted / Under curation — owner hasn't published a shortlist yet). Show a neutral empty-state
  panel: muted icon + "Shortlist henüz hazır değil — RoNa Legal adaylarınızı seçiyor" (shortlist not
  yet ready). NOT an error, NOT a 404. Mirror health's neutral-fallback box geometry
  (`rounded-2xl border ... text-gray-500`).
- **success (default)** — requisition summary + N anonymized cards, each with its `ExpressInterestButton`
  in the correct per-card state (idle / interest-sent pill).
- **per-card: interest-sent (locked)** — when a `reveal_unlocks` row already exists for THIS employer +
  THIS worker, that card's button renders the disabled "İlgi gönderildi — RoNa Legal incelemesi
  bekleniyor" pill on first paint (Spec 09 already-expressed state). Dossier STILL locked
  (`owner_approved=false`); this is NOT an unlock — the unlocked dossier lives in the unlock center
  (`/career/employer/dashboard/unlocks`), never inline here.
- **locked dossier (whole page)** — there is NO un-anonymized variant on this surface. Even after
  owner-approval + payment, identity/docs render in the unlock center, not here. This page is anonymized
  by construction.

## Status pill values (PART 2 §6 lifecycle, amber-neutral)
Submitted → Under curation → Shortlist ready → Interest expressed → Approved/Unlocked → Placed → In
guarantee. Pill in `brandCareer-50 / brandCareer-700`; copy from `careerVertical.*` dictionary (9-locale
deep parity, R8 #7). The pill reflects the requisition's overall status, independent of per-card buttons.

## Amber accent usage (`brandCareer`, swaps health's sky/`brandHealth`)
- Accent is **wayfinding only** (back-link, status pill, section-heading icons, the "Verified by RoNa
  Legal" pill on each card). Body/label text uses `brandCareer-700` (the 50/DEFAULT/700 ramp is the
  only career ramp; do not invent shades).
- The ONLY solid amber-600 (`bg-brandCareer`) button is the `ExpressInterestButton` CTA on each card —
  the conversion event, analogous to health's solid-teal CTA. Empty-state and summary chrome stay neutral.
- Lock glyphs (on card cert/photo affordances) use amber to signal "unlock path", never red/danger.

## Data the page needs (UX-level — not exact field names)
One owner-scoped read RPC `career_get_requisition(p_requisition_id, p_employer_user_id, p_locale)`
(mirror `health_get_*`; service-role, R1 — owner re-verified inside via `p_employer_user_id`, never
`auth.uid()`):
- **Requisition facts:** sector, roles + per-role headcount, requirements (experience band, skill tier,
  certs, languages), terms shown to workers (wage range, hours, accommodation/board, contract duration,
  start date), service path, overall status. (PART 3 `career_requisitions`.)
- **Presented shortlist items:** for each `career_shortlist_items` row with
  `presented_to_employer = true` on this requisition, the SAME public-safe anonymized worker fields the
  pool view exposes (worker code, role/trade, skill tier, experience band, region, age band, languages,
  top skills, cert facts, readiness, "Verified by RoNa Legal" tier, blurred+watermarked thumb URL) —
  sourced through `career_worker_showcase` (R2 VIEW: excludes every `_enc`/`_hash`/private column).
- **Per-card interest state:** whether THIS employer already has a `reveal_unlocks` row for each listed
  worker (drives the per-card `alreadyExpressed` button state). Employer identity passed as the explicit
  `p_employer_user_id` arg.
- **MUST NOT return** (R8 #1 column-set test asserts zero of these reach this path): full name, DOB,
  phone/email, exact country/city/address, passport no, original document file paths, employer contact
  of any other party. Worker identity is gated; only `presented_to_employer = true` items appear at all.
- **R7 — worker is never charged.** No fee/price/payment field attaches to any worker card or to the
  requisition's worker-facing terms; all payment UI is employer-side and lives in the unlock center.

## Edge cases
- **Invalid/malformed `[id]`** → `notFound()` before any RPC (UUID validation).
- **Cross-employer access** (employer B requests A's req id) → RPC returns null → `notFound()` (indistinct
  from unknown-id; do not leak existence — R8 #2).
- **Requisition with an empty/unpublished shortlist** → neutral empty-state, not 404/error.
- **Shortlist item whose worker was de-listed** (`is_showcased=false` after curation) → the RPC omits
  that card (showcase join drops it); never render a half-anonymized stub.
- **Worker the employer already expressed interest in** → that card's button is the disabled "pending
  review" pill on first paint; dossier still locked (`owner_approved=false`) — R8 #9.
- **Express-interest success** → `ExpressInterestButton` calls `router.refresh()` so the server re-reads
  `reveal_unlocks` and that card flips to the sent-pill; owner is notified via `dispatchInterestNotice`
  (R10, best-effort, on the endpoint side — not this page's concern).
- **Flag OFF** → real HTTP 404 via middleware; nothing renders (R8 #8).
- **Scrape note** — this is a page route, not `/api/*`, so `lib/rateLimit.ts`'s `public-form` cap does
  NOT cover it (R12). Rely on server-side reads + no bulk export + the owner-ownership gate; add a
  comment noting the gap so it isn't mistaken for covered.
- **RTL (`ar`)** — single-column layout, status pill, card grid, and lock-list direction mirror correctly.
- **i18n** — all copy under the `careerVertical.*` dictionary subtree (deep 9-locale parity, R8 #7);
  admin/internal strings excluded per the i18n policy.
