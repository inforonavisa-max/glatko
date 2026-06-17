# Spec 27 — Owner Unlock Approval Gate (`/admin/career/unlocks`) + `AdminUnlocksList`

> Docs-only build contract. Downstream agent writes the code (NO app/lib/SQL here).
> Read with `career-vertical-plan-v1.md` (PART 2 §10 "reveal/unlock approval gate", PART 4 steps
> 1→4) and `BUILD-RULES.md` (R1, R7, R8 #2/#9, R13, R15). This is **THE monetization gate UI** —
> the owner-side counterpart to the employer-side Unlock Center (Spec 16). It is where the owner
> approves/denies an employer's interest, triggers the fee-invoice stub, and marks-paid to flip a
> worker's dossier to **unlocked**. Lives under `/admin` (allowlist-gated, `noindex`), NOT a
> `(gated)` career route → it is EXEMPT from `CAREER_VERTICAL_ENABLED` (admins manage pre-launch).

## What this mirrors (read these first)
- **Server page** — mirror `app/[locale]/admin/requests/page.tsx`: `force-dynamic` async server
  component, awaits `params` + `searchParams.status`, calls one `createAdminClient()` data fn,
  renders header + status-filter pills (`Link` `?status=…`) + count + error banner + empty block +
  the client list. New path: `app/[locale]/admin/career/unlocks/page.tsx`.
- **Client list island** — mirror `components/admin/AdminRequestsList.tsx` (expand/collapse cards,
  `useTransition` per-card, inline action buttons, inline `actionError`, reason-input reveal idiom).
  New: `components/glatko-kariyer/AdminUnlocksList.tsx` (`"use client"`).
- **Server actions** — mirror `app/[locale]/admin/requests/actions.ts` (`"use server"`,
  `requireAdmin()` via `auth.getUser()`+`isAdminEmail`, `createAdminClient()`, `revalidatePath`,
  `{ success, error }` return). New: `app/[locale]/admin/career/unlocks/actions.ts`.
- **Sidebar** — add a "Açılımlar" item under the "Kariyer" group in `components/admin/AdminSidebar.tsx`.
- **RPCs (already in migration `076`):** `career_admin_list_unlocks(p_status)` (read),
  `career_admin_approve_unlock(p_id)` (approve + invoice stub), `career_admin_mark_unlock_paid(p_id)`
  (atomic flip to unlocked). Each returns `{ ok, reason? }`. Service-role EXECUTE only.

## Route & rendering
- `export const dynamic = "force-dynamic"` (live owner action queue; never ISR-cache).
- `noindex` + auth inherited from `app/[locale]/admin/layout.tsx` (no user → `/login`; not in
  `isAdminEmail` → `notFound()`). Do NOT re-implement auth here, and do NOT import the career flag.
- No `generateStaticParams` / no `setRequestLocale` re-call beyond the page-level `setRequestLocale`
  the requests mirror already does.

## Chrome language — TR-HARDCODED (admin-i18n-policy)
All visible strings are Turkish string literals in JSX, NOT `careerVertical.*` dictionary keys
(matches `/admin/*`). Title "Açılım Onayları"; subtitle "İlgi → Onay → Fatura → Ödendi → Kilit
açıldı". The 9-locale dictionaries are for the public/employer/worker surfaces only.

## The gate state machine (load-bearing — derive each card's state from the `reveal_unlocks` row)
State derives from `(owner_approved, payment_status, unlocked_at)`. `payment_status` enum is
`unpaid | invoiced | paid` (no "denied" value — see GAP). Four live states + one terminal:
1. **interest** — `owner_approved=false, payment_status='unpaid'`. The owner action queue's default.
   Actions: **Onayla** (approve) and **Reddet** (deny — see GAP). Amber pill "İlgi — onay bekliyor".
2. **approved / invoiced** — after `career_admin_approve_unlock`: `owner_approved=true,
   payment_status='invoiced', fee_invoice_id='INV-…'`. The approve RPC IS the "trigger fee invoice
   stub" — it stamps a placeholder `fee_invoice_id` in the same atomic update; there is no separate
   invoice action. Action: **Ödendi olarak işaretle** (mark-paid). Amber pill "Onaylandı — fatura
   kesildi (ödeme bekliyor)"; show the `feeInvoiceId`.
3. **paid / unlocked** — after `career_admin_mark_unlock_paid`: `payment_status='paid',
   unlocked_at=now()` in ONE update. **This single byte releases the employer's full dossier**
   (the employer read RPC + document signer re-check `owner_approved && paid`). Green/success pill
   "Kilit açıldı" + `unlockedAt` date. No further action (terminal-success).
4. **denied** (GAP — no enum/RPC yet) — see GAP; until built, surface deny as a disabled/"yakında"
   control or omit, do NOT fake it client-side.

Transitions are **server-authoritative + state-guarded**: every RPC is an expected→next
compare-and-set. `approve` only flips `owner_approved=false` rows (else `{ok:false,
reason:'STATE_MISMATCH'}`); `mark_unlock_paid` refuses rows that aren't `owner_approved=true` (else
`{ok:false, reason:'NOT_APPROVED'}`). After any successful action, `revalidatePath` re-reads and the
card re-renders from fresh server data — the client NEVER fabricates the unlock locally.

## Data it needs (UX level — PII-light; never decrypt here)
One `careerAdminListUnlocks({ status })` data fn (mirror the requests page inline query, but call
`career_admin_list_unlocks` via `createAdminClient().rpc(...)`). Per row: unlock id, requisition
ref, **worker CODE** (never name), **employer company name**, interest timestamp, the three gate
flags (`ownerApproved`, `paymentStatus`, `unlockedAt`), and `feeInvoiceId`. **R7/R8 #9:** this
surface shows worker CODE + company only — it MUST NEVER render a worker's name/phone/email/passport
or any signed document URL (PII decryption lives only in the talent-curation RPC, not here). Status
filter pills map to the `p_status` arg (`unpaid` = interest queue, `invoiced` = awaiting payment,
`paid` = unlocked, `Tümü` = `null`); default filter = the action queue (`unpaid`/interest).

## Actions (server actions → `createAdminClient().rpc(...)`)
- `approveUnlock(unlockId)` → `career_admin_approve_unlock`. Maps `STATE_MISMATCH` → "Bu açılım
  zaten onaylanmış/durumu değişmiş." On `ok` → `revalidatePath` + audit (R13).
- `markUnlockPaid(unlockId)` → `career_admin_mark_unlock_paid`. Maps `NOT_APPROVED` → "Önce onaylayın."
  On `ok` → `revalidatePath` + audit. **Phase-0 stub:** marking paid is a MANUAL action — no live
  PSP; off-platform settlement is confirmed by the owner by hand. A TODO marks where a real PSP
  webhook replaces this human call (the SQL stays identical; only the caller changes).
- `denyUnlock(unlockId, reason)` → **GAP** (no RPC). See GAP.
- **R1:** these are admin/service-path mutations; identity is the cookie-session admin re-checked by
  `requireAdmin()` before the service-role RPC runs (two-layer gate). No `auth.uid()` inside any RPC.
- **R7:** every fee/invoice/payment string is EMPLOYER-direction only. No worker-charging wording.
- **R13 (audit):** `logAdminAction` (`lib/admin/audit.ts`) must record each approve/mark-paid/deny.
  Its `AdminActionType` + `AuditTargetTable` unions do NOT yet include career types → extend them
  (`career_unlock_approve | career_unlock_paid | career_unlock_deny`, target
  `career.reveal_unlocks`). FIRST confirm `glatko_admin_audit_log.target_table` has no CHECK/enum
  rejecting a schema-qualified `career.*` string; if constrained, a migration must extend it
  (R13/R15 — no prod apply without explicit go). Audit failure must never block the action.

## amber-accent usage (`brandCareer` = amber-600 `#D97706`, swaps health's teal)
- `interest` + `invoiced` pills: amber-tinted (`bg-amber-100 text-amber-700 dark:bg-amber-500/15
  dark:text-amber-300`). **Onayla** = solid amber CTA (`bg-amber-600 text-white hover:bg-amber-700`,
  the requests mirror's green-approve geometry, amber here).
- **Ödendi** (mark-paid) = solid amber CTA as well (it's the gate's money step). **unlocked** pill is
  GREEN/success (completion, not a call-to-action). **Reddet** = neutral/red-outline (danger idiom).
- Amber is wayfinding + the two action CTAs only; never amber-color neutral metadata or the unlocked
  completion state. Every amber surface needs its `dark:` parity.

## Every UI state
- **loading** — server-rendered (`force-dynamic` resolves before paint, like the requests mirror); no
  client skeleton required. Per-card actions show a `Loader2`/"İşleniyor…" busy label via
  `useTransition` (`disabled:opacity-50`).
- **empty** — zero unlock rows for the active filter → designed empty block (mirror requests'
  centered icon + "Açılım talebi yok" muted note, amber-tinted icon at low opacity). Day-1 expected
  state; must look intentional, not broken.
- **error** — the list RPC fails → red error banner at top (mirror requests' `error` block,
  "Açılımlar yüklenemedi"); never a 500 white screen. A per-card action failure shows the mapped
  message in the card's inline `actionError` strip and the card stays in its prior state.
- **success** — after approve: card flips interest → invoiced (Ödendi button appears). After
  mark-paid: card flips invoiced → unlocked (green pill, actions gone). Optional inline confirmation.
- **locked** — N/A in the reveal sense (this page never shows a dossier). The gate's "locked" rows
  ARE states 1–2; the owner here only manipulates flags, never views identity (R7/R8 #9).

## Edge cases
- **Stale console view** — owner clicks Onayla on a row already approved elsewhere → RPC
  `STATE_MISMATCH` → mapped toast/inline note; `revalidatePath` reconciles to truth. Same idempotency
  protects double-click mark-paid (already-paid row → guard returns mismatch; no double release).
- **Double-click** — `useTransition` pending blocks the second click; RPCs are compare-and-set so a
  race is a no-op, not a double mutation.
- **Mark-paid before approve** — guarded server-side (`NOT_APPROVED`); the button only renders on
  `invoiced` rows, but the action never trusts the client.
- **Worker de-showcased / consent revoked after approval** — the join in `career_admin_list_unlocks`
  still returns the row (it joins on `worker_id`); the owner can still mark-paid, but the EMPLOYER's
  read RPC re-checks showcase/consent at signing time (Spec 16 surfaces "no longer available"). This
  page does not re-validate worker availability — note the boundary; do not block mark-paid here.
- **Flag exemption** — never gate this page on `CAREER_VERTICAL_ENABLED`; admins act pre-launch.
- **Unmapped status** — map any unexpected `paymentStatus`/flag combo to a neutral gray pill; never
  crash on an unmapped value (mirror the requests `map[status] ?? fallback` pattern).
- **RTL** — admin chrome is TR-only (LTR); no RTL handling on this page.
- **Dark mode** — every amber/green/red surface needs its `dark:` variant 1:1 with the mirror.

## GAP — DENY has no RPC or enum value (must resolve before claiming "deny" works)
The task requires **approve/deny**, but migration `076` ships ONLY approve + mark-paid, and the
`career.unlock_payment_status` enum (`unpaid|invoiced|paid`) has no terminal "denied" value. Options
for the migration owner (R15 — author/dry-run only, no prod apply without explicit go): (a) add a
`career_admin_deny_unlock(p_id, p_reason)` RPC that state-guards `owner_approved=false` and records a
deny (e.g. a `denied_at`/`deny_reason` column or a status flag), OR (b) add a `denied` enum value.
Until one lands, the deny control must be rendered disabled/"yakında" — do NOT simulate deny
client-side and do NOT delete the gate row (audit trail must survive). Flag this loudly so deny isn't
mistaken for shipped.

## Deps that must exist first (reference, do not block)
- `app/[locale]/admin/layout.tsx` + `isAdminEmail` (present, inherited).
- `components/admin/AdminSidebar.tsx` — add "Kariyer › Açılımlar" entry.
- `createAdminClient()` (`@/supabase/server`), `lib/admin/audit.ts` — present (extend the audit
  unions, R13).
- Migration `076` RPCs `career_admin_list_unlocks` / `career_admin_approve_unlock` /
  `career_admin_mark_unlock_paid` — authored; verify applied on the target DB (R15). The DENY RPC is
  NOT authored (GAP above).
