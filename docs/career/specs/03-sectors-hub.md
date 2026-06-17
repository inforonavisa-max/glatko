# Spec 03 — Sectors Hub (`/career/sectors`)

> Build spec for the career Sectors hub: a tile grid of the seeded sectors
> (Construction + Hospitality) that links into each sector's detail page.
> Mirrors the HEALTH directory home. Accent **amber-600 (`brandCareer`)** wherever
> health uses sky/teal (`brandHealth`). Flag `CAREER_VERTICAL_ENABLED` default OFF;
> `noindex` + middleware-gated like Health. Read `BUILD-RULES.md` + the SSOT first.

## Mirror source (read these before writing code)
- **Page to mirror:** `app/[locale]/health/(gated)/page.tsx` (the health directory
  home = its sector/tile grid). Reuse its layout, tile markup, ISR cadence.
- **Co-located states:** `app/[locale]/health/(gated)/loading.tsx`,
  `.../error.tsx` — mirror both 1:1 (swap teal→amber on the error retry button).
- **Detail target (separate spec):** `app/[locale]/health/(gated)/[specialty]/page.tsx`.
- **Brand lockup:** `components/glatko/verticals/VerticalBrand.tsx` — already
  supports `vertical="career"` (renders `brandCareer-700` word). Use as-is.
- **Icons:** `lib/kariyer/category-icons.ts` → `sectorIcon(slug)` (already maps
  `construction`→HardHat, `hospitality`→ConciergeBell, default Briefcase).
- **Routes constant:** `lib/kariyer/config.ts` → `CAREER_ROUTES.sectors`.

## Target file
`app/[locale]/career/(gated)/sectors/page.tsx` (Server Component, `async`).

## Prerequisites the implementer must confirm exist (NOT this page's job to create)
- **Routing keys:** `/career/sectors` and `/career/sectors/[sector]` must be
  registered in `i18n/routing.ts` `pathnames` (9 localized slugs, e.g.
  `tr: /kariyer/sektorler`). Today only `/career` exists — coordinator adds these
  per R14 ordering. If missing, the typed `Link` href won't compile.
- **Data layer:** a `server-only` query module `lib/kariyer/queries.ts` exposing
  `listSectors(locale)` over a **SECURITY DEFINER read-RPC** (mirror
  `lib/saglik/queries.ts:listSpecialties`; career schema is NOT on PostgREST).
  Returns published sectors only, localized name from `name_jsonb`. Seed lives in
  `078_career_c0_seed.sql` (Construction, Hospitality).

## Data needed (UX level — not field names)
Per sector tile: a **stable slug** (for icon lookup + the detail link) and a
**localized display name** (resolved from the seed's per-locale name map for the
active locale). Nothing private, nothing gated — this is pure public marketing
taxonomy. No counts/availability needed for v1.

## Layout (top → bottom)
1. **Page wrapper** tinted `bg-brandCareer-50/60 dark:bg-transparent`.
2. **Hero** (centered, `max-w-3xl`, `pt-32`): `<VerticalBrand vertical="career" />`
   + serif `h1` (sectors hub title) + muted subtitle. **No inert search form**
   here (health's home has one; the sectors hub is taxonomy-only — keep it lean).
3. **Tile grid** (`max-w-5xl`, responsive `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`,
   `gap-3`): one tile per sector. Each tile = typed `Link` to
   `{ pathname: "/career/sectors/[sector]", params: { sector: slug } }`,
   `group` card (`rounded-xl border bg-white p-4 hover:shadow-premium-sm`), an
   icon chip + the localized name. Icon: `const Icon = sectorIcon(s.slug)`.

## Amber-accent usage (the only color rule that matters)
Everywhere health's tile uses `brandHealth`, use `brandCareer`:
- Icon chip bg: `bg-brandCareer-50 dark:bg-brandCareer/15`.
- Icon glyph: `text-brandCareer` (chip), `h-5 w-5`.
- Hero word: handled by `VerticalBrand` (`brandCareer-700`, already AA-safe).
- Error-state retry button gradient: amber (`from-amber-500 to-amber-600`,
  `shadow-amber-500/25`) — health uses teal there.
- Neutral text/borders (gray-200, gray-900, dark:white/10) stay neutral — do NOT
  amber-tint body text or card borders; accent is chips/word/CTA only (§1.5 AA).

## UI states
- **Loading:** mirror `loading.tsx` — pulsing neutral skeleton (title bars + a
  grid of ~6 `h-16 rounded-xl` blocks). No amber in the skeleton.
- **Success (≥1 sector):** the tile grid above. Expected v1 = exactly 2 tiles.
- **Empty (0 published sectors):** designed dashed-border empty card (mirror the
  detail page's empty state: `SearchX` icon + title + body), NOT a blank grid or
  fake tile. Only reachable if the seed didn't apply — copy: "sectors coming soon."
- **Error:** the thrown read-RPC failure lands in the co-located `error.tsx`
  boundary (graceful screen + retry). Mirror health's; never let it 500 or look
  like an empty/404.
- **Locked / flag-off:** there is NO in-page locked state. The whole `(gated)`
  route group is quarantined by middleware when `CAREER_VERTICAL_ENABLED` is OFF:
  the route returns a real **HTTP 404** and `/career/coming-soon` is served
  instead. This page assumes it only renders when the flag is ON. Do not add a
  flag check inside the page.

## Rendering / metadata
- `export const revalidate = 3600;` — static marketing page, ISR-cached (BUILD-RULES
  R5: only `/career/pool*` is `force-dynamic`; the sectors hub is NOT).
- **No `generateStaticParams`** (read-RPC fetch is non-cacheable → would trigger
  `DYNAMIC_SERVER_USAGE` on prod build) — mirror the health home comment exactly.
- `generateMetadata`: title from the career dictionary; the gate already injects
  `noindex` for the vertical — do not hand-set robots here (mirror health).
- Locale guard at top: `if (!hasLocale(routing.locales, locale)) notFound();`
  then `setRequestLocale(locale)` (mirror health home lines 39-42).

## i18n
- All copy from a nested `careerVertical.sectors.*` subtree (title, subtitle,
  `browseBySectorsHeading`, `emptyTitle`, `emptyBody`, `errorTitle`/`errorBody`/
  `retry` for the error boundary) across **all 9 dictionaries** — deep parity
  required (CI checks top-level only; R8 test #7 deep-diffs this subtree).
- Sector **names** come from the DB `name_jsonb`, NOT the dictionary.
- `ar` is RTL — rely on the existing dir handling; do not hardcode `ml-/mr-`,
  prefer logical `gap`/`flex` (the mirrored health markup is already RTL-safe).

## Edge cases / gotchas
- **Unmapped sector slug** → `sectorIcon()` already falls back to `Briefcase`; a
  new seeded sector never breaks the grid (no code change needed to add one).
- **Detail-page slug validation** is the detail page's responsibility (unknown
  `[sector]` → `notFound()`); the hub only links slugs the query returned, so no
  dead links from here.
- **Single-sector launch:** plan §5 may launch Construction only. The grid must
  render cleanly with 1 tile (no min-count assumption, no "needs ≥2" layout bug).
- **Do not** reach into `career` schema via `supabase.from()` — all reads through
  `lib/kariyer/queries.ts` (server-only) so the service-role key never bundles
  client-side (R1 / health architecture note).
