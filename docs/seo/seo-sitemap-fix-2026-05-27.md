# SEO-SITEMAP-FIX — Per-Locale Blog URLs in sitemap.xml (2026-05-27)

PR: `seo/sitemap-per-locale-blog` (awaiting Rohat approval — not merged).

## Discovery

While preparing GSC URL Inspection submissions for the 9 B2 cost-guide URLs
just published (B2 across ME/EN/RU/TR/DE/UK/IT/SR/AR), a check against
production `https://glatko.app/sitemap.xml` revealed 18 blog URLs — but only
the **ME** B2 slug was real. The other 17 were two ME slugs cross-spread
across every other locale prefix (e.g. `/ar/blog/cijene-vodoinstalatera-…`,
`/de/blog/ciscenje-jahti-…`), none of which resolve. Eight of nine B2 URLs
(EN/RU/TR/DE/UK/IT/SR/AR) — the very URLs we wanted GSC to index — were
**absent from the sitemap**, and the URLs that were present were largely
404-bound.

## Root cause

`app/sitemap.ts` fetches `getAllPostSlugs("me")` (line 107) — i.e. ME slugs
only — then loops `for (const locale of LOCALES)` to emit one entry per
locale using the **same ME slug** at every locale prefix. The same K9-shaped
"single slug across all locales" bug we fixed in `buildAlternates` for
hreflang (PR #65 / SEO-HREFLANG-FIX). The blog page hreflang now points at
each translation's real per-locale slug, but the sitemap kept feeding the
single ME slug to every locale URL.

The comment block in the old code (lines 190–193) even acknowledged the gap:
*"until per-locale sitemap fetches are wired we surface the ME slug…"*. This
PR wires it.

## Fix

1. **GROQ projection** — new `ALL_POST_SLUGS_WITH_TRANSLATIONS_QUERY` in
   `lib/sanity/queries.ts` returns `{slug, publishedAt, translations[]}` per
   post, with each translation resolved to `{locale, slug}` via the same
   `select()/coalesce()` pattern already used by `POST_DETAIL_PROJECTION`.
2. **Type** — `PostSlugWithTranslations` replaces `PostSlug` in
   `lib/sanity/types.ts`.
3. **Fetcher** — `getAllPostSlugsWithTranslations(locale)` in
   `lib/sanity/fetch.ts`.
4. **sitemap.ts refactor** — fetch per locale (Promise.all over `LOCALES`),
   tolerating failure per locale; emit each post at its own slug; compute
   hreflang via `buildPostAlternates(locale, post.slug, post.translations)` —
   the **same** helper the blog page uses, so sitemap and page-head agree by
   construction.

`buildAlternates` and `makeAlternatesForParams` are intentionally left as-is
for path-translated all-locale routes (services, static pages). Only the blog
section moves to the per-locale model.

## Old vs new behaviour

**Before** (production today, 2 ME slugs only):
```
/me/blog/cijene-vodoinstalatera-elektricara-crna-gora-2026   ✅
/ar/blog/cijene-vodoinstalatera-elektricara-crna-gora-2026   ❌ 404
/de/blog/cijene-vodoinstalatera-elektricara-crna-gora-2026   ❌ 404
…7 more 404-bound URLs for the cost-guide alone…
…and the same pattern for ciscenje-jahti…
```

**After** (this PR, expected — 1 entry per real (locale, post) pair):
```
/me/blog/cijene-vodoinstalatera-elektricara-crna-gora-2026   ✅
/en/blog/plumber-cost-montenegro-2026                         ✅
/ru/blog/santehnik-cena-chernogoriya-2026                     ✅
/tr/blog/tesisatci-elektrikci-fiyatlari-karadag-2026          ✅
/de/blog/klempner-elektriker-preise-montenegro-2026           ✅
/uk/blog/santehnik-cina-chornohoriya-2026                     ✅
/it/blog/idraulico-prezzi-montenegro-2026                     ✅
/sr/blog/cene-vodoinstalatera-elektricara-srbija-2026         ✅
/ar/blog/asaar-sabakeen-montenegro-khaleeji-2026              ✅
…and similar for every other post (yacht-cleaning's en/de/ar variants too)…
```

Each entry carries `alternates.languages` populated from that post's
`translations`, so Google sees the full hreflang cluster per URL (matching
what the page itself emits in `<head>`).

## Build verify

`next build` clean in worktree: compile + types + lint + 18/18 static pages.

## Deploy + verify checklist (post-merge)

1. PR merge → prod deploy
2. `curl https://glatko.app/sitemap.xml | grep -oE '/[a-z]+/blog/[a-z0-9-]+'`
   → expect 9 distinct B2 URLs (one per locale, with real slugs).
3. `curl ${url}` for a sample non-ME B2 URL from the new sitemap → 200 OK.
4. Resubmit sitemap in GSC (Settings → Sitemaps) to trigger re-crawl.
5. Run GSC URL Inspection + Request Indexing for the 9 B2 URLs.

## Scope

This PR fixes the blog-section bug. Static-page and category/pro sections of
the sitemap (path-translated routes via the `pathnames` map) are unchanged
and intentionally kept on `makeAlternatesForHref`/`makeAlternatesForParams`,
which is correct for those routes.

## Related

- PR #65 (SEO-HREFLANG-FIX) — introduced the `translations` field and
  `buildPostAlternates`. This PR reuses that infrastructure on the sitemap
  side; without #65 the per-locale slug data wasn't available.
