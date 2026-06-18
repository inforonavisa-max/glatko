# Spec 05 — Talent Pool browse (`/career/pool`)

> Docs-only build spec. Downstream agent writes the code. Read alongside
> `career-vertical-plan-v1.md` (PART 2 §3, PART 4) and `BUILD-RULES.md` (R5, R12, R2, R8).
> THE core employer screen: anonymized worker-code cards + full filter rail. Gated + `noindex`.

## What this mirrors (read these first)
- **Page route** — mirror `app/[locale]/health/(gated)/[specialty]/page.tsx`. That page is the
  analog: validate input → call a read-RPC → render a header + filter context + a card grid with a
  designed empty state. Career differs in TWO ways: filters are searchParam-driven (a client rail),
  and the page is **`force-dynamic`** (health's list is `revalidate=3600`; see R5 below).
- **Card** — mirror `components/glatko-saglik/ProviderCard.tsx` → new
  `components/glatko-kariyer/WorkerCard.tsx` (sync server component, no client JS, labels passed in).
- **Filter rail client component** — `components/glatko-kariyer/WorkerPoolBrowser.tsx`. Pattern its
  searchParam read/write + state machine on `components/glatko-saglik/BookingWidget.tsx`
  (`useSearchParams` + `useRouter` from `@/i18n/navigation`, three-state fetch loading/ready/error).
- **Loading / error** — mirror `app/[locale]/health/(gated)/loading.tsx` and `.../error.tsx`
  (skeleton card grid; client error boundary with retry). New copies under the career `(gated)` group.
- **Token** — accent is `brandCareer` (amber-600 `#D97706`) everywhere health uses `brandHealth`
  (sky-600). Import the segment/token from `lib/kariyer/config.ts`; never hardcode `/career` or hex.

## Route & rendering
- Path: `app/[locale]/career/(gated)/pool/page.tsx` (canonical segment `career`, localized per
  `i18n/routing.ts`). `export const dynamic = "force-dynamic"` (**R5**: per-viewer interest markers +
  per-session watermark; never ISR-cache one employer's render for another). `noindex` is inherited
  from the gated group metadata — keep it. No `generateStaticParams`.
- Data: server component awaits `searchParams`, maps them to the `career_browse_showcase` RPC args
  `(p_sector, p_trade, p_tier, p_experience, p_region, p_age, p_languages[], p_min_readiness,
  p_limit, p_offset)` via a `lib/kariyer/queries.ts` wrapper (mirror `lib/saglik/queries.ts`). Sector
  facet options come from `career_list_sectors(locale)`. The RPC reads the VIEW only (**R2/R8**) and
  returns ONLY public-safe fields — render nothing else.

## Layout
Two-column on `lg+`, single column stacked on mobile:
- **Left filter rail** (`WorkerPoolBrowser`, client) — sticky on desktop; on mobile a "Filtrele"
  button opens it as a drawer/sheet. Holds EVERY facet (next section). An active-filter count badge
  (amber) + a "Temizle" (clear all) link. Result count ("128 işçi") above the grid.
- **Right results region** — sort dropdown (top-right), the anonymized card grid (1 col mobile /
  2 col `md` / 3 col `xl`), then pagination controls. The grid + sort + pagination are driven by the
  same searchParams the rail writes; the server re-renders on URL change.

## Filter facets (left rail — every one, searchParam-driven)
Each facet writes a searchParam; changing any facet resets `page` to 1 and pushes a new URL (shallow
router push, scroll-to-top of results). Facets:
1. **Sector** (`sector`) — single-select from `career_list_sectors` (Construction, Hospitality).
2. **Trade / skill** (`trade`) — single-select, dependent on sector.
3. **Skill tier** (`tier`) — entry / skilled / expert (single-select).
4. **Experience band** (`experience`) — e.g. 0–2 / 3–5 / 6–10 / 10+ yrs.
5. **Region** (`region`) — **Far East / Middle East / Africa ONLY** (never country/city — PART 4).
6. **Age band** (`age`) — banded, never DOB.
7. **Languages** (`langs`, multi → array; RPC uses `@>` contains) — checkbox group.
8. **Certifications** (`certs`) — checkbox group (the *fact* of a cert as a badge facet).
9. **Readiness** (`minReadiness`) — min-score slider/segmented (maps to `p_min_readiness`).
10. **Availability** (`availability`) — e.g. ready-now / in-30-days.
> GAP: the current `074` `career_browse_showcase` RPC does NOT yet accept certs / availability / sort
> params, and `verification_status` is returned but not a filter arg. Either (a) extend the RPC
> signature in a follow-up migration, or (b) ship those facets disabled-with-tooltip until wired.
> Do not silently render facets that don't filter — pick one and note it. Coordinate with the
> migration owner (**R15**: no prod apply without explicit go).

## Card (anonymized — never leak identity)
Shows ONLY: `worker_code` (e.g. `MNE-CW-0427`, validate with `lib/kariyer/worker-code.ts`),
role/trade, skill tier, experience band, region, age band, top 3–5 skill badges, cert badges,
readiness score, "Verified by RoNa Legal" verification badge, and a **face-blurred + watermarked**
work-photo thumbnail (showcase variant only — never a gated original; **R6**). No name, no contact,
no exact location, no DOB. Two actions: `İlgi Göster` (express interest) + `Talebe Ekle`
(add-to-requisition) — both behind employer login (see locked state). Amber accent is wayfinding
only: verification badge bg/text, readiness pill, focus rings. Card title/code stays neutral gray.

## Sort
Sort dropdown writes `sort`: relevance (default = `readiness_score desc` per RPC) / experience /
readiness / recent (`created_at`). Default when absent = readiness desc.

## Pagination (server-side, R12)
Server-side only — `p_limit` (default 24) + `p_offset` from a `page` searchParam. Prev/Next +
page numbers; disable Prev on page 1, Next when returned rows < limit. **No bulk export, no
"load all".** This pagination IS the structural throttle.

## UI states (every one)
- **Loading** — skeleton card grid (mirror health `loading.tsx`); neutral gray blocks, no amber.
  Rail stays interactive; only the results region shows skeletons during a searchParam transition.
- **Empty** (zero results for the active filters) — designed empty state (NOT a fake card; mirror
  health's dashed-border `SearchX` block): "Bu filtrelerle eşleşen işçi yok" + a "Filtreleri temizle"
  action. Distinguish from the **pool-not-yet-open** empty (Phase 1 seeding): if the whole pool is
  empty, show a "Havuz hazırlanıyor" message instead of a filter-mismatch message.
- **Error** — client `error.tsx` boundary with amber retry button (mirror health error; swap teal
  gradient → amber). A read-RPC failure lands here as a graceful screen, never a crash or fake-empty.
- **Success** — card grid + result count + pagination.
- **Locked** (the gate) — interest/add actions for a **non-logged-in or non-employer** viewer render
  as locked: clicking routes to `/career/login` (or shows an inline "İşveren girişi gerekli" prompt).
  Worker detail full dossier (name/contact/passport) is NEVER on this surface — it lives behind the
  reveal-unlock gate on the detail page after owner-approve + payment. The browse card's locked CTA
  is the entry to that funnel, not the unlock itself.

## Data it needs (UX level — exact field names live in the RPC)
- Per card: anonymized code, role/trade, tier, experience band, region, age band, language list,
  skill list, readiness score, verification status, showcase photo URL (blurred/watermarked variant).
- Page-level: total/filtered count for pagination + result header; sector facet options (localized);
  the viewer's auth/role (employer vs anon) to decide locked vs active actions; per-viewer
  already-expressed-interest markers (so a card can show "İlgi gösterildi" instead of the CTA).
- All facet option lists localized via the active locale dictionary (`careerVertical.*` subtree;
  **R8 #7**: keep nested i18n parity across all 9 locales). RTL for `ar`.

## Edge cases
- **Unthrottled scrape gap (R12)** — `/career/pool` is a page route, so `lib/rateLimit.ts`'s
  `public-form` cap does NOT apply. Mitigations: server-side pagination (above), no bulk export, and
  a loud `log()`/code comment marking this as an unthrottled scrape surface so it isn't mistaken for
  covered. If a lightweight bot guard is added later, hook it here. Do not claim this surface is
  rate-limited.
- **Per-session watermark** — the showcase photo watermark must carry the viewing employer/session id
  (PART 4 best-practice); this is why the page is `force-dynamic` and must not be cached.
- **Invalid / out-of-range searchParams** — coerce defensively (unknown sector → ignore filter, not
  500; `page<1` → 1; non-numeric → default). Never pass unvalidated strings into the RPC as-is.
- **Flag OFF** — the gated group middleware quarantines this route to a real HTTP 404 (**R8 #8**); the
  page itself assumes the flag gate already ran. Do not re-implement the flag check here.
- **No name/contact ever in page text** — even in markup, hidden fields, or JSON props (**R8 #9**):
  the RPC returns only public-safe columns; never fetch the base table or join private rows here.
