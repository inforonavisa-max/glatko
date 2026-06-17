import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  Briefcase,
  CalendarClock,
  ChevronLeft,
  Coins,
  Home,
  Languages,
  ScrollText,
  Users,
} from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { createClient } from "@/supabase/server";
import {
  getEmployerRequisition,
  resolveCareerRole,
  type RequisitionShortlistCard,
  type ShowcaseWorkerCard,
} from "@/lib/kariyer/queries";
import { intlLocale } from "@/lib/kariyer/intl";
import { WorkerCard } from "@/components/glatko-kariyer/WorkerCard";
import { ExpressInterestButton } from "@/components/glatko-kariyer/ExpressInterestButton";
import { RequisitionStatusPill } from "@/components/glatko-kariyer/RequisitionStatusPill";

type Props = {
  params:
    | Promise<{ locale: string; id: string }>
    | { locale: string; id: string };
};

// Per-employer, per-requisition, per-viewer state (interest markers re-read on
// every render) → NEVER ISR-cached (R5/R11). Mirrors health's randevu page,
// which is force-dynamic for the same session-scoped reason. `noindex` for the
// whole career subtree is set by app/[locale]/career/layout.tsx; we also pin it
// at the page level here (mirror randevu lines 19–21) — via generateMetadata
// below (Next forbids exporting both `metadata` and `generateMetadata`).
export const dynamic = "force-dynamic";

// ⚠️ R12 — UNTHROTTLED SCRAPE SURFACE: this is a PAGE route, so lib/rateLimit.ts's
// `public-form` cap does NOT cover it. The structural throttle here is the
// server-side owner-ownership gate (the RPC re-verifies p_employer_user_id and
// returns null for a foreign uid → notFound) + no bulk export (one owned
// requisition + its presented shortlist per route). Do not mistake this for a
// rate-limited surface.

/** Canonical UUID v1–v5 matcher — validate the `[id]` segment before any RPC. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(id: string): boolean {
  return typeof id === "string" && UUID_RE.test(id);
}

// ── Defensive JSONB narrowing ────────────────────────────────────────────────
// roles_jsonb / requirements / terms_jsonb are `unknown` on RequisitionDetail
// (the RPC projects raw jsonb). Narrow each shape here without `any` so a missing
// or malformed blob renders a graceful gap rather than crashing the page.

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** roles_jsonb = `{ trade: headcount }`. Returns ordered [trade, count] rows. */
function rolesRows(v: unknown): Array<{ trade: string; headcount: number | null }> {
  const rec = asRecord(v);
  if (!rec) return [];
  return Object.entries(rec).map(([trade, count]) => ({
    trade,
    headcount: asNumber(count),
  }));
}

/**
 * The presented shortlist carries the smaller RequisitionShortlistCard shape
 * (no ageBand/languages/skills/verificationStatus, plus a `stage`). The
 * anonymized WorkerCard expects a public-safe ShowcaseWorkerCard, so we widen
 * each row to that shape — filling the columns the shortlist RPC does not
 * project with safe empties (NEVER inventing identity, R2/R8 #1).
 */
function toShowcaseCard(item: RequisitionShortlistCard): ShowcaseWorkerCard {
  return {
    workerCode: item.workerCode,
    role: item.role,
    trade: item.trade,
    skillTier: item.skillTier,
    experienceBand: item.experienceBand,
    region: item.region,
    ageBand: null,
    languages: [],
    skills: [],
    readinessScore: item.readinessScore,
    verificationStatus: null,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  // noindex inherited from app/[locale]/career/layout.tsx — do NOT add
  // buildAlternates/indexable metadata to this gated subtree (IMPL-CONTRACT).
  return {
    title: t("careerVertical.employer.dashboard.viewRequisition"),
    robots: { index: false, follow: false },
  };
}

/**
 * Requisition detail + presented shortlist (Spec 15) — the employer-scoped,
 * identity-firewalled counterpart to health's session-scoped booking page
 * (app/[locale]/health/(gated)/randevu/[holdId]). Single-column detail: a
 * back-link, the requisition header + status pill, a PII-free summary card
 * (sector, roles + headcount, requirements, worker-facing terms, service path),
 * then the owner-curated anonymized shortlist — ONE WorkerCard per presented
 * item, each carrying its own ExpressInterestButton folded into THIS requisition.
 *
 * AUTH / OWNERSHIP (R1/R11/R8 #2): identity is the verified session uid
 * (auth.getUser()), passed DOWN as p_employer_user_id into the read-RPC, which
 * re-verifies ownership. A not-logged-in viewer is redirected to /career/login
 * BEFORE any req facts render. Employer B opening employer A's requisition →
 * the RPC returns null → notFound() (indistinct from an unknown id; never leak
 * the existence of another employer's requisition).
 *
 * 404 vs error (mirror health): a malformed id, an unknown requisition, or a
 * cross-employer denial all resolve to notFound() (a null requisition is a 404,
 * NOT an error screen). A genuine RPC THROW propagates to the gated group
 * error.tsx retry screen.
 *
 * IDENTITY FIREWALL (R2/R6/R8 #1): every shortlist card is the public-safe
 * anonymized set the showcase VIEW projects (worker_code, role/trade, bands,
 * region, readiness) — NO name/contact/exact-location/passport/doc. There is no
 * un-anonymized variant on this surface even after approval+payment; the unlocked
 * dossier lives in the unlock center (/career/employer/dashboard/unlocks).
 *
 * R7: the worker is never charged — no fee/price/payment field attaches to any
 * worker card or to the requisition's worker-facing terms.
 */
export default async function RequisitionDetailPage({ params }: Props) {
  const { locale, id } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const l = locale as Locale;

  // Malformed `[id]` segment → 404 BEFORE any RPC (Spec 15 edge case; mirror the
  // health slug-shape validation that precedes the read).
  if (!isUuid(id)) notFound();

  // Identity is derived server-side from the trusted session (auth.getUser()),
  // NEVER the request. Not-logged-in / non-employer → bounce to login before
  // rendering any requisition facts (R11; the dashboard is employer-only).
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/career/login", locale: l });
  }
  // After redirect(), `user` is non-null on the live path; narrow for the RPC.
  const employerUser = user!;
  const role = await resolveCareerRole(employerUser.id);
  if (role !== "employer") {
    redirect({ href: "/career/login", locale: l });
  }

  // Owner-scoped read. The RPC re-verifies p_employer_user_id inside (R1): a
  // foreign uid or an unknown id yields null → notFound() (cross-employer denial
  // is indistinct from unknown-id, R8 #2). A genuine RPC failure throws →
  // error.tsx. The presented shortlist is ONLY presented_to_employer=true items.
  const requisition = await getEmployerRequisition(id, employerUser.id);
  if (!requisition) notFound();

  const t = await getTranslations();
  const e = (k: string) => t(`careerVertical.employer.${k}`);
  const wz = (k: string) => t(`careerVertical.employer.requisitionWizard.steps.${k}`);

  // Status pill — localized label from the requisitionStatus.* subtree (9-locale
  // parity); the pill maps the raw status → amber-neutral tone (Spec 12). Unknown
  // future status falls back to the raw string (never crash on an unmapped enum).
  const statusLabel = t.has(
    `careerVertical.employer.requisitionStatus.${requisition.status}`,
  )
    ? e(`requisitionStatus.${requisition.status}`)
    : requisition.status;

  const sectorLabel = requisition.sector ?? e("requisitionWizard.none");

  // Defensive narrowing of the raw jsonb blobs (see helpers above).
  const roles = rolesRows(requisition.rolesJsonb);
  const req = asRecord(requisition.requirements);
  const terms = asRecord(requisition.termsJsonb);

  const experience = req ? asString(req.experience) : null;
  const minTier = req ? asString(req.minTier) : null;
  const certifications = req ? asStringArray(req.certifications) : [];
  const reqLanguages = req ? asStringArray(req.languages) : [];

  const wageMin = terms ? asNumber(terms.wageMin) : null;
  const wageMax = terms ? asNumber(terms.wageMax) : null;
  const currency = terms ? asString(terms.currency) : null;
  const hours = terms ? asString(terms.hours) : null;
  const accommodation =
    terms && typeof terms.accommodation === "boolean" ? terms.accommodation : null;
  const accommodationNote = terms ? asString(terms.accommodationNote) : null;
  const duration = terms ? asString(terms.duration) : null;
  const startDateRaw = terms ? asString(terms.startDate) : null;

  // Localized start-date (date-only; mirror health's Intl.DateTimeFormat, but with
  // no time-of-day — the wizard collects a date). Guard an unparseable string.
  let startDate: string | null = null;
  if (startDateRaw) {
    const parsed = new Date(startDateRaw);
    startDate = Number.isNaN(parsed.getTime())
      ? startDateRaw
      : new Intl.DateTimeFormat(intlLocale(l), {
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(parsed);
  }

  const wageRange =
    wageMin != null || wageMax != null
      ? [wageMin, wageMax]
          .filter((n): n is number => n != null)
          .join(" – ") + (currency ? ` ${currency}` : "")
      : null;

  // Tier label (free / verified / premium) — falls back to the raw string.
  const tierLabel =
    minTier &&
    (t.has(`careerVertical.employer.tier.${minTier}`)
      ? e(`tier.${minTier}`)
      : minTier);

  const shortlist = requisition.shortlist;
  const isEmployer = role === "employer";

  // ── WorkerCard labels (the parent owns the translator; the card is zero-JS) ──
  const cardLabels = {
    verified: t("careerVertical.pool.card.verifiedBadge"),
    readinessLabel: t("careerVertical.pool.card.readinessLabel"),
    expressInterest: t("careerVertical.pool.card.expressInterest"),
    interestSent: t("careerVertical.interest.sentPill"),
    viewLocked: t("careerVertical.pool.card.viewProfile"),
    employerLoginRequired: t("careerVertical.interest.loginRequired"),
    photoAlt: t("careerVertical.pool.card.photoBlurredNote"),
  };

  return (
    <div className="bg-brandCareer-50/40 pb-16 dark:bg-transparent">
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-28">
        {/* ← back to requisitions (mirror randevu's back-to-directory link; amber
            text accent uses the -700 ramp — DEFAULT amber-600 is below AA). */}
        <Link
          href="/career/employer/dashboard/requisitions"
          className="inline-flex items-center gap-1 text-sm font-medium text-brandCareer-700 hover:underline dark:text-brandCareer"
        >
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          {e("dashboard.requisitionsTab")}
        </Link>

        {/* ── Header — title/sector + short ref, plus the lifecycle status pill ── */}
        <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl font-light tracking-tight text-gray-900 dark:text-white">
              {sectorLabel}
            </h1>
            <p className="mt-1 font-mono text-xs uppercase tracking-wider text-gray-400 dark:text-white/40">
              #{requisition.id.slice(0, 8)}
            </p>
          </div>
          <RequisitionStatusPill label={statusLabel} status={requisition.status} />
        </div>

        {/* ── Requisition summary card (PII-free; mirror randevu's summary section:
            rounded-2xl border bg-white shadow-premium-sm). Read-only; NO worker
            identity here. ───────────────────────────────────────────────────── */}
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-premium-sm dark:border-white/10 dark:bg-white/5">
          {/* Roles + headcount */}
          {roles.length > 0 && (
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
                <Users className="h-4 w-4 text-brandCareer-700 dark:text-brandCareer" />
                {wz("rolesStep.title")}
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {roles.map((r) => (
                  <li
                    key={r.trade}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-white/70"
                  >
                    <Briefcase className="h-3.5 w-3.5 text-gray-400 dark:text-white/40" />
                    {r.trade}
                    {r.headcount != null && (
                      <span className="rounded bg-brandCareer-50 px-1.5 py-0.5 text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
                        ×{r.headcount}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Requirements — experience band, skill tier, certs, languages */}
          {(experience || tierLabel || certifications.length > 0 || reqLanguages.length > 0) && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
                {wz("requirementsStep.title")}
              </h2>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                {experience && (
                  <div>
                    <dt className="text-xs text-gray-400 dark:text-white/40">
                      {wz("requirementsStep.experienceLabel")}
                    </dt>
                    <dd className="mt-0.5 text-sm text-gray-700 dark:text-white/70">
                      {experience}
                    </dd>
                  </div>
                )}
                {tierLabel && (
                  <div>
                    <dt className="text-xs text-gray-400 dark:text-white/40">
                      {wz("requirementsStep.tierLabel")}
                    </dt>
                    <dd className="mt-0.5 text-sm text-gray-700 dark:text-white/70">
                      {tierLabel}
                    </dd>
                  </div>
                )}
                {certifications.length > 0 && (
                  <div>
                    <dt className="text-xs text-gray-400 dark:text-white/40">
                      {wz("requirementsStep.certificationsLabel")}
                    </dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">
                      {certifications.map((c) => (
                        <span
                          key={c}
                          className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-white/10 dark:text-white/70"
                        >
                          {c}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                {reqLanguages.length > 0 && (
                  <div>
                    <dt className="flex items-center gap-1 text-xs text-gray-400 dark:text-white/40">
                      <Languages className="h-3.5 w-3.5" />
                      {wz("requirementsStep.languagesLabel")}
                    </dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">
                      {reqLanguages.map((lang) => (
                        <span
                          key={lang}
                          className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium uppercase text-gray-600 dark:bg-white/10 dark:text-white/60"
                        >
                          {lang}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Terms shown to workers (MNE disclosure) — wage range, hours,
              accommodation/board, contract duration, start date. R7: these are
              worker-facing terms, never a fee charged TO the worker. */}
          {(wageRange || hours || accommodation != null || duration || startDate) && (
            <div className="mt-6">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
                <ScrollText className="h-4 w-4 text-brandCareer-700 dark:text-brandCareer" />
                {wz("termsStep.title")}
              </h2>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                {wageRange && (
                  <div>
                    <dt className="text-xs text-gray-400 dark:text-white/40">
                      {wz("termsStep.wageRangeLabel")}
                    </dt>
                    <dd className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">
                      {wageRange}
                    </dd>
                  </div>
                )}
                {hours && (
                  <div>
                    <dt className="text-xs text-gray-400 dark:text-white/40">
                      {wz("termsStep.hoursLabel")}
                    </dt>
                    <dd className="mt-0.5 text-sm text-gray-700 dark:text-white/70">
                      {hours}
                    </dd>
                  </div>
                )}
                {accommodation != null && (
                  <div>
                    <dt className="flex items-center gap-1 text-xs text-gray-400 dark:text-white/40">
                      <Home className="h-3.5 w-3.5" />
                      {wz("termsStep.accommodationLabel")}
                    </dt>
                    <dd className="mt-0.5 text-sm text-gray-700 dark:text-white/70">
                      {accommodation
                        ? wz("termsStep.accommodationYes")
                        : wz("termsStep.accommodationNo")}
                      {accommodation && accommodationNote ? ` — ${accommodationNote}` : ""}
                    </dd>
                  </div>
                )}
                {duration && (
                  <div>
                    <dt className="text-xs text-gray-400 dark:text-white/40">
                      {wz("termsStep.durationLabel")}
                    </dt>
                    <dd className="mt-0.5 text-sm text-gray-700 dark:text-white/70">
                      {duration}
                    </dd>
                  </div>
                )}
                {startDate && (
                  <div>
                    <dt className="flex items-center gap-1 text-xs text-gray-400 dark:text-white/40">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {wz("termsStep.startDateLabel")}
                    </dt>
                    <dd className="mt-0.5 text-sm text-gray-700 dark:text-white/70">
                      {startDate}
                    </dd>
                  </div>
                )}
              </dl>
              <p className="mt-3 text-xs text-gray-400 dark:text-white/40">
                {wz("termsStep.legalNote")}
              </p>
            </div>
          )}

          {/* Service path (commission-only vs full-service). Employer-direction
              only (R7); no worker-facing fee. */}
          <div className="mt-6 flex items-center gap-2 border-t border-gray-100 pt-4 dark:border-white/5">
            <Coins className="h-4 w-4 shrink-0 text-brandCareer-700 dark:text-brandCareer" />
            <span className="text-xs text-gray-400 dark:text-white/40">
              {wz("serviceStep.title")}
            </span>
            <span className="inline-flex items-center rounded-full bg-brandCareer-50 px-2.5 py-0.5 text-xs font-medium text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
              {e(`servicePath.${requisition.servicePath}`)}
            </span>
          </div>
        </section>

        {/* ── Presented shortlist ──────────────────────────────────────────────
            Heading (uppercase-tracked, mirror health's section headings) + a stack
            of anonymized WorkerCards, ONE per presented_to_employer=true item. Each
            card carries its own ExpressInterestButton folded into THIS requisition
            (R10 — same /api/career/interest endpoint, the id rides in the body).
            Cards are anonymized exactly as on the pool (Spec 06/07). */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
            {e("dashboard.shortlistReadyLabel")}
          </h2>

          {shortlist.length === 0 ? (
            // Empty shortlist — requisition resolved but ZERO presented items
            // (Submitted / Under curation). Neutral empty-state, NOT a 404/error.
            // Mirror health's neutral-fallback box geometry.
            <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500 shadow-premium-sm dark:border-white/15 dark:bg-white/5 dark:text-white/50">
              <Users className="h-8 w-8 text-gray-300 dark:text-white/20" />
              {/* "Shortlist not yet ready — RoNa Legal is selecting your candidates."
                  The closest existing 9-locale key is the wizard success body, which
                  carries exactly this "RoNa Legal will prepare the shortlist" promise
                  (IMPL-CONTRACT: render with whatever key exists; never hardcode). */}
              <p className="max-w-sm">
                {t("careerVertical.employer.requisitionWizard.successBody")}
              </p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4">
              {shortlist.map((item) => (
                <div key={item.workerCode} className="space-y-3">
                  {/* Anonymized facts (zero-JS card). The in-card interest pill
                      reflects per-card already-expressed state; the real
                      interactive CTA is the ExpressInterestButton below. */}
                  <WorkerCard
                    worker={toShowcaseCard(item)}
                    photoUrl={null}
                    viewerId={employerUser.id}
                    viewerRole={isEmployer ? "employer" : "anon"}
                    interestSent={item.stage === "interest_expressed"}
                    labels={cardLabels}
                  />
                  {/* Per-card CTA — express interest folded into THIS requisition
                      (requisitionId set → "Talebe Ekle"). On success it
                      router.refresh()es so the server re-reads interest state and
                      the card flips to the sent pill. Dossier STILL locked. */}
                  <ExpressInterestButton
                    workerCode={item.workerCode}
                    requisitionId={requisition.id}
                    isEmployer={isEmployer}
                    alreadyExpressed={item.stage === "interest_expressed"}
                    locale={l}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
