# Spec 30 — Admin Employers (`/admin/career/employers` + `AdminCareerEmployersList`)

> Docs-only build spec. Downstream agent writes the code (no app/lib/SQL here). Read alongside
> `career-vertical-plan-v1.md` (PART 2 §10 owner/admin console; PART 5 "Employer tiers": Free →
> Verified → Premium) and `BUILD-RULES.md` (R5/R11 dynamic, R7 no worker fee, R8 #8 flag-off 404,
> R13 audit, R14 audit-union ordering). Sibling Spec 24 (Admin Requisitions) is the format template —
> mirror its structure. The owner's RoNa Legal console screen that lists EVERY employer account (all
> tiers, verified or not) and drives two actions per row: **verify** (toggle a boolean) and **set
> tier** (Free / Verified / Premium). Admin-gated, service-role read, `noindex`.

## What this mirrors (read these first — do not invent a pattern)
- **Page route** — mirror `app/[locale]/admin/reviews/page.tsx` → new
  `app/[locale]/admin/career/employers/page.tsx`: async server component, `setRequestLocale`, reads
  optional `searchParams.tier` (default `"all"`), uses **`createAdminClient()`** (service_role) to
  read ALL employer rows, maps the raw read into a typed `AdminEmployerRow[]`, renders the list
  client component. Export the row type from the page (mirror `AdminReviewRow`) so the client imports it.
- **Client list** — mirror `components/admin/AdminReviewsList.tsx` → new
  `components/admin/AdminCareerEmployersList.tsx`: `"use client"`, `useState` for `pendingId` +
  `error`, `useTransition`, a `FILTERS` pill array, a `STATUS_BADGE`/tier-badge record, and an
  `act(...)` helper that sets `pendingId`, clears `error`, calls a server action inside
  `startTransition`, surfaces `result.error` on failure, and clears `pendingId` after.
- **Action** — mirror `app/[locale]/admin/reviews/actions.ts` → new
  `app/[locale]/admin/career/employers/actions.ts`: `"use server"`, a `requireAdmin()` guard
  (`createClient().auth.getUser()` → `isAdminEmail`), then `createAdminClient()` to call the RPCs,
  then `revalidatePath`. Export TWO actions: `setEmployerTier(id, tier)` →
  **`career_admin_set_employer_tier(p_id, p_tier)`** (migration 076 §13) and
  `setEmployerVerified(id, verified)` → **`career_admin_set_employer_verified(p_id, p_verified)`**
  (076 §12). Both return `{ success, error? }`; map a non-`ok` RPC result (`reason:'NOT_FOUND'`) to
  `{ success:false, error:'…' }`.
- **Auth gate** — inherited from `app/[locale]/admin/layout.tsx` (email allowlist → `notFound()` for
  non-admins; redirect to login when signed out). Do NOT re-implement; the admin layout already wraps.

## R1 / R8 #2 note (this surface is the exception)
Admin RPCs are owner-only and read/mutate **all** employers by design — there is **no
`p_employer_user_id` scoping and no cross-employer denial here** (unlike the employer/worker RPCs).
The two-layer defense is: (1) admin-layout email allowlist gates the human, (2) the RPCs are
`service_role`-only EXECUTE. `career_admin_set_employer_tier`/`_verified` take only `(p_id, value)`;
identity is the admin session, never a client-passed uid.

## Route & rendering
- Path: `app/[locale]/admin/career/employers/page.tsx`. Internal/identity segment (English `career`,
  NOT a localized public slug — admin console is not locale-public, mirror reviews).
- `export const dynamic = "force-dynamic"` (**R5/R11** — reads session + per-request `?tier`).
  `robots:{index:false,follow:false}` is already set by the admin layout's metadata.
- Read: `createAdminClient()` → an employer-list read-RPC. **NOTE for downstream:** 076 ships
  `career_admin_set_employer_tier`/`_verified` but **NO `career_admin_list_employers` list-RPC yet** —
  add one (mirror 076 §8/§11 shape: `service_role`-only, `security definer`, `set search_path=''`,
  returns `jsonb`, ordered `created_at desc`). It returns PII-light columns only (company, tier,
  verified, counts) — **never** decrypt `contact_enc` for a list view. Optional `?tier` filter passes
  the enum value (or null for "all"), mirroring how reviews `page.tsx` does `.eq("status", filter)`.

## Layout (mirror AdminReviewsList exactly)
- `<h1>` `font-serif text-2xl font-bold` — "İşveren yönetimi". Subtitle `text-sm text-gray-500` —
  "N kayıt" (`rows.length`).
- **Filter pills row** (`mt-4 flex flex-wrap gap-2`): `<Link href="?tier=...">` pills — `all` / `free`
  / `verified` / `premium`. Active pill solid accent (`bg-brandCareer text-white`, swapping reviews'
  `bg-teal-600`); inactive `bg-gray-100 text-gray-600 hover:bg-gray-200` + dark variants.
- **Error line** (`error && <p className="mt-4 text-sm text-red-600">`).
- **Empty** vs **list** (`rows.length === 0 ? … : …`), `mt-6 space-y-4` card stack.
- Each card: `rounded-2xl border border-gray-200/80 bg-white/80 p-5` + dark variants (identical shell
  to the review card).

## Card contents (per employer — UX level)
- **Header row** (`flex flex-wrap items-center justify-between gap-2`): left = company name (bold) +
  the **tier badge pill** + a small **verified check** (a `lucide-react` `BadgeCheck` in emerald when
  verified, muted/absent when not); right = created date via
  `new Date(...).toLocaleDateString("tr",{day,month,year})` (mirror reviews).
- **Meta line** (`mt-1 text-xs text-gray-500`): requisition count ("N talep") when available; do NOT
  render a contact email/phone (it is encrypted — list is PII-light). **R7** — no fee/payment column
  anywhere on the employer card.
- **Action area** (`mt-4 flex flex-wrap gap-2`): the verify toggle + the tier control (see below).

## Actions (the core of this surface)
Two independent mutations per row; each disables only its own row while pending (`pendingId===r.id`).
1. **Verify toggle** — a single button mirroring reviews' remove/restore pair: when `verified===false`
   show "Doğrula" (emerald-bordered, `BadgeCheck` icon) → `act(r.id,'verify')` calls
   `setEmployerVerified(id,true)`; when `verified===true` show "Doğrulamayı kaldır" (neutral/gray
   bordered, `RotateCcw`) → `setEmployerVerified(id,false)`. Button shape mirrors reviews:
   `inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-xs font-semibold
   disabled:opacity-50`; label flips to "İşleniyor…" while pending.
2. **Set tier** — three small segmented buttons (Free / Verified / Premium). The button matching the
   employer's CURRENT tier is the active/selected style (`bg-brandCareer text-white`); the other two
   are neutral bordered and call `setEmployerTier(id, <thatTier>)` on click. Clicking the
   already-current tier is a no-op (disable it). Keep the verify-boolean and the tier-enum
   conceptually distinct (an employer can be `tier='free'` yet `verified=true`, or vice versa — they
   are separate columns; do not couple them in the UI).

## Tier badges (`TIER_BADGE` record — mirror reviews' `STATUS_BADGE`, keyed by tier)
TR-hardcoded labels (admin chrome — see i18n note). Colors:
- `premium` → **amber** (`bg-amber-100 text-amber-700` + dark) — the premium/retainer signal; this is
  the one amber pill, mirroring how reviews uses amber for `flagged`.
- `verified` → emerald (`bg-emerald-100 text-emerald-700` + dark).
- `free` → neutral gray (`bg-gray-100 text-gray-600` + dark).
- Unknown/future tier → fall back to the gray pill (mirror reviews' `?? STATUS_BADGE.published`
  defaulting); never crash on an unmapped value.

## Every UI state
- **loading** — admin pages here ship no `loading.tsx` (reviews ships none); the server `await` blocks.
  If a Suspense skeleton is added, keep it neutral gray, no amber.
- **empty** (no employers in this filter) — the `rows.length === 0` block: centered muted text
  "Bu filtrede işveren yok" (mirror reviews' "Bu filtrede değerlendirme yok"). NOT an error, no CTA
  (admin doesn't create employer accounts — they self-register, Spec 11).
- **error** — two kinds: (a) page-level read error is `console.error`'d and renders an empty list
  (mirror reviews `page.tsx`: log + `data ?? []`); (b) an action failure sets the client `error` state
  → red `<p>` above the list (e.g. `NOT_FOUND` → "İşveren bulunamadı, sayfayı yenileyin").
- **success** — the action's `revalidatePath` re-renders the list with the new tier pill / verified
  check; `pendingId` clears, buttons return to idle. No toast needed (mirror reviews).
- **locked / gated** — flag OFF and/or non-admin: the admin layout already returns **real HTTP 404**
  for non-allowlisted users (**R8 #8**: Next 14.2 `notFound()` is 200 in dev, 404 in prod). The
  `CAREER_VERTICAL_ENABLED` flag does NOT gate `/admin/*`; if the console must be hidden while the flag
  is OFF, add a defense-in-depth `if (!isCareerVerticalEnabled()) notFound()` at the top of THIS page
  (decide with the coordinator — must match the choice made for Spec 24 so the whole console behaves
  uniformly; reviews has no such check). No per-row locked-dossier state on this surface.

## Amber accent usage (`brandCareer`, swaps reviews' teal)
- The **active filter pill** and the **selected tier button** are `bg-brandCareer text-white` (the
  teal→amber swaps; mirror reviews' `bg-teal-600` active pill). Everything else neutral.
- The `premium` tier badge uses the `amber-100/700` Tailwind pair (already AA-safe) — do NOT amber-tint
  every pill or the premium signal is lost. Verify/unverify buttons stay emerald/gray bordered (mirror
  reviews' emerald-restore / red-remove buttons); error text stays red.
- Accent **text** must use `brandCareer-700` (DEFAULT amber-600 is below 4.5:1 AA); admin pills use the
  literal `amber-100 text-amber-700` pair (not the `brandCareer` token), matching reviews' literal
  `amber-100 text-amber-700` for `flagged`.

## Data it needs (UX level — exact field names live in the RPC)
- **Reads (all employers):** per row — id (action target), company name, current tier, verified
  boolean, created timestamp, and an optional requisition count. Page-level: optional `?tier` filter.
  PII-light — no decrypted contact in the list.
- **Sends (per action):** the employer id + the new value (the target tier enum, or the verified
  boolean). The action re-derives admin identity from the session, never from the client.
- **i18n:** admin chrome is **TR-hardcoded by policy** (Admin i18n policy: `+TODO i18n-b4`) — mirror
  `AdminReviewsList`'s literal-TR `FILTERS`/`STATUS_BADGE`. Do NOT route these through the
  `careerVertical.*` dictionary (that is employer/worker-public surfaces only). No RTL needed (TR-only).

## Edge cases
- **Tier/verified independence** — these are two separate DB columns; setting tier must not touch
  `verified` and vice versa (each action calls only its own RPC). The UI must reflect both states
  simultaneously and not assume `verified` implies `premium`.
- **No-op self-click** — clicking the already-current tier button does nothing (disable it) so a
  redundant write + revalidate is avoided.
- **Stale double-action** — the RPCs are plain idempotent updates (no compare-and-set guard, unlike
  requisitions); a double-click just re-applies the same value harmlessly. Still gate per-row with
  `pendingId` to prevent overlapping transitions.
- **`NOT_FOUND`** — RPC returns `{ok:false,reason:'NOT_FOUND'}` if the id is gone (deleted between
  read and click) → action maps to a red error; the next `revalidatePath` drops the stale row.
- **Read failure** — page logs + renders empty list (mirror reviews); never a crash.
- **Audit (R13/R14)** — both actions SHOULD write a `glatko_admin_audit_log` row via
  `lib/admin/audit.ts` (add `career_employer_tier_change` + `career_employer_verify` action types and a
  `career.employer_accounts` target — first confirm per R13 that `target_table` has no CHECK/enum
  rejecting the schema-qualified string; per R14, the audit-union extension lands before these actions
  type-check). Best-effort / never-throw, mirroring health's dispatch pattern.
- **Action authz** — `requireAdmin()` runs first in BOTH actions (mirror reviews); a non-admin POST to
  the server action is rejected even though the layout already gates the page render.
- **revalidatePath path** — literal route-pattern `/[locale]/admin/career/employers` + `"page"`
  (mirror reviews' `/[locale]/admin/reviews`).
