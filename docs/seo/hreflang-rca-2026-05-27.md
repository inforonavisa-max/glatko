# RCA — Blog Cross-Locale hreflang (2026-05-27)

Sprint: SEO-HREFLANG-FIX. Read-only investigation of how blog-post hreflang is
currently produced and why the two B2 articles (ME + EN) are not linked.

## Q1 — How is `alternates` produced on the blog post page?

`app/[locale]/blog/[slug]/page.tsx` → `generateMetadata` (line 49):

```ts
const alternates = buildAlternates(locale, "/blog/[slug]", { slug });
```

The returned object (`{ canonical, languages }`) is passed straight into Next's
`Metadata.alternates`. Next renders it as `<link rel="canonical">` plus one
`<link rel="alternate" hreflang="…">` per key in `languages` (including
`x-default`). There is no separate hreflang component — `buildAlternates` is the
single source (per the 2026-05-18 GSC duplicate-canonical incident note in
`lib/seo.ts`).

## Q2 — Does `buildAlternates` spread one slug across all 9 locales?

**Yes — this is the bug.** `lib/seo.ts` `buildAlternates` loops every
`SEO_LOCALES` entry and resolves each via
`getPathname({ locale: l, href: { pathname: "/blog/[slug]", params: { slug } } })`
with the **same `slug`** for all locales. Because `/blog/[slug]` is *not*
path-translated in `i18n/routing.ts` (the pathnames entry is the identity
`"/blog/[slug]": "/blog/[slug]"`), only the locale prefix changes:

| locale | emitted hreflang URL (for the ME post) | exists? |
|--------|----------------------------------------|---------|
| sr-Latn-ME | /me/blog/cijene-vodoinstalatera-elektricara-crna-gora-2026 | ✅ |
| en | /en/blog/**cijene-vodoinstalatera-elektricara-crna-gora-2026** | ❌ 404 |
| de/it/ru/… | /…/blog/cijene-… | ❌ |
| x-default | = the `en` URL above | ❌ |

So every non-current locale points at a slug that doesn't exist in that
language, and `x-default` inherits the broken `en` URL. The real EN article
lives at `/en/blog/plumber-cost-montenegro-2026`, which is never referenced.
Net effect: Google sees no valid cross-locale relationship between the two
articles (and is fed 404-bound alternates).

## Q3 — Is there a `translations` reference to pull from?

**No.** `lib/sanity/queries.ts` `POST_DETAIL_PROJECTION` fetches no
`translations`, and `studio/schemas/documents/post.ts` has no such field. There
is currently no data linking a post to its other-language versions.

## Fix shape (implemented in this sprint)

1. **Schema:** additive `translations` field on `post` — array of references to
   other `post` docs (self-reference filtered out, max 9).
2. **Query:** extend `POST_DETAIL_PROJECTION` to resolve each translation to
   `{ locale, slug }` (locale derived from whichever `slug.<loc>.current` is
   defined; literal locale fields, untouched by the `$$LOCALE$$` substitution).
3. **Helper:** new additive `buildPostAlternates(currentLocale, currentSlug,
   translations)` in `lib/seo.ts` — emits hreflang ONLY for locales that have a
   real version (current + linked translations), reusing `localizedUrl()` so
   URLs stay in lockstep with the pathnames map; keys use `hreflangForLocale()`
   (BCP 47); `x-default` → en, else me, else current. `buildAlternates` is left
   untouched.
4. **Page:** swap the blog `generateMetadata` call to `buildPostAlternates`.
5. **Data:** link the two existing B2 posts to each other (prod patch, Görev 5).

Why a new helper rather than changing `buildAlternates`: that function is the
single source for *path-translated, all-locale* routes (services, static pages)
where one logical page genuinely exists in every locale at a derivable URL.
Blog posts are the opposite case — separate per-locale documents with
independent slugs and partial locale coverage — so they need their own builder.
