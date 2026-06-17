# Spec 17 — Worker Landing (free-for-you, Employer Pays)

> Build spec for the İş & Kariyer **worker** landing surface (supply side). Read
> `docs/career/BUILD-RULES.md` + `docs/career/career-vertical-plan-v1.md` (PART 2 §"Page-by-page"
> item 1 + nav "Worker nav"; PART 4 Employer Pays; R7) first. Docs-only: NO app/lib/SQL code here.
> This is the conversion funnel for workers → register ("Profil Oluştur"). It is **fully static**
> (zero DB reads, zero auth). Sibling of `10-employer-landing.md` (same shape, mirrored audience):
> employer-landing sells curation + pricing; this one sells "free for you, the employer pays, build
> a portable verified profile." The two CTAs are inverted — this page leads with `workerRegister`.

## Route & file
- **Create:** `app/[locale]/career/(gated)/worker/page.tsx` (route key `CAREER_ROUTES.worker`).
- **Mirror of:** `app/[locale]/health/(gated)/page.tsx` — copy its static marketing structure
  (page tint wrapper, `max-w-3xl` centered hero, serif `h1`, `max-w-5xl` section grids). This page
  has NO search form and NO read-RPC — simpler than the health home, like spec 10.
- Boundary files (`(gated)/layout.tsx` gate, `loading.tsx`, `error.tsx`) are shared with the rest of
  `app/[locale]/career/(gated)/` and are defined in spec 01 — do NOT duplicate them here.

## Invariants (non-negotiable)
- **Flag:** reachable only where `CAREER_VERTICAL_ENABLED=true` (default OFF in Production). Gated in
  middleware + defensively via the shared `(gated)/layout.tsx` (`isCareerVerticalEnabled()` →
  `notFound()`). Flag off → real HTTP 404 (not a 200 body — R-tests #8).
- **noindex:** whole vertical quarantined (career layout metadata convention); no canonical, no
  sitemap. Do not add indexing.
- **Caching:** static marketing page → `export const revalidate = 3600` (R5). NO `force-dynamic` —
  no per-viewer or auth state on this page. Even logged-in workers see the same render (the
  "you're already showcased" state lives on the worker **dashboard**, spec for `/career/worker/dashboard`,
  not here).
- **i18n:** all copy from the `careerVertical.worker.*` dictionary subtree across all 9 locales (RTL
  for `ar`). No hardcoded strings. `setRequestLocale(locale)` + `notFound()` on unknown locale, same
  guard as the health page.
- **R7 — worker is NEVER charged:** this page is the loudest place that promise is made. ZERO
  fee/price/payment/commission wording may attach to the worker. Affirmative "free for you / always
  free / the employer pays the fee" framing only. Do not even show the employer-side pricing paths
  here — that copy lives on spec 10. Audit every final string against R7.
- **Routing:** every internal link uses `Link` from `@/i18n/navigation` with route KEYS from
  `lib/kariyer/config.ts` (`CAREER_ROUTES.*`) — never hardcode `/career/...` slugs.

## Accent rule (amber-600 = `brandCareer`, where health uses sky / `brandHealth`)
- Token group `brandCareer` (`DEFAULT #D97706`, `50 #FFFBEB`, `700 #B45309`).
- **Text** uses `brandCareer-700` (AA-safe). `DEFAULT` only for icons / large UI / chip & circle
  backgrounds — same rule as health's `brandHealth-700`.
- Page tint: `bg-brandCareer-50/60 dark:bg-transparent` (mirrors health's `bg-brandHealth-50/60`).
- **CTA gradient buttons:** `from-amber-500 to-amber-600` with `shadow-amber-500/25` (health uses
  teal/`from-teal-500 to-teal-600`). Dark parity on every amber surface:
  `dark:bg-brandCareer/15 dark:text-brandCareer`.
- `<VerticalBrand vertical="career" size="md" />` — already amber-aware (no change needed).

## Layout (top → bottom, single column, centered like the health home)
1. **Hero** (`max-w-3xl px-4 pb-16 pt-32 text-center`): `<VerticalBrand vertical="career" size="md"
   className="mb-3" />`, a worker-audience eyebrow pill (`careerVertical.worker.eyebrow` — e.g.
   "For workers · Always free", amber pill like health's coming-soon badge with a `HandCoins`/
   `BadgeCheck` icon), serif `h1` = `careerVertical.worker.title` (e.g. "Get hired abroad — free for
   you, fully managed"), subtitle `p` = `careerVertical.worker.subtitle`.
2. **Primary CTA row** (under hero, stack on mobile → `sm:flex-row`): primary amber-gradient button
   `careerVertical.worker.registerCta` = **"Profil Oluştur"** → `CAREER_ROUTES.workerRegister`;
   secondary ghost/outline button `careerVertical.worker.howItWorksCta` ("How it works for workers")
   → `CAREER_ROUTES.howItWorks`.
3. **Employer-Pays banner (PROMINENT — the signature element of this page)**: a full-width amber-
   tinted callout card (`bg-brandCareer-50 dark:bg-brandCareer/10`, `BadgeCheck`/`HandCoins` icon)
   directly under the CTA row, NOT buried in a grid. Headline `careerVertical.worker.employerPays.title`
   ("You never pay a fee") + one line `careerVertical.worker.employerPays.body` stating the employer
   covers all recruitment costs (ILO Employer Pays). This is more visually weighted than the trust
   strip — it is the page's core promise.
4. **Trust strip** (2–3 pills under the banner): "Verified by RoNa Legal" (`BadgeCheck`), "Your data
   stays private until you approve" (`ShieldCheck`/`Lock`), "Portable verified credential" (`IdCard`).
   Pills = `bg-brandCareer-50 text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer`. Static.
5. **Worker benefits grid** (`max-w-5xl`, `grid sm:grid-cols-2 lg:grid-cols-3` like the health
   specialty grid): 4–6 cards, each an amber-tinted lucide icon + title + one line. Cover: always
   free / employer pays; build a portable verified profile (credential vault); anonymized by default —
   identity revealed only with your consent + RoNa approval; one point of contact (RoNa handles
   employers, you never chase anyone); legal/permit handling done for you; readiness score boosts
   your visibility. Strings from `careerVertical.worker.benefits.*`. Static, no data.
6. **3-step "How it works (worker lens)"** (`max-w-5xl`): three numbered amber circles
   (`bg-brandCareer-50 text-brandCareer-700`), stack on mobile, connector chevrons on desktop:
   (1) Create your profile + upload docs (free) → (2) Get verified by RoNa Legal & showcased
   anonymously → (3) An employer expresses interest → RoNa contacts you → matched. Footer link
   "How it works in full" → `CAREER_ROUTES.howItWorks`. RTL: chevrons flip.
7. **Privacy / consent reassurance band** (`max-w-3xl`): short line that the worker controls
   per-document consent and full identity/contact is shared ONLY after the worker approves and the
   employer is approved by RoNa (symmetric gate — PART 4). Reinforces the anonymized-by-default model.
8. **Closing CTA band** (`max-w-3xl text-center`): repeat the primary **"Profil Oluştur"** amber-
   gradient button → `CAREER_ROUTES.workerRegister`, with a one-line reassurance subtitle restating
   "free for you, always." Bottom conversion point.

## UI states
- **Loading:** shared `(gated)/loading.tsx` neutral pulse skeleton (Suspense during navigation; this
  page does no async read, so it resolves immediately).
- **Empty:** N/A — fully static, no list that can be empty. Never renders a broken section.
- **Error:** any unexpected render throw bubbles to the shared `(gated)/error.tsx` (graceful screen +
  amber retry). Never a blank page or fake 404.
- **Success:** the full page as laid out above (hero → CTA → Employer-Pays banner → trust → benefits
  → how-it-works → privacy → closing CTA).
- **Locked:** this is public worker-marketing — it shows NO locked/gated data and no worker dossier.
  No reveal-unlock affordance lives here (those are on `/career/pool` + the unlock flow). Logged-in
  vs anonymous render identically (no auth read — keeps `revalidate=3600`).

## Data the page needs (UX level, not field names)
- **None from the database.** Entirely static marketing copy + icons. Do NOT call the sectors
  read-RPC, the showcase view, or any worker RPC here. Keeping it data-free is what lets it stay
  `revalidate=3600`, leak nothing, and avoid `auth.getUser()` (which would force `force-dynamic`).
- All text resolves from the `careerVertical.worker.*` dictionary subtree for the active locale.

## Edge cases
- Unknown/unsupported locale → `notFound()` (same guard as the health page).
- RTL (`ar`): hero, CTA row, Employer-Pays banner, trust strip, benefits grid, 3-step diagram, and
  closing band must mirror correctly (logical-direction classes; no hardcoded left/right). The
  how-it-works connector chevrons must flip direction in RTL. The `ar`/source-region languages are
  the primary worker-facing locales (plan §"Brand & system inheritance"), so RTL is load-bearing here.
- Flag flips OFF after the page is in an ISR cache → middleware + `(gated)/layout.tsx` 404 ahead of
  render; the cached HTML is never served.
- Dark-mode parity for every amber surface, matching the health page's dark variants 1:1.
- **R7 audit:** every string is worker-direction. No phrase may imply the worker pays, owes, or is
  charged anything. Do not import employer pricing/commission copy onto this page.
- The header's `workerJoin` link already points at `CAREER_ROUTES.worker` (this page). If a dedicated
  worker-apply route ships later, only that one constant in `lib/kariyer/config.ts` changes — do not
  hardcode the register slug in the header for it.

## Deps that must exist first (reference, do not block)
- `lib/kariyer/config.ts` (`CAREER_ROUTES.worker`, `workerRegister`, `howItWorks`) — present.
- `lib/kariyer/flags.ts` (`isCareerVerticalEnabled`) — present.
- `brandCareer` tailwind token — present. `VerticalBrand` career support — present.
- Shared `(gated)/layout.tsx` + `loading.tsx` + `error.tsx` (spec 01) — must land with/before this page.
- Needed but NOT yet present: `careerVertical.worker.*` dictionary keys in all 9 locales (RTL `ar`),
  including `employerPays.title`/`employerPays.body` (R-tests #7 deep-diffs this subtree across all
  9 dictionaries — keep it parity-complete); `/career/worker` route key registered in
  `i18n/routing.ts` pathnames (R14 ordering).
