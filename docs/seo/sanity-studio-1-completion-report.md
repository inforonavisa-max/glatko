# SANITY-STUDIO-1 — Completion Report

**Date:** 2026-05-26
**Branch:** `sanity-studio-1` (worktree `../glatko-sanity-studio-1`, off `main` @ `668d4e1` incl. the merged #62 schema)
**Goal:** Move the Sanity Studio out of the React-18 Next app into a standalone `studio/` package with its own React 19, so it can actually run/deploy (Sanity 5 needs `react/compiler-runtime` = React 19).
**Status:** Code complete, **both builds green**. Deploy (`sanity deploy`) is pending — needs Rohat's Sanity login.

---

## Why
Sanity 5.x Studio imports `react/compiler-runtime` (React 19). The Next app is React 18, so embedding the Studio fails the webpack build. A standalone package with its own React 19 is the clean fix; the app keeps only the **reader** (`next-sanity` / `@sanity/client` / `@sanity/image-url`), which works on React 18.

## What changed
**New `studio/` package** (own `node_modules`, React 19):
- `studio/package.json` — react 19, react-dom 19, sanity ^5.23, @sanity/vision ^5.23, styled-components ^6.1.15
- `studio/sanity.cli.ts` — projectId `txobbpuq`, dataset `production`, `studioHost: "glatko"` → deploys to `glatko.sanity.studio`
- `studio/sanity.config.ts` — moved from `sanity/`; projectId/dataset hardcoded (no NEXT_PUBLIC env in standalone), embedded `basePath: "/studio"` removed (dedicated host serves at root)
- `studio/schemas/**`, `studio/structure/**` — moved from `sanity/` (incl. #62's `faqBlock` / `priceTable` / `schemaType`)
- `studio/.gitignore` — `node_modules`, `dist`, `.sanity`

**App (Next, React 18) cleanup:**
- Removed `sanity` + `@sanity/vision` from `package.json` (studio-only; verified the app never imports them — reader is GROQ-based)
- Removed the dead `studio:dev` / `studio:build` / `studio:deploy` scripts (`--config-path`, gone in Sanity CLI 5.x, and pointed at the now-moved config)
- `tsconfig.json` — added `studio` to `exclude` so `next build`'s type-check doesn't reach into the React-19 package
- `package-lock.json` relocked

**Untouched:** `middleware.ts`, `app/layout.tsx`, `lib/supabase/admin.ts`, env files, and the entire app reader.

## Build verification
- `cd studio && npm run build` (`sanity build`, React 19) → **exit 0**, clean (no styled-components warning after the ^6.1.15 bump).
- `npm run build` (`next build`, app) → **exit 0**; route table intact; only pre-existing next-intl/webpack cache warnings (no new ones).

## Commit note
Shipped as **one atomic refactor commit** (+ this report) rather than 4 fragments: scaffold / move / app-cleanup are interdependent — intermediate splits wouldn't build. Squash-merge yields the same result.

## Pending — Rohat (needs Sanity login)
```bash
cd studio && npx sanity deploy        # → https://glatko.sanity.studio (claims the 'glatko' host on first deploy)
```
Then verify:
- [ ] `https://glatko.sanity.studio` loads → Sanity login → Studio
- [ ] Posts → Create new → **Schema.org type** dropdown present
- [ ] Body `+` menu shows **FAQ Block** + **Price Table**
- [ ] Create a disposable post (FAQ + price), publish → frontend render + FAQPage/Article JSON-LD (per #62 test plan), then delete
- [ ] Existing `/me/blog/karadagda-yat-temizligi` still renders (regression)

## Migration impact
None for content or the app reader. Editors get a working, deployable Studio for the first time; CONTENT-ENGINE-1 Phase 2 authoring is unblocked once deployed.
