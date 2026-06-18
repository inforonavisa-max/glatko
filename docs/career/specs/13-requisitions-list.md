# Spec 13 — My Requisitions list (`/career/employer/dashboard/requisitions`)

> Docs-only build spec. Downstream agent writes the code. Read alongside
> `career-vertical-plan-v1.md` (PART 2 §6 employer dashboard + §IA sitemap) and
> `BUILD-RULES.md` (R1, R5/R11, R8 #2 cross-employer denial, R8 #7 i18n, R8 #8 flag-off).
> The employer's first authed screen after login: a status-pill list of their own requisitions
> + a "new requisition" CTA. Auth-gated, employer-only, `noindex`.

## What this mirrors (read these first)
- **Page route + auth/dynamic pattern** — mirror the gated booking page
  `app/[locale]/health/(gated)/randevu/[holdId]/page.tsx`: server component, `setRequestLocale`,
  `notFound()` on bad locale, reads the session cookie, calls ONE read helper, and renders a
  **designed graceful screen** when the read returns null (never crashes). Same `force-dynamic` +
  `robots: { index:false, follow:false }` exports.
- **Gated-group guard** — lives under a career `(gated)` route group whose `layout.tsx` mirrors
  `app/[locale]/health/(gated)/layout.tsx` (defense-in-depth `if (!isCareerVerticalEnabled()) notFound()`).
- **List card** — mirror `components/glatko-saglik/ProviderCard.tsx` → new
  `components/glatko-kariyer/RequisitionCard.tsx` (sync server component, no client JS, labels passed
  in by the page). Each card = one requisition row; the status pill is the analog of ProviderCard's
  `verified` badge (rounded-full pill, accent bg/text).
- **Loading / error** — mirror `app/[locale]/health/(gated)/loading.tsx` (neutral skeleton, no accent)
  and `.../error.tsx` (client retry boundary). New copies under the career `(gated)` group.
- **Token** — accent is `brandCareer` (amber-600 `#D97706`) everywhere health uses `brandHealth`
  (sky/teal). Import the segment from `lib/kariyer/config.ts` (`CAREER_ROUTES`); never hardcode
  `/career` literals or hex. Note: `CAREER_ROUTES` lacks a `requisitions` / `requisitionsNew` key
  today — add them there first (R14 ordering) and derive hrefs from the constant.

## Route & rendering
- Path: `app/[locale]/career/(gated)/employer/dashboard/requisitions/page.tsx` (canonical segment
  `career`, localized per `i18n/routing.ts`).
- `export const dynamic = "force-dynamic"` (**R11**: reads `auth.getUser()` / cookie session) and
  `export const metadata = { robots: { index:false, follow:false } }`. No `generateStaticParams`.
- **Auth gate:** derive the employer identity from the cookie session via `auth.getUser()` in the
  page (or a `lib/kariyer/auth.ts` helper). Not logged in → redirect to `/career/login` (use
  `@/i18n/navigation` redirect). Logged in but no `career_employer_accounts` row → "complete
  registration" screen linking to `/career/employer/register`.
- **Data read (R1):** call a `lib/kariyer/queries.ts` wrapper around the `career_employer_requisitions`
  read-RPC, **passing the employer's user id as an explicit `p_employer_user_id` arg** — the RPC runs
  as `service_role` (`auth.uid()` is NULL) and re-verifies `employer_accounts.user_id = p_employer_user_id`
  inside its body. Never pass an employer id sourced from the URL/searchParams.

## Layout
Single column, centered (`mx-auto max-w-3xl px-4`), mirroring the booking page container rhythm:
- **Header row** — page title ("Taleplerim") on the left; the **"Yeni Talep" CTA** (solid amber, see
  accent section) on the right, linking to `.../requisitions/new` (Spec 12). Stack on mobile.
- **Status legend / count** (optional, small) — "N talep" count line under the title.
- **List** — vertical stack (`space-y-3`) of `RequisitionCard`s, each a bordered rounded card
  (reuse ProviderCard's `rounded-2xl border bg-white p-5 shadow-premium-sm` shell + dark-mode
  variants). The whole card is a `<Link>` to the requisition detail (Spec 14,
  `.../requisitions/[id]`).

## RequisitionCard contents (per row — UX level)
- **Title line** — sector + role summary (e.g. "İnşaat · Kalıpçı ×6"); headcount total as a muted
  suffix. Neutral gray text (not amber).
- **Status pill** — top-right, the analog of the verified badge: `rounded-full px-2 py-0.5 text-xs
  font-medium` with a status-keyed color (see status table). Amber is reserved for the
  attention/action statuses; terminal/neutral statuses use gray/green.
- **Meta row** — created date (localized via `Intl.DateTimeFormat` + `intlLocale(locale)` from
  `lib/kariyer/intl.ts`, `Europe/Podgorica`), service path (commission / full-service), and a
  shortlist-ready signal ("N aday sunuldu") when applicable. Muted gray, `lucide-react` icons
  (`CalendarClock`, etc.) mirroring the booking summary.
- No worker identity, no name/contact, no fee amount on this list (fees live downstream in the
  unlock center). **R7** — no worker-side fee anywhere; payment UI is employer-only and not here.

## Status pills (the state set — from PART 2 §6 pipeline)
Map the requisition `status` to a localized label + color class. The full lifecycle:
`submitted` (Gönderildi) → `under_curation` (İnceleniyor) → `shortlist_ready` (Aday Hazır) →
`interest_expressed` (İlgi Bildirildi) → `approved` / `unlocked` (Onaylandı) → `placed` (Yerleşti) →
`in_guarantee` (Garanti Süresinde). Color guidance:
- **Attention/owner-action-pending** (`shortlist_ready`) → **amber** pill (`bg-brandCareer-50
  text-brandCareer-700`, dark `bg-brandCareer/15 text-brandCareer`) — this is the "act now" state.
- **In-progress neutral** (`submitted`, `under_curation`, `interest_expressed`) → gray pill.
- **Positive/terminal** (`approved`/`unlocked`, `placed`, `in_guarantee`) → green pill.
- Any unknown/future status string → fall back to a neutral gray pill (never crash; coerce defensively).
- A small `RequisitionStatus` → label+color map (in `lib/kariyer/...` or passed as `labels` from the
  page like ProviderCard) keeps the card a pure presentational component.

## Every UI state
- **loading** — neutral skeleton list (mirror health `loading.tsx`): a few gray `rounded-2xl` row
  placeholders, no amber. Shown by the Suspense boundary during the RPC read.
- **empty** (employer has zero requisitions — the common first-login state) — designed empty state
  (dashed-border block, mirror the pool-browse empty pattern, `Inbox`/`FileText` icon): "Henüz talep
  oluşturmadınız" + the **primary amber "Yeni Talep" CTA** as the single call to action. This is NOT
  an error and NOT a fake card.
- **error** (read-RPC throw / network) — the client `error.tsx` boundary with an amber retry button
  (mirror health error; swap teal gradient → amber). A read failure lands here gracefully, never a
  crash or a fake-empty list.
- **success** — the header + status-pill card list + the CTA.
- **locked / gated** — three layers, none re-implemented here beyond the page-level gate:
  (1) flag OFF → middleware quarantine → **real HTTP 404** (**R8 #8**); the `(gated)` layout is
  defense-in-depth. (2) not authenticated → redirect to `/career/login`. (3) authenticated non-employer
  (no `employer_accounts` row, e.g. a worker session) → "this area is for employers" screen linking to
  registration; do NOT show another employer's data. There is no in-card locked dossier state on this
  surface — unlock/reveal lives on the requisition detail (Spec 14) + unlock center.

## Amber accent usage (`brandCareer`, swaps health's sky/teal)
- The **"Yeni Talep" CTA** is the primary conversion action → **solid amber-600** (`bg-brandCareer`,
  white text, `rounded-xl`, hover deepens toward `brandCareer-700`). This is the ONE solid amber
  button on the surface — it replaces health's `from-teal-500 to-teal-600` gradient button. Use the
  same shadow rhythm (`shadow-lg shadow-brandCareer/25`).
- The **`shortlist_ready` status pill**, any focus rings, and meta-row accent icons use `brandCareer`
  (DEFAULT for icon/large-UI fills; `brandCareer-700` for any accent *text* — DEFAULT amber-600 is
  below the 4.5:1 AA text floor, mirror the health token comment).
- Other status pills are gray (neutral/in-progress) or green (positive/terminal) — do NOT amber-tint
  every pill, or the "act now" signal loses meaning. Error/danger stays red; spinner inherits CTA white.

## Data it needs (UX level — exact field names live in the RPC)
- **Reads:** the authed employer's user id (from the cookie session, passed to the RPC as
  `p_employer_user_id`); the list of THAT employer's requisitions — per row: an id (for the detail
  link), sector + role/headcount summary, status, created timestamp, service path, and a
  shortlist-presented count/flag. Page-level: the employer-account-exists check (to choose
  empty vs not-registered vs list).
- **Sends:** nothing (read-only list). Actions (create / open detail) are navigations, not mutations.
- All labels (title, status labels, empty/CTA copy, meta) localized under the `careerVertical.*`
  dictionary subtree (**R8 #7** — deep 9-locale parity; CI `i18n-check.sh` only checks top-level keys,
  so nested drift ships silently). No TR-hardcoded strings (this is an authed but employer-PUBLIC
  surface, not an admin-only carve-out). RTL for `ar`.

## Edge cases
- **Cross-employer denial (R8 #2)** — the RPC scopes strictly by `p_employer_user_id` and re-verifies
  ownership; even a tampered/guessed id cannot surface another employer's requisitions. The page must
  never accept an employer id from the URL.
- **Not-registered employer** — authed user with no `employer_accounts` row → the "complete
  registration" screen, never an empty requisitions list (which would imply they have an account).
- **Unknown / future status value** — coerce to a neutral gray pill + a safe label; never throw on an
  unmapped status (forward-compat with new pipeline stages).
- **Date formatting** — use `intlLocale(locale)` (me/sr → Latin Sırpça, not İngilizce/Kiril) +
  `Europe/Podgorica`, mirroring `ProviderCard`/booking; never `toLocaleString()` with raw locale.
- **Flag OFF** — gated route → real HTTP 404 (**R8 #8**); the page assumes the flag/middleware gate
  already ran and does not re-implement it (the `(gated)` layout `notFound()` is the only in-tree
  re-check).
- **`<a>` nesting** — the card outer element is a single `<Link>` to detail; do NOT nest the CTA or
  any inner link inside it (HTML rule, same as ProviderCard's div-wraps-links structure). The "Yeni
  Talep" CTA lives in the header row, outside the list, so there is no nested-anchor conflict.
- **Empty vs error distinction** — zero rows = designed empty state with CTA; an RPC failure = the
  error boundary. Never render empty-looking success when the read actually failed.
