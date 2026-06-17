# Spec 04 — Sector Detail page (`/career/sectors/[sector]`)

> Build spec for a downstream implementation agent. Docs only — this file writes no code.
> Read first: `docs/career/career-vertical-plan-v1.md` (SSOT) + `docs/career/BUILD-RULES.md`.

## What this surface is
The sector detail page: a sector intro header, the trades within that sector, and a
**filtered anonymized worker grid** (workers whose `trade`/`role` belongs to this sector),
with a designed soft-fail empty state when the pool has no matching workers yet.

## Mirror target (read it line-by-line)
`app/[locale]/health/(gated)/[specialty]/page.tsx` — the health specialty-list page. This
career page is the structural twin: validate the dynamic segment → 404 on unknown, render a
back-link + icon + title header, then either a designed empty state or a results grid.

Supporting mirrors:
- Card: `components/glatko-saglik/ProviderCard.tsx` → new `components/glatko-kariyer/WorkerCard.tsx` (anonymized).
- Route group shell (reuse, do NOT recreate): `app/[locale]/health/(gated)/{layout,loading,error}.tsx`
  → the career `(gated)` group must have the same three files (flag-off `notFound()` layout,
  neutral skeleton `loading.tsx`, retry `error.tsx`).

## File to create
`app/[locale]/career/(gated)/sectors/[sector]/page.tsx` (server component, async).
The static sectors **hub** (`/career/sectors`, spec 03) stays `revalidate=3600`. This detail
page renders a per-viewer anonymized grid → per **BUILD-RULES R5**, set `export const dynamic = "force-dynamic"`
(do NOT use `revalidate` here — never ISR-cache an employer-personalized grid). `noindex` is
inherited from the vertical's middleware quarantine; do not add SEO metadata beyond `title`.

## Layout (top → bottom), all amber accent
Container identical to health: `mx-auto max-w-3xl px-4 pb-24 pt-28`, wrapper bg
`bg-brandCareer-50/40 dark:bg-transparent`.
1. **Back-link** to `/career/sectors` (NOT `/career`): `ChevronLeft` + "All sectors" label,
   `text-brandCareer-700 hover:underline dark:text-brandCareer`. (Health links to `text-teal-600`;
   career uses the amber-600 token — `-700` for text per the AA contrast note in tailwind.config.ts,
   the bare `brandCareer` DEFAULT is icons/large-UI only, never label text.)
2. **Sector header**: icon tile (`sectorIcon(sector)` from `lib/kariyer/category-icons.ts`) in
   `h-12 w-12 rounded-xl bg-brandCareer-50 dark:bg-brandCareer/15`, icon `text-brandCareer`; beside it
   the localized sector name as `font-serif text-3xl font-light` h1 + a one-line sector intro subtitle.
3. **Trades-within-sector row** (this is the career-specific addition vs health): a horizontal
   wrap of trade chips (e.g. Mason, Welder, Electrician for Construction). Each chip = `tradeIcon(slug)`
   + label, amber pill (`bg-brandCareer-50 text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer`).
   Clicking a chip is a client-side filter that narrows the grid below to that trade (sets the
   `p_trade` browse arg); an "All trades" chip clears it. Selected chip gets a ring/filled style.
   If the trade list is empty, omit this row entirely (no empty placeholder).
4. **Worker grid**: `mt-8 grid gap-4` of `WorkerCard` (one column, like health — these are wide cards).

## WorkerCard (anonymized) — what it shows
Mirror ProviderCard's shape but every field is anonymized per plan PART 4 / showcase view in
migration 074. NEVER render a name, photo of a face, contact, or exact location.
- Identity block: the **worker code** (e.g. `MNE-CW-0427`) as the heading — this is the only
  identifier. Below it the role/trade label. No `<Image>` of a real face; use an amber initial-less
  avatar tile (icon or worker-code monogram) on `bg-brandCareer-50 ... text-brandCareer-700`.
- A **"Verified by RoNa Legal"** badge (amber pill + `BadgeCheck`) shown when verification_status is verified.
- Meta chips: experience band, region (Far East/ME/Africa — region, **not** country/city),
  age band, skill tier; top 3–5 skill badges; cert badges (the *fact* of a cert, neutral gray pills
  like health's language chips).
- A readiness indicator (score/meter) — amber accent.
- The whole card links to the anonymized detail `/career/pool/[workerCode]` (one inner `<Link>`;
  remember `<a>` cannot nest — same rule as ProviderCard's comment).
- **Interest actions** (`İlgi Göster` / `Talebe Ekle`) are NOT rendered on this list card unless an
  employer is logged in; on the public sector page show only the locked "view profile" affordance.
  (Full interest flow lives in the pool/detail surfaces — out of scope here.)

## Data it needs (UX level — not exact field names)
- **Sector validation + name**: a localized list of sectors keyed by slug (RPC `career_list_sectors`,
  mirroring health's `listSpecialties`). Find the sector matching `params.sector`; unknown → `notFound()`.
  Use its localized name + slug for the header and icon.
- **Trades in this sector**: the distinct set of trades/roles that exist in the showcase pool for
  this sector, each with a slug + localized label + count. (Derive from the seed taxonomy /
  showcase data; if no dedicated "list trades" RPC exists yet, the implementer should add a thin
  read helper in `lib/kariyer/queries.ts` that returns the trades — keep it service_role RPC-backed
  per BUILD-RULES, never a base-table grant.)
- **Worker cards**: the anonymized showcase rows filtered to this sector (browse RPC
  `career_browse_showcase` with `p_sector = <slug>`, optional `p_trade` from the selected chip,
  server-side pagination `p_limit`/`p_offset`). Returns ONLY public-safe fields (worker code, role,
  trade, skill tier, experience band, region, age band, languages, skills, readiness, verification).
  This is the prod read path — it goes through the VIEW, so no private column can appear (BUILD-RULES
  R2/R8). Do NOT add fields to the select.

## UI states (every one must be designed, not faked)
- **Loading**: handled by the `(gated)/loading.tsx` Suspense skeleton (neutral pulse blocks, no accent
  noise) — mirror health's. No per-card spinner.
- **Empty (soft-fail)**: when the browse RPC returns zero workers for this sector/trade, render the
  designed dashed-border empty card (mirror health: `SearchX` icon + emptyTitle + emptyBody), NOT a
  fake/placeholder card and NOT a 404. Sector is valid, pool is just unpopulated (expected pre-seeding,
  plan Phase 1). If a trade chip filter produced the empty result, the empty copy should hint "no
  workers in this trade yet — clear the filter" and keep the chip row visible so the user can reset.
- **Error**: a thrown read-RPC failure bubbles to `(gated)/error.tsx` (designed retry screen, amber
  CTA gradient instead of teal). The trades-row fetch and the next-availability-equivalent (none here)
  must be **best-effort** — wrap any secondary fetch in try/catch and degrade (mirror health's
  `getNextSlotsBySpecialty` try/catch); a secondary outage must not take down the grid.
- **Success**: header + trades row + grid of anonymized cards.
- **Locked**: every card is inherently in the "locked" state — identity gated. The public (not-logged-in)
  viewer sees anonymized cards with a locked "view profile" affordance and no interest buttons; an
  authenticated employer additionally sees `İlgi Göster` / `Talebe Ekle`. There is no unlocked variant
  on this surface (unlock happens via approval+payment elsewhere).

## Amber-accent usage (swap map vs health)
Every place health uses sky-600 / `brandHealth` / teal, use `brandCareer` (amber-600):
`bg-brandCareer-50`, `text-brandCareer-700` (label text), `text-brandCareer` (icons/large UI only),
`dark:bg-brandCareer/15`, `dark:text-brandCareer`. The retry button gradient in `error.tsx` becomes
`from-amber-500 to-amber-600` (health uses teal). Neutral grays (borders, body text, language/cert
pills) stay identical — accent is wayfinding only, exactly as ProviderCard's header comment states.

## i18n
All copy via a `careerVertical.sectorDetail.*` (or reuse `careerVertical.directory.*`) dictionary
subtree across all 9 locales — back-link "all sectors", sector intro, empty title/body, verified badge,
trade-row "all trades", interest CTAs. Per BUILD-RULES R8 #7 the `careerVertical` subtree must be
deep-parity across all 9 dictionaries. RTL (`ar`) must lay out correctly (chip row, back-link
chevron direction) — verify under `dir="rtl"`.

## Edge cases / guardrails
- Unknown `sector` slug → `notFound()` (real HTTP 404 in prod; Next 14.2 returns 200 in dev — see R8 #8).
- Flag `CAREER_VERTICAL_ENABLED` OFF → the `(gated)/layout.tsx` `notFound()` + middleware quarantine
  already 404 this route; do not add a second flag check inside the page.
- `force-dynamic` is mandatory (R5) — do not let a personalized/anonymized grid get ISR-cached.
- Trade chip filter must round-trip through the browse RPC's `p_trade` arg, not a client-side
  `.filter()` over a full dump (no bulk export — R12); re-query with the narrowed arg + reset offset.
- Pagination: server-side `p_limit`/`p_offset` only; no client-side "load all". R12 notes this page
  route is NOT covered by `lib/rateLimit.ts`'s `public-form` cap — keep pagination as the structural
  throttle and leave a comment noting the unthrottled scrape surface.
- Card must never receive a private column even hidden in props; type the card prop to the public-safe
  showcase shape only.
