# Spec 32 — Career Coming-Soon page + CareerWaitlistForm (dual employer/worker)

> Build spec for a downstream agent. Docs only — author the files described, write no code here.
> Mirrors the HEALTH vertical. Accent: **amber-600 via the `brandCareer` token group**
> (`brandCareer` / `brandCareer-50` / `brandCareer-700`) wherever Health uses sky-600 /
> `brandHealth*`. Flag `CAREER_VERTICAL_ENABLED` default OFF. Everything noindex + gated.
> Read alongside `docs/career/career-vertical-plan-v1.md` and `docs/career/BUILD-RULES.md`.

## Why this surface matters
While the flag is OFF, `/career/coming-soon` is the **only** career route that returns HTTP 200 —
every other `/career/**` path is middleware-quarantined to a real 404 (BUILD-RULES R8 §8). It is
the supply-seeding intake: it collects a **dual waitlist** (employers AND workers) before launch.
This is the career analogue of the Health doctor waitlist, but with an audience toggle.

## Files to create (mirror map)
| Health original | Career file to author |
|---|---|
| `app/[locale]/health/coming-soon/page.tsx` | `app/[locale]/career/coming-soon/page.tsx` |
| `components/glatko-saglik/HealthWaitlistForm.tsx` | `components/glatko-kariyer/CareerWaitlistForm.tsx` |
| `app/api/health/waitlist/route.ts` | `app/api/career/waitlist/route.ts` (out of scope here — spec separately) |

The form posts to `/api/career/waitlist`; assume that endpoint + its SECURITY DEFINER RPC exist
(mirror migration 065 / `health_waitlist_join`). This spec stops at the page + the form component.

## Page layout (`app/[locale]/career/coming-soon/page.tsx`)
Structure is a 1:1 mirror of the health page; substitutions only:
- Server component. `Props` = `{ params: Promise<{ locale: string }> | { locale: string } }`.
- `generateMetadata`: guard `hasLocale(routing.locales, locale)`; `title = t("careerVertical.seoTitle")`.
  Add `robots: { index: false, follow: false }` (noindex — this surface is SEO-quarantined).
- Default export: resolve locale → `notFound()` if not a known locale → `setRequestLocale(locale)`.
- Outer wrapper bg: `bg-brandCareer-50/60 dark:bg-transparent` (health uses `brandHealth-50/60`).
- Centered header block:
  - Badge pill: `inline-flex … rounded-full bg-brandCareer-50 … text-brandCareer-700
    dark:bg-brandCareer/15 dark:text-brandCareer`, with a **Briefcase** lucide icon
    (health uses `HeartPulse`) + `t("careerVertical.comingSoon.badge")`.
  - Hero: `<VerticalBrand vertical="career" size="lg" />` (component already supports `career`).
  - `t("careerVertical.comingSoon.title")` then `…subtitle`.
- Card (`rounded-2xl border … bg-white … shadow-premium-sm dark:…`): `…waitlistTitle` +
  `…waitlistSubtitle`, then `<CareerWaitlistForm locale={locale as Locale} />`.
- Back-home `Link href="/"`: accent the link text **amber** —
  `text-brandCareer-700 hover:underline dark:text-brandCareer` (health uses teal; do NOT copy teal).
- `t("careerVertical.comingSoon.backHome")`.

## CareerWaitlistForm component (the real work)
`"use client"`. Same shell as `HealthWaitlistForm` (FormData read, fetch POST, status machine), with
ONE structural addition: an **audience toggle** that switches the form between employer and worker.

### Audience toggle (top of form, above fields)
- A two-option segmented control / radio group: **İşveren (Employer)** vs **İşçi / Aday (Worker)**.
  Selected segment uses the amber accent (`bg-brandCareer-50 text-brandCareer-700` border
  `border-brandCareer` / dark equivalents); unselected is neutral gray.
- Default selection: **employer** (Phase-1 priority is seeding demand-side design partners; workers
  are concierge-onboarded). State held in `useState`, sent as `audience: "employer" | "worker"`.
- Switching audience swaps the field set below it and resets validation state to `idle`.

### Fields by audience (UX-level data, not DB field names)
Shared (both audiences): **contact name**, **phone** (required, `type=tel`, placeholder
`+382 6x xxx xxx`), **email** (optional), hidden `locale`, hidden `audience`.
- **Employer fields:** company name (required), sector of need (required `select` — Construction /
  Hospitality / Other; reuse the seeded sector list from migration 078 conceptually), approximate
  headcount needed (optional), city (optional).
- **Worker fields:** trade / role (required `select` — e.g. Construction worker, Hospitality, Other),
  years of experience band (optional `select`), source region (optional `select` — Far East /
  Middle East / Africa / Europe / Montenegro — **region, never exact country**, per anonymization
  rule). **No fee/price/payment field may ever appear on the worker side (BUILD-RULES R7).**
- Required-field set differs per audience; the client pre-validates the active audience's required
  fields and sets `"invalid"` if any are blank (mirror health's pre-fetch guard).

### Amber-accent usage (replace every teal in the health form)
- Input focus ring: `focus:border-brandCareer focus:ring-brandCareer/20` (health: teal-500).
- Submit button: `bg-gradient-to-r from-brandCareer to-brandCareer-700 … shadow-brandCareer/25
  hover:shadow-brandCareer/40` (do NOT keep `from-teal-500 to-teal-600`).
- Success panel: `bg-brandCareer-50 text-brandCareer-700 dark:bg-brandCareer/10 dark:text-brandCareer`.
- Selected audience segment + privacy link hover: amber tokens, not teal.

## Every UI state
- **idle** — toggle + audience field set + submit enabled. No message.
- **loading / submitting** — submit disabled, `opacity-70 cursor-not-allowed`, `Loader2` spinner +
  `t("careerVertical.waitlist.submitting")`.
- **invalid** — red inline `role="alert"` with `…waitlist.errorValidation`; fired client-side when a
  required field for the active audience is empty, OR on a 400 from the API.
- **error** — red inline alert `…waitlist.errorGeneric`; fired on non-OK non-400 response or fetch throw.
- **success** — replace the whole form body with the amber success panel (`CheckCircle2` +
  `…waitlist.success`); call `form.reset()`. Idempotent resubmit (same phone) is a success server-side.
- **empty** — N/A (no list rendered; this is a write-only intake form).
- **locked** — the page IS the locked state: while the flag is OFF this is the only reachable route,
  and the form does not reveal any pool/identity data. No separate locked panel needed here.

## Data it needs (UX level)
Submits `{ audience, name, phone, email?, locale, …audience-specific }`. The server (separate spec)
maps these onto a `career.waitlist` row via a SECURITY DEFINER RPC; `audience` distinguishes the two
intake types. Phone is the dedupe/idempotency key (mirror health). PII (name/phone/email) is real —
include the privacy-policy disclosure line + `Link href="/privacy"` exactly like the health form,
using `…waitlist.privacyNote` / `…waitlist.privacyLinkText`.

## i18n (BUILD-RULES R8 §7 — nested parity across all 9 dicts)
`dictionaries/*.json` currently has a flat `careerVertical` ({ seoTitle, title, subtitle, backHome }).
EXTEND it to mirror `healthVertical`'s nested shape, in **all 9 locales** (tr/en/de/it/me/ru/sr/ar/uk):
- `careerVertical.comingSoon`: `badge`, `title`, `subtitle`, `waitlistTitle`, `waitlistSubtitle`,
  `backHome` (move existing `title`/`subtitle`/`backHome` under `comingSoon`; keep `seoTitle` at root).
- `careerVertical.waitlist`: `audienceEmployer`, `audienceWorker`, `name`, `company`, `sector`,
  `headcount`, `city`, `trade`, `experience`, `region`, `phone`, `email`, `submit`, `submitting`,
  `success`, `errorGeneric`, `errorValidation`, `privacyNote`, `privacyLinkText`.
- `careerVertical.trades` + `careerVertical.regions` + `careerVertical.experienceBands`: option-label
  maps for the worker selects (mirror `healthVertical.specialties`).
- `verticals.career` already = "Jobs"/"Kariyer" — used by `VerticalBrand`; do not change.
- The i18n-parity vitest (R8 §7) deep-diffs the `careerVertical` subtree; CI top-level check won't
  catch nested drift — keep every locale's key set identical.

## Edge cases
- **Flag OFF (prod):** route MUST be HTTP 200 for all 9 localized slugs (`/kariyer/yakinda`,
  `/karriere/…`, `/carriera/…`, `/karera/…`, `/kariera/…`, `/karijera/…` (sr+me), `/al-wazaif/…`).
  Add `"/career/coming-soon"` to `i18n/routing.ts` `pathnames` with all 9 slugs (mirror
  `/health/coming-soon`); the localized leaf slug should mirror health's "yakinda/uskoro/…".
- **Unknown locale:** `notFound()`.
- **RTL (`ar`):** the audience toggle + grid must not break under `dir="rtl"`; use logical
  gap/spacing utilities, avoid hardcoded left/right; verify the segmented control mirrors correctly.
- **Audience switch mid-fill:** reset status to `idle` so a stale `invalid`/`error` from the previous
  audience doesn't persist; clear the now-irrelevant field values.
- **No `auth` read:** page is fully static-eligible aside from noindex; keep `revalidate=3600` like
  health's static marketing pages (BUILD-RULES R5 — coming-soon is NOT an employer-personalized page,
  so it does NOT need `force-dynamic`).
- **Worker side never shows money** (R7): no price/fee text in worker copy or fields.
- Disabled/empty `<option value="">` placeholder on every required select (mirror health).

## Acceptance
- Page renders amber-accented (zero teal/sky leakage) and uses only `brandCareer*` tokens + neutral grays.
- Toggle flips field sets; each audience validates its own required set; success/error/invalid/loading
  all reachable. Idempotent resubmit succeeds.
- `careerVertical` subtree present + identical-keyed in all 9 dictionaries.
- `/career/coming-soon` → 200 (all 9 slugs) with flag OFF; all other `/career/**` → 404.
