# Spec 01 — Career Landing / Hero

> Build spec for the İş & Kariyer landing/hero surface. Read `docs/career/BUILD-RULES.md`
> + `docs/career/career-vertical-plan-v1.md` (PART 2 §"Page-by-page" item 1) first.
> Docs-only: this file does NOT contain app/lib/SQL code — it tells the implementation agent
> exactly what to build and which health file to copy from.

## Route & file
- **Create:** `app/[locale]/career/(gated)/page.tsx`
- **Mirror of:** `app/[locale]/health/(gated)/page.tsx` (copy its structure, swap content + accent).
- Also mirror the sibling boundary files into `app/[locale]/career/(gated)/`:
  `layout.tsx` (gate via `isCareerVerticalEnabled()` → `notFound()`; mirror health's gated layout),
  `loading.tsx` (neutral pulse skeleton — copy health's verbatim, no accent), and
  `error.tsx` (graceful retry; strings from the career dictionary, retry button uses the **amber**
  gradient — see Accent below). The `coming-soon` page lives OUTSIDE `(gated)` (separate spec).

## Invariants (non-negotiable)
- **Flag:** reachable only where `CAREER_VERTICAL_ENABLED=true` (default OFF in Production).
  Gate in middleware + defensively in `(gated)/layout.tsx`. Flag off → real HTTP 404.
- **noindex:** entire vertical is quarantined; no canonical, no sitemap entry. (Handled by the
  vertical's middleware/metadata convention — do not add indexing.)
- **Caching:** this is a static marketing page → `export const revalidate = 3600` (BUILD-RULE R5;
  pool pages are the `force-dynamic` ones, NOT this). No per-viewer state on this page.
- **i18n:** all copy from the `careerVertical.landing.*` dictionary subtree across all 9 locales
  (RTL for `ar`). No hardcoded strings. `setRequestLocale(locale)` + `notFound()` on unknown locale,
  same guard pattern as the health page.
- **Worker NEVER charged (R7):** no fee/price wording anywhere on the worker CTA or trust strip.
  The trust strip says "Employer Pays" — that is the only money-direction statement here.
- **Data altitude:** sector tiles read sectors via a server-only `lib/kariyer/queries` read-RPC
  (SECURITY DEFINER, mirrors `lib/saglik/queries.listSpecialties`). The `career` schema is never
  touched by the browser. The teaser cards on THIS page are **static placeholders** (see below) —
  do NOT query the showcase view here (that is the pool page).

## Accent rule (amber-600 = `brandCareer`, where health uses sky / `brandHealth`)
- Sub-brand word + token group: `brandCareer` (`DEFAULT #D97706`, `50 #FFFBEB`, `700 #B45309`).
- **Text** must use `brandCareer-700` (AA-safe), never `DEFAULT` for body/label text — same rule as
  health's `brandHealth-700`. Icons / large UI / chip backgrounds may use `brandCareer`/`-50`.
- Page tint: `bg-brandCareer-50/60 dark:bg-transparent` (mirrors health's `bg-brandHealth-50/60`).
- **CTA gradient buttons:** amber gradient `from-amber-500 to-amber-600` with
  `shadow-amber-500/25` (health uses `from-teal-500 to-teal-600`). Apply to both hero CTAs and the
  `error.tsx` retry button.
- `<VerticalBrand vertical="career" size="md" />` — already amber-aware (`text-brandCareer-700`).

## Layout (top → bottom, single column, centered hero like health)
1. **Hero** (`max-w-3xl px-4 pb-16 pt-32 text-center`):
   `<VerticalBrand vertical="career" size="md" className="mb-3" />`, serif `h1` =
   `careerVertical.landing.title`, subtitle `p` = `careerVertical.landing.subtitle`.
2. **Dual CTA row** (replaces health's inert search form): two side-by-side buttons (stack on
   mobile, `sm:flex-row`). Primary = **employer** (`careerVertical.landing.employerCta`, amber
   gradient, links to `CAREER_ROUTES.employerJoin`). Secondary = **worker**
   (`careerVertical.landing.workerCta`, outline/ghost amber `border-brandCareer-100
   text-brandCareer-700`, links to `CAREER_ROUTES.workerJoin`). Worker button carries a small
   "free for you" sub-label. Use `Link` from `@/i18n/navigation` with the route KEYS from
   `lib/kariyer/config.ts` — never hardcode `/career/...` slugs.
3. **Trust strip** (horizontal row of 2–3 pills under the CTAs): "Verified by RoNa Legal"
   (`BadgeCheck` icon) + "Employer Pays" (`ShieldCheck` or `HandCoins` icon). Pills =
   `bg-brandCareer-50 text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer`, same shape
   as health's coming-soon badge. Static, no data.
4. **Teaser row of LOCKED anonymized worker cards** (`max-w-5xl`): a row of 3–4 placeholder cards
   in the anonymized-card shape (mirror the *structure* of `components/glatko-saglik/ProviderCard.tsx`
   but build a dedicated presentational `components/glatko-kariyer/LockedTeaserCard.tsx`). Each shows:
   worker code (e.g. `MNE-CW-0427`), role/trade label, experience band, region (NOT country), 2–3
   skill badges, a "Verified by RoNa Legal" mini-badge, and a **face-blurred/locked thumbnail**
   (greyed avatar block with a `Lock` overlay + `blur-sm`/`grayscale`). A frosted overlay + lock
   icon communicates "locked"; the whole row is non-interactive teaser content (no real worker data —
   these are hardcoded sample placeholders, NOT showcase-view reads). A single CTA under the row
   ("Browse the talent pool") links to `CAREER_ROUTES.pool` (gated by login downstream).
5. **Sector tiles** (`max-w-5xl`, grid `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` like health's
   specialty grid): one tile per seeded sector (Construction, Hospitality from migration 078), each
   with `sectorIcon(slug)` from `lib/kariyer/category-icons.ts` rendered in `brandCareer`, the
   localized sector name, and a `Link` to the sector hub (`/career/sectors/[sector]` route key).
   Data comes from the server-only sectors read-RPC.
6. **3-step "How it works" diagram** (`max-w-5xl`): three numbered steps in a row (stack on mobile),
   amber numbered circles (`bg-brandCareer-50 text-brandCareer-700`), each a title + one line:
   (1) Employer submits a requirement → (2) RoNa Legal curates a verified shortlist → (3) Reveal
   identity after approval + employer pays. Connector chevrons between steps on desktop. A footer
   link to the full explainer = `CAREER_ROUTES.howItWorks`.

## UI states
- **Loading:** `loading.tsx` pulse skeleton (Suspense during sector read-RPC) — copy health's.
- **Empty (no sectors):** if the sectors RPC returns `[]`, render the hero + dual CTA + trust strip
  + teaser + how-it-works as normal, and simply omit the sector-tiles section (no broken empty grid).
  Seed migration 078 (R9) guarantees Construction + Hospitality, so this is a defensive path only.
- **Error:** a thrown read-RPC error bubbles to `error.tsx` (graceful screen + amber retry button).
  Never a blank page or a fake 404.
- **Success:** full page as laid out above.
- **Locked:** the teaser worker-card row is the page's "locked" affordance — frosted/blurred cards
  with lock overlay, no real identity, signalling "browse the pool to see more (gated)". This is
  cosmetic on the landing page; the real gate lives on `/career/pool` + the reveal-unlock flow.

## Data the page needs (UX level, not field names)
- **Sectors:** localized list of top-level sectors (name + slug) for the current locale — for the
  tiles only. Read server-side via the career sectors read-RPC. Nothing private, nothing per-viewer.
- **Teaser cards:** none from the DB — hardcoded representative placeholders (worker code pattern,
  role, region, skill words). Keeps the page static-cacheable and leaks nothing.
- **No auth read** on this page → stays `revalidate=3600`, NOT `force-dynamic`.

## Edge cases
- Unknown/unsupported locale → `notFound()` (same guard as health page).
- RTL (`ar`): hero, CTA row, trust strip, sector grid, and the 3-step diagram must mirror correctly
  (logical-direction classes; avoid hardcoded left/right). The how-it-works connector chevrons must
  flip direction in RTL.
- Flag flips OFF after a card is in an ISR cache → middleware + `(gated)/layout.tsx` still 404 before
  render; the cached HTML is never served (gate runs ahead of the cached page).
- Dark mode parity for every amber surface (`dark:bg-brandCareer/15 dark:text-brandCareer`), matching
  the health page's dark variants 1:1.
- Teaser placeholders must contain ZERO real names/contacts even as sample text (use codes + roles).

## Deps that must exist first (do not block on, just reference)
- `lib/kariyer/config.ts` (`CAREER_ROUTES`, `CAREER_ACCENT_TOKEN`) — present.
- `lib/kariyer/flags.ts` (`isCareerVerticalEnabled`) — present.
- `lib/kariyer/category-icons.ts` (`sectorIcon`) — present.
- `brandCareer` tailwind token — present.
- `VerticalBrand` career support — present.
- Needed but NOT yet present (other specs/migrations): career sectors read-RPC in `lib/kariyer/queries`,
  migration 078 sector seed (R9), `careerVertical.landing.*` dictionary keys in all 9 locales,
  `/career/coming-soon` + ~20 route keys registered in `i18n/routing.ts` (R14 ordering).
