# Spec 24 — Admin Requisitions (`/admin/career/requisitions` + `AdminCareerRequisitionsList`)

> Docs-only build spec. Downstream agent writes the code. Read alongside
> `career-vertical-plan-v1.md` (PART 2 §10 owner/admin console + §6 lifecycle pipeline) and
> `BUILD-RULES.md` (R1/R8 #2 caveat below, R5/R11 dynamic, R13 audit, R8 #8 flag-off).
> The owner's RoNa Legal console screen that lists EVERY requisition (all employers, all statuses)
> and drives each one forward through the lifecycle via a state-guarded set-status action.
> This is the ADMIN/OWNER surface — NOT the employer's own list (that is Spec 13). Admin-gated,
> service-role read, `noindex`.

## What this mirrors (read these first — do not invent a pattern)
- **Page route** — mirror `app/[locale]/admin/reviews/page.tsx` → new
  `app/[locale]/admin/career/requisitions/page.tsx`: async server component, `setRequestLocale`,
  reads `searchParams.status` (default `"all"`), uses **`createAdminClient()`** (service_role) to read
  ALL rows, maps the raw read into a typed `AdminRequisitionRow[]`, renders the list client component.
  Export the row type from the page (mirror `AdminReviewRow`) so the client imports it.
- **Client list** — mirror `components/admin/AdminReviewsList.tsx` → new
  `components/admin/AdminCareerRequisitionsList.tsx`: `"use client"`, `useState` for `pendingId` +
  `error`, `useTransition`, a `FILTERS` pill array, a `STATUS_BADGE` record, and an `act(...)` helper
  that sets `pendingId`, clears `error`, calls the server action in `startTransition`, surfaces
  `result.error` on failure, and clears `pendingId` after.
- **Action** — mirror `app/[locale]/admin/reviews/actions.ts` → new
  `app/[locale]/admin/career/requisitions/actions.ts`: `"use server"`, a `requireAdmin()` guard
  (`createClient().auth.getUser()` → `isAdminEmail`), then `createAdminClient()` to call the
  **`career_admin_set_requisition_status(p_id, p_expected, p_next)`** RPC (migration 076, §2 —
  state-guarded compare-and-set), then `revalidatePath`. Return `{ success, error? }`.
- **Auth gate** — inherited from `app/[locale]/admin/layout.tsx` (email allowlist → `notFound()` for
  non-admins; redirect to login when signed out). Do NOT re-implement; the admin layout already wraps.

## R1 / R8 #2 note (this surface is the exception)
Unlike employer/worker RPCs, admin RPCs are owner-only and read **all** employers' requisitions by
design — there is **no `p_employer_user_id` scoping and no cross-employer denial here**. The two-layer
defense is: (1) the admin layout email allowlist gates the human, (2) the RPC is `service_role`-only
EXECUTE. `career_admin_set_requisition_status` does NOT take a user id; identity is the admin session.

## Route & rendering
- Path: `app/[locale]/admin/career/requisitions/page.tsx`. Internal/identity segment (English
  `career`, NOT a localized public slug — admin console is not locale-public, mirror reviews).
- `export const dynamic = "force-dynamic"` (**R5/R11** — reads session + per-request `?status`).
  `robots: { index:false, follow:false }` is already set by the admin layout's metadata.
- Read: `createAdminClient()` → `career_admin_list_requisitions` read-RPC (returns all requisitions,
  joined to employer company + a presented-shortlist count; UN-anonymized employer name is fine — this
  is the owner console). **NOTE for downstream:** 076 ships `career_admin_set_requisition_status` and
  `career_admin_list_unlocks` but NO `career_admin_list_requisitions` list-RPC yet — add it (mirror
  076 §8's shape: `service_role`-only, `security definer`, `search_path=''`, returns `jsonb`) before
  this page can read. Optional `?status` filter passes the enum value (or null for "all") to the RPC,
  mirroring how reviews `page.tsx` does `.eq("status", filter)` for `filter !== "all"`.

## Layout (mirror AdminReviewsList exactly)
- `<h1>` `font-serif text-2xl font-bold` — "Talep yönetimi". Subtitle `text-sm text-gray-500` — "N
  kayıt" (`rows.length`).
- **Filter pills row** (`mt-4 flex flex-wrap gap-2`): `<Link href="?status=...">` pills; active pill
  is solid accent (`bg-brandCareer text-white`, swapping reviews' `bg-teal-600`), inactive is
  `bg-gray-100 text-gray-600 hover:bg-gray-200` + dark variants. One pill per status + an "all".
- **Error line** (`error && <p className="mt-4 text-sm text-red-600">`).
- **Empty** vs **list** (`rows.length === 0 ? … : …`), `mt-6 space-y-4` card stack.
- Each card: `rounded-2xl border border-gray-200/80 bg-white/80 p-5` + dark variants (identical shell
  to the review card).

## Card contents (per requisition — UX level)
- **Header row** (`flex flex-wrap items-center justify-between gap-2`): left = employer company name
  (bold) + sector·role/headcount summary (e.g. "İnşaat · Kalıpçı ×6") + the **status badge pill**;
  right = created date via `new Date(...).toLocaleDateString("tr", {day,month,year})` (mirror reviews).
- **Meta line** (`mt-1 text-xs text-gray-500`): service path (commission / full-service) ·
  presented-shortlist count ("N aday sunuldu") when applicable.
- **Action area** (`mt-4`): the state-transition control(s) — see below. No worker identity, no fee
  amount (fees live in the unlocks center, Spec 16). **R7** — no worker-side fee anywhere.

## The state-guarded set-status action (the core difference from reviews)
Reviews toggle a binary `published ⇄ removed`. Requisitions advance through a **linear lifecycle**, so
each card offers only the transition(s) legal FROM the current status, and the action is a
**compare-and-set** (passes the current status as `p_expected`):
```
submitted → under_curation → shortlist_ready → interest_expressed → approved → placed → in_guarantee
```
- `act(id, expected, next)` calls `setRequisitionStatus(id, expected, next)`; the RPC updates only
  `where id=p_id and status=p_expected`, returning `{ok:false, reason:'STATE_MISMATCH'}` if a stale
  console view tried to skip/double-apply a stage. The action maps a non-`ok` result to
  `{ success:false, error:'…' }` so the client shows it.
- Render the **forward button** for the next legal status ("İncelemeye Al", "Aday Hazır", "Onayla",
  "Yerleşti olarak işaretle", "Garantiye Al"), label by current status. Terminal `in_guarantee` shows
  no forward button. Optionally a single back-step is out of scope for C0 (forward-only).
- Mirror the reviews button structure: `inline-flex items-center gap-1.5 rounded-lg border px-4 py-2
  text-xs font-semibold disabled:opacity-50`, `disabled={pendingId === r.id}`, label flips to
  "İşleniyor…" while pending. `lucide-react` icon (e.g. `ChevronRight`/`CheckCircle2`).

## Status pills (`STATUS_BADGE` record — mirror reviews', keyed by enum)
Enum (migration 073): `submitted` · `under_curation` · `shortlist_ready` · `interest_expressed` ·
`approved` · `placed` · `in_guarantee`. TR-hardcoded labels (admin chrome — see i18n note). Colors:
- `shortlist_ready` (owner-action-pending) → **amber** (`bg-amber-100 text-amber-700` + dark) — the
  "act now" signal; this is the one amber pill, mirroring how reviews uses amber for `flagged`.
- `submitted`, `under_curation`, `interest_expressed` (in-progress) → neutral gray/blue pill.
- `approved`, `placed`, `in_guarantee` (positive/terminal) → emerald (`bg-emerald-100 text-emerald-700`).
- Unknown/future status → fall back to a neutral gray pill (mirror reviews' `?? STATUS_BADGE.published`
  defaulting); never crash on an unmapped value.

## Every UI state
- **loading** — admin pages here have no `loading.tsx` (reviews ships none); the server `await` blocks.
  If a Suspense skeleton is added, keep it neutral gray, no amber (mirror health admin convention).
- **empty** (no requisitions in this filter) — the `rows.length === 0` block: centered muted text
  "Bu filtrede talep yok" (mirror reviews' "Bu filtrede değerlendirme yok"). NOT an error, no CTA
  (admin doesn't create requisitions).
- **error** — two kinds: (a) the page-level read error is `console.error`'d and renders an empty list
  (mirror reviews `page.tsx`, which logs and falls through to `data ?? []`); (b) an action failure
  sets the client `error` state → red `<p>` above the list. A `STATE_MISMATCH` surfaces here as a
  human-readable "Durum değişmiş, sayfayı yenileyin" message.
- **success** — the action's `revalidatePath` re-renders the list with the new status pill; `pendingId`
  clears, button returns to idle. No toast needed (mirror reviews).
- **locked / gated** — flag OFF and/or non-admin: the admin layout already returns **real HTTP 404**
  for non-allowlisted users (**R8 #8**: Next 14.2 `notFound()` is 200 in dev, 404 in prod). The
  `CAREER_VERTICAL_ENABLED` flag does NOT gate `/admin/*` (admin is always reachable to admins) — but
  if the plan wants the career console hidden while the flag is OFF, add a defense-in-depth
  `if (!isCareerVerticalEnabled()) notFound()` at the top of THIS page (decide with the coordinator;
  reviews has no such check). There is no per-row locked-dossier state on this surface.

## Amber accent usage (`brandCareer`, swaps reviews' teal)
- The **active filter pill** is `bg-brandCareer text-white` (the one teal→amber swap, mirroring reviews'
  `bg-teal-600` active pill). Everything else neutral.
- Pro-tip parity: where reviews uses `border-teal-500` for the pro-response quote bar, this surface has
  no equivalent; keep accent minimal — the active pill is the only solid amber.
- `shortlist_ready` pill uses amber-100/700 (the attention status) — do NOT amber-tint every pill or the
  "act now" signal is lost. Forward-action buttons stay neutral/emerald bordered (mirror reviews'
  emerald restore / red remove buttons); error stays red.
- Accent **text** must use `brandCareer-700` (DEFAULT amber-600 is below 4.5:1 AA) — but admin pills use
  the `amber-100/700` Tailwind pair (already AA-safe), not the `brandCareer` token, matching reviews'
  literal `amber-100 text-amber-700` for its `flagged` badge.

## Data it needs (UX level — exact field names live in the RPC)
- **Reads (all requisitions, all employers):** per row — id (for the action target), employer company
  name, sector + role/headcount summary, current status, created timestamp, service path, and a
  presented-shortlist count. Page-level: the optional `?status` filter value.
- **Sends (per action):** the requisition id, its current status (`p_expected`), and the next status
  (`p_next`) — the action re-derives admin identity from the session, never from the client.
- **i18n:** admin chrome is **TR-hardcoded by policy** (Admin i18n policy: `+TODO i18n-b4`) — mirror
  `AdminReviewsList`'s `FILTERS`/`STATUS_BADGE` literal TR strings. Do NOT route these through the
  `careerVertical.*` dictionary (that is for employer/worker-public surfaces only). No RTL handling
  needed (admin is TR-only).

## Edge cases
- **Stale-view double-action (the headline edge case)** — two admins, or a slow tab, both click
  "Onayla": the compare-and-set means the second update matches zero rows → `{ok:false,
  reason:'STATE_MISMATCH'}` → red error, no silent skip. The card must always pass the status it
  currently displays as `p_expected`. This is why a plain `update status=p_next` is wrong here.
- **Unknown/future status** — coerce to a gray pill + safe label; if no forward transition is defined
  for it, render no forward button (never throw).
- **Read failure** — page logs + renders empty list (mirror reviews); never a crash.
- **Audit (R13)** — the set-status action SHOULD write a `glatko_admin_audit_log` row via
  `lib/admin/audit.ts` (add a `career_requisition_status_change` action type + a `career.requisitions`
  target — first confirm `target_table` has no CHECK/enum rejecting the schema-qualified string;
  reviews' `setReviewStatus` does NOT audit today, so this is a deliberate add, best-effort/never-throw).
- **Action authz** — `requireAdmin()` runs first in the action (mirror reviews); a non-admin POST to the
  server action is rejected even though the layout already gates the page render.
- **revalidatePath path** — use the literal route-pattern string `/[locale]/admin/career/requisitions`
  + `"page"` (mirror reviews' `/[locale]/admin/reviews`).
