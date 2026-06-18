# Spec 02 — Career "How It Works" page

> Build spec for the gated-model explainer page. Docs only. Read alongside
> `docs/career/career-vertical-plan-v1.md` (PART 2 §page-2, PART 4) and
> `docs/career/BUILD-RULES.md`. Mirrors the HEALTH vertical's marketing-page
> conventions; accent **amber-600** (`brandCareer`) wherever health uses sky-600
> (`brandHealth`). Default-OFF, noindex, gated.

## What to build

Route: `/career/how-it-works` (next-intl key `CAREER_ROUTES.howItWorks`; localizes
per-locale, e.g. `/kariyer/nasil-calisir`). A **static marketing page** (no auth,
no DB writes) explaining BOTH lifecycle paths transparently, the two revenue paths,
and the Employer-Pays guarantee. Pure content + internal CTAs.

## Files to mirror (read these)

- **Page chrome / metadata / ISR**: `app/[locale]/health/(gated)/page.tsx` — copy the
  `generateMetadata` + `hasLocale` guard + `setRequestLocale` + `revalidate = 3600`
  shape (BUILD-RULES R5: static marketing pages keep `revalidate=3600`, NOT
  force-dynamic). This page reads no auth/cookies, so it stays static.
- **Gate/flag/noindex placement**: this page lives INSIDE the career `(gated)` route
  group, whose `layout.tsx` mirrors `app/[locale]/health/(gated)/layout.tsx`
  (`if (!isCareerVerticalEnabled()) notFound()` — defense-in-depth behind middleware).
  Do NOT add a flag check in this page itself; the group layout owns it.
- **Step-card visual layout**: `app/[locale]/how-it-works/page.tsx` (the services-side
  page) — numbered step cards in a `sm:grid-cols-3`, eyebrow pill, serif hero, gradient
  top-glow, bottom CTA band. Reuse this structure; swap teal/indigo → amber.
- **Sub-brand lockup**: `components/glatko/verticals/VerticalBrand.tsx` with
  `vertical="career"` (already wired to `brandCareer`). Use for the hero brand line.
- **Locked-state visual reference** (for the "what stays locked until unlock" panel):
  the coming-soon/locked treatment in `app/[locale]/health/coming-soon/page.tsx`.

## Layout (top → bottom)

1. **Top glow + hero** — amber gradient (`from-brandCareer/[0.10] … to-transparent`),
   `VerticalBrand vertical="career"`, eyebrow pill, serif H1, subtitle. One sentence
   restating the model: a verified, anonymized talent pool with a human matcher
   (RoNa Legal) gating identity until the employer pays.
2. **Employer path** (primary, 8 numbered steps): browse anonymized pool → create
   requisition → owner curates a shortlist → express interest → owner approves →
   pay (commission or service fee) → identity/docs unlock → placement + 90-day
   guarantee. Numbered step cards, amber number badges + amber step icons.
3. **Worker path** (6 steps, distinct sub-section): register + consent → build profile
   → upload docs + per-document consent → owner verifies & badges → showcased
   anonymously → matched (owner brokers all contact). Same card style, clearly
   labeled as the worker journey.
4. **Two revenue paths** — two side-by-side cards: **Commission-only** vs
   **Full-service**. Plain-language difference (what the owner handles, when the fee
   applies). Employer-facing copy only.
5. **Employer-Pays banner** — a prominent amber callout stating workers are NEVER
   charged (ILO Employer Pays; MNE law). This is load-bearing per BUILD-RULES R7 —
   no fee/price wording may appear on any worker step.
6. **Trust strip** — "Verified by RoNa Legal" + "90-day free replacement guarantee" +
   "Employer Pays" chips (mirror landing trust strip).
7. **Dual CTA band** — two buttons: employer → `CAREER_ROUTES.employer`
   (amber primary, "Talep Oluştur"/"Create Requisition"); worker → `CAREER_ROUTES.worker`
   (amber outline/secondary, "Profil Oluştur"/"Create Profile"). Use `Link` from
   `@/i18n/navigation` with route keys — never hardcode localized slugs.

## Amber-accent usage (sky-600 → amber-600 substitution map)

- Eyebrow pill bg/border/text: `bg-brandCareer-50 border-brandCareer-50 text-brandCareer-700`
  (dark: `bg-brandCareer/15 text-brandCareer`).
- Step number badges: amber gradient `from-brandCareer to-brandCareer-700` (health uses
  the teal gradient on the services page).
- Step icons + accent text: `text-brandCareer` (dark) / `text-brandCareer-700` (light,
  AA-safe — DEFAULT amber-600 is below the 4.5:1 text floor, exactly like sky-600).
- Primary CTA: amber gradient button; secondary/worker CTA: amber outline.
- Page wash + top glow: `bg-brandCareer-50/60` / `from-brandCareer/[0.10]`.
- NO new hex literals — use the `brandCareer` token group only (CAREER_ACCENT_TOKEN).

## UI states

- **Loading**: none needed — fully static, no async data fetch. (If a placement-stats
  block is added later it must degrade silently like health's counts `try/catch`.)
- **Empty**: N/A — all copy is static i18n; no list can be empty.
- **Error**: inherit the `(gated)` group `error.tsx` (mirror
  `app/[locale]/health/(gated)/error.tsx`). Page renders no throwing data path itself.
- **Success / default**: the rendered explainer above.
- **Locked**: this page does not gate content per-viewer, but it DESCRIBES the gate.
  Include a small "what unlocks after approval + payment" panel (locked-look styling,
  lock icon, amber accents) listing the gated dossier (full name, contact, exact
  location, passport/ID, original cert files, un-blurred photos) vs what is shown
  anonymously (worker code, role/tier, region, skill/cert badges, readiness, blurred
  watermarked photos). Visual only — no real data, no signed URLs.
- **Flag-OFF (prod)**: the whole route returns a real **HTTP 404** (middleware +
  `(gated)` layout `notFound()`), per BUILD-RULES R8 #8. The only career route that
  stays 200 while dark is `/career/coming-soon` — NOT this page.

## Data it needs (UX level)

None at runtime. All text from the `careerVertical.howItWorks` i18n subtree across
all 9 dictionaries (deep-diff parity required — BUILD-RULES R8 #7; CI `i18n-check.sh`
only checks top-level keys). The two revenue-path descriptions, every step title/body,
the Employer-Pays statement, and the gated-vs-anonymized lists are all static strings.
RTL required for `ar`. No private columns, no RPCs, no auth on this surface.

## Edge cases

- **Worker-side copy must contain zero fee/price language** (R7) — reviewer check.
- **noindex**: this page is inside the gated group → never indexed; do NOT add
  `buildAlternates()` or `robots:{index:true}` (unlike the services `/how-it-works`,
  which IS public). Set `robots: { index: false, follow: false }` or rely on the
  global gated-group noindex convention used by health gated routes.
- **CTA hrefs** resolve through `CAREER_ROUTES` keys + `@/i18n/navigation` `Link`
  only; a future carve-out (`CAREER_HOST`) must not require touching this page.
- **Symmetric gate** must be stated in the worker path: the worker never sees employer
  contact pre-placement; the owner brokers all contact (PART 4 step 5).
- **Reachable only when `CAREER_VERTICAL_ENABLED=true`** (Preview/Dev on, Prod off).
