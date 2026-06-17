# Spec 10 — Employer Landing / Value Prop

> Build spec for the İş & Kariyer **employer** landing surface (demand side). Read
> `docs/career/BUILD-RULES.md` + `docs/career/career-vertical-plan-v1.md` (PART 2 §"Page-by-page"
> item, Employer landing `/career/employer`) first. Docs-only: NO app/lib/SQL code here.
> This page is the conversion funnel for employers → register. It is **fully static** (zero DB
> reads, zero auth). Sibling of spec `01-landing.md` (the dual-audience hero); this one is
> employer-only and sells the gated-curation model.

## Route & file
- **Create:** `app/[locale]/career/(gated)/employer/page.tsx` (route key `CAREER_ROUTES.employer`).
- **Mirror of:** `app/[locale]/health/(gated)/page.tsx` — copy its static marketing structure
  (hero block, centered sections, serif `h1`, section grids), swap content + accent. This page has
  NO search form and NO read-RPC — it is simpler than the health home.
- Boundary files (`layout.tsx` gate, `loading.tsx`, `error.tsx`) are shared with the rest of
  `app/[locale]/career/(gated)/` and are defined in spec 01 — do NOT duplicate them here. This page
  reuses that group's `(gated)/layout.tsx` flag gate and `(gated)/error.tsx`.

## Invariants (non-negotiable)
- **Flag:** reachable only where `CAREER_VERTICAL_ENABLED=true` (default OFF in Production). Gate in
  middleware + defensively via the shared `(gated)/layout.tsx` (`isCareerVerticalEnabled()` →
  `notFound()`). Flag off → real HTTP 404.
- **noindex:** whole vertical quarantined (handled by the career layout metadata convention); no
  canonical, no sitemap entry. Do not add indexing.
- **Caching:** static marketing page → `export const revalidate = 3600` (BUILD-RULE R5). NO
  `force-dynamic` — there is no per-viewer or auth state on this page.
- **i18n:** all copy from the `careerVertical.employer.*` dictionary subtree across all 9 locales
  (RTL for `ar`). No hardcoded strings. `setRequestLocale(locale)` + `notFound()` on unknown locale,
  same guard as the health page.
- **Worker NEVER charged (R7):** all pricing/fee/value language is **employer-direction only**. The
  page may name commission vs full-service paths and "you pay only on placement"; it must state
  "free for workers / Employer Pays". No fee/price wording may ever attach to the worker.
- **Routing:** every internal link uses `Link` from `@/i18n/navigation` with route KEYS from
  `lib/kariyer/config.ts` (`CAREER_ROUTES.*`) — never hardcode `/career/...` slugs.

## Accent rule (amber-600 = `brandCareer`, where health uses sky / `brandHealth`)
- Token group `brandCareer` (`DEFAULT #D97706`, `50 #FFFBEB`, `700 #B45309`).
- **Text** uses `brandCareer-700` (AA-safe); `DEFAULT` only for icons / large UI / chip & circle
  backgrounds — same rule as health's `brandHealth-700`.
- Page tint: `bg-brandCareer-50/60 dark:bg-transparent` (mirrors health's `bg-brandHealth-50/60`).
- **CTA gradient buttons:** `from-amber-500 to-amber-600` with `shadow-amber-500/25` (health uses
  teal). Dark parity on every amber surface: `dark:bg-brandCareer/15 dark:text-brandCareer`.
- `<VerticalBrand vertical="career" size="md" />` — already amber-aware.

## Layout (top → bottom, single column, centered like the health home)
1. **Hero** (`max-w-3xl px-4 pb-16 pt-32 text-center`): `<VerticalBrand vertical="career" size="md"
   className="mb-3" />`, an employer-audience eyebrow pill (`careerVertical.employer.eyebrow`,
   amber pill like health's coming-soon badge), serif `h1` = `careerVertical.employer.title`
   (employer value prop — e.g. "Verified, ready-to-deploy workers, fully managed"), subtitle `p` =
   `careerVertical.employer.subtitle`.
2. **Primary CTA row** (under hero): primary button `careerVertical.employer.registerCta` (amber
   gradient) → `CAREER_ROUTES.employerRegister`; secondary ghost/outline button
   `careerVertical.employer.poolCta` ("Browse the talent pool") → `CAREER_ROUTES.pool` (gated by
   login downstream). Stack on mobile, `sm:flex-row`.
3. **Trust strip** (2–3 pills): "Verified by RoNa Legal" (`BadgeCheck`), "Employer Pays / free for
   workers" (`HandCoins` or `ShieldCheck`), "90-day replacement guarantee" (`RefreshCw`). Pills =
   `bg-brandCareer-50 text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer`. Static.
4. **Value-prop / benefits grid** (`max-w-5xl`, `grid sm:grid-cols-2 lg:grid-cols-3` like the health
   specialty grid): 4–6 benefit cards, each an amber-tinted lucide icon + title + one line. Cover:
   verified & curated pool, anonymized browse with anti-leakage gate, full-lifecycle handling
   (legal/permits), 90-day free replacement, escrow-protected fees, human talent matcher. Strings
   from `careerVertical.employer.benefits.*`. Static, no data.
5. **3-step "How it works" (employer lens)** (`max-w-5xl`): three numbered amber circles
   (`bg-brandCareer-50 text-brandCareer-700`), stack on mobile, connector chevrons on desktop:
   (1) Submit your requirement → (2) RoNa Legal curates a verified shortlist → (3) Reveal identity
   after approval + you pay. Footer link "How it works in full" → `CAREER_ROUTES.howItWorks`.
6. **Pricing-paths band** (`max-w-3xl`, two cards): commission-only vs full-service — labels + one
   line each, "you pay only on successful placement" framing. Employer-direction money language
   ONLY (R7). No numbers required; copy from `careerVertical.employer.pricing.*`.
7. **Closing CTA band** (`max-w-3xl text-center`): repeat the primary
   `careerVertical.employer.registerCta` amber-gradient button → `CAREER_ROUTES.employerRegister`,
   with a one-line reassurance subtitle. Gives the page a bottom conversion point.

## UI states
- **Loading:** shared `(gated)/loading.tsx` neutral pulse skeleton (Suspense during navigation; this
  page itself does no async read, so it resolves immediately).
- **Empty:** N/A — page is fully static, no list that can be empty. Never renders a broken section.
- **Error:** any unexpected render throw bubbles to the shared `(gated)/error.tsx` (graceful screen
  + amber retry). Never a blank page or fake 404.
- **Success:** the full page as laid out above (hero → CTA → trust → benefits → how-it-works →
  pricing → closing CTA).
- **Locked:** this page is public marketing — it does NOT show locked worker data. The "locked"
  gate affordance lives on `/career/pool` + the reveal-unlock flow; here, the `poolCta` simply links
  there (login is enforced downstream, not on this page).

## Data the page needs (UX level, not field names)
- **None from the database.** Entirely static marketing copy + icons. Do NOT call the sectors
  read-RPC or the showcase view here (those belong to spec 01 / the pool). Keeping it data-free is
  what lets it stay `revalidate=3600` and leak nothing.
- All text resolves from the `careerVertical.employer.*` dictionary subtree for the active locale.

## Edge cases
- Unknown/unsupported locale → `notFound()` (same guard as the health page).
- RTL (`ar`): hero, CTA row, trust strip, benefits grid, 3-step diagram, and pricing cards must
  mirror correctly (logical-direction classes; no hardcoded left/right). The how-it-works connector
  chevrons must flip direction in RTL.
- Flag flips OFF after the page is in an ISR cache → middleware + `(gated)/layout.tsx` 404 ahead of
  render; the cached HTML is never served.
- Dark-mode parity for every amber surface, matching the health page's dark variants 1:1.
- Money language: every pricing/fee phrase is employer-direction. Audit the final copy so no string
  implies a worker pays anything (R7).
- The `employerJoin` header link already points at `CAREER_ROUTES.employer` (this page); if a
  dedicated apply route ships later, only that one constant in `lib/kariyer/config.ts` changes — do
  not hardcode the register slug in the header for it.

## Deps that must exist first (reference, do not block)
- `lib/kariyer/config.ts` (`CAREER_ROUTES.employer`, `employerRegister`, `pool`, `howItWorks`) — present.
- `lib/kariyer/flags.ts` (`isCareerVerticalEnabled`) — present.
- `brandCareer` tailwind token — present. `VerticalBrand` career support — present.
- Shared `(gated)/layout.tsx` + `loading.tsx` + `error.tsx` (spec 01) — must land with/before this page.
- Needed but NOT yet present: `careerVertical.employer.*` dictionary keys in all 9 locales (RTL `ar`);
  `/career/employer` route key registered in `i18n/routing.ts` pathnames (R14 ordering).
