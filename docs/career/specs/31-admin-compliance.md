# Spec 31 — Compliance / Documents (`/admin/career/compliance`)

> Docs-only build spec. Downstream agent writes the code (NO app/lib/SQL here).
> Read alongside `career-vertical-plan-v1.md` (PART 2 §10 "compliance/documents (consent log,
> retention timers, access audit)", PART 3 "audit trail for PDPA/GDPR", PART 6.D data-protection)
> and `BUILD-RULES.md` (R1, R6, R7, R8 #6, R13, R15). This is a **READ-ONLY PDPA/GDPR scaffolding
> view**: three audit surfaces in one page — (1) consent log, (2) retention timers, (3) document
> access audit trail. NO mutations (no consent edits, no purge button) in Phase 0 — it is a window
> onto the compliance state, not a control panel. Lives under `/admin`, NOT a `(gated)` career route.

## What this mirrors (read these first)
- **Page route** — mirror `app/[locale]/admin/reviews/page.tsx`: a server component that awaits
  `params`, calls `setRequestLocale(locale)`, reads `searchParams` for a tab/filter, runs
  `createAdminClient()` service-role `.select(...)` reads (`.order("…", {ascending:false}).limit(100)`),
  maps rows to a typed `Row` interface exported from the page, and renders a client list component.
  New page: `app/[locale]/admin/career/compliance/page.tsx`.
- **Client list island** — mirror `components/admin/AdminReviewsList.tsx` (filter pills + a
  `STATUS_BADGE: Record<string,{label,cls}>` map + a rows table). New: `components/admin/career/
  CareerComplianceView.tsx` (`"use client"`). Phase-0 has NO action buttons (unlike AdminReviewsList's
  hide/restore) — it is a viewer; drop the `useTransition`/action wiring entirely.
- **Auth gate** — inherited from `app/[locale]/admin/layout.tsx` (no user → `redirect(/login)`; not in
  `isAdminEmail` allowlist → `notFound()`). Do NOT re-implement any auth check. This is why
  `/admin/career/*` is exempt from `CAREER_VERTICAL_ENABLED` — admins manage the vertical pre-launch.
- **Sidebar** — the "Kariyer" admin nav item already exists (Spec 23). This compliance page is a
  sub-route; surface it as a tab within the career admin area or a secondary link, matching how
  existing `/admin` sections sub-navigate. Do not add a second top-level sidebar entry.

## Route & rendering
- Path: `app/[locale]/admin/career/compliance/page.tsx`.
- `export const dynamic = "force-dynamic"` (live audit reads; never ISR-cache an admin view).
- `noindex` inherited from the admin layout `metadata.robots` — do not re-declare.
- No `generateStaticParams`; `setRequestLocale(locale)` per the reviews-page pattern.
- NO `isCareerVerticalEnabled` import — this page is outside the career flag gate (Spec 23 rule).

## Chrome language — TR-HARDCODED (admin-i18n-policy)
All visible strings are Turkish string literals in JSX, NOT `careerVertical.*` dictionary keys
(matching `/admin/reviews` and all `/admin`). Page title: "Uyum & Belgeler" · subtitle: "Onam kaydı,
saklama süreleri, belge erişim denetimi (salt-okunur)". Tab labels: "Onam Kaydı", "Saklama Süreleri",
"Erişim Denetimi". Do NOT wire the 9-locale dictionaries here (RTL N/A — admin chrome is TR/LTR only).

## Layout — three tabs (filter-pill row, mirror AdminReviewsList `FILTERS`)
`<h1>` + subtitle, then a pill row switching three tab views via `?tab=consents|retention|access`
(`<Link href=…?tab=…>` like the reviews status pills; active pill `bg-amber-600 text-white`, inactive
`bg-gray-100`). One table renders per active tab. Each table: sticky-ish header row + `.limit(100)`
rows, newest-first, with a small "{rows.length} kayıt" count under the title.

1. **Onam Kaydı (consent log)** — append-only PDPA/GDPR consent trail. Columns: worker CODE (anonymized
   identifier, never name — R7), consent purpose (e.g. "showcase", "document-share"), granted/revoked
   state badge, granted-at date, revoked-at date (if any). Source: `career.consents` joined to the
   worker's `worker_code`.
2. **Saklama Süreleri (retention timers)** — per-document retention countdown for PDPA auto-purge
   tracking. Columns: worker CODE, document category (passport/diploma/work_photo/…), visibility tier
   (`internal_only`/`gated`/`public_anonymized`), consent_status, retention-until date + a derived
   **"kalan gün" (days remaining)** chip. Source: `career.worker_documents` (read `category`,
   `visibility`, `consent_status`, `retention_until` — NEVER `storage_path`; see R6 note below).
3. **Erişim Denetimi (access audit trail)** — every gated-original signed-URL issuance (R6 write path).
   Columns: document id (short), worker CODE, accessed-by (employer CODE/id — never employer PII),
   reveal-unlock id (short), accessed-at timestamp, ip-hash (already hashed in the table). Source:
   `career.document_access_log` joined to resolve the worker CODE. Newest-first; this is the
   "who-opened-what-when" forensic log.

## Data it needs (UX level — service_role read; NOT exact field names)
Three count-limited reads via `createAdminClient()` (one per tab; read only the active tab's source to
avoid pulling all three every render). **R1 N/A** — admin/service path is the intended caller; these
are aggregate audit reads, not per-user RPCs. Per tab the view needs:
- **consents**: each row = a worker CODE + the consent purpose + granted-or-revoked state + grant date
  + optional revoke date. (Resolve `worker_id → worker_code` so no UUID/name leaks.)
- **retention**: each row = worker CODE + document category + visibility tier + consent state + a
  retention-until date (the page derives days-remaining client-side). NO file path, NO signed URL.
- **access**: each row = document (short id), worker CODE, the accessing employer (CODE/id only),
  unlock reference (short id), access timestamp, ip-hash. Already-anonymized append-only rows.

GAP: migration `076` (career admin RPCs) may not yet expose admin read-RPCs for `consents`,
`worker_documents` retention fields, or `document_access_log`. `career.commission_records`,
`career.consents`, and `career.document_access_log` are **deny-all base tables** (RLS enabled, zero
permissive policy — R8 #6) so only `createAdminClient()` (service_role, bypasses RLS) or a SECURITY
DEFINER admin RPC can read them. Prefer a direct service-role `.select(...)` on the schema-qualified
tables if reachable; else route through a `076` admin read-RPC. Pick one, note which, coordinate the
migration owner (**R15** — no prod apply without explicit go). If a source isn't ready, render that
tab's designed empty state (below), not a crash.

## amber-accent usage (brandCareer = amber-600 `#D97706`)
Mirror exactly how `AdminReviewsList` uses tinted chips; this page's vertical accent is amber (admin
chrome app-wide stays neutral gray/teal — only career content reads amber):
- Active tab pill: `bg-amber-600 text-white` (where reviews uses `bg-teal-600`).
- Consent/state badges (tinted-chip vocabulary, with `dark:` parity 1:1):
  `granted` → green `bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400`;
  `pending` → amber `bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400`;
  `revoked` → red `bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400`.
- **Days-remaining chip (retention)** — amber is the warning signal: ≤30 days → amber chip
  ("{n} gün kaldı"); already past `retention_until` → red chip ("Süresi doldu — temizlenmeli"); plenty
  of time / no timer set → neutral gray. Amber is wayfinding/warning only; do not amber-color neutral
  data cells or counts.

## UI states (every one)
- **loading** — server-rendered; the `force-dynamic` read resolves before paint (like
  `admin/reviews`). The admin layout shell renders immediately; the page streams in. No client skeleton.
- **empty (zero rows, real)** — career pre-launch legitimately has 0 consents / 0 documents / 0 access
  events. Each tab renders a designed centered muted note ("Henüz onam kaydı yok" / "Saklama süreli
  belge yok" / "Henüz erişim kaydı yok"), mirroring reviews' empty handling — must look intentional,
  not broken. This is the expected day-1 state.
- **error (a read fails)** — mirror `admin/reviews`: `console.error("[GLATKO:admin] …", error)` and
  fall through to `rows = data ?? []` so a failed read degrades to the empty state, never a 500 white
  screen for the owner. If the whole helper throws, it bubbles to the nearest admin error boundary.
- **success** — header + active tab's populated table + "{n} kayıt".
- **locked** — N/A in the gate sense, but **this is the most sensitive admin page**: it MUST NEVER
  render a worker's name/phone/email/passport, an employer's contact PII, a `storage_path`, or any
  signed/openable document URL (**R6, R7, R8 #9**). It shows worker/employer CODES, categories,
  states, dates, and already-hashed values only. No "view document" affordance exists here (that path
  is the unlock-center signer in Spec 16, which itself writes the access-log rows this page displays).

## Edge cases
- **No row-pull of private columns** — never `select("*")` on `worker_documents` (would pull
  `storage_path` / `watermarked_variant_path`); select only the retention/visibility/category/consent
  columns. Never touch `career.worker_profiles` base private columns — resolve worker CODE via the
  showcase VIEW or a CODE-only join (mirror Spec 23's "never the base private table" rule).
- **Read-only, so no audit row written (R13)** — this page performs zero mutations, so it writes no
  `glatko_admin_audit_log` row and needs no `target_table` union extension. (R13 audit-table
  compatibility matters for the career *action* pages, not this viewer.) Confirm it stays read-only;
  if a Phase-2 "force-purge"/"revoke-consent" action is ever added, THAT triggers R13 + an audit row.
- **Deny-all source tables (R8 #6)** — `consents` and `document_access_log` are deny-all to
  authenticated employer/worker; only the service-role admin client reads them here. Do NOT expose
  these to PostgREST or grant employer/worker SELECT to make this page work — route through
  service_role / an admin RPC. (Verifying these stay denied to non-admins is R8 #6's job.)
- **Days-remaining derivation** — compute client-side from `retention_until` vs now via the locale's
  `Intl`; a null `retention_until` → "—" / neutral (no timer set yet), never a NaN or crash.
- **Unmapped consent/visibility value** — map any unknown state string to a neutral gray badge
  (`map[status] ?? neutral`), never crash on an unmapped value (mirror reviews' fallback).
- **Pagination / volume** — `.limit(100)` newest-first per tab like reviews; if the access log grows
  large, note the truncation ("son 100 kayıt") rather than silently dropping older rows. No bulk
  export from this page (PART 4 anti-leakage; even for admins keep it a viewer).
- **Dark mode** — every amber/tinted surface needs its `dark:` parity variant, matching the
  `STATUS_BADGE` dark classes 1:1.
- **RTL** — N/A (admin chrome is TR/LTR only).

## Deps that must exist first (reference, do not block)
- `app/[locale]/admin/layout.tsx` + `isAdminEmail` gate — present (inherited).
- `components/admin/AdminReviewsList.tsx` (mirror source) + `@/lib/utils` `cn` — present.
- `createAdminClient()` (`@/supabase/server`) — present.
- The "Kariyer" admin sidebar entry (Spec 23) — present once Spec 23 lands; add this page as a sub-tab.
- Service-role read access to `career.consents`, `career.worker_documents` (retention/visibility cols),
  `career.document_access_log`, and a worker-CODE resolver — via migrations `073`/`074`/`076`;
  **verify availability** (see GAP); if an admin RPC is required instead of direct reads, route through
  it. No prod migration apply without explicit human go (**R15**).
