# Career UI — Implementation Contract (every UI agent reads this)

You are building one slice of the career vertical on branch `feat/career-ik-vertical`. The
FOUNDATION is done and type-checks. Read `docs/career/career-vertical-plan-v1.md`,
`docs/career/BUILD-RULES.md`, and your surface's spec in `docs/career/specs/NN-*.md` before writing.
Match the surrounding code style. After writing, your file must be import-correct and type-correct.

## Non-negotiables
- **Flag OFF**: everything ships dark behind `CAREER_VERTICAL_ENABLED` (middleware already 404-gates
  gated career routes; the `(gated)` layout also calls `notFound()` if the flag is off). Don't fight it.
- **noindex**: the `app/[locale]/career/layout.tsx` sets `robots:{index:false,follow:false}` for the
  whole subtree. Don't add `buildAlternates`/indexable metadata to career pages.
- **Accent = amber / `brandCareer`** wherever health uses sky/`brandHealth`. Text accent uses
  `brandCareer-700` (the DEFAULT amber-600 #D97706 is below AA for text). **Primary CTA buttons use an
  amber gradient** `from-amber-500 to-amber-600 ... shadow-amber-500/25` (career convention; health
  happens to use teal — for career use amber). Badges/chips: `brandCareer-50` bg + `brandCareer-700` text.
- **i18n**: copy lives under `careerVertical.*` in `dictionaries/tr.json` + `en.json` (the other 7
  locales land in a parallel pass — render with whatever key exists; never hardcode user-facing copy
  except admin-console chrome which is TR-hardcoded per the admin-i18n policy). READ the relevant
  `careerVertical.<area>` subtree in `dictionaries/tr.json` for your exact keys. Header nav uses
  `nav.careerTalentPool / nav.careerHowItWorks / nav.careerSectors / nav.careerEmployerJoin /
  nav.careerCreateRequisition` (added in the localization pass).
- **Routing**: use typed `Link`/`getPathname` from `@/i18n/navigation` with the registered route keys
  (e.g. `/career/pool`, `/career/pool/[workerCode]`, `/career/employer/dashboard/requisitions/new`).
  Never hardcode localized slugs.
- **No identity leak**: pool/showcase surfaces render ONLY anonymized fields the data layer returns
  (worker_code, role, trade, bands, region, languages, skills, readiness, verification). There is NO
  name/phone/email/passport field on the showcase types — don't invent one.
- **Worker never charged** (R7): no fee/price/payment UI on the worker side, ever.

## Data access (server-only — `lib/kariyer/`)
Server Components/Actions import these. **Never** call `.from('career.*')` from app code; always go
through these wrappers (they call the SECURITY-DEFINER RPCs as service_role).

`lib/kariyer/queries.ts` (reads):
- `listSectors(locale)` → `CareerSector[]`
- `getShowcaseWorkers(filters: ShowcaseFilters)` → `ShowcaseWorkerCard[]`
- `getShowcaseWorker(workerCode)` → `ShowcaseWorkerProfile | null`
- `getWorkerProfile(userId)` / `getWorkerDocuments(userId)` / `getWorkerStatus(userId)`
- `getEmployerRequisitions(userId)` → `RequisitionSummary[]`
- `getEmployerRequisition(id, userId)` → `RequisitionDetail | null`
- `getEmployerUnlocks(userId)` → `EmployerUnlock[]`
- `resolveCareerRole(userId)` → `CareerRole` ('worker'|'employer'|'none')
- types: `CareerSector, ShowcaseWorkerCard, ShowcaseWorkerProfile, WorkerProfile, WorkerDocument,
  WorkerStatus, RequisitionSummary, RequisitionShortlistCard, RequisitionDetail, EmployerUnlock,
  CareerRole, ShowcaseFilters`

`lib/kariyer/booking.ts` (writes, return discriminated unions `{ok:true,...}|{ok:false,code}`):
- `createWorkerProfile, createEmployerAccount, createRequisition, addDocument, expressInterest,
  joinWaitlist, dispatchInterestNotice` (last is best-effort owner-notify, never throws)
- `CareerWriteErrorCode` codes: `SECTOR_INVALID, CONSENT_REQUIRED, NOT_OWNED, GATE_LOCKED,
  WORKER_NOT_FOUND, ALREADY_EXISTS, PII_KEY_MISSING` (+ ERROR fallback)

`lib/kariyer/gate.ts`: `canAccessDocument`, `assertRevealUnlocked` (fail-closed; used by the doc-sign route).
`lib/kariyer/storage.ts`: `signWorkerDocument(path,ttl)`, `signShowcaseVariant(path,ttl)`,
`uploadWorkerDocumentPath(userId,category,file)` (returns a storage PATH, not a URL).
`lib/kariyer/otp-rate-limit.ts`: `checkCareerInterestLimit(employerKey,ip)`, `checkCareerOtpLimit(phone,ip)`.
Core: `lib/kariyer/flags.ts isCareerVerticalEnabled()`, `config.ts CAREER_ROUTES`,
`category-icons.ts sectorIcon/tradeIcon`, `worker-code.ts WORKER_CODE_RE`, `phone.ts`, `intl.ts`.

## API routes (client components fetch these; all under `/api/career/*`, public-form rate-limited)
- `POST /api/career/waitlist` (no flag guard — dark-launch intake)
- `POST /api/career/worker/register`, `POST /api/career/employer/register`
- `POST /api/career/requisitions`
- `POST /api/career/interest` (express interest; pass `workerCode` + optional `requisitionId`)
- `POST /api/career/documents/upload`, `POST /api/career/documents/sign`
All flag-guarded routes (everything except waitlist) return a bare 404 when the flag is off (clone the
health route guard). Identity (employer/worker uid) comes from `auth.getUser()` server-side, NEVER the
request body. Hand-rolled validation (no zod) in route handlers, matching health's API style.

## Page rendering rules
- Static marketing (landing, how-it-works, sectors, sector detail): `export const revalidate = 3600`.
- Pool browse + worker detail: `export const dynamic = 'force-dynamic'` (R5 — per-employer/per-viewer).
- Anything reading `auth.getUser()` / cookies (all dashboards, register, profile, documents, login,
  unlocks): `export const dynamic = 'force-dynamic'` (R11).
- Server page preamble mirrors health gated pages: `await` params, `hasLocale` guard → `notFound()`,
  `setRequestLocale(locale)`, `getTranslations`. `generateMetadata` returns `{}` on locale-miss.

## Mirror map (read the health file, then write the career analog)
- gated layout/loading/error → `app/[locale]/health/(gated)/{layout,loading,error}.tsx`
- landing/hero → `app/[locale]/health/(gated)/page.tsx`
- directory/detail → `app/[locale]/health/(gated)/[specialty]/page.tsx`, `.../uzman/[slug]/page.tsx`
- coming-soon + waitlist form → `app/[locale]/health/coming-soon/page.tsx`,
  `components/glatko-saglik/HealthWaitlistForm.tsx`
- anonymized card → `components/glatko-saglik/ProviderCard.tsx`
- booking/multi-step client → `components/glatko-saglik/BookingWidget.tsx`,
  `components/glatko/request-service/RequestServiceWizard.tsx`,
  `components/glatko/become-a-pro/*` (wizard + DocumentsUploader)
- admin list/actions → `app/[locale]/admin/reviews/page.tsx` + `components/admin/AdminReviewsList.tsx`,
  and `app/[locale]/admin/page.tsx` for the dashboard KPI pattern
- API route → `app/api/health/{waitlist,bookings,otp}/route.ts`
- brand lockup → `components/glatko/verticals/VerticalBrand.tsx` (pass `vertical="career"`)

## Quality bar
Your file must type-check (`npx tsc --noEmit` is run at the end). No `any` unless health does it.
Re-read your file before finishing. Components you import from a sibling in your group: follow that
sibling's spec (`docs/career/specs/NN-*.md`) for its exact prop contract so imports align.
