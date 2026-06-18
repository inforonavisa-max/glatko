# Spec 26 — AdminShortlistBuilder (owner console)

> Owner/RoNa-Legal console surface inside `/admin/career/requisitions/[id]`. Curate a
> per-requisition shortlist of anonymized workers, then **publish** it (set
> `presented_to_employer=true`) so the employer can see the anonymized cards. Worker
> identity is NEVER revealed here — that is the separate unlock gate (Spec for unlocks).

## Mirror target (health → career)
- **Component pattern:** mirror `components/admin/AdminReviewsList.tsx` — a `"use client"`
  list with per-row action buttons that call a server action wrapped in `useTransition`,
  with `pendingId`/`error` local state. This is the canonical admin list+mutate pattern.
- **Page pattern:** mirror `app/[locale]/admin/reviews/page.tsx` — server component, `createAdminClient()`,
  fetch rows, render the client list. Career detail page is `app/[locale]/admin/career/requisitions/[id]/page.tsx`.
- **Layout chrome:** the shared `/admin` layout + `AdminSidebar.tsx` already wrap it; add a
  "Talepler" (Requisitions) sidebar entry there.

## Data (UX-level — exact field names live in the RPCs)
Read path is `createAdminClient()` → `SECURITY DEFINER` RPCs (service_role), NEVER base-table or RLS.
- **Requisition header:** sector, roles+headcount, requirements, terms, service path, current status.
- **Current shortlist items:** the worker cards already added to this requisition — each is an
  anonymized card (worker code, role/trade, skill tier, experience band, region, readiness score,
  pipeline stage) PLUS the item id (needed to remove). NOTE: `076` ships add/remove/publish writes
  and `career_admin_search_workers`, but `074`'s shortlist read (`career_employer_requisition`)
  only returns `presented_to_employer=true` items and omits item ids. **The admin needs an
  un-presented shortlist read that returns item ids + the shortlist id + `presented_to_employer`.**
  Flag this as a missing RPC (see Edge cases) — do not invent client-side joins.
- **Candidate search panel:** `career_admin_search_workers(q, verification, limit, offset)` returns
  un-anonymized rows; in THIS surface render only the anonymized fields + worker code (curation,
  not unlock) so the builder reads symmetrically with what the employer will see.
- **Writes:** add → `career_admin_add_shortlist_item(requisitionId, workerCode, stage, addedBy)`
  (creates the shortlist on first add); remove → `career_admin_remove_shortlist_item(itemId)`;
  publish → `career_admin_publish_shortlist(shortlistId)` (flips `presented_to_employer=true` +
  advances requisition `submitted|under_curation → shortlist_ready`). `addedBy` = the admin's user id.

## Layout
Single detail page, stacked sections:
1. **Requisition summary card** (read-only): sector, roles×headcount, key requirements, service-path
   pill, status pill.
2. **Current shortlist** (the builder body): list of added worker cards; each card shows worker code +
   anonymized attributes + stage + a **Remove** button. A header row shows count + a **Publish** button.
3. **Add candidates** panel: search input (worker code / role / trade / region) + verification filter;
   results are anonymized rows each with an **Add** button (disabled if already on the shortlist).

## UI states (every one is required)
- **Loading (page):** server component awaits RPCs; no skeleton needed (SSR). `force-dynamic` (R11 —
  reads `auth.getUser()` for admin gate + service-role state).
- **Loading (action):** per-row button shows "İşleniyor…" and is `disabled` while its transition is
  pending (mirror `pendingId === r.id`). Other rows stay interactive.
- **Empty (no items yet):** shortlist body shows a centered muted message ("Bu talebe henüz aday
  eklenmedi") and the **Publish** button is disabled (cannot publish an empty shortlist).
- **Empty (search no results):** results panel shows "Aday bulunamadı".
- **Error:** a single red text line above the list (mirror AdminReviews `error` state); message comes
  from the action result's `error`/`reason`; never throws to the user.
- **Success (add):** the worker card appears in the current-shortlist list (revalidate the path);
  its Add button in the search panel becomes disabled/"Eklendi".
- **Success (remove):** the card disappears from the list.
- **Locked / already-published:** once `presented_to_employer=true`, show an amber "Yayınlandı"
  badge on the section header, disable **Publish**, and keep Add/Remove allowed only per policy
  decision below (default: still allow add/remove but show a "değişiklikler yeniden yayınlanmalı"
  hint — re-publish is idempotent and safe). If the requisition status is past `shortlist_ready`
  (interest/approved/placed), make the whole builder read-only.
- **Forbidden:** non-admin email → the shared `/admin` layout already 404s/redirects; this surface
  adds no extra gate, it inherits it.

## Amber accent usage (token `brandCareer` = amber-600 #D97706; replaces health's sky-600/teal)
- **Publish** primary button: amber-600 bg, white text (`bg-brandCareer text-white hover:bg-brandCareer-700`).
- "Yayınlandı" badge + active sidebar entry: amber tints (`bg-brandCareer-500/10 text-brandCareer-700`,
  dark `bg-brandCareer-500/15 text-brandCareer-300`) — exactly where AdminReviews/AdminSidebar use teal.
- **Add** button: amber outline (`border-brandCareer-300 text-brandCareer-700 hover:bg-brandCareer-50`).
- **Remove** button: keep neutral/red (destructive), NOT amber.
- Stage/status pills: neutral grays + one amber for the "current/active" stage. Readiness score uses
  emerald/amber/gray by band, not the brand accent.
- Admin chrome copy is TR-hardcoded by policy (admin i18n deferred, TODO i18n-b4) — do not wire
  next-intl into this surface; reuse the AdminReviews string style.

## Edge cases
- **Missing admin shortlist-read RPC:** `074`/`076` lack an RPC that returns the *un-presented*
  shortlist with item ids + shortlist id for the console. Add one (e.g. `career_admin_get_shortlist(p_requisition_id)`)
  in a follow-up migration mirroring `076`'s SECURITY-DEFINER + service_role-only conventions; until
  it exists the page cannot drive Remove or know the shortlist id to Publish. Do not read base tables.
- **First add creates the shortlist:** `add_shortlist_item` lazily creates the shortlist row; the
  Publish button must therefore read the shortlist id from the (new) read RPC after the first add,
  not assume it pre-exists.
- **Duplicate add:** adding the same worker twice should be prevented (disable Add when present, and
  rely on a DB unique constraint if present); surface a benign error if it slips through.
- **Worker un-showcased after adding:** a curated worker may later flip `is_showcased=false`; the
  employer-facing read joins the showcase view and will silently drop it. Show a warning marker on
  any current-shortlist card whose worker is no longer showcased so the owner re-curates.
- **Publish state-guard:** `publish_shortlist` only advances status from `submitted|under_curation`;
  if the requisition already moved on, publishing still flips the bool but won't regress status —
  treat the RPC's `ok`/`reason` as the source of truth, don't optimistically assume the transition.
- **Empty publish:** block client-side (disabled button) AND tolerate server rejection.
- **Audit:** confirm `glatko_admin_audit_log` accepts schema-qualified `career.*` target rows (R13)
  before relying on audit; at minimum log the publish action.
- **No identity here:** this surface must render ZERO PII even though `search_workers` returns
  decrypted fields — project only anonymized attributes + worker code in the JSX (R-gate discipline).

## Acceptance
Owner opens a `submitted` requisition → searches workers → Adds 2–3 → they appear in the current
shortlist → Removes one → clicks **Publish** → header shows amber "Yayınlandı", requisition status
becomes `shortlist_ready`, and the matching employer's requisition detail now shows those anonymized
cards (and only those). No name/phone/email/passport ever appears in the admin shortlist DOM.
