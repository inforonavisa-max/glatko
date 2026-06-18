# Glatko İş & Kariyer (Work & Career) Vertical — Master Plan v1

> SSOT for the gated, anonymized B2B labor-supply marketplace vertical.
> Mirrors the Health vertical's structural conventions (feature-flag + middleware gate,
> `(gated)` route group, per-locale slugs, `noindex` quarantine) but swaps the accent to
> **amber-600 (#D97706)** — exactly as Health uses sky-600.
> Status: Phase 0 (foundations) + Phase 1 (product UI scaffold) buildable now. Phase 2/3
> (Montenegro mediation licence, AZLP/GDPR operationalization, real revenue) are a
> separate legal workstream — scaffolding only, no live operation.

## TL;DR

Build the İş & Kariyer vertical as a gated, anonymized B2B labor-supply marketplace:
- **Supply narrative** modeled on overseas-manpower agency portals (AJEETS, Oman Agencies):
  sector-first taxonomy, skill tiers, source-region framing, "submit your requirement" CTA,
  free-replacement guarantee, full-lifecycle ownership.
- **Gate** modeled on Toptal/Andela: a human "talent matcher" (the owner's RoNa Legal
  consultancy) mandatory between supply and demand; curation is the product; no public contact.
- **Backbone** modeled on recruitment ATS pipelines: requisition → shortlist → placement.
- The owner's consultancy is **structurally inserted as the mandatory unlock step** before any
  worker identity, contact, or document is revealed.

The anti-disintermediation model separates **public anonymized showcase data** from
**gated identity/contact/document data at the database layer** (Supabase RLS + a dedicated
public view), so employers browse a worker-ID-coded talent pool, filter, and "express
interest," but full identity is released ONLY after **owner approval + commission/service-fee
payment**.

The worker is **never charged a fee** (ILO Employer Pays Principle; Montenegro law makes
charging a jobseeker an offence: €500–€20,000 fine).

---

## PART 1 — Reference platform synthesis

The employer sees a **manpower-agency-style sector pool** rendered as **Upwork/LinkedIn-style
anonymized cards**; the owner runs a **Toptal-style human-gated ATS** requisition→shortlist→
placement pipeline behind the scenes; the **identity-unlock gate** is the monetization and
anti-disintermediation point.

Reusable patterns adopted:
- **Sector-and-tier faceting** from day one (Construction + Hospitality target).
- **Source-region framing** (Far East / Middle East / Africa) shown as *region*, not exact country.
- **"Create Requisition" CTA** (not "apply") as the conversion event.
- **90-day free replacement guarantee** as standard.
- **Human talent-matcher** in the loop; talent never free-floats.
- **Vetting/curation as gate** ("Verified by RoNa Legal"); scarcity is the product.
- **No public contact details**; platform mediates all contact (symmetric gate — worker also
  never sees employer contact pre-placement).
- **Profile-card UX** (skills-match badges, experience band, status signal, "view full profile (locked)").
- **Anti-leakage ToS** (Upwork-style: off-platform circumvention → termination + liability) +
  contact-info masking.
- **ATS pipeline**: requisition → posting/sourcing → screening → shortlist → interview → offer →
  placement → onboarding; scorecards; anonymization; stage-conversion reporting.

---

## PART 2 — Information architecture & page schema

### Brand & system inheritance
- Mirror the Hizmetler/Health structural conventions (three-tier vertical switcher, nav, "Nasıl
  Çalışır", CTA). Swap global accent → **amber-600 (#D97706)** as the vertical accent.
- All 9 locales: `tr` (default), `en`, `de`, `it`, `me`, `ru`, `sr`, `ar`, `uk`.
  Launch priority pair: `tr` + `en`. Employer-facing: `me`/`sr`/`ru`. Worker-side: `en`/`ar` +
  source-region languages. **RTL handling required for `ar`.**
- Feature-flag gated (default OFF), middleware-quarantined + `noindex` exactly like Health while
  unlaunched. Flag name: **`CAREER_VERTICAL_ENABLED`**.

### Navigation (context-aware by audience)
**Public / Employer nav (İş & Kariyer active):** İş & Kariyer · İşgücü Havuzu (Talent Pool) ·
Nasıl Çalışır · Sektörler · İşveren Ol · Search · Giriş · CTA `Talep Oluştur` (amber-600).

**Worker nav (after worker login / worker landing):** İş & Kariyer · Nasıl Çalışır (worker
version — "free for you, employer pays") · Profilim · Belgelerim · Başvurularım/Durumum ·
Giriş/Kayıt · CTA `Profil Oluştur` (amber-600).

**Owner/Admin nav (separate authenticated console, not public):** Dashboard · Requisitions ·
Talent Curation · Shortlists · Unlock Approvals · Commissions/Fees · Workers · Employers ·
Compliance/Documents · Reports.

### Sitemap / URL structure (canonical English segment `career`; localizes to `/kariyer` etc.)
```
/career                                  → İş & Kariyer landing/hero
/career/how-it-works                     → How It Works (gated model explainer)
/career/sectors                          → Sectors hub
/career/sectors/construction             → Construction sector hub
/career/sectors/hospitality              → Hospitality sector hub
/career/pool                             → Talent Pool browse (anonymized cards + filters)
/career/pool/[workerCode]                → Anonymized worker profile detail (e.g. MNE-CW-0427)
/career/employer                         → Employer landing / value prop
/career/employer/register                → Employer registration
/career/employer/dashboard               → Employer dashboard
/career/employer/dashboard/requisitions  → My requisitions
/career/employer/dashboard/requisitions/new   → Create bulk requisition (multi-step)
/career/employer/dashboard/requisitions/[id]  → Requisition detail + presented shortlist
/career/employer/dashboard/unlocks       → Unlock / reveal requests + payment status
/career/worker                           → Worker landing (free-for-you messaging)
/career/worker/register                  → Worker registration
/career/worker/profile                   → Worker profile builder (multi-step)
/career/worker/documents                 → Document & photo upload center
/career/worker/dashboard                 → Worker dashboard / status
/career/login                            → Role-routed login (may reuse global auth)
/admin/career/...                        → Owner console (gated, not locale-public)
```
All public segments localize per-locale via `i18n/routing.ts` (e.g. `tr: /kariyer/...`,
`me: /karijera/...`). Gated/internal segments stay identity (English) like Health's `uzman`/`randevu`.

### Page-by-page content (condensed)
1. **Landing/Hero** (`/career`): amber hero, dual CTA (employer/worker), trust strip ("Verified by
   RoNa Legal", "Employer Pays"), live anonymized-card teaser (blurred/locked look), sector tiles,
   3-step how-it-works diagram, placement stats (when available).
2. **How It Works**: both paths explained transparently; two revenue paths stated (commission-only
   vs full-service); Employer Pays statement (workers never charged).
3. **Talent Pool browse** (`/career/pool`) — core employer screen: left filter rail (Sector, Skill/
   trade, Skill tier, Experience band, Region [Far East/ME/Africa, not country], Age band, Languages,
   Certifications, Readiness/verification, Availability); results grid of **anonymized cards**
   (worker code, role/trade, experience band, region, top 3–5 skill badges, cert badges, readiness
   score, "Verified by RoNa Legal" badge, face-blurred+watermarked work-photo thumb, `İlgi Göster`
   + `Talebe Ekle`). No name, no contact, no exact location. Sort by relevance/experience/readiness/
   recent. Interest actions require employer login.
4. **Anonymized worker detail** (`/career/pool/[workerCode]`): expanded anonymized view (skills
   matrix, redacted experience timeline "Hospitality employer, UAE, 3 yrs", cert badges [file
   locked], face-blurred/watermarked photos, optional gated video intro, languages, readiness
   summary). Prominent **locked panel**: "Full name, contact, passport & original documents
   available after RoNa Legal approval and fee." + `İlgi Göster` CTA + add-to-requisition.
5. **Create bulk requisition** (`.../requisitions/new`) — multi-step: (1) sector + role(s) +
   headcount per role; (2) requirements (experience, certs, languages, tier); (3) terms shown to
   workers (wage range, hours, accommodation/board, contract duration, start date — mirror MNE
   mediation-law disclosure fields); (4) service choice commission-only vs full-service; (5) review
   + submit → creates `requisition` status `submitted`.
6. **Employer dashboard**: requisitions list with status pills (Submitted → Under curation →
   Shortlist ready → Interest expressed → Approved/Unlocked → Placed → In guarantee); per-req
   owner-curated anonymized shortlist with per-worker actions; unlock/payment center; placement
   tracker + guarantee countdown + request-replacement; saved searches/workers.
7. **Worker registration + profile builder** (`/career/worker/profile`) — multi-step: (1) account +
   explicit GDPR/PDPA consent; (2) basics (role/trade, years, region/country, languages, age); (3)
   skills (structured per-trade picker) + work history; (4) certifications/education; (5) photos &
   docs; (6) optional video intro. Profile completeness + readiness meter.
8. **Document & photo upload center** (`/career/worker/documents`) — per-item visibility flag:
   `public_anonymized` | `gated` | `internal_only`. Categories: profile photo, work photos,
   ID/passport, diplomas/certs, skill certs, insurance/medical, references. Each upload shows the
   consent the worker is granting; worker can see + revoke per-document consent.
9. **Worker dashboard**: status ("You are showcased" / "An employer expressed interest" / "Pending
   RoNa approval" / "Matched — legal processing"), owner is single point of contact; no employer
   contact exposed (symmetric gate).
10. **Owner/Admin console** (`/admin/career`): requisition management; talent curation (search full
    un-anonymized worker DB, verify docs, set badges + readiness, build shortlists); shortlist
    builder (drag → publish anonymized shortlist); **reveal/unlock approval gate** (approve/deny,
    trigger fee invoice, on payment-confirmed flip `reveal_unlock` to release identity+docs);
    commission/fee tracking; compliance/documents (consent log, retention timers, access audit).

---

## PART 3 — Data model (Supabase)

### Core tables
- **`career_worker_profiles`** — split public-safe vs private columns.
  - Public-safe: `worker_code` (e.g. `MNE-CW-0427`), `role`, `trade`, `skill_tier`,
    `experience_band`, `region` (Far East/ME/Africa), `age_band`, `languages[]`, `skills[]`,
    `readiness_score`, `verification_status`, `is_showcased`.
  - Private: `full_name`, `dob`, `exact_country`, `phone`, `email`, `address`, `passport_no`.
- **`career_worker_documents`** — `id`, `worker_id`, `category`
  (passport/diploma/work_photo/insurance/reference), `storage_path`, `visibility` enum
  (`public_anonymized` | `gated` | `internal_only`), `consent_status`, `consent_at`,
  `retention_until`, `watermarked_variant_path`.
- **`career_employer_accounts`** — `id`, `company`, `contact`, `verified`, `tier`.
- **`career_requisitions`** — `id`, `employer_id`, `sector`, `roles_jsonb` (role→count),
  `requirements`, `terms_jsonb` (wage/hours/accommodation/duration), `service_path`
  (`commission` | `full_service`), `status`.
- **`career_shortlists` / `career_shortlist_items`** — `requisition_id`, `worker_id`, `stage`,
  `added_by` (owner), `presented_to_employer` bool.
- **`career_reveal_unlocks`** — `id`, `requisition_id`, `worker_id`, `employer_id`, `interest_at`,
  `owner_approved` bool, `fee_invoice_id`, `payment_status`, `unlocked_at`.
  **THIS ROW IS THE GATE**: identity/doc access granted only when
  `owner_approved = true AND payment_status = 'paid'`.
- **`career_placements`** — `id`, `reveal_unlock_id`, `placed_at`, `guarantee_until`,
  `replacement_of` (self-ref), `status`.
- **`career_commission_records`** — `id`, `placement_id`, `path`, `amount`, `currency`,
  `invoice_id`, `paid_at`.
- **`career_consents` / `career_document_access_log`** — audit trail for PDPA/GDPR.

### Critical RLS architecture (Postgres RLS = row-level, not column-level)
1. Keep identity/contact/document data in **separate rows/tables** from anonymized data, AND expose
   a dedicated public view **`career_worker_showcase`** that selects ONLY public-safe columns where
   `is_showcased = true`. Anon/authenticated-employer roles get `SELECT` on the view; base
   `career_worker_profiles` RLS denies employer access entirely.
2. RLS on `career_worker_profiles` (base): `SELECT` only to (a) owner/admin (service role or admin
   claim) and (b) the worker themselves (`(select auth.uid()) = user_id`). Employers get no grant.
3. The `career_worker_showcase` **view** carries only public-safe fields + `is_showcased = true`;
   granted to employer role. A view exposes only the columns it selects.
4. Gated document/identity access via RLS on `career_worker_documents` joined to
   `career_reveal_unlocks`: employer may `SELECT` a worker's `gated` docs/identity only if
   `EXISTS (reveal_unlocks WHERE worker_id=… AND employer_id=… AND owner_approved=true AND
   payment_status='paid')` in the policy `USING` clause.
5. **Enable RLS on every table from day one.** (Supabase leaves RLS off for SQL-created tables;
   CVE-2025-48757, disclosed 2025-06-04, CVSS 8.26: 303 endpoints across 170 projects had tables
   readable by the anon key.) Index every column used in policies; wrap `auth.uid()` as
   `(select auth.uid())`.
6. **Storage RLS:** worker docs in a private bucket; signed URLs issued only through a server action
   that re-checks the `reveal_unlocks` gate. Watermarked/blurred variants in a separate showcase path.
7. **Service-role for owner operations only on the server**; never expose the service key client-side.

### Document upload + visibility architecture
- Worker uploads → private bucket `career-worker/{id}/{category}/…`.
- Server process generates derived showcase variants for any `public_anonymized` work photo
  (face-blur + watermark "Glatko · RoNa Legal"), stored separately.
- `visibility` + `consent_status` on each `career_worker_documents` row is the single source of
  truth; `/career/worker/documents` writes these + shows the worker exactly what is/isn't public.
- Original gated files never served pre-unlock; post-unlock via short-lived signed URLs, every
  access written to `career_document_access_log`.

---

## PART 4 — Anonymization & anti-disintermediation

**Shown publicly (anonymized showcase):** worker code (not name); role/trade, skill tier,
experience band, top skills as badges; region (not country/city); age band (not DOB); languages;
certifications as badges (the *fact* of a cert, not the file/issuer); work photos face-blurred +
watermarked; readiness score + "Verified by RoNa Legal" badge. Optional video: gate or
face-blur/voice-only until unlock (a short hands-only skills clip may be public; full intro gated).

**Gated (released only after approval + payment):** full name; phone/email/messaging; exact
country/city/address; passport & ID scans; original diploma/cert files; insurance/medical;
references with contactable identifiers; un-blurred photos/video.

**Express-interest → owner-approve → unlock-after-payment flow:**
1. Employer browses → `İlgi Göster`/`Talebe Ekle` (creates `career_reveal_unlocks` row, state
   `interest`). No identity revealed.
2. Owner reviews fit + worker consent → approves (`owner_approved=true`) + issues fee invoice
   (commission or service fee).
3. Employer dashboard: "Approved — fee due"; employer pays (ideally escrow, held until placement).
4. On `payment_status='paid'`, system flips `unlocked_at` → employer's view swaps anonymized → full
   dossier (identity + gated docs via signed URLs), logged.
5. Symmetric gate: worker never sees employer contact pre-placement; owner brokers all contact.

**Best practices:** per-session dynamic watermark with viewer/employer ID; in-platform-only
messaging with contact-info masking (regex/NLP redaction of phone/email/WhatsApp in free text);
ToS non-circumvention + penalty clause; rate-limit + bot-detection on pool browse; no bulk export;
server-side pagination; never ship private columns to the client even hidden; provide so much
bundled value (legal/permit handling, guarantee, verified pool, escrow, dispute resolution) that
going around is irrational.

---

## PART 5 — Extra / alternative ideas

- **"Verified by RoNa Legal" tiered trust layer**: ID-verified, skills-verified, documents-verified,
  interview-passed. Show badge on every card.
- **Worker readiness score**: composite of profile completeness, verified docs, skill assessment,
  language level, deployment readiness (passport valid, medical done). Drives sort + employer
  confidence; gamifies worker completion.
- **90-day free replacement guarantee** (industry standard, ~45% of recruiters; replacement-only is
  the dominant form, ~61%). Encode `career_placements.guarantee_until` + replacement linkage.
- **Escrow for fees**: hold commission/service fee, release on confirmed placement / probation
  checkpoint — addresses employer risk + leakage.
- **Pricing model options**: per-placement (contingency norm 15–25% of annual salary; flat per-head
  often cleaner for blue-collar volume) and subscription for high-volume employers. Two revenue
  paths map to commission-only vs full-service.
- **Employer tiers**: Free (browse anonymized pool) → Verified (submit requisitions, express
  interest) → Premium/retainer (priority curation, volume discounts, dedicated support).
- **Video intro profiles** (face-gated) + one-way skills clips.
- **Two-sided cold-start**: seed supply first (concierge MVP, manual onboarding of first cohort);
  single-player utility for workers (portable verified credential vault); bring-your-own-demand
  (3–5 design-partner employers from RoNa network); make pool look populated before launch.
- **Sector pilots**: launch ONE sector first (recommend Construction).
- **Worker grievance & welfare channel** (IRIS/IOM ethical-recruitment best practice).
- **Post-placement check-ins** + replacement-driven retention loop.

---

## PART 6 — Phase 2 (SEPARATE): legal-operational layer

> Distinct, later workstream with RoNa Legal counsel. The IA/product (Parts 1–5) builds first with
> compliance scaffolding (consent, RLS, audit logs) in place; licensing + cross-border legal
> operation is its own track. **Not legal advice; execute with qualified Montenegrin counsel.**

- **A. Montenegro recruitment/employment-mediation licensing (NACE 78.10):** Law on Employment
  Mediation (Off. Gazette 24/2019). Private agency needs a Ministry-of-Labour "dozvola za rad"
  *before* operating (Art. 82); Ministry decides within 15 days. Conditions (premises/staff/
  equipment) sit in an implementing rulebook (obtain directly). Revocable (Art. 83); 2-year
  re-founding bar after revocation. Foreign placement: Arts. 30–34 (accurate info, contract before
  departure, cost of early return, notify Ministry).
- **B. Foreign (third-country) worker permits:** integrated temporary residence-and-work permit,
  employer-sponsored, tied to employer+job, annual quota. **Jan 17 2026 Foreigners Act amendment**
  expressly permits **staff-leasing** of foreign workers into Montenegro (permit up to 1y, renewable
  to max 2y; MNE Labour Act applies to leased workers; leasing added to quota exemptions). Evaluate
  direct-sponsorship vs staff-leasing structure with counsel.
- **C. ILO Employer Pays Principle:** recruitment fees/costs never borne by workers. Aligns with MNE
  law (services free for jobseekers; charging a jobseeker = €500–€20,000 fine). Private agency may
  charge the **employer**. MNE has NOT ratified ILO C181 (worker-fee protection rests on national
  law — do not describe as C181 compliance).
- **D. Data protection (GDPR-equivalent):** MNE PDPL (Off. Gazette 79/08 + amendments incl. 77/2024),
  enforced by AZLP. Source conflict on in-force regime — **build to GDPR standard regardless**.
  Passport/biometric/cert data = special-category (Art. 9): explicit consent + strong security +
  strict retention; MNE PDPL requires prior AZLP authorization for high-risk automated processing.
  Build-in: explicit purpose-bound revocable per-document consent; data minimization (anonymized
  showcase is itself a control); `retention_until` timers + auto-purge; `career_document_access_log`;
  72-hour breach notification; DPO/responsible person; cross-border transfer controls
  (source countries → Supabase Frankfurt → MNE employers = international transfers needing lawful
  basis); **DPIA strongly advised** (sensitive data + vulnerable migrants + readiness profiling).

### Owner compliance checklist (high level)
1. Register company + NACE 78.10. 2. Obtain Ministry mediation licence ("dozvola za rad").
3. Confirm foreign-worker structure (direct vs Jan-2026 staff-leasing) with counsel.
4. Register as data controller with AZLP; prior authorization for sensitive/biometric; appoint DPO;
   run DPIA. 5. Employer-Pays contracts + non-circumvention + guarantee/replacement + escrow.
6. Consent/retention/breach/audit processes matching the schema. 7. Consider IRIS certification.

---

## Staged recommendations & gating thresholds

- **Phase 0 — Foundations (build now):** Supabase schema with RLS on every table from day one;
  `career_worker_showcase` view; `career_reveal_unlocks` gate policy; private storage bucket +
  signed-URL server action; `career_consents` / `career_document_access_log` / `retention_until`
  scaffolding. Mirror Health nav/layout; accent → amber-600. Flag `CAREER_VERTICAL_ENABLED` OFF.
- **Phase 1 — Supply seeding (concierge MVP):** manually onboard first verified worker cohort
  (~50–100 profiles before any employer sees the pool); single-player credential-vault value; do not
  open employer browse until pool clears threshold.
- **Phase 2 — Demand + gate live:** onboard 3–5 design-partner employers; ship requisition → curated
  shortlist → express-interest → owner-approve → pay → unlock with escrow + 90-day guarantee; pick
  one sector first (Construction).
- **Phase 3 — Legal-operational layer:** execute Part 6 with counsel. **Gating threshold: do not take
  real commission/service-fee revenue at scale before the mediation licence is in hand.**

**Metrics that change the plan:** employer conversion stalls despite populated pool → push
verification badges + guarantee. Workers churn off-platform → strengthen credential-vault value.
Leakage appears → escalate contact-masking → ML intent-flag + ToS enforcement; lean on bundled
legal value over penalties.

## Caveats
- "029/25" amendment to MNE mediation law unverified; 24/2019 base text confirmed.
- MNE data-protection-law in-force status reported inconsistently — confirm with counsel before
  Phase 2.
- Exact numeric licensing conditions sit in a Ministry rulebook not retrieved.
- MNE has not ratified ILO C181.
- Reference-platform UX patterns inferred from public marketing/help pages.
- This document informs product/IA; **not legal advice** — Part 6 needs qualified MNE counsel.
