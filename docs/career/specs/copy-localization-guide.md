# Career Vertical — Copy & Tone Localization Guide (9 locales)

> The translator/editor SSOT for the `careerVertical.*` dictionary subtree across all 9
> locales. Read with `docs/career/BUILD-RULES.md` (R7, R8.7) + `career-vertical-plan-v1.md`
> (PART 2 §"Brand & system inheritance", PART 4). Docs-only: no app/SQL code here.
>
> **Scope:** every key under `careerVertical.*` in `dictionaries/{tr,en,de,it,ru,uk,sr,me,ar}.json`.
> Source-of-truth pair is **`tr` (default) then `en`**; all other locales translate from `en`.
> CI `i18n-check.sh` only checks TOP-LEVEL keys — nested `careerVertical` drift ships silently.
> So this guide + the vitest deep-diff parity test (R8.7) are the only things keeping the
> subtree consistent. Treat the key SET as frozen once `tr`+`en` land; never add/drop a key in
> one locale only.

## The 9 locales (matches `i18n/routing.ts`)
`tr` (default), `en`, `de`, `it`, `ru`, `uk`, `sr`, `me`, `ar`. Launch priority pair: `tr` + `en`.
Audience skew (informs register, never changes the key set): employer-facing weight on
`me`/`sr`/`ru`/`tr`; worker-facing weight on `en`/`ar` + source-region readers.

## Two voices in one subtree
The career vertical talks to two audiences who must never be addressed with the same tone. Keys
are namespaced by audience (`careerVertical.employer.*` vs `careerVertical.worker.*`); shared
chrome (landing, how-it-works, trust strip, errors) is neutral.

- **Employer-facing voice** — confident, B2B, outcome-first. The buyer of a *curated, verified,
  guaranteed* labor supply. Lead with control, speed, vetting, the 90-day guarantee, "submit a
  requirement." Professional, not salesy; never desperate. Money is named plainly (the employer
  pays a service/commission fee). Address as "you" formal (de: *Sie*, ru/uk: вы, ar: formal).
- **Worker-facing voice** — warm, plain, protective, reassuring. The reader may be a vulnerable
  migrant jobseeker. Short sentences, zero jargon, zero legalese. Lead with safety + dignity +
  "this is free for you, the employer pays." Never imply the worker competes, is ranked against
  others, or could be charged. No fee/price/payment word may EVER appear on a worker key (R7 is
  structural — but copy must not hint at it either). Address as "you" warm/respectful.

Neutral chrome (landing hero, trust strip, how-it-works) stays brand-calm and even-handed —
it is read by both sides; do not tilt it toward the buyer.

## Must-keep phrases (canonical strings — translate the surrounding copy, keep the anchor exact)
These four anchors carry legal/brand weight. Each locale gets ONE canonical rendering, reused
verbatim everywhere it appears (do not paraphrase per-screen):

| Anchor (en) | Role | Localization rule |
|---|---|---|
| **Verified by RoNa Legal** | trust badge, every card + detail + landing strip | Keep **"RoNa Legal"** as an untranslated proper noun in every locale (incl. `ar` — Latin brand name inside RTL run, see RTL note). Translate only "Verified by". One canonical phrase per locale. |
| **Employer Pays** / **workers never pay** | trust pill + worker reassurance | Render as a clear money-direction statement. The worker-side variant ("free for you — the employer pays") must read as a *promise of protection*, never a fee disclosure. Keep both halves: employer-pays AND worker-never-pays. |
| **Talep Oluştur** (Create Requirement) | primary employer CTA (the conversion event) | This is the *employer* conversion verb — "create a requirement/requisition", NOT "apply", NOT "post a job". `tr` canonical = **Talep Oluştur**. Each locale picks one CTA verb and reuses it on landing + employer nav + dashboard. Distinct from "search/browse". |
| **Profil Oluştur** (Create Profile) | primary worker CTA | The *worker* conversion verb — "create your profile". `tr` canonical = **Profil Oluştur**. Must never collide with the employer CTA wording in the same locale (two different verbs/objects so nav is unambiguous). |

Anti-disintermediation copy invariants (PART 4): never expose or promise a name, phone, exact
city/country, or document before unlock. Locked-state copy says identity is released "after RoNa
Legal approval and the employer's fee" — keep that ordering (approval THEN payment).

## Per-locale translator checklist (run for each of the 9 files)
1. **Key parity:** the `careerVertical` key set is byte-for-byte identical to `en` (same nesting,
   same key names). No extra keys, no missing keys, no locale-only keys. (Parity is enforced by
   the R8.7 vitest deep-diff — match it or the build fails.)
2. **No leaked source language:** zero TR/EN words left in a non-TR/EN file (except the frozen
   proper noun **RoNa Legal** and worker codes like `MNE-CW-0427`).
3. **Voice check:** every `*.employer.*` key reads in the employer voice; every `*.worker.*` key
   in the worker voice. Re-read worker keys specifically for any competitive, ranking, or
   cost/fee/price/payment language → must be ZERO (R7).
4. **Anchor consistency:** the four must-keep phrases use this locale's ONE canonical rendering,
   identical across every screen they appear on. "RoNa Legal" left untranslated.
5. **Lock/gate copy:** locked-panel + "express interest" strings never promise contact/identity
   pre-unlock; ordering is *approval → employer fee → reveal*.
6. **Placeholders & ICU:** preserve every `{var}` / ICU plural exactly (headcount, fee amount on
   employer keys, day-counts for the 90-day guarantee). Do not translate variable names. Verify
   plural categories for the locale (ru/uk/sr/me Slavic plural rules differ from en's one/other).
7. **Length/UI fit:** CTAs and nav labels (`Talep Oluştur` / `Profil Oluştur` equivalents) stay
   short — de/ru tend to run long; keep button labels ≤ ~2 words so the amber CTA doesn't wrap.
8. **Tone register:** formal "you" where the language distinguishes (de *Sie*, ru/uk вы, it
   *Lei* for employer / warm but respectful for worker, ar formal). Consistent within a voice.
9. **Region not country:** worker-pool copy says *region* (Far East / Middle East / Africa),
   never an exact source country — mirror the anonymization rule in the strings themselves.
10. **RTL (`ar`) pass:** see below — read the Arabic strings rendered RTL, not just in the JSON.

## RTL note — Arabic (`ar`)
- Direction is set ONCE at the root: `app/[locale]/layout.tsx` applies `dir="rtl"` for `ar` via
  `RTL_LOCALES`. Translators add **no** direction markup — the whole `careerVertical` subtree
  inherits it. The job is to write Arabic copy that *reads correctly* when flowed RTL.
- **Brand names stay Latin (LTR) inside the RTL run:** "RoNa Legal", "Glatko", worker codes
  (`MNE-CW-0427`). Keep them as-is; the browser bidi algorithm handles the embedded LTR token —
  do not reorder letters or wrap them.
- **No hardcoded left/right in copy:** never write "to the left/right" (UI mirrors); refer to
  steps by order/number, not screen side. The 3-step how-it-works connector flips automatically.
- **Numerals & units:** keep fee amounts, the "90-day" guarantee, and headcount as the ICU
  variable; let the locale format them. Don't bake a number into prose.
- **Verify in a rendered preview**, not the raw JSON — RTL reordering only shows when painted.

## Tone anchors (existing copy to match, do not contradict)
- Current coming-soon `careerVertical.subtitle` (already shipped): tr "Karadağ'da işverenlerle
  güvenilir çalışanları buluşturacağız." / en "a trusted way to connect employers and workers in
  Montenegro." → new copy keeps this calm, trust-first register; don't pivot to hype.
- Mirror the health vertical's coming-soon warmth + concreteness (`healthVertical.comingSoon.*`)
  as the house style; career swaps the subject matter (employers/workers, verified labor supply)
  and the accent (amber, cosmetic — irrelevant to copy) but keeps the same plainspoken tone.

## Definition of done (for the whole 9-locale pass)
- All 9 `careerVertical` subtrees pass the R8.7 deep-diff parity test (identical key sets).
- Every must-keep anchor renders canonically per locale; "RoNa Legal" untranslated everywhere.
- Worker-voice keys scrubbed of any cost/competition language (R7); employer-voice keys carry
  the plain employer-pays fee framing.
- `ar` reviewed in a rendered RTL preview, Latin brand tokens intact.
- No new top-level dictionary keys (only `careerVertical.*` touched); CI top-level check + the
  nested vitest parity test both green.
