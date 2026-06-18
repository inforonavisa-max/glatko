# Spec 23 — Owner Console Dashboard (`/admin/career`)

> Docs-only build spec. Downstream agent writes the code (NO app/lib/SQL here).
> Read alongside `career-vertical-plan-v1.md` (PART 2 §10 "Owner/Admin console") and
> `BUILD-RULES.md` (R1, R7, R8 #2, R13, R15). This is the owner's at-a-glance console home: a
> Yönetim-Paneli-style KPI grid (count-only) plus a short recent-activity list. Behind the `/admin`
> auth gate, `noindex`. Unlike the employer/worker dashboards this is NOT a `(gated)` career route —
> it lives under the existing `/admin` tree and inherits its allowlist gate, NOT the
> `CAREER_VERTICAL_ENABLED` flag.

## What this mirrors (read these first)
- **Page route** — mirror `app/[locale]/admin/page.tsx` end to end: a `force-dynamic` async server
  component that awaits `params`, calls one `getDashboardStats()` helper doing parallel count-only
  `createAdminClient()` queries, then renders a `<header>` + a 4-up `KpiCard` grid + a recent-items
  `Card`. Reuse the exact `KpiCard` and status-badge presentational helpers from that file's shape
  (copy the pattern; keep the same `Card`/`CardHeader`/`CardContent` primitives from
  `@/components/ui/card`).
- **Auth gate** — inherited from `app/[locale]/admin/layout.tsx` (reads `auth.getUser()` → no user
  `redirect(/login)`; not in `isAdminEmail` allowlist → `notFound()`). Do NOT re-implement any auth
  check on this page; the layout already gates it. This is why `/admin/career` is exempt from the
  career flag — admins always see it.
- **Sidebar entry** — add a "Kariyer" item to `components/admin/AdminSidebar.tsx` `items` array
  (`href: /${locale}/admin/career`, `label: "Kariyer"`), beside the existing 6. Active state is the
  array's existing `startsWith` logic — no change needed there.

## Route & rendering
- Path: `app/[locale]/admin/career/page.tsx`.
- `export const dynamic = "force-dynamic"` (live count-only reads; never ISR-cache an admin view).
- `noindex` inherited from the admin layout `metadata.robots` — do not re-declare.
- No `generateStaticParams`, no `setRequestLocale` here (the admin layout already called it).

## Chrome language — TR-HARDCODED (admin-i18n-policy)
All visible strings on this page are Turkish string literals in the JSX, NOT `getTranslations`
dictionary keys — matching `app/[locale]/admin/page.tsx` and the rest of `/admin`. Do not wire the
`careerVertical.*` dictionaries here. (The 9-locale dictionaries are for the public/employer/worker
surfaces only.) Page title: "Kariyer — Yönetim". Subtitle: "İş & Kariyer dikey genel durumu".

## Data it needs (UX level — count-only, service_role)
One `getDashboardStats()` helper, parallel `Promise.all`, every query
`.select("id", { count: "exact", head: true })` (head = count-only, no rows pulled). Read via
`createAdminClient()` against the showcase VIEW / owner-scoped tables. **R1 N/A** (admin/service path
is the intended caller; these are aggregate counts, not per-user RPCs). Three KPI counts + one short
recent list:
1. **Açık Talepler (open requisitions)** — count of `career.requisitions` in an active lifecycle
   (e.g. status in submitted/under-curation/shortlist-ready — the not-yet-placed/closed set). Icon
   `ClipboardList`, amber accent.
2. **Bekleyen Açılımlar (pending unlocks)** — count of `career_reveal_unlocks` awaiting owner action
   or payment (`owner_approved = false` OR (`owner_approved = true` AND `payment_status != 'paid'`)).
   This is the owner's action queue — the gate's inbox. Icon `Clock`, amber accent (action-needed).
3. **Vitrindeki İşçiler (showcased workers)** — count of workers with `is_showcased = true` (read the
   `career_worker_showcase` VIEW or the count-only RPC, never the base private table). Icon `Users`.
4. **Recent activity list** — the latest ~10 interest/unlock events (worker CODE + state + date),
   newest-first, for the bottom `Card`. Worker CODE only — never name/contact (**R7/R8 #9**).

GAP: migration `076` (career admin RPCs) may not yet expose count-only or recent-activity RPCs. If a
direct count-only `.select(... head:true)` on the schema-qualified tables/VIEW is available to
`createAdminClient()`, use it. If `076` instead requires going through an admin RPC, call that RPC and
derive counts from its payload. Pick one, note which, and coordinate the migration owner (**R15** — no
prod apply without explicit go). If the recent-activity source isn't ready, ship the 3 KPI cards and
render the recent list with its designed empty state (below) rather than blocking the page.

## amber-accent usage (brandCareer = amber-600 `#D97706`)
Mirror exactly how `app/[locale]/admin/page.tsx` uses teal/amber, but this page's vertical accent is
amber throughout (the admin chrome itself stays neutral gray/teal app-wide; only the career KPI
content reads amber):
- KPI icons: `text-amber-600 dark:text-amber-400`.
- Action-needed subtitle (pending unlocks > 0): `font-medium text-amber-600 dark:text-amber-400`
  ("Onay/ödeme bekliyor") — reuse the `subtitleAccent` prop pattern from the mirrored `KpiCard`.
- Recent-activity state badges: amber-tinted for pending/curation states
  (`bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300`), green-tinted for
  unlocked/placed, neutral gray for closed — same tinted-chip vocabulary as `RequestStatusBadge`.
- Amber is wayfinding/factual only; do not amber-color neutral counts or non-amber states.

## UI states (every one)
- **Loading** — server-rendered; no client skeleton needed (the `force-dynamic` fetch resolves before
  paint, like `admin/page.tsx`). The admin layout shell renders immediately; the page streams in.
- **Empty (zero data, real)** — career vertical pre-launch will legitimately have 0 of everything.
  KPI cards render "0" (not hidden, not "—"); the recent-activity `Card` shows the designed empty
  block "Henüz kariyer aktivitesi yok" (mirror `admin/page.tsx`'s "Henüz talep yok" centered muted
  note). This is the expected day-1 state — must look intentional, not broken.
- **Error (a count query fails)** — do NOT let one failed count blank the whole page. Each count
  defaults to `0` on a null/failed result (`res.count ?? 0`, exactly like the mirror). If the whole
  helper throws, it bubbles to the nearest admin error boundary (or a try/catch returning all-zeros +
  a small "veriler yüklenemedi" inline note) — never a 500 white screen for the owner.
- **Success** — header + 3 (or 4, if a 4th metric lands) KPI cards + populated recent list.
- **Locked** — N/A in the gate sense; this page shows only counts and worker CODES. It must NEVER
  render a worker's name/phone/email/passport or any gated document/signed URL (**R7/R8 #9**) — it
  reads counts and the anonymized showcase/event surface only, never a base private table.

## Edge cases
- **Count-only, never row-pull** — every KPI uses `head: true` count queries; do not `select("*")`
  and `.length` (pulls rows, risks private columns crossing the wire). The recent list is the only
  query that returns rows, and it returns CODE + state + date only.
- **Showcased count source** — read the `career_worker_showcase` VIEW (or its count RPC), never
  `career.worker_profiles` base — even for a count, do not touch the private table from this page.
- **No flag check here** — `/admin/career` is intentionally outside the `CAREER_VERTICAL_ENABLED`
  gate (admins manage the vertical before public launch). Do not import `isCareerVerticalEnabled`.
- **Admin audit (R13)** — this page is read-only (no mutations) so it writes no audit rows; nothing
  to extend here. (Audit-table compatibility matters for the action pages, not this dashboard.)
- **Dark mode** — every amber surface needs its `dark:` parity variant, matching the mirrored
  `KpiCard`/badge dark classes 1:1.
- **Unmapped status in recent list** — map any unknown event/status string to the neutral gray badge;
  never crash on an unmapped value (mirror the `map[status] ?? map.pending_moderation` fallback).
- **RTL** — admin chrome is TR-only (LTR); no RTL handling required on this page.

## Deps that must exist first (reference, do not block)
- `app/[locale]/admin/layout.tsx` + `isAdminEmail` gate — present (inherited).
- `components/admin/AdminSidebar.tsx` — add the "Kariyer" nav item (one array entry).
- `@/components/ui/card` primitives + `cn` — present (reuse from the mirror).
- `createAdminClient()` (`@/supabase/server`) — present.
- Count-only access to `career.requisitions`, `career_reveal_unlocks`, `career_worker_showcase`
  (VIEW) and a recent-activity source via migrations `073`/`074`/`076` — **verify availability**;
  if an admin RPC is required instead of direct count queries, route through it (see GAP above).
