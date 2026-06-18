# Spec 08 — WatermarkedPhoto (showcase work-photo thumbnail)

> Docs-only build spec. The downstream agent writes the code. Read alongside
> `career-vertical-plan-v1.md` (PART 3 "Document upload + visibility", PART 4) and
> `BUILD-RULES.md` (R6 is load-bearing). This is the shared presentational component the pool
> card (Spec 05) and the worker detail page (Spec 06) both reference as the "face-blurred +
> watermarked work-photo thumb" — neither defines it; THIS spec does.

## What this is / phase-1 deferral (read first)
- **Phase-1 placeholder.** Real ML face-blur is DEFERRED. In Phase 1 the "blur" is a pure CSS
  effect (`filter: blur(...)`) applied client-side over the showcase variant, plus a baked-in
  text watermark "Glatko · RoNa Legal". This is cosmetic deterrence, **not** identity protection
  — a CSS blur is trivially reversible by removing the style. So:
  - The component MUST NOT receive or render a non-showcase / gated-original URL. It only ever
    renders an already-derived `public_anonymized` showcase variant (BUILD-RULES R6: the signer
    rejects any other path). The real privacy boundary is the VIEW + signer, never this CSS.
  - Document the deferral inline in the component with a `// PHASE-1:` comment so nobody mistakes
    the CSS blur for the face-blur control. Server-side ML face-blur + watermark baking into the
    derived variant is a later document/upload-pipeline task (PART 3), tracked separately.

## Mirror target
- **Closest health analog:** the avatar block in `components/glatko-saglik/ProviderCard.tsx`
  (lines 56–68) — `photoUrl ? <Image .../> : <initials tile>`. We mirror its rounded-tile shape,
  object-cover fit, and the `bg-brand{X}-50 / text-brand{X}-700` fallback, swapping `brandHealth`
  → `brandCareer`. We deliberately DIVERGE on the `<img>` element (see below).
- **New file:** `components/glatko-kariyer/WatermarkedPhoto.tsx`.
- Imported by `WorkerCard.tsx` (Spec 05, thumbnail size) and the detail page's photo strip
  (Spec 06 §5, larger size). One component, size-parameterized.

## Element choice — plain `<img>`, NOT `next/image` (deliberate divergence)
ProviderCard uses `next/image`; this component uses a plain `<img>`. Reasons, document in a
comment:
1. Showcase variants are served via short-lived/dynamic signed URLs (per-session, R5/R6) — they
   are not stable, optimizable, cacheable origins `next/image` expects; routing them through the
   Next optimizer adds a caching layer we explicitly do not want on per-viewer gated pages.
2. The whole point is a degraded, watermarked render — we do not want Next generating crisp
   responsive `srcset` variants of a photo we are intentionally obscuring.
3. Pool/detail pages are `force-dynamic` + `noindex`; image-optimization SEO/LCP wins don't apply.
Use `loading="lazy"`, explicit `width`/`height` (or aspect-box) to avoid layout shift, and
`draggable={false}` + `onContextMenu` prevention as light deterrence (not security).

## Layout / structure
A single relatively-positioned tile (`position: relative; overflow: hidden; rounded-xl`):
1. **Base layer** — the `<img>` showcase variant, `object-cover`, filling the tile, with the CSS
   blur filter (e.g. `blur-[3px]` thumbnail / a touch stronger on the larger detail size; tune so
   the silhouette reads but the face does not).
2. **Watermark overlay** — an absolutely-positioned layer over the image rendering the text
   "Glatko · RoNa Legal", repeated/tiled or diagonally centered, semi-transparent
   (`text-white/70` with a subtle dark scrim behind for legibility on any photo),
   `pointer-events-none`, `select-none`. Even if the variant already has a baked watermark, this
   CSS overlay is the visible guarantee in Phase 1 and carries the per-session id (below).
3. **Optional per-session dynamic watermark** — accept an optional `viewerId` prop; when present,
   append/replace the overlay text with the employer/session id (PART 4 best-practice; this is why
   the host pages are `force-dynamic`). Absent → static brand watermark only.
4. **Accent frame** — thin `ring-1 ring-brandCareer-50` (or a `border-brandCareer/20`) to tie it
   to the vertical; amber is wayfinding-only here, never the dominant color of the tile.

## Sizes (one component, `size` prop)
- `thumb` — card use (Spec 05): ~`h-16 w-16` … up to a `~96px` card hero, square, `rounded-xl`.
- `detail` — strip use (Spec 06 §5): larger (e.g. `h-40`+, possibly `aspect-[4/3]`), `rounded-2xl`.
Pass size as a prop/variant; do not fork into two components.

## Every UI state
- **loading** — while the `<img>` loads: a neutral gray shimmer block at the tile's dimensions
  (mirror the health skeleton tone; no amber). Reserve the box so there is no layout shift.
- **empty / no photo** — worker has no showcase photo variant: render the **initials-style /
  placeholder fallback tile** in `bg-brandCareer-50 text-brandCareer-700` (mirror ProviderCard's
  fallback), e.g. a generic `User`/`UserRound` lucide glyph (NOT initials of a name — we have no
  name; use the icon or the worker code's leading token). Watermark overlay is omitted on the
  fallback (nothing to protect). This is the common Phase-1 state.
- **error / broken image** — `onError` swaps to the same fallback tile as the empty state; never
  show a broken-image icon, never retry against an original. Log nothing PII.
- **success** — blurred showcase variant + watermark overlay + amber frame.
- **locked** — there is no separate "locked" visual: the blurred+watermarked render IS the locked
  presentation. There is NO un-blurred/un-watermarked variant of this component — the original is
  only ever revealed in the employer dashboard after owner-approval + payment, via a different
  render path entirely. This component must have no prop or branch that yields a clean original.

## Amber-accent usage (`brandCareer`, swaps health's `brandHealth`)
- Fallback tile bg/text: `bg-brandCareer-50` / `text-brandCareer-700` (mirror health fallback).
- Frame ring/border: amber at low opacity only.
- Watermark text stays white-on-scrim for legibility (NOT amber).
- Never use amber for body text or as the tile's fill; it is wayfinding only (the 50/DEFAULT/700
  ramp is the only career ramp in `tailwind.config.ts` — do not invent shades).

## Data it needs (UX level — not exact field names)
Props the host passes down (the page/card already fetched these from the showcase VIEW/RPC; this
component fetches nothing):
- the showcase-variant image URL (already a derived `public_anonymized` blurred/watermarked
  variant — may be null/absent → fallback state).
- a non-identifying alt text (use the worker code or a generic localized "worker photo" string —
  NEVER a name; there is no name on this surface).
- `size` variant (`thumb` | `detail`).
- optional `viewerId` (employer/session id) for the per-session watermark.
- localized labels (alt text, fallback label) passed in — keep this a pure presentational
  component with no `useTranslations` of its own where the parent already owns the translator
  (mirror ProviderCard's `labels` prop pattern). Copy lives under `careerVertical.*` (9-locale
  nested parity, BUILD-RULES R8 #7).

## Edge cases
- **Never an original.** The component must reject (or simply never be handed) a gated-original
  path. Guard at the host (Spec 05/06 only pass showcase variant URLs); add a comment that R6's
  `signShowcaseVariant` already enforces `visibility = 'public_anonymized'` upstream — this
  component trusts that contract and does not sign or fetch anything.
- **CSS-blur is reversible** — explicitly comment that Phase-1 blur is deterrence only; the
  identity gate is the DB VIEW + signer, not this CSS (so a future reviewer doesn't "harden" it
  by adding more CSS instead of shipping the ML pipeline).
- **RTL (`ar`)** — diagonal/tiled watermark must look correct mirrored; the tile + overlay are
  symmetric so this is mostly free, but verify the watermark text isn't clipped/inverted.
- **No PII in DOM** — alt text, title, and any data-* attribute must contain zero name/contact;
  only the worker code or a generic string (supports BUILD-RULES R8 #9: no name/contact in page
  text or props).
- **Dark mode** — fallback tile gets a `dark:` variant like ProviderCard
  (`dark:bg-brandCareer/15 dark:text-brandCareer`); scrim behind the watermark must stay legible
  on dark too.
- **`force-dynamic` host** — because the per-session watermark personalizes the render, the host
  pages are `force-dynamic` and uncached (R5); this component itself is stateless but must not be
  memoized/cached in a way that would share one employer's watermark with another.
