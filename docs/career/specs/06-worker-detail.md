# Spec 06 — Anonymized Worker Detail (`/career/pool/[workerCode]`)

> Read `docs/career/career-vertical-plan-v1.md` (PART 2 §4, PART 4) + `docs/career/BUILD-RULES.md`
> (esp. R1, R2, R5, R6, R10) first. This page is the gated, anonymized counterpart to the Health
> provider profile. **No app/lib/SQL code is written here — this is the build contract.**

## Mirror target
- **File to mirror:** `app/[locale]/health/(gated)/uzman/[slug]/page.tsx` (two-column profile).
- **Card sibling to mirror for blur/watermark styling:** `components/glatko-saglik/ProviderCard.tsx`.
- **New page path:** `app/[locale]/career/(gated)/talep/[workerCode]/page.tsx` (gated route group;
  segment `talep`/pool-detail stays English-identity like health's `uzman`). Confirm the exact gated
  segment against `i18n/routing.ts` once Spec 05 (pool browse) lands — reuse whatever it registered.
- **Data layer to mirror:** `lib/saglik/queries.ts` → create `lib/kariyer/queries.ts` (`server-only`,
  `createAdminClient()`, SECURITY DEFINER RPC over the `career_worker_showcase` VIEW). Code validation
  lives in `lib/kariyer/worker-code.ts` (`isWorkerCode` / `WORKER_CODE_RE`).

## Rendering contract (differs from health)
- **`export const dynamic = "force-dynamic";`** — NOT `revalidate=3600` (BUILD-RULES R5: per-viewer
  interest marker + per-session watermark must never be ISR-cached and served to another employer).
- `noindex` is inherited from the `(gated)` route group; do not add page-level SEO metadata beyond a
  bare title (worker code only, never a name).
- Reads the cookie session via `auth.getUser()` to know the viewing employer (interest state + R1
  identity to pass into RPCs); this is consistent with `force-dynamic`.
- Behind `CAREER_VERTICAL_ENABLED` (default OFF) → middleware quarantine; flag-off ⇒ real HTTP 404.

## Layout (two-column, mirrors health `lg:grid-cols-[1fr_20rem]`)
Outer wrapper tinted `bg-brandCareer-50/40`, `max-w-5xl`, top "← back to pool" link
(`text-brandCareer-700`, mirrors health's `← allSpecialties`).
- **LEFT (facts, anonymized):** header (worker code + role/trade + skill tier + "Verified by RoNa
  Legal" badge), skills matrix, redacted experience timeline, certification badges (file-locked),
  blurred/watermarked photo strip, optional gated video, languages, readiness summary.
- **RIGHT (`<aside>`, sticky on `lg` via `lg:sticky lg:top-24`):** the prominent **LockedDossierPanel**
  + `ExpressInterestButton`. On mobile it stacks below the facts (same as health's BookingWidget).

## LEFT column sections (top → bottom)
1. **Header** — worker-code as `<h1>` (`font-serif text-3xl font-light`, mirrors health name); below
   it: role/trade · skill tier · experience band · region (Far East/ME/Africa, NOT country) · age band.
   "Verified by RoNa Legal" pill in `brandCareer-50 / brandCareer-700` with `BadgeCheck` (mirror the
   health `verified` pill exactly, amber-swapped). Avatar slot = blurred/watermarked thumb, or initials-
   style fallback tile in `bg-brandCareer-50 text-brandCareer-700` when no showcase photo.
2. **Skills matrix** — section heading (uppercase-tracked label like health's). Grid of skill chips
   with per-skill tier/level indicator (e.g. dots or a small label). Neutral chips; amber only on the
   tier accent. Top 5 highlighted, rest collapsible if long.
3. **Redacted experience timeline** — ordered list, each entry shows employer-TYPE + region + duration
   only, e.g. "Hospitality employer, UAE, 3 yrs" — NEVER an exact employer name or dates. Render as
   a vertical timeline (icon + redacted line). Empty → omit section.
4. **Certifications** — badge row; each cert shows the FACT of the cert as a badge with a small
   `Lock`/file icon meaning "document file locked until unlock". Badge = neutral; lock icon amber.
   Clicking does nothing pre-unlock (no signed URL minted; see R6).
5. **Photos** — strip of face-blurred + watermarked showcase thumbnails ("Glatko · RoNa Legal"
   watermark baked into the showcase variant server-side; the page only renders the already-derived
   variant URL — never an original). Optional per-session dynamic watermark overlay (employer id) is
   acceptable as a CSS overlay. No lightbox to an original.
6. **Optional gated video** — if a public hands-only/face-blurred clip exists, show an inline player;
   the FULL intro stays gated (show a locked placeholder tile pointing at the LockedDossierPanel).
   Omit the whole section when no video.
7. **Languages** — uppercase chip row (mirror health `languagesLabel` block verbatim, amber-neutral).
8. **Readiness summary** — readiness score + sub-signals (profile completeness, docs verified, language
   level, deployment-ready). Render as a labeled meter/badge in `brandCareer`. Read-only.

## RIGHT column — LockedDossierPanel + ExpressInterestButton
`LockedDossierPanel` is a **server-rendered** card (no booking client needed); `ExpressInterestButton`
is the only client island.
- Card: `lg:sticky lg:top-24 rounded-2xl border bg-white shadow-premium-sm` (mirror health's neutral
  fallback aside box), with a `Lock` icon header in amber.
- Copy: "Full name, contact, passport & original documents available after RoNa Legal approval and
  fee." Below it, a short locked-fields list (full name · phone/email · exact country/city · passport
  & ID · original certs · references · un-blurred photos/video) each with a lock glyph.
- `ExpressInterestButton` (`"use client"`): primary amber CTA `İlgi Göster`. Optional
  `Talebe Ekle` (add-to-requisition) is the SAME action with a `requisitionId` (BUILD-RULES R10 —
  no separate route). POSTs to `/api/career/interest` (to be built per Spec covering the API).
- The CTA is **gated by employer login**: not logged in → CTA routes to `/career/login` (or shows a
  "sign in to express interest" inline state), never silently no-ops.

## Every UI state
- **loading** — route-group `loading.tsx` skeleton (mirror `(gated)/loading.tsx`): two-column skeleton,
  amber shimmer accents.
- **empty** — N/A for the page as a whole; per-section emptiness (no certs / no video / no photos) →
  omit that section (mirror health's `&&`-guarded sections). Skills/readiness should always exist for a
  showcased worker; if missing, render a muted "—" rather than crashing.
- **error** — RPC THROWS on a genuine failure → caught by `(gated)/error.tsx` designed error screen
  (mirror health: throw on RPC error, return null only for "not found"). A `null` worker is NOT an
  error — it is a 404.
- **not-found / invalid code** — `!isWorkerCode(workerCode)` OR RPC returns null (not showcased /
  unknown) → `notFound()`. (Flag-off also → 404 via middleware.)
- **success (anonymized, default)** — full LEFT facts + LockedDossierPanel showing LOCKED state +
  `İlgi Göster` enabled (employer logged in).
- **locked (the resting state)** — this IS the success state for the dossier: identity/docs stay hidden;
  panel shows the locked copy + CTA. There is **no in-page unlocked variant** in this surface — after
  owner-approval + payment the unlocked dossier renders in the EMPLOYER DASHBOARD, not here. If the
  viewing employer has already expressed interest for this worker, the CTA flips to a disabled
  "Interest sent — pending RoNa Legal review" pill (read the existing `reveal_unlocks` state for this
  employer+worker; still LOCKED while `owner_approved=false`).

## Amber accent usage (`brandCareer`, swaps health's sky/`brandHealth`)
- Accent is **wayfinding only** (icons, badges, the "Verified by RoNa Legal" pill, readiness meter,
  back-link, the primary CTA). Body/label text uses `brandCareer-700` (the 50/DEFAULT/700 ramp is the
  only career ramp in `tailwind.config.ts`; do not invent shades).
- `İlgi Göster` CTA is solid amber-600 (`bg-brandCareer`); this is the one place a solid amber button is
  correct (it is the conversion event, analogous to health's teal CTA).
- Lock glyphs on gated items use amber to signal "unlock path", not red/danger.

## Data the page needs (UX-level — not exact field names)
From `career_worker_showcase` VIEW via a `career_get_showcase_worker(p_worker_code, p_locale)` RPC
(mirror `health_get_provider`; R2 — VIEW excludes every `_enc`/`_hash`/private column):
- worker code, role/trade, skill tier, experience band, region, age band, languages, verification
  status + "Verified by RoNa Legal" trust tier, readiness score + sub-signals, `is_showcased` flag.
- skills (with per-skill tier), redacted experience entries (employer-type + region + duration only),
  certification facts (badge labels, NO file paths to originals), showcase photo variant URLs
  (already blurred+watermarked), optional public video variant URL.
- **MUST NOT** return: full name, DOB, phone/email, exact country/city/address, passport no, original
  document paths. (BUILD-RULES R8 #1 column-set test asserts zero private columns reach this path.)
- Viewer/interest state: whether THIS employer already has a `reveal_unlocks` row for this worker
  (drives the CTA state). Identity of the employer is derived from the session and passed as an explicit
  `p_employer_user_id` arg (R1 — never `auth.uid()` inside the RPC).

## Edge cases
- Invalid/malformed `workerCode` segment → `notFound()` BEFORE any RPC (validate with `WORKER_CODE_RE`).
- Worker exists but `is_showcased=false` (de-listed / consent revoked) → RPC returns null → 404.
- Showcase photo/video variant missing → render the blurred-placeholder tile, never fall back to an
  original path (R6: signer rejects non-`public_anonymized` paths anyway).
- Not-logged-in viewer → page still renders the anonymized facts (public-safe by construction) but the
  CTA routes to login; do NOT attempt to read interest state without a session.
- Employer who already expressed interest → CTA disabled "pending review"; dossier STILL locked
  (`owner_approved=false`) — this is BUILD-RULES R8 #9, the real-permission e2e assertion.
- RTL: `ar` must mirror the two-column layout and lock-list direction correctly.
- Pool scrape surface: this is a page route, not `/api/*` — note in a comment that `lib/rateLimit.ts`'s
  `public-form` cap does NOT cover it (BUILD-RULES R12); rely on server-side reads + no bulk export.
- i18n: all copy lives under the `careerVertical.*` dictionary subtree (deep parity across 9 locales —
  BUILD-RULES R8 #7); admin/internal strings excluded per the i18n policy.
