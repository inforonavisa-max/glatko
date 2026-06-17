# Spec 07 — WorkerCard (anonymized pool card)

> Docs-only build spec. The downstream agent writes the component; no app/lib/SQL code here.
> Read alongside `career-vertical-plan-v1.md` (PART 2 §3, PART 4) + `BUILD-RULES.md` (R2, R5, R6, R8)
> and Spec 05 (`05-pool-browse.md`, the page that renders a grid of these) + Spec 06 (the detail page
> each card links to). This card is the conversion heart of `/career/pool` and the anonymization
> firewall: if it leaks one private field, the gate is broken with every RLS policy still green.

## Mirror target (read first)
- **File to mirror:** `components/glatko-saglik/ProviderCard.tsx`.
- **New file:** `components/glatko-kariyer/WorkerCard.tsx`.
- **Same contract as the health card:** SYNC server component, **no client JS**, localized labels
  passed in as a `labels` prop (the parent `WorkerPoolBrowser`/page owns the translator). Plain
  presentational — no data fetching, no `auth`, no RPC calls inside the card.
- **Token swap:** every `brandHealth` → `brandCareer` (amber-600 `#D97706`). The career ramp is ONLY
  `brandCareer-50` / `brandCareer` (DEFAULT) / `brandCareer-700` (see `tailwind.config.ts`) — do NOT
  invent `-100`/`-200` etc. Health's `hover:bg-brandHealth-100` chip has no career equivalent; use
  `hover:bg-brandCareer-50` + a border/opacity shift instead, or drop the hover tint.
- Import the `/career` segment + token references from `lib/kariyer/config.ts` — never hardcode
  `/career` or the hex.

## Anchor-in-anchor rule (load-bearing — same as health)
`<a>` cannot nest inside `<a>`. The outer card element is a plain `<div>` (NOT a Link). The whole
identity/body block is ONE inner `<Link>` to the worker detail page
(`/career/pool/[workerCode]` — confirm the registered gated segment against `i18n/routing.ts`, same
one Spec 06 uses). The interest/add actions are NOT links inside that Link — they are SEPARATE
siblings in a footer row below the identity Link (mirror how health puts time-chip `<Link>`s in a
separate `border-t` footer outside the identity Link). Never wrap the card in a Link and also place
Links/buttons inside it.

## Layout (mirror health card structure)
Outer: `div.group.rounded-2xl.border.border-gray-200.bg-white.p-5.shadow-premium-sm` + hover/dark
variants, verbatim from health.
1. **Identity Link block** (`<Link>` → detail, `className="block"`): a `flex gap-4` row —
   - **Left: WatermarkedPhoto thumb** — `h-16 w-16 shrink-0 rounded-xl`. If a showcase-variant URL
     exists, render the **face-blurred + watermarked showcase variant** ("Glatko · RoNa Legal", baked
     server-side; **R6** — NEVER an original/gated path). If absent, a fallback tile in
     `bg-brandCareer-50 text-brandCareer-700` showing the worker code's trade-letters (e.g. "CW"),
     NOT initials of a name (there is no name). See WatermarkedPhoto note below.
   - **Right: min-w-0 flex-1 column** —
     - Top row (`flex items-start justify-between`): on the left, `<h3>` = **worker_code**
       (e.g. `MNE-CW-0427`, neutral `text-gray-900`, `truncate`, validate display with
       `lib/kariyer/worker-code.ts`) with role/trade as the `text-sm text-gray-500` subline
       (mirrors health's name + specialty). On the right, the **Verified-by-RoNa badge**
       (see below), `shrink-0`.
     - **Meta line** (mirror health's `MapPin` location line, but NO location): experience band +
       region (Far East / Middle East / Africa ONLY — never country/city) + age band, as a muted
       `text-sm text-gray-500` row with a neutral icon (`Briefcase`/`Globe`), `truncate`.
     - **Skill-badge row** (mirror health's languages row): top **3–5 skill badges**. Use
       `bg-brandCareer-50 text-brandCareer-700` chips (the plan's brandCareer-50/-700 badge spec).
       Optional cert-fact badges may share this row with a small lock glyph (neutral chip, amber lock).
2. **Footer action row** (`mt-4 border-t pt-3`, OUTSIDE the identity Link) — the readiness pill on the
   left + the two actions on the right (see Actions). This is the structural slot health uses for its
   time chips.

### Verified-by-RoNa badge
Mirror health's `verified` pill EXACTLY, amber-swapped:
`inline-flex shrink-0 items-center gap-1 rounded-full bg-brandCareer-50 px-2 py-0.5 text-xs
font-medium text-brandCareer-700` + `<BadgeCheck className="h-3.5 w-3.5" />` + `labels.verified`
("Verified by RoNa Legal"). Render only when verification status qualifies; omit otherwise.

### Readiness pill
Small amber pill (`bg-brandCareer-50 text-brandCareer-700`) showing the readiness score
(e.g. "Hazırlık 82") in the footer. Read-only, factual chip — amber is wayfinding only here.

### WatermarkedPhoto
May be a tiny sibling presentational component or inline `next/image`. It receives ONLY the
already-derived showcase-variant URL. It must never accept or render a gated original. A
per-session/per-viewer dynamic watermark overlay (employer id, PART 4) is an acceptable CSS overlay
the PARENT supplies — the card just renders what it's given.

## Amber-accent usage (wayfinding only)
- Amber appears on: Verified badge bg/text, skill/cert badge chips, readiness pill, photo fallback
  tile, focus-visible rings on the action controls. That's it.
- Worker code (`<h3>`), role/trade subline, and the meta line stay **neutral gray** (mirror health:
  name/specialty are neutral; accent is wayfinding, never body text).
- No solid amber button on the CARD. The solid `bg-brandCareer` CTA lives on the detail page
  (Spec 06), not here. The card's "express interest" is a compact secondary control (see below).

## Actions + the two action labels
Two actions in the footer, each its own `<Link>`/`<button>` sibling (NOT nested in the identity Link):
- **`İlgi Göster`** (express interest) and **`Talebe Ekle`** (add-to-requisition). Per **R10** these
  are the SAME endpoint differing by a `requisitionId`; on the card they may collapse to a single
  primary "İlgi Göster" + an optional add affordance.
- **Active (employer logged in):** clickable control. The actual POST to `/api/career/interest` is
  the parent/detail-page concern; on the card the simplest correct form is a `<Link>` to the worker
  detail (where the client `ExpressInterestButton` lives), so the card stays zero-JS. If a card-level
  client action is later wanted, it must be a separate client island, not this sync card.
- **"view full profile (locked)" link:** the identity Link's affordance is itself the entry to the
  locked dossier — add an explicit `Lock`-glyph "Profili gör (kilitli)" affordance in the footer
  pointing at the detail page, so the lock is legible on the card.

## Every UI state
- **Loading** — the card has none of its own; the parent grid renders skeleton tiles
  (mirror health `(gated)/loading.tsx`, neutral gray blocks, no amber). The card only renders with
  real data.
- **Empty** — N/A at the card level; "no results" is the parent page's designed empty state
  (Spec 05). A card is never rendered as a fake/placeholder empty.
- **Per-field emptiness** — guard each optional block with `&&` (mirror health's guarded
  location/languages): no skills → omit the badge row; no cert facts → omit; no readiness → omit the
  pill (don't render "—" garbage); no showcase photo → fallback tile (never an original).
- **Error** — the card doesn't fetch, so it doesn't error; an RPC failure is the parent page's
  `error.tsx` boundary (Spec 05). The card must not swallow/hide a missing field as a silent default
  that looks like real data.
- **Success** — full anonymized card: code + role/trade + Verified badge + meta line + skill badges +
  readiness pill + footer actions.
- **Locked (the gate / non-employer viewer)** — when the viewer is anon/non-employer, the
  interest/add controls render in a locked form: the affordance routes to `/career/login` (or shows
  the inline "İşveren girişi gerekli" prompt the parent supplies via labels). The parent passes a
  flag/role indicating locked-vs-active; the card does NOT read `auth` itself.
- **Interest-already-sent** — if the parent marks this worker as already-interested for this employer,
  the action flips to a disabled "İlgi gösterildi" pill (mirror Spec 05/06 — still LOCKED while
  `owner_approved=false`; the card never shows an unlocked/dossier state).

## Data it needs (UX level — exact field names live in the RPC/VIEW)
The parent passes a single anonymized worker object sourced from `career_worker_showcase` (the VIEW,
**R2**) plus localized `labels`. The card needs, at the UX level:
- worker code; role/trade; skill tier; experience band; region (Far East/ME/Africa); age band;
  list of skills (for top 3–5 badges); list of cert facts (badge labels only, NO file paths);
  readiness score; verification status / "Verified by RoNa Legal" trust signal;
  showcase-variant photo URL (blurred + watermarked — never a gated original).
- **MUST NOT receive or render:** full name, DOB, phone/email, exact country/city/address, passport
  number, original document paths, any `_enc`/`_hash` column. If any such field is present on the
  object, that is a VIEW/RPC bug upstream (**R8 #1/#5/#9**) — the card must not surface it even if
  passed.
- From the parent: viewer role (employer vs anon → active-vs-locked actions); the
  already-expressed-interest marker for this worker; the localized `labels` bundle
  (`verified`, `readinessLabel`, `expressInterest`, `addToRequisition`, `viewLocked`,
  `employerLoginRequired`, `interestSent`, region/band display strings). All copy lives under the
  `careerVertical.*` dictionary subtree with deep 9-locale parity (**R8 #7**). **RTL for `ar`** —
  the `flex gap-4` row and badge alignment must mirror correctly.

## Edge cases
- **No name, ever** — there is no `fullName`; do NOT port health's `initials(name)` helper. The photo
  fallback tile derives its glyph from the worker code's trade segment (e.g. "CW"), not a name.
- **No location** — the health card's `MapPin` city/address line has NO career analog. Replace it with
  the experience/region/age-band meta line; never render an exact location even if upstream leaks one.
- **Showcase photo missing or wrong path** — fallback tile only; never reach for an original/gated path
  (the signer rejects non-`public_anonymized` paths anyway, **R6**).
- **Invalid/malformed worker code** — display defensively; the parent/page already validated with
  `WORKER_CODE_RE` before routing. The card should still render the code as-is (it's the routing key)
  and not crash.
- **Anchor-in-anchor regression** — keep the identity Link and the footer action controls as separate
  siblings; a future "make the whole card clickable" refactor must NOT wrap action Links/buttons.
- **Unthrottled scrape surface** — the card is rendered by a page route, not `/api/*`; per **R12** the
  pool browse has no `public-form` rate-limit. Nothing to fix in the card, but do not add any
  card-level bulk/export affordance.
