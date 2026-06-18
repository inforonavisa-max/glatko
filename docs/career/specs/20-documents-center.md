# Spec 20 — Worker Document & Photo Upload Center (`WorkerDocumentsUploader`, client)

> Read `docs/career/career-vertical-plan-v1.md` (PART 2 §8 "Document & photo upload center", PART 3
> "Document upload + visibility architecture", PART 4 gated-vs-public split) + `docs/career/BUILD-RULES.md`
> (R5/R6/R7/R11 are load-bearing) first. **Docs-only — the downstream agent writes the code.**
> This is the WORKER side. It is the one surface where the per-document `visibility` + `consent_status`
> rows are written, and the only place a worker sees + revokes what is public about them. There is no
> health analog component for upload; we mirror health's *client form conventions* + *signed media path*.

## Mirror targets
- **Client-form skeleton:** `components/glatko-saglik/BookingForm.tsx` — `"use client"`,
  `useTranslations("...Vertical")`, a single status machine, `fetch` calls with `mapApiError`,
  `role="alert"` red error line, disabled-while-busy CTAs, dark-mode input classes. Swap teal → amber.
- **Per-item consent UX:** the two-checkbox PDPL consent block in BookingForm (lines 228–245) — an
  unchecked-by-default checkbox + a privacy-policy `<Link href="/privacy">`. Here it is PER DOCUMENT,
  not one global pair.
- **Photo tile / fallback:** `components/glatko-kariyer/WatermarkedPhoto.tsx` (Spec 08) for any
  rendered `public_anonymized` showcase thumbnail; never render a gated original through it.
- **Signed media path contract:** BUILD-RULES R6 — two-step **signed upload → signed read**; gated
  originals served via `<a href={signedUrl}>`, NEVER `next/image`/`<img>` (no optimizer, no caching).
- **New file:** `components/glatko-kariyer/WorkerDocumentsUploader.tsx`. Rendered by
  `app/[locale]/career/(gated)/worker/documents/page.tsx` (gated group; `force-dynamic` per R11 — the
  page reads `auth.getUser()` to scope to the worker and load existing docs). Boundary files
  (`(gated)/layout.tsx`, `loading.tsx`, `error.tsx`) are shared, defined in Spec 01 — do not duplicate.

## Invariants (non-negotiable)
- **R7 — worker is NEVER charged.** Zero fee/price/payment field, copy, or CTA anywhere on this surface.
- **Flag:** `CAREER_VERTICAL_ENABLED` default OFF → middleware quarantine + defensive `(gated)/layout.tsx`
  → real HTTP 404 when off (R-tests #8). Whole vertical `noindex`.
- **`force-dynamic`** (R5/R11): per-worker, auth-scoped, never cached/shared between workers.
- **Two-step upload:** (1) client asks server action `/api/career/documents/upload-url` for a short-lived
  signed PUT URL into the private bucket `career-worker/{workerId}/{category}/…` (server re-derives
  `workerId` from session — client never names the path); (2) client PUTs the bytes directly to storage;
  (3) client POSTs metadata (category, chosen visibility, consent flag) to `/api/career/documents` which
  writes the `worker_documents` row via a `SECURITY DEFINER` RPC (career schema not on PostgREST).
- **Two-step read:** thumbnails/links are NOT public URLs; the page mints short-lived signed READ URLs
  per item via `/api/career/documents/sign` (R6: showcase variants checked `visibility='public_anonymized'`;
  gated originals re-check the worker owns the row). The worker may always read their OWN gated original.

## Layout (single-column, `max-w-3xl`, page-tinted `bg-brandCareer-50/40`)
Top: page title + a profile-completeness/readiness strip (read-only, mirrors Spec 06 readiness meter,
amber). Then **one section per CATEGORY** (each a card `rounded-2xl border bg-white shadow-premium-sm`):
1. profile photo · 2. work photos · 3. ID/passport · 4. diplomas/education · 5. skill certs ·
6. insurance/medical · 7. references.
Each category card shows: an icon + localized title, a one-line "what this is used for / who sees it"
helper, the **default visibility for that category** (see table), the list of already-uploaded items,
and a dropzone/`<input type="file">` add-control. Each uploaded ITEM row shows: a thumbnail (showcase
variant for photos via WatermarkedPhoto; a generic file glyph + filename for PDFs/originals via `<a>`),
a **visibility selector** (`public_anonymized | gated | internal_only`), a **consent toggle with the
exact consent text being granted inline**, the consent timestamp once granted, and a remove (X) control.

### Default visibility per category (worker can change within the allowed set)
- profile photo, work photos → `public_anonymized` (a derived blurred+watermarked variant is what's
  shown; the original stays private). May be downgraded to `gated`/`internal_only`.
- ID/passport, insurance/medical → `internal_only` (RoNa Legal verification only); **cannot** be set
  `public_anonymized` (special-category data, PART 6 §D) — that option is disabled with a tooltip.
- diplomas, skill certs, references → `gated` (the FACT shows as a badge publicly; the FILE unlocks
  only after owner-approval + payment). May be `internal_only`; not `public_anonymized`.

## Per-document consent (the heart of this surface)
Each item renders the consent it grants **in plain localized language tied to its current visibility**,
e.g. `public_anonymized` → "A blurred, watermarked version may be shown to employers in the anonymized
pool; the original stays private." / `gated` → "The fact of this document is shown; the file is released
to an employer only after RoNa Legal approval and the employer pays." / `internal_only` → "Only RoNa
Legal sees this, for verification. Never shown to employers." Changing visibility **re-states the consent
and requires re-affirming** (the consent toggle resets to unchecked on visibility change). Consent is
**revocable per document**: un-checking writes `consent_status` → revoked + (for showcase photos) removes
it from the pool immediately; show the resulting effect inline ("This photo is no longer shown to
employers"). Mirror BookingForm's not-prechecked, link-to-`/privacy` consent pattern, per item.

## Every UI state (status machine, mirror BookingForm `busy`/`error` + a per-item state)
- **loading** — route-group `loading.tsx` skeleton on first paint; per-category card shows a neutral
  gray shimmer list while existing docs + signed thumbnails resolve (no amber spinner storm).
- **empty** — a category with no uploads: muted "No files yet" + the dropzone; readiness strip reflects
  the gap ("Add your passport to become deployment-ready"). This is the common first-run state.
- **uploading** (per item) — progress/`Loader2` on that row only; the rest of the page stays usable;
  CTA for that category `disabled opacity-70`. Optimistic row with a spinner until the metadata POST
  returns.
- **error** — upload/sign/network failure → red `role="alert"` line scoped to the affected item
  (mirror BookingForm's `mapApiError` → localized message); the file is NOT added to the list; the
  worker can retry. Signed-URL expiry mid-action → re-mint transparently, surface error only if re-mint
  fails. Log no PII.
- **success** — item appears in the list with its thumbnail/link, chosen visibility, and a green-ish
  "consent granted ·  <timestamp>" line (keep success accent amber per vertical, not health teal).
- **locked / gated** — there is no payment lock on THIS surface (worker side, R7). The only "locked"
  affordance is the disabled `public_anonymized` option on ID/passport/insurance categories (special
  category) with an explanatory tooltip. The page-level gate is the flag (→ 404 when off).

## Amber accent usage (`brandCareer`, swaps health's sky/teal)
- One solid amber CTA pattern: the per-category "Add / Upload" button = `bg-brandCareer` white text,
  hover → `brandCareer-700` (analog of health's teal CTA). Everything else is wayfinding-only amber:
  readiness meter, category icons, the visibility-selector active state, consent-link, focus rings
  (`focus:border-brandCareer focus:ring-brandCareer/20`).
- Accent *text* uses `brandCareer-700` (DEFAULT is below AA 4.5:1 — mirror the health token comment).
- Errors stay red (`text-red-600`); never amber-tint danger. Use only the `50/DEFAULT/700` career ramp;
  invent no shades. Showcase-photo watermark text stays white-on-scrim (Spec 08), not amber.

## Data it needs (UX level — not exact field names)
- **Reads (page → component props):** the worker's existing documents grouped by category, each with its
  category, current visibility, consent status + timestamp, a freshly-minted short-lived signed READ URL
  (showcase variant for photos, gated-original or internal for the worker's own files), and a filename/
  type. Plus the readiness sub-signals (profile completeness, docs verified) for the strip. Identity
  (`workerId`) is derived from the session server-side and passed into the read RPC as an explicit
  `p_worker_user_id` (R1 — never `auth.uid()` inside the RPC); the component receives no raw ids it could
  forge.
- **Sends:** request-upload-url (category only — server picks the path); the PUT to storage; then metadata
  (category, chosen visibility, consent boolean, original filename). Visibility change + consent revoke
  each POST a small update to the documents RPC. No private path strings ever originate client-side.
- **Never:** a fee/price field (R7); a way to set special-category docs `public_anonymized`; a public
  (un-signed) URL to any file; the worker viewing/altering another worker's docs.

## Edge cases
- **Gated/original via `<a href>` only** — gated originals and internal files render as a download link
  (`<a href={signedUrl} target="_blank" rel="noopener">filename</a>` + file glyph), NEVER `next/image`
  or `<img>`: signed URLs aren't stable, cacheable origins, and we don't want the Next optimizer minting
  variants of sensitive files (same reasoning as Spec 08 §"Element choice"). Only `public_anonymized`
  photos use WatermarkedPhoto.
- **Wrong file type / oversize** — validate client-side BEFORE requesting an upload URL (accept
  images for photo categories, PDF/JPG/PNG for docs; size cap); reject into the item `error` state with
  no request sent (mirror BookingForm's early-return validation). Server re-validates (defense in depth).
- **Consent reset on visibility change** — moving an item to a more-public visibility MUST force a fresh
  consent affirmation; never silently carry an old consent to a broader exposure (PART 6 §D, purpose-bound).
- **Revoke a showcased photo** — removing consent/visibility must drop it from the pool view at the next
  read (the showcase VIEW filters on consent/visibility); reflect "no longer shown" immediately in UI.
- **Delete** — removing a row should soft-delete + respect `retention_until`/audit (the RPC handles it);
  the UI just confirms ("Remove this file?") and updates the list optimistically.
- **No PII in DOM** — filenames may contain a name; that is the worker's OWN data on the worker's OWN
  page (allowed), but do NOT echo it into any showcase/public context. Alt text for showcase photos stays
  generic (Spec 08).
- **RTL (`ar`)** — category cards, dropzone, visibility selector, consent rows, and the readiness strip
  must mirror correctly; reuse health's RTL-safe utilities.
- **i18n** — ALL copy (category titles, helper lines, every visibility's consent sentence, errors,
  tooltips) under `careerVertical.documents.*`, deep 9-locale parity (R-tests #7; CI checks only
  top-level keys). No TR-hardcoded strings — this is a worker-facing PUBLIC surface, not an admin form.
- **Rate limit** — the upload/sign/metadata endpoints are under `/api/`, so `lib/rateLimit.ts`'s
  `public-form` cap DOES apply (note it in the API spec); the page itself is auth-gated, not a scrape
  surface like the pool (R12).
