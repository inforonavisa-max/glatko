import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  ClipboardList,
  LogIn,
  PackageOpen,
  ShieldCheck,
  Unlock,
  UserPlus,
  Users,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { createClient } from "@/supabase/server";
import { VerticalBrand } from "@/components/glatko/verticals/VerticalBrand";
import {
  getEmployerRequisitions,
  getEmployerUnlocks,
  resolveCareerRole,
  type EmployerUnlock,
  type RequisitionSummary,
} from "@/lib/kariyer/queries";
import { intlLocale } from "@/lib/kariyer/intl";
import { CAREER_ROUTES } from "@/lib/kariyer/config";
import { RequisitionStatusPill } from "@/components/glatko-kariyer/RequisitionStatusPill";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
};

// R5/R11 — the dashboard is per-employer auth state. NEVER ISR-cache one
// employer's render and serve it to another. The pool/randevu surfaces are the
// same exception; this one reads auth.getUser() so it MUST be dynamic. No
// generateStaticParams. `noindex` is inherited from app/[locale]/career/layout.tsx.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  // noindex inherited from the career layout — no buildAlternates (IMPL-CONTRACT).
  return { title: t("careerVertical.employer.dashboard.seoTitle") };
}

// ── Placement / guarantee derivation (Spec 12 §GAP, option (b)) ───────────────
// There is no `career_employer_placements` read-RPC in 074 yet, so the placement
// tracker is derived from the requisition `status` only: a requisition in
// `placed` / `in_guarantee` is an active placement. The explicit `guaranteeUntil`
// date / days-remaining stays "—" until a follow-up RPC ships `placedAt` +
// `guaranteeUntil` (R15: no prod migration without explicit go). The replacement
// action is rendered disabled-with-tooltip because that endpoint isn't built.
const PLACEMENT_STATUSES = new Set(["placed", "in_guarantee"]);

/**
 * Summarize `rolesJsonb` into a headcount + role-count line. Tolerates a
 * malformed / empty payload (Spec 12 edge case: a requisition with empty roles
 * must still render — fall back to "—", never blow up the list).
 */
function summarizeRoles(rolesJsonb: unknown): {
  workers: number;
  roles: number;
} | null {
  if (!Array.isArray(rolesJsonb) || rolesJsonb.length === 0) return null;
  let workers = 0;
  for (const entry of rolesJsonb) {
    if (entry && typeof entry === "object" && "count" in entry) {
      const c = Number((entry as { count: unknown }).count);
      if (Number.isFinite(c) && c > 0) workers += Math.floor(c);
    }
  }
  return { workers, roles: rolesJsonb.length };
}

/**
 * Employer dashboard (Spec 12) — the employer's authenticated home. Mirrors the
 * health gated home shape (locale guard → setRequestLocale → getTranslations →
 * read-RPC wrapper → header + sections + designed empty state) and the randevu
 * auth/cookie → graceful-screen pattern (no user → designed sign-in prompt,
 * never crash). `force-dynamic` (reads auth.getUser(); R11).
 *
 * Identity is derived server-side from the trusted session and passed to the
 * read-RPC wrappers as the explicit user id (R1). The RPCs re-verify ownership
 * (R8 #2), so a foreign uid yields empty — the page never client-side scopes an
 * employer and never reads an employerId from the URL. Workers stay anonymized
 * (workerCode only) everywhere here — the dossier gate lives in the unlock flow
 * (R8 #9). The worker side is never charged (R7): any fee wording is
 * employer-direction only.
 */
export default async function EmployerDashboardPage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const l = locale as Locale;
  const d = (k: string, values?: Record<string, string | number>) =>
    t(`careerVertical.employer.dashboard.${k}`, values);

  // Identity from the trusted session — NEVER the request (R1). Anon → designed
  // sign-in prompt (mirror randevu's graceful block; do NOT throw).
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <GracefulScreen
        icon={<LogIn className="h-7 w-7 text-brandCareer" />}
        title={t("careerVertical.login.title")}
        body={t("careerVertical.login.subtitle")}
        ctaLabel={t("careerVertical.login.submit")}
        ctaHref={CAREER_ROUTES.login}
      />
    );
  }

  // Authed but not an employer account → complete-registration prompt.
  const role = await resolveCareerRole(user.id);
  if (role !== "employer") {
    return (
      <GracefulScreen
        icon={<UserPlus className="h-7 w-7 text-brandCareer" />}
        title={t("careerVertical.employer.register.title")}
        body={t("careerVertical.employer.register.subtitle")}
        ctaLabel={t("careerVertical.employer.landing.cta")}
        ctaHref={CAREER_ROUTES.employerRegister}
      />
    );
  }

  // Two read-RPCs in parallel (R1: ownership re-verified inside each via the
  // explicit user id). A genuine RPC failure throws → caught by the gated group
  // error.tsx; an empty array is a real "no rows" (designed empty state below).
  const [requisitions, unlocks] = await Promise.all([
    getEmployerRequisitions(user.id),
    getEmployerUnlocks(user.id),
  ]);

  // Derived counts for the summary tiles (computed here from the two payloads —
  // no third RPC just for counts, per Spec 12).
  const activeRequisitions = requisitions.filter(
    (r) => !PLACEMENT_STATUSES.has(r.status),
  ).length;
  const shortlistsReady = requisitions.filter(
    (r) => r.status === "shortlist_ready",
  ).length;
  // Pending unlocks: interest expressed OR approved-but-fee-due (gate not yet
  // cleared) — i.e. anything not yet unlocked.
  const pendingUnlocks = unlocks.filter((u) => u.unlockedAt == null).length;
  const placements = requisitions.filter((r) =>
    PLACEMENT_STATUSES.has(r.status),
  );
  const activePlacements = placements.filter(
    (r) => r.status === "in_guarantee",
  ).length;

  const dateFmt = new Intl.DateTimeFormat(intlLocale(l), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const hasRequisitions = requisitions.length > 0;

  return (
    <div className="bg-brandCareer-50/40 dark:bg-transparent">
      <div className="mx-auto max-w-5xl px-4 pb-24 pt-28">
        {/* 1) Header — brand lockup, serif title, primary amber-gradient CTA +
            ghost "browse the talent pool" link. */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <VerticalBrand vertical="career" size="sm" />
            <h1 className="mt-2 font-serif text-3xl font-light tracking-tight text-gray-900 dark:text-white sm:text-4xl">
              {d("title")}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-gray-500 dark:text-white/50">
              {d("subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/career/employer/dashboard/requisitions/new"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 transition-all hover:shadow-amber-500/40"
            >
              {d("newRequisition")}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
            <Link
              href={CAREER_ROUTES.pool}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brandCareer-700 transition-colors hover:text-brandCareer dark:text-brandCareer"
            >
              {t("careerVertical.employer.landing.secondaryCta")}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </div>
        </header>

        {!hasRequisitions ? (
          /* Empty (first-time employer, zero requisitions) — designed dashed
             block, NOT a fake row. Unlock + placement sections collapse to a
             muted one-liner below. Same copy for a real employer whose fetch
             returned [] (distinct from an error, which hits error.tsx). */
          <div className="mt-12 rounded-2xl border border-dashed border-gray-300 bg-white/50 p-10 text-center dark:border-white/15 dark:bg-white/5">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brandCareer-50 dark:bg-brandCareer/15">
              <PackageOpen className="h-6 w-6 text-brandCareer" />
            </span>
            <h2 className="mt-4 font-semibold text-gray-900 dark:text-white">
              {d("emptyTitle")}
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500 dark:text-white/50">
              {d("emptyBody")}
            </p>
            <Link
              href="/career/employer/dashboard/requisitions/new"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 transition-all hover:shadow-amber-500/40"
            >
              {d("newRequisition")}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </div>
        ) : (
          <>
            {/* 2) Summary tiles — each a deep-link into the relevant section. */}
            <section className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryTile
                href="/career/employer/dashboard/requisitions"
                icon={<ClipboardList className="h-5 w-5 text-brandCareer" />}
                count={activeRequisitions}
                label={d("requisitionsTab")}
              />
              <SummaryTile
                href="/career/employer/dashboard/requisitions"
                icon={<Users className="h-5 w-5 text-brandCareer" />}
                count={shortlistsReady}
                label={d("shortlistReadyLabel")}
              />
              <SummaryTile
                href="/career/employer/dashboard/unlocks"
                icon={<Unlock className="h-5 w-5 text-brandCareer" />}
                count={pendingUnlocks}
                label={d("unlocksTab")}
              />
              <SummaryTile
                href="/career/employer/dashboard/requisitions"
                icon={<ShieldCheck className="h-5 w-5 text-brandCareer" />}
                count={activePlacements}
                label={t("careerVertical.employer.requisitionStatus.in_guarantee")}
              />
            </section>

            {/* 3) Requisitions list — the primary block (newest-first per RPC). */}
            <section className="mt-10">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
                {d("requisitionsTab")}
              </h2>
              <ul className="space-y-3">
                {requisitions.map((r) => (
                  <RequisitionRow
                    key={r.id}
                    requisition={r}
                    statusLabel={statusLabel(t, r.status)}
                    servicePathLabel={servicePathLabel(t, r.servicePath)}
                    sectorFallback={t("careerVertical.sectors.title")}
                    createdLabel={dateFmt.format(new Date(r.createdAt))}
                    viewLabel={d("viewRequisition")}
                  />
                ))}
              </ul>
            </section>

            {/* 4) Unlock center summary — grouped counts + recent rows + link. */}
            <UnlockSummary
              unlocks={unlocks}
              labels={{
                heading: t("careerVertical.employer.unlocks.title"),
                interest: t("careerVertical.employer.unlocks.pill.interest"),
                approved: t("careerVertical.employer.unlocks.pill.approved"),
                unlocked: t("careerVertical.employer.unlocks.pill.unlocked"),
                viewCenter: t("careerVertical.employer.unlocks.title"),
                empty: t("careerVertical.employer.unlocks.emptyBody"),
              }}
            />

            {/* 5) Placement + guarantee tracker (derived from status — Spec 12
                §GAP option (b); guaranteeUntil shown "—" until a placement RPC
                ships). Worker stays anonymized (workerCode only). */}
            <PlacementTracker
              placements={placements}
              labels={{
                heading: t(
                  "careerVertical.employer.requisitionStatus.in_guarantee",
                ),
                guaranteeEnded: t(
                  "careerVertical.employer.requisitionStatus.placed",
                ),
                requestReplacement: d("requestReplacement"),
                empty: d("emptyBody"),
              }}
              t={t}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── Label resolvers (forward-compat: unknown enum → raw string, never crash) ──

type Translator = Awaited<ReturnType<typeof getTranslations>>;

const KNOWN_STATUSES = new Set([
  "submitted",
  "under_curation",
  "shortlist_ready",
  "interest_expressed",
  "approved",
  "placed",
  "in_guarantee",
]);

function statusLabel(t: Translator, status: string): string {
  if (KNOWN_STATUSES.has(status)) {
    return t(`careerVertical.employer.requisitionStatus.${status}`);
  }
  // Unmapped / future status → show the raw value rather than throw (Spec 12).
  return status;
}

const KNOWN_SERVICE_PATHS = new Set(["commission", "full_service"]);

function servicePathLabel(t: Translator, path: string): string {
  if (KNOWN_SERVICE_PATHS.has(path)) {
    return t(`careerVertical.employer.servicePath.${path}`);
  }
  return path;
}

// ── Presentational sub-components (all sync server components) ────────────────

function GracefulScreen({
  icon,
  title,
  body,
  ctaLabel,
  ctaHref,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: "/career/login" | "/career/employer/register";
}) {
  return (
    <div className="bg-brandCareer-50/40 dark:bg-transparent">
      <div className="mx-auto max-w-md px-4 pb-24 pt-40 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brandCareer-50 dark:bg-brandCareer/15">
          {icon}
        </span>
        <h1 className="mt-5 font-serif text-2xl font-light tracking-tight text-gray-900 dark:text-white">
          {title}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500 dark:text-white/50">
          {body}
        </p>
        <Link
          href={ctaHref}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 transition-all hover:shadow-amber-500/40"
        >
          {ctaLabel}
          <ArrowRight className="h-4 w-4 rtl:rotate-180" />
        </Link>
      </div>
    </div>
  );
}

function SummaryTile({
  href,
  icon,
  count,
  label,
}: {
  href:
    | "/career/employer/dashboard/requisitions"
    | "/career/employer/dashboard/unlocks";
  icon: React.ReactNode;
  count: number;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 hover:shadow-premium-sm dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brandCareer-50 dark:bg-brandCareer/15">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">
          {count}
        </span>
        <span className="block truncate text-xs text-gray-500 dark:text-white/50">
          {label}
        </span>
      </span>
    </Link>
  );
}

function RequisitionRow({
  requisition,
  statusLabel,
  servicePathLabel,
  sectorFallback,
  createdLabel,
  viewLabel,
}: {
  requisition: RequisitionSummary;
  statusLabel: string;
  servicePathLabel: string;
  sectorFallback: string;
  createdLabel: string;
  viewLabel: string;
}) {
  const summary = summarizeRoles(requisition.rolesJsonb);
  const sector = requisition.sector ?? sectorFallback;
  // "Construction · 12 workers, 3 roles" — but a malformed/empty rolesJsonb
  // falls back to "—" (Spec 12 edge case), never crashes the row.
  const rolesLine = summary
    ? `${summary.workers} · ${summary.roles}`
    : "—";

  return (
    <li>
      <Link
        href={{
          pathname: "/career/employer/dashboard/requisitions/[id]",
          params: { id: requisition.id },
        }}
        className="group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 hover:shadow-premium-sm dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
            <Briefcase className="h-4 w-4 shrink-0 text-brandCareer-700 dark:text-brandCareer" />
            <span className="truncate">{sector}</span>
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-white/50">
            {rolesLine} · {servicePathLabel} · {createdLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RequisitionStatusPill
            label={statusLabel}
            status={requisition.status}
          />
          <span className="hidden items-center gap-1 text-xs font-medium text-brandCareer-700 group-hover:underline dark:text-brandCareer sm:inline-flex">
            {viewLabel}
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
          </span>
        </div>
      </Link>
    </li>
  );
}

function UnlockSummary({
  unlocks,
  labels,
}: {
  unlocks: EmployerUnlock[];
  labels: {
    heading: string;
    interest: string;
    approved: string;
    unlocked: string;
    viewCenter: string;
    empty: string;
  };
}) {
  // Grouped counts (Spec 12 §4): Interest expressed / Approved – fee due / Unlocked.
  const interestCount = unlocks.filter(
    (u) => !u.ownerApproved && u.unlockedAt == null,
  ).length;
  const approvedDueCount = unlocks.filter(
    (u) => u.ownerApproved && u.paymentStatus !== "paid" && u.unlockedAt == null,
  ).length;
  const unlockedCount = unlocks.filter((u) => u.unlockedAt != null).length;
  // 1–3 most recent rows (the RPC already orders newest-first via interest_at).
  const recent = unlocks.slice(0, 3);

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
        {labels.heading}
      </h2>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-premium-sm dark:border-white/10 dark:bg-white/5">
        {unlocks.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-white/50">
            {labels.empty}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <GroupedCount value={interestCount} label={labels.interest} />
              <GroupedCount value={approvedDueCount} label={labels.approved} />
              <GroupedCount
                value={unlockedCount}
                label={labels.unlocked}
                done
              />
            </div>
            <ul className="mt-4 space-y-2 border-t border-gray-100 pt-4 dark:border-white/5">
              {recent.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                    {u.workerCode}
                  </span>
                  <UnlockStateBadge unlock={u} labels={labels} />
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-4 border-t border-gray-100 pt-4 dark:border-white/5">
          <Link
            href="/career/employer/dashboard/unlocks"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brandCareer-700 transition-colors hover:text-brandCareer dark:text-brandCareer"
          >
            {labels.viewCenter}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function GroupedCount({
  value,
  label,
  done,
}: {
  value: number;
  label: string;
  done?: boolean;
}) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-3 text-center dark:bg-white/5">
      <span
        className={
          done
            ? "block text-xl font-semibold tabular-nums text-green-700 dark:text-green-300"
            : "block text-xl font-semibold tabular-nums text-brandCareer-700 dark:text-brandCareer"
        }
      >
        {value}
      </span>
      <span className="mt-1 block text-[11px] leading-tight text-gray-500 dark:text-white/50">
        {label}
      </span>
    </div>
  );
}

function UnlockStateBadge({
  unlock,
  labels,
}: {
  unlock: EmployerUnlock;
  labels: { interest: string; approved: string; unlocked: string };
}) {
  // Unlocked = completion → GREEN (not a call-to-action). Approved-but-fee-due
  // and interest → amber wayfinding (R7: any fee wording is employer-direction).
  if (unlock.unlockedAt != null) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
        <BadgeCheck className="h-3.5 w-3.5" />
        {labels.unlocked}
      </span>
    );
  }
  const label = unlock.ownerApproved ? labels.approved : labels.interest;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brandCareer-50 px-2.5 py-1 text-xs font-medium text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
      {label}
    </span>
  );
}

function PlacementTracker({
  placements,
  labels,
  t,
}: {
  placements: RequisitionSummary[];
  labels: {
    heading: string;
    guaranteeEnded: string;
    requestReplacement: string;
    empty: string;
  };
  t: Translator;
}) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
        {labels.heading}
      </h2>
      {placements.length === 0 ? (
        <p className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500 shadow-premium-sm dark:border-white/10 dark:bg-white/5 dark:text-white/50">
          {labels.empty}
        </p>
      ) : (
        <ul className="space-y-3">
          {placements.map((p) => {
            // GAP (Spec 12 §option b): no placedAt / guaranteeUntil from 074 yet
            // → countdown date shown "—"; in_guarantee = still active, placed =
            // window ended. We render a static label, never a live Date.now()
            // countdown (health's hydration lesson).
            const inGuarantee = p.status === "in_guarantee";
            return (
              <li
                key={p.id}
                className="rounded-2xl border border-gray-200 bg-white p-4 shadow-premium-sm dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                    {/* Anonymized — placements derived from the requisition,
                        which carries no workerCode; show the sector + a code
                        placeholder until the placement RPC lands. */}
                    {p.sector ?? "—"}
                  </span>
                  {inGuarantee ? (
                    <RequisitionStatusPill
                      label={t(
                        "careerVertical.employer.requisitionStatus.in_guarantee",
                      )}
                      status="in_guarantee"
                    />
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-white/10 dark:text-white/60">
                      {labels.guaranteeEnded}
                    </span>
                  )}
                </div>

                {inGuarantee && (
                  <div className="mt-3">
                    {/* Guarantee window — days-remaining unknown until the
                        placement RPC ships (Spec 12 §GAP). Thin amber bar at an
                        indeterminate fill; the explicit date reads "—". */}
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-white/50">
                      <span>—</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-brandCareer-50 dark:bg-brandCareer/15">
                      <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-amber-500 to-amber-600" />
                    </div>
                  </div>
                )}

                <div className="mt-3 flex justify-end">
                  {/* Replacement endpoint isn't built → disabled-with-tooltip,
                      NOT a dead button (Spec 12 §5). */}
                  <button
                    type="button"
                    disabled
                    title={labels.requestReplacement}
                    className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-400 opacity-60 dark:border-white/10 dark:text-white/40"
                  >
                    {labels.requestReplacement}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
