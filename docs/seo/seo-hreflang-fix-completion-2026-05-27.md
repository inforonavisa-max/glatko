# SEO-HREFLANG-FIX — Completion Report (2026-05-27)

PR: https://github.com/inforonavisa-max/glatko-frontend/pull/65 (branch
`seo-hreflang-fix`, **awaiting Rohat approval — not merged**).

## Summary

Blog posts are separate per-locale Sanity documents with independent slugs. The
blog page emitted hreflang via `buildAlternates`, which spreads a **single slug
across all 9 locales** — so cross-locale alternates pointed at slugs that don't
exist in the target language, and the ME/EN versions of the B2 cost guide were
never linked. This sprint makes each post declare its other-language versions
(`translations`) and emits hreflang only for locales that actually have a
version, each at its own localized slug.

## Old vs new behavior

**Before** (ME post `/me/blog/cijene-vodoinstalatera-elektricara-crna-gora-2026`):

```
canonical → /me/blog/cijene-vodoinstalatera-elektricara-crna-gora-2026
hreflang sr-Latn-ME, en, de, it, ru, uk, sr, ar, x-default
  → ALL using slug "cijene-…", e.g. en → /en/blog/cijene-…  (404, wrong)
x-default → /en/blog/cijene-…  (404)
```

**After** (same page, verified on Vercel preview):

```
canonical    → https://glatko.app/me/blog/cijene-vodoinstalatera-elektricara-crna-gora-2026
sr-Latn-ME   → https://glatko.app/me/blog/cijene-vodoinstalatera-elektricara-crna-gora-2026
en           → https://glatko.app/en/blog/plumber-cost-montenegro-2026
x-default    → https://glatko.app/en/blog/plumber-cost-montenegro-2026
```

Only locales with a real published version are emitted (no 404-bound alternates).

## What changed

| Layer | File | Change |
|-------|------|--------|
| Schema | `studio/schemas/documents/post.ts` | additive `translations` field (array of `post` refs, self-filtered, max 9) |
| Studio | — | redeployed to glatko.sanity.studio (`sanity deploy`, 1/1 schemas) |
| Query | `lib/sanity/queries.ts` | `POST_DETAIL_PROJECTION` resolves each translation → `{locale, slug}` |
| Type | `lib/sanity/types.ts` | `PostDetail.translations?` |
| Helper | `lib/seo.ts` | **additive** `buildPostAlternates()`; `buildAlternates` untouched |
| Page | `app/[locale]/blog/[slug]/page.tsx` | `generateMetadata` uses `buildPostAlternates` |
| Data | `studio/scripts/add-b2-translations.mjs` | prod migration: cross-link the two B2 posts |

## Test results

- `next build` — clean (compile + types + lint, 18/18 static pages, exit 0).
- Prod `translations` data verified: ME → `{en, plumber-cost-montenegro-2026}`,
  EN → `{me, cijene-vodoinstalatera-elektricara-crna-gora-2026}`.
- **Vercel preview hreflang (verified):**

  ME post:
  ```
  canonical    https://glatko.app/me/blog/cijene-vodoinstalatera-elektricara-crna-gora-2026
  sr-Latn-ME   https://glatko.app/me/blog/cijene-vodoinstalatera-elektricara-crna-gora-2026
  en           https://glatko.app/en/blog/plumber-cost-montenegro-2026
  x-default    https://glatko.app/en/blog/plumber-cost-montenegro-2026
  ```
  EN post:
  ```
  canonical    https://glatko.app/en/blog/plumber-cost-montenegro-2026
  en           https://glatko.app/en/blog/plumber-cost-montenegro-2026
  sr-Latn-ME   https://glatko.app/me/blog/cijene-vodoinstalatera-elektricara-crna-gora-2026
  x-default    https://glatko.app/en/blog/plumber-cost-montenegro-2026
  ```

Note: the ME hreflang uses the BCP-47 form `sr-Latn-ME` (the project's
`hreflangForLocale` convention), not the bare `me` — this is the correct,
canonical signal and matches how the rest of the site emits ME hreflang.

## DoD

- [x] `translations` field on post schema (visible in Studio)
- [x] Studio deployed, field live
- [x] `buildPostAlternates` added; `buildAlternates` not broken
- [x] Blog page hreflang sourced from `translations`
- [x] B2 ME + EN cross-referenced (prod)
- [x] Preview hreflang correct
- [x] ME post → EN hreflang; EN post → ME hreflang
- [x] x-default → correct locale (en)
- [x] Build clean
- [x] PR opened (awaiting approval, NOT merged)
- [x] Completion report written

## Phase 2 — workflow impact

This is the cross-locale plumbing for the whole content engine. Going forward:

- When publishing a post's other-language versions, fill the **Translations**
  field in Studio (select the equivalent post in each other language). For clean
  bidirectional hreflang, add the reverse link on each post too — `add` on one
  side does not auto-mirror.
- ~1-minute manual step per language set. Wave 1 (≈10 topics × 3 languages)
  ≈ 60 reference links, all linkable in well under an hour.
- No code change needed per post — hreflang is emitted automatically from
  whatever `translations` contains.

## Backlog note — Studio editor instruction

Add a short editor doc / Studio field hint: "Translations = the SAME article in
other languages. Link each language version to every other; add the reverse
link too. This drives Google hreflang — leave empty and the post won't be
connected to its translations in search."
