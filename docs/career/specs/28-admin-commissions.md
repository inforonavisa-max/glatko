# Spec 28 — Admin Commissions / Fee Ledger (`/admin/career/commissions` + `AdminCareerCommissionsList`)

> Docs-only build spec. Downstream agent writes the code. Read alongside
> `career-vertical-plan-v1.md` (PART 2 §10 owner console "commission/fee tracking"; PART 3 core
> tables `career_commission_records` + `career_placements`; PART 5 pricing/guarantee) and
> `BUILD-RULES.md` (R5/R11 dynamic, R7 worker-never-charged, R8 #6 deny-all tables, R8 #8 flag-off,
> R13 audit). This is the owner's **read-only Phase-0 fee ledger**: one row per
> `career.commission_records` entry, showing commission/full-service path, amount, invoice ref, paid
> status, and the placement → guarantee linkage. Admin-gated, service-role read, `noindex`.

## What this mirrors (read these first — do not invent a pattern)
- **Page route** — mirror `app/[locale]/admin/reviews/page.tsx` → new
  `app/[locale]/admin/career/commissions/page.tsx`: async server component, `setRequestLocale`, reads
  optional `searchParams.status` (default `"all"`; values `paid` / `unpaid`), uses `createAdminClient()`
  (service_role) to call the read-RPC, maps the JSON into a typed `AdminCommissionRow[]`, renders the
  list client component. Export the row type from the page (mirror `AdminReviewRow`).
- **Client list** — mirror `components/admin/AdminReviewsList.tsx` → new
  `components/admin/AdminCareerCommissionsList.tsx`: `"use client"`, the `<h1>` + count subtitle, the
  `FILTERS` pill array, a `STATUS_BADGE` record, the `rows.length === 0 ? empty : card-stack` shell,
  and the same card chrome (`rounded-2xl border border-gray-200/80 bg-white/80 p-5` + dark variants).
  **Phase-0 = READ-ONLY**: there is NO `act()` helper, NO `useTransition`, NO `pendingId`, NO server
  action, NO mutating button. Strip all the toggle machinery from the reviews mirror.
- **Auth gate** — inherited from `app/[locale]/admin/layout.tsx` (email allowlist via `isAdminEmail` →
  `notFound()` for non-admins; `redirect` when signed out; `robots:{index:false,follow:false}` already
  set). Do NOT re-implement.

## R1 / cross-employer note (admin exception)
This is an owner-only surface reading **all** placements' fees by design — there is NO
`p_employer_user_id` scoping and NO cross-employer denial here (mirror Spec 24). Two-layer defense:
(1) admin layout email allowlist gates the human, (2) the RPC is `service_role`-only EXECUTE. The
RPC `public.career_admin_list_commissions()` (migration 076 §11) takes **no user-id arg**; identity is
the admin session. **R7:** commission rows are employer-side revenue only — no worker identity or
worker-side fee ever appears on this surface (the `commission_records` table has no worker column).

## Route & rendering
- Path: `app/[locale]/admin/career/commissions/page.tsx`. Internal/identity segment (English `career`,
  NOT a localized public slug — admin console is not locale-public; mirror reviews).
- `export const dynamic = "force-dynamic"` (**R5/R11** — reads session + per-request `?status`).
  `runtime = "nodejs"`. `robots` already set by the admin layout.
- Read: `createAdminClient()` → `career_admin_list_commissions()` (076 §11; returns a `jsonb` array,
  newest-first by `created_at`). **DOWNSTREAM GAP — the shipped RPC selects only the bare
  `commission_records` columns (id, placementId, path, amount, currency, invoiceId, paidAt, createdAt)
  and does NOT join placement/guarantee data.** To show placement → guarantee linkage (a task
  requirement) the agent must either (a) extend `career_admin_list_commissions()` to `left join
  career.placements p on p.id = cr.placement_id` and add `placedAt`, `guaranteeUntil`,
  `placementStatus`, and a short worker-code/role label from the unlock chain; or (b) add a sibling
  read-RPC. Keep the RPC shape/security boilerplate identical to 076 §11 (`security definer`,
  `set search_path = ''`, `stable`, `revoke … from public,anon,authenticated`, `grant execute to
  service_role`). No `?status` arg exists in the RPC today — derive the paid/unpaid filter in TS
  (`paidAt != null`) or add a `p_paid boolean` arg (mirror 076 §1's optional-filter shape).

## Layout (mirror AdminReviewsList exactly)
- `<h1>` `font-serif text-2xl font-bold` — "Komisyon / hizmet bedeli kaydı". Subtitle
  `text-sm text-gray-500` — "N kayıt" (`rows.length`). Optionally a second muted line summing total
  paid vs outstanding amount (e.g. "€X tahsil edildi · €Y bekliyor"), grouped by currency.
- **Filter pills row** (`mt-4 flex flex-wrap gap-2`): `<Link href="?status=…">` pills — `Tümü` /
  `Ödendi` / `Bekliyor`. Active pill solid accent `bg-brandCareer text-white` (the one teal→amber
  swap, mirroring reviews' `bg-teal-600` active); inactive `bg-gray-100 text-gray-600
  hover:bg-gray-200` + dark variants.
- **Card stack** (`mt-6 space-y-4`), one card per commission row.

## Card contents (per commission record — UX level)
- **Header row** (`flex flex-wrap items-center justify-between gap-2`): left = the **amount** (bold,
  formatted via `Intl.NumberFormat` with the row currency, e.g. "€1.500,00") + the **paid-status
  badge pill**; right = created date via `new Date(...).toLocaleDateString("tr",{day,month,year})`
  (mirror reviews).
- **Meta line** (`mt-1 text-xs text-gray-500`): service path label (Komisyon / Tam hizmet) ·
  invoice reference (`invoiceId ?? "—"`) · short placement/worker-code reference.
- **Linkage line** (`mt-1 text-xs text-gray-500`): "Yerleşme: <placedAt>" + guarantee state — if
  `guaranteeUntil` is in the future show "Garanti: <date>'e kadar" (amber-tinted to flag an active
  guarantee window), past → neutral "Garanti doldu", null → "—". This is the placement → guarantee
  linkage the surface exists to expose. No action buttons (read-only).

## Status pills (`STATUS_BADGE` — keyed by derived paid/unpaid)
Derive from `paidAt`: `paid` (`paidAt != null`) → emerald (`bg-emerald-100 text-emerald-700` + dark),
label "Ödendi". `unpaid` (`paidAt == null`) → **amber** (`bg-amber-100 text-amber-700` + dark), label
"Bekliyor" — amber is the "fee outstanding / needs attention" signal (mirrors how reviews uses amber
for `flagged` and Spec 24 for `shortlist_ready`). Unknown/edge → neutral gray fallback (mirror reviews'
`?? STATUS_BADGE.published` default); never crash on an unmapped value.

## Every UI state
- **loading** — admin pages here ship no `loading.tsx` (reviews ships none); the server `await` blocks.
  If a Suspense skeleton is added, keep it neutral gray, no amber (mirror health admin convention).
- **empty** — no commission rows in this filter → the `rows.length === 0` centered muted block:
  "Henüz komisyon kaydı yok" (mirror reviews' empty copy). NOT an error, NO CTA (admin doesn't create
  commission rows in Phase-0 — they arrive via the placement/unlock pipeline).
- **error** — the page-level read error is `console.error`'d and renders an empty list (mirror reviews
  `page.tsx`, which logs and falls through to `data ?? []`). There are no per-action errors (read-only,
  no mutating action), so no client `error` state is needed; if the agent keeps the red `<p>` slot, it
  stays unused.
- **success** — N/A (no mutations). A page refresh re-reads the ledger.
- **locked / gated** — flag OFF and/or non-admin: the admin layout returns **real HTTP 404** for
  non-allowlisted users (**R8 #8**: Next 14.2 `notFound()` is 200 in dev, 404 in prod). The
  `CAREER_VERTICAL_ENABLED` flag does NOT gate `/admin/*`; if the console should be hidden while the
  flag is OFF, add a defense-in-depth `if (!isCareerVerticalEnabled()) notFound()` at the top of THIS
  page (decide with the coordinator — reviews has no such check; align with Spec 23/24). There is no
  per-row locked state on this surface — it is already the deepest owner-only read.

## Amber accent usage (`brandCareer`, swaps reviews' teal)
- The **active filter pill** is the one solid amber (`bg-brandCareer text-white`).
- The **`unpaid` status pill** uses the AA-safe `amber-100 / amber-700` Tailwind pair (NOT the
  `brandCareer` token — `brandCareer` DEFAULT amber-600 is below 4.5:1 AA for text; pills use the
  literal amber-100/700 pair like reviews' `flagged`). Do NOT amber-tint every pill or the
  "outstanding" signal is lost — `paid` is emerald.
- Active-guarantee linkage text may use `brandCareer-700` for the AA-safe amber accent; everything
  else neutral. No solid-amber CTA here (read-only surface, no conversion action).

## Data it needs (UX level — exact field names live in the RPC)
- **Reads (all commission records, all placements):** per row — id, amount + currency, service path
  (commission / full-service), invoice reference, paid-at (drives paid/unpaid), created timestamp, and
  the linked placement's placed-at + guarantee-until + a short worker-code/role label. Page-level: the
  optional `?status` (paid/unpaid/all) filter.
- **Sends:** nothing — read-only. No server action, no client→server mutation.
- **i18n:** admin chrome is **TR-hardcoded by policy** (Admin i18n policy `+TODO i18n-b4`) — mirror
  `AdminReviewsList`'s literal TR `FILTERS`/`STATUS_BADGE` strings. Do NOT route through the
  `careerVertical.*` dictionary (that subtree is employer/worker-public only). No RTL needed (admin is
  TR-only). Amounts/dates via `Intl` (TR locale).

## Edge cases
- **Null amount / currency** — `commission_records.amount` and `currency` are nullable + a record can
  exist before invoicing. Render "—" for a null amount; default a null currency to "EUR" (matches the
  column default) before formatting; never `Intl`-format `null`.
- **Orphan / missing placement linkage** — if the left-join yields no placement row (or the RPC isn't
  extended yet), the linkage line shows "—" and the row still renders. Never crash on a missing join.
- **Paid-at in the future / clock skew** — treat any non-null `paidAt` as paid (don't compare to now);
  guarantee window IS compared to now for its amber/neutral state.
- **Read failure** — page logs + renders empty list (mirror reviews); never a crash.
- **Deny-all integrity (R8 #6)** — `commission_records` is RLS deny-all with zero policy; the ONLY read
  path is this service-role RPC. Do NOT add a base-table `.from("career.commission_records")` client
  read (it would 0-row or error); always go through the RPC.
- **Audit (R13)** — this is a read-only surface; **no audit row needed** (mirror reviews, which doesn't
  audit reads). If the RPC is later extended with a mutation (e.g. mark-paid in Phase-1+), THAT action
  audits via `lib/admin/audit.ts` — out of scope for Phase-0.
- **Flag-off / non-admin** → real HTTP 404 (R8 #8), handled by the layout.
