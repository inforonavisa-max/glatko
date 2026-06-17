# Spec 25 — Talent Curation (`/admin/career/curation`) + `AdminWorkerCurationList`

> Docs-only build spec. Downstream agent writes the code (NO app/lib/SQL here).
> Read alongside `career-vertical-plan-v1.md` (PART 2 §10 "talent curation", PART 3 "Core tables",
> PART 5 "Verified by RoNa Legal" + readiness) and `BUILD-RULES.md` (R1, R8 #1/#3, R13, R15).
> **This is THE owner-only un-anonymized surface** — the single place in the whole product where a
> human reads a worker's real name, phone, email, passport. Treat that as load-bearing: every
> rendering decision here is about keeping clear-text PII server→admin only, never leaking it to a
> non-admin or a cache. Lives under `/admin`, inherits its allowlist gate, NOT the
> `CAREER_VERTICAL_ENABLED` flag (admins always see it, like Spec 23).

## What this mirrors (read these first)
- **Page route** — mirror `app/[locale]/admin/professionals/page.tsx`: a `force-dynamic` async server
  component that awaits `params` + `searchParams`, derives a safe filter from the query string,
  calls ONE service-role data fn, then renders a `<header>` (title + count + filter pills) and a
  vertical list of cards with an empty state. Keep that file's exact card geometry, filter-pill
  styling, and empty-state block (centered icon + title in a dashed/translucent card).
- **Auth gate** — inherited from `app/[locale]/admin/layout.tsx` (no user → `redirect(/login)`; not
  in `isAdminEmail` allowlist → `notFound()`). Do NOT re-implement any auth check on this page. This
  is why the page is exempt from the career flag.
- **Verification/badge/toggle island** — mirror `components/admin/providers/ProviderVerificationFields.tsx`
  (the `Toggle` switch + segmented status/tier button-group idiom) for the per-worker actions.
- **Sidebar** — no new sidebar item (Spec 23 already added "Kariyer" → `/admin/career`). Reach
  curation via an in-page link/tab from the Spec 23 dashboard (`/admin/career/curation`).
- **Data fn** — add to `lib/kariyer/queries.ts` (`server-only`, `createAdminClient()`):
  `careerAdminSearchWorkers({ q, verification, limit, offset })` calling RPC
  `career_admin_search_workers` (migration `076`, item 1 — **the ONLY read path that decrypts PII**).
  Mutations call `career_admin_set_worker_verification`, `career_admin_verify_document` (076 items
  3–4) through server actions in a co-located `actions.ts`.
- **Token:** accent is `brandCareer` (amber-600 `#D97706`; ramp `50 / DEFAULT / 700` only — invent
  no shades), swapping the admin tree's default teal everywhere this surface uses an accent.

## Route & rendering
- Path: `app/[locale]/admin/career/curation/page.tsx` (+ `actions.ts`).
- `export const dynamic = "force-dynamic"` — un-anonymized + per-query reads; **never ISR-cache a
  page containing clear-text PII** (R8 #1 spirit). `runtime = "nodejs"` (needs the service-role/PII
  decrypt path).
- `noindex` inherited from the admin layout `metadata.robots` — do not re-declare. No
  `generateStaticParams`, no `setRequestLocale` (admin layout already ran it).
- Admin chrome strings are **TR-hardcoded** per the admin-i18n policy (e.g. "İşgücü Küratörlüğü",
  "Doğrula", "Hazır"), NOT under `careerVertical.*`. Worker-facing data values render as stored.

## Layout
Full-width admin `<main>` column (the layout supplies sidebar + padding). Top `<header>`: `<h1>`
(`font-serif text-2xl font-bold`) "İşgücü Küratörlüğü" + amber underline rule (`bg-brandCareer`) +
result count. Below the header, two controls in a row:
1. **Search box** — a `GET`-form text input (`name="q"`) submitting back to the page (URL is the
   single source of truth, mirroring the providers filter-via-querystring pattern; no client search
   state). Placeholder "İşçi kodu, rol, meslek, bölge ara". Searches worker_code/role/trade/region
   ILIKE server-side (R: RPC does the matching, never the client).
2. **Verification filter pills** — `Link`s carrying `?verification=` (preserving `q`): Tümü ·
   Beklemede (`pending`) · Kimlik (`id_verified`) · Beceri (`skills_verified`) · Belge
   (`documents_verified`) · Mülakat (`interview_passed`) · Reddedilmiş (`rejected`). Active pill =
   `bg-brandCareer-50 text-brandCareer-700`.

Then the **`AdminWorkerCurationList`** client island (`"use client"`) rendering one **worker row
card** per result (`rounded-2xl border bg-white/70 p-5`):
- **Header line:** worker_code (mono) + role · trade + region + experience band + age band + the
  **un-anonymized identity block** (full name, phone, email, exact country, passport no.) shown in a
  visually-distinct "internal only" panel (muted, small, a `Lock`/`ShieldAlert` glyph + a TR caption
  "Yalnızca dahili — RoNa Legal"). This block is the whole reason the surface exists; render it
  plainly but mark it as confidential.
- **Body:** skills/cert chips, languages, a **readiness meter** (composite score from the row, 0–100,
  amber fill `bg-brandCareer`), `is_showcased` indicator.
- **Action cluster (per worker):** (a) a **verification segmented control** (the 6 statuses above) →
  `career_admin_set_worker_verification`; (b) a **documents sub-list** — each `worker_documents` row
  with category + filename + current consent/verify state and a **Doğrula / Reddet** pair →
  `career_admin_verify_document(id, approve)`; (c) a link "Uyum/Belgeler →"
  to the compliance view (Spec 23/`career_admin_compliance`) for the full consent+access log.
- **Pagination:** prev/next links carrying `q`/`verification` + `offset` (server-paginated; the RPC
  takes `limit/offset`). No infinite scroll, no bulk export (R12-adjacent: no scrape surface).

## Amber accent usage (`brandCareer`, swaps the admin tree's teal)
- Accent is wayfinding + the one affirmative action color: header underline, active filter pill
  (`brandCareer-50/700`), readiness-meter fill, the **Doğrula** / "set verified-tier" buttons when
  selected (`border-brandCareer bg-brandCareer-50 text-brandCareer-700`). Body/label text uses
  `brandCareer-700`; stick to the `50 / DEFAULT / 700` ramp only.
- **Reject / revoke** actions use red (danger), NEVER amber. The confidential-PII panel is neutral
  (gray/`ShieldAlert`), not amber — amber signals the positive curation path, not "secret".

## Every UI state
- **loading** — admin route `loading.tsx` skeleton (or in-page Suspense): a few row-card-shaped
  shimmer blocks with amber-tinted accents. Search submits navigate (full server re-render), so the
  loading state is the standard navigation skeleton.
- **empty (no results)** — query/filter matched zero workers → the providers-page empty block:
  centered icon (`Users`/`SearchX`, `text-brandCareer/30`) + "Bu aramada işçi yok" + a "Filtreyi
  temizle" link back to the unfiltered page. NOT an error.
- **empty (no workers at all)** — Phase-1 concierge cold-start: pool genuinely empty → same block,
  copy "Henüz havuzda işçi yok" (no clear-filter link). Expected pre-seeding; not a failure.
- **error** — the search RPC THROWS on genuine infra failure (incl. `PII_KEY_MISSING` → the Vault
  `career_pii_key` is absent) → caught by the admin `error.tsx` designed error screen; surface a
  plain "Kayıtlar yüklenemedi" + retry. A missing PII key is an infra error, never a silent blank.
- **success (per action)** — after a verification/doc action: server action returns → `useTransition`
  ends → `router.refresh()` re-reads fresh (re-decrypted) data → the card reflects the new state.
  Optional inline confirmation; no optimistic local mutation of PII (server is authoritative).
- **busy (per action)** — the acting button shows a `Loader2` spinner + disabled
  (`disabled:opacity-60`); `useTransition` guards double-submit; other cards stay interactive.
- **locked** — there is no "locked" employer-style state here: an admin who reached this page is
  already past the allowlist gate, so all PII is visible by definition. (The "lock" is the gate
  ITSELF — a non-admin never renders this page; flag/route quarantine is upstream.)
- **aria-live** — wrap each card's status region in `aria-live="polite"` so a verification/doc state
  change after `router.refresh()` and any action error are announced; the busy-label change is also
  announced.

## Data the page needs (UX-level — not exact field names)
From `careerAdminSearchWorkers({ q, verification, limit, offset })` (service-role RPC, R1 — no
`auth.uid()` inside; the admin identity is established by the `/admin` layout gate, not passed as a
scoping arg since admins see ALL workers):
- One entry per matching worker: worker_code, role, trade, skill tier, experience/age bands, region,
  languages, skills, readiness score, verification status, `is_showcased`, AND the **clear-text PII**
  (full name, dob, exact country, phone, email, address, passport no.) — this surface is the
  intended consumer of that decrypted block.
- Per worker, the **document manifest** (id + category + filename + consent/verify state) so the doc
  sub-list and Doğrula/Reddet buttons can act. (If the search RPC doesn't return docs, fetch them
  per-expanded-card via a sibling admin read; do NOT pre-mint any signed URLs here — curation reads
  metadata, not file bytes.)
- **R8 #1 / #3 boundary:** this is the ONE surface allowed to ship PII to its (admin-only) client
  island. Every OTHER career client surface must ship ZERO private columns. Do not reuse this
  island, its props type, or its data fn on any employer/worker page.

## Edge cases
- **Non-admin reaches the URL** → `/admin` layout `notFound()` (hides existence). This page renders
  no auth check of its own and must not assume it runs only for admins beyond that gate.
- **`career_pii_key` missing in Vault** (fresh DB / staging branch before secret set) → RPC raises
  `PII_KEY_MISSING` → error screen, not a blank list of half-decrypted rows (R4 self-containment
  spirit: fail loud).
- **Search injection / weird input** → RPC parameterizes `p_q` (ILIKE bind), so quotes/`%` are data,
  not SQL; the form must not interpolate into any query client-side.
- **Pagination past the end** → RPC returns `[]` → "no results" empty state (clear-filter link still
  works); offset is clamped server-side (`greatest(...,0)`).
- **Set verification to an invalid status** → RPC raises (input-validation code) → action returns an
  error → toast/inline error, card unchanged. Buttons only offer the 6 valid statuses, but the
  action never trusts the client.
- **Verify a doc that was deleted/re-uploaded** → RPC returns `{ ok:false, reason:'NOT_FOUND' }` →
  inline "Belge bulunamadı"; refresh re-reads the current manifest.
- **R13 audit** — every verification/doc mutation here SHOULD write a `glatko_admin_audit_log` row
  via `lib/admin/audit.ts`; confirm `target_table` accepts the schema-qualified `career.*` value (or
  extend the union + any CHECK) and smoke-test one career admin action produces an audit row.
- **No worker fee anywhere (R7)** — this surface shows/edits curation + verification only; it MUST
  NOT display or edit any fee/price/payment field against the worker. Payment lives on the
  employer-only unlock surfaces (Spec 16/23).
- **RTL (`ar`)** — admin chrome is TR-only so the page is LTR; but PII values may contain Arabic
  script (names) — render values with `dir="auto"` so mixed-script identity displays correctly.
- **i18n** — admin chrome strings stay TR-hardcoded (admin-i18n policy), NOT under
  `careerVertical.*`; only the verification-status labels are translated to TR inline. Dates via
  `Intl` with the page locale (mirror the providers page `toLocaleDateString(locale, …)`).
- **Caching** — never cache: `force-dynamic` + no `revalidate`. A cached page would serve one query's
  PII to a later admin's URL — the dynamic flag is load-bearing, not a perf knob.
