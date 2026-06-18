# Spec 22 — Career Login + Role Routing (`CareerLoginForm`, client + server resolver)

> Read `docs/career/career-vertical-plan-v1.md` (PART 2 §nav, sitemap `/career/login`) +
> `docs/career/BUILD-RULES.md` (esp. R1, R11, R14) first. **No app/lib/SQL code is written here —
> this is the build contract.** This surface reuses the GLOBAL Supabase auth (no new auth backend);
> its only novel job is resolving which dashboard to land on (worker vs employer).

## Mirror target
- **Page/form to mirror (verbatim structure):** `app/[locale]/login/page.tsx` — `"use client"`,
  `useTranslations`, `createClient()` from `@/supabase/browser`, `signInWithPassword`,
  `signInWithOAuth` (Google), email/phone tab toggle (`PhoneLoginPanel`), `Loader2` submit spinner,
  `motion` wrappers, `AccountLinkAlert` for oauth-only accounts, `AuthBrandPanel` left column.
  Keep the whole two-column `grid md:grid-cols-2` shell.
- **Layout to mirror:** `app/[locale]/(auth)/layout.tsx` — `metadata.robots = { index:false }`
  (noindex). Career login is additionally flag-gated (below), so it is BOTH noindex AND 404 when off.
- **Gate pattern to mirror:** `app/[locale]/health/(gated)/layout.tsx` `notFound()` on flag-off,
  and `lib/kariyer/flags.ts:isCareerVerticalEnabled()` (already scaffolded, default OFF).
- **New files:** `components/glatko-kariyer/CareerLoginForm.tsx` (client form), rendered by
  `app/[locale]/career/login/page.tsx` (server wrapper). Role resolution lives in a server helper
  `lib/kariyer/queries.ts:resolveCareerRole(userId)` (a `SECURITY DEFINER` RPC wrapper, R1).

## Difference from the mirror (read carefully)
The global login `router.push("/")` unconditionally. THIS surface must NOT — on auth success it
must resolve the user's career role and route to the matching dashboard. Because the `career` schema
is not on PostgREST, the role lookup is NOT a client query: after `signInWithPassword` succeeds the
form `router.push("/career/login")` (same route) + `router.refresh()`, and the **server wrapper**
re-reads `auth.getUser()` and does the role-routing redirect (below). Client never sees career rows.
Everything else (tabs, OAuth, OAuth-only alert, error rendering, brand panel) stays identical.

## Server wrapper behavior (`page.tsx`, `force-dynamic` per R11 — reads `auth.getUser()`)
1. Flag OFF → `notFound()` (defense-in-depth behind middleware; real HTTP 404 per BUILD-RULES R8 #8).
2. `auth.getUser()`:
   - **No session** → render `<CareerLoginForm />` (the unauthenticated case).
   - **Session present** → call `resolveCareerRole(user.id)` and `redirect()` (server redirect):
     - role `employer` → `/career/employer/dashboard`
     - role `worker` → `/career/worker/dashboard`
     - role `both` (a rare account that owns BOTH an employer account and a worker profile) →
       `/career/login?choose=1` (render a role-chooser, see states) — do NOT silently pick one.
     - role `none` (authed globally but no career profile yet) → render `<CareerLoginForm />` with a
       post-login banner offering `/career/employer/register` or `/career/worker/register`.
- `resolveCareerRole` is a `SECURITY DEFINER` RPC over `createAdminClient()` (service_role) that
  takes `p_user_id` explicitly and re-checks ownership inside the SQL (**R1 — no `auth.uid()`**). It
  returns the role by **profile-row existence**: an `is_active` `career_employer_accounts` row for
  the uid ⇒ employer; a `career_worker_profiles` row for the uid ⇒ worker; both ⇒ `both`; neither ⇒
  `none`. (Existence check only — no identity/PII columns returned to the route.)

## Layout
- Identical two-column shell as global login: `AuthBrandPanel` left (hidden on mobile), form right in
  a `max-w-md` centered `motion.div`. The brand panel here is the **career-accented** variant (amber
  gradient + amber check bullets) — either a `vertical` prop on `AuthBrandPanel` or a sibling
  `CareerAuthBrandPanel`; swap the teal gradient/dots to `brandCareer` (see accent section).
- Heading `careerVertical.auth.loginTitle`, subline = career tagline. Below the form: a single
  "no account?" line linking to **both** register paths (`/career/employer/register` and
  `/career/worker/register`) — career has two audiences, unlike the single global `/register`.

## Every UI state
- **idle** — email/phone tab toggle, Google OAuth button, email + password inputs, amber submit CTA
  enabled. (Phone tab reuses `PhoneLoginPanel` verbatim; do not fork it.)
- **loading / submitting** — CTA shows `Loader2` spinner + submitting label, `disabled`,
  `opacity-50 cursor-not-allowed`; inputs stay mounted. After a successful `signInWithPassword`,
  the CTA STAYS in the spinner state while `router.push`+`refresh` re-runs the server wrapper for the
  redirect (avoid a flash of the idle form before the server redirect lands).
- **error** (invalid credentials / network throw) — red `role="alert"` line
  (`rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600` + dark variants),
  fields retained, mirror global login's `signInError.message` rendering.
- **oauth-only account** (`invalid_credentials` + `lookupAuthMethods` says password-less) — render
  `AccountLinkAlert` instead of the red line, exactly as global login (`oauthOnlyProviders` state +
  `handleOAuthLogin`). Reuse `lib/actions/auth-methods.ts:lookupAuthMethods` unchanged.
- **success** — no in-form success panel; success = the server redirect to the resolved dashboard.
- **role-chooser** (`?choose=1`, the `both` case) — a small card with two amber-outline buttons
  ("Continue as Employer" → employer dashboard, "Continue as Worker" → worker dashboard). Server
  redirect targets; no client career query.
- **no-career-profile banner** (authed, role `none`) — an amber-tinted info note above the form:
  "You're signed in but haven't joined İş & Kariyer yet" + two links to the register flows. The login
  form below stays usable (e.g. to switch accounts).
- **locked / gated** — there is no in-form locked state: the whole route is 404 when
  `CAREER_VERTICAL_ENABLED` is OFF (middleware quarantine + wrapper `notFound()`). Nothing renders.

## Amber accent usage (`brandCareer`, swaps health/global sky-teal)
- Submit CTA: **solid amber-600** (`bg-brandCareer`, white text, hover → `brandCareer-700`), NOT the
  global `from-teal-500 to-teal-600` gradient. This is the one solid amber button on the surface.
- Input focus rings, the brand-panel gradient/bullet checks, tab-toggle active pill, the
  no-career banner, and the role-chooser outline buttons use `brandCareer`. Accent **text** (links
  like "register now", "forgot password") uses `brandCareer-700` — DEFAULT amber-600 is below the
  4.5:1 AA text floor (mirror the health token comment in `tailwind.config.ts`).
- Errors stay red (`text-red-600`); Google button stays neutral; spinner inherits CTA white. Do not
  amber-tint danger states or the Google brand button.

## Data the surface needs (UX-level — not exact field names)
- **Client form:** sends email+password (or phone OTP via `PhoneLoginPanel`) to GLOBAL Supabase auth
  via `@/supabase/browser` `createClient()` — the SAME global session, no career-specific auth. Reads
  the active `locale`. No career DB read happens client-side.
- **Server wrapper:** reads `auth.getUser()` (server Supabase client) and calls `resolveCareerRole`,
  which needs only **whether an employer account and/or a worker profile exists for this uid** — a
  boolean-pair existence signal, returned by the service-role RPC. No names, contact, or documents
  cross this path (BUILD-RULES gate invariants — the role resolver must not select private columns).
- OAuth callback reuses the global `/auth/callback`; after callback the user lands back on
  `/career/login`, where the server wrapper performs the same role-routing redirect.

## Edge cases
- **Already-authed visit** to `/career/login` → server resolves + redirects immediately; the form
  never flashes for employer/worker roles (only role `none`/`both` render UI).
- **Global account, never joined career** (role `none`) → no-career banner + register links; do NOT
  auto-create a career profile on login (registration is an explicit, consented step — PART 6 §D).
- **Dual-role account** (role `both`) → role-chooser, never an arbitrary default.
- **Worker is NEVER charged (R7):** no fee/payment/tier UI appears on either login path; payment UI
  is employer-only and downstream (unlock/commission), never here.
- **OAuth-only / account-link** → `AccountLinkAlert`, identical to global login (no career fork).
- **Redirect-after-login intent:** if a `?next=` param targets a gated career page, honor it ONLY
  after role resolution and ONLY for same-origin `/career/*` paths (open-redirect guard); otherwise
  fall back to the resolved dashboard.
- **RTL (`ar`):** brand panel, tab toggle, `*`/links, role-chooser, and the OAuth alert must mirror
  correctly; reuse the dark-mode + RTL-safe utility classes from the global login form.
- **i18n:** ALL copy under the `careerVertical.auth.*` dictionary subtree, deep 9-locale parity
  (BUILD-RULES R8 #7 — CI `i18n-check.sh` only checks top-level keys; nested drift ships silently).
  No TR-hardcoded strings on this PUBLIC surface.
- **Flag-off:** route returns real **HTTP 404** for every localized slug (kariyer/karriere/…), per
  BUILD-RULES R8 #8 — verify status, not just body.

## Build ordering / deps (R14)
- `lib/kariyer/flags.ts` already exists; `resolveCareerRole` lands in `lib/kariyer/queries.ts`
  (service_role + explicit `p_user_id`, R1) and depends on the `career_employer_accounts` /
  `career_worker_profiles` tables (migrations 073) + an existence-check RPC (075 read-RPCs). The page
  wrapper must not type-check before that helper exists.
- The localized `/career/login` slug must be registered in `i18n/routing.ts` before the page wrapper
  links resolve (coordinator step, R14 §2).
