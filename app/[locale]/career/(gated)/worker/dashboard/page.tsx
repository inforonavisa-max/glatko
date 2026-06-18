import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Clock,
  Eye,
  FileText,
  Handshake,
  Lock,
  ShieldCheck,
  UserPen,
} from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { createClient } from "@/supabase/server";
import { VerticalBrand } from "@/components/glatko/verticals/VerticalBrand";
import { getWorkerProfile, getWorkerStatus, type WorkerStatus } from "@/lib/kariyer/queries";
import { intlLocale } from "@/lib/kariyer/intl";
import { CAREER_ROUTES } from "@/lib/kariyer/config";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
};

// R5/R11 — this is the worker's own auth state + per-worker lifecycle status; it
// reads auth.getUser() and one per-worker status RPC, so it can NEVER be
// statically rendered or ISR-cached (one worker's status must never be served to
// another). No generateStaticParams. The gated career route group is already
// flag-quarantined (middleware + the (gated) layout's notFound()); `noindex` is
// inherited from app/[locale]/career/layout.tsx's robots quarantine, so no
// buildAlternates / indexable metadata is added here (IMPL-CONTRACT).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  // noindex inherited from the career layout — no buildAlternates (IMPL-CONTRACT).
  return {
    title: t("careerVertical.worker.dashboard.seoTitle"),
    robots: { index: false, follow: false },
  };
}

// ── Lifecycle state model (Spec 21 §"Lifecycle state model") ──────────────────
// The worker's overall status is the FURTHEST-ADVANCED state across their
// reveal/match records, derived server-side from the PII-free WorkerStatus
// counts (symmetric gate: counts only, never employer identity). One of:
//   placed → matched → pending → interest → showcased → not-showcased.
// `placed`/`matched` are completion (green); `interest`/`pending`/`showcased`
// are amber wayfinding; `not-showcased` is neutral gray. R7: there is NO
// fee/amount/payment field on WorkerStatus — the worker side never has a money
// step at all, so no string here can reference one.
type LifecycleState =
  | "placed"
  | "matched"
  | "pending"
  | "interest"
  | "showcased"
  | "notShowcased";

function deriveState(status: WorkerStatus): LifecycleState {
  // Terminal completion first (furthest-advanced wins).
  if (status.placedCount > 0) return "placed";
  if (status.approvedCount > 0) return "matched";
  // Interest expressed but not yet owner-approved → either "interest" (just
  // landed) or "pending" (under RoNa review). We can't distinguish a separate
  // review flag from the counts, so any un-approved interest reads as the
  // employer-interest state; the pending/RoNa-review copy is reached once the
  // worker is showcased with interest but the match hasn't advanced. We treat
  // ANY interest as state #2 here and surface the RoNa-review reassurance in the
  // single-contact band, which is shown on every state (Spec 21 §3).
  if (status.interestCount > 0) return "interest";
  // De-showcased after a match / verification lapse, or never showcased.
  if (!status.isShowcased) return "notShowcased";
  return "showcased";
}

// Visual treatment per state. `green` = completion (NOT a CTA); `amber` =
// wayfinding; `gray` = resting/incomplete (Spec 21 §"Amber accent usage").
type Tone = "amber" | "green" | "gray";

type StateView = {
  tone: Tone;
  Icon: typeof Eye;
  /** dictionary key under careerVertical.worker.dashboard.statuses.* */
  pillKey: string;
  /** dictionary key under careerVertical.worker.dashboard.body.* */
  bodyKey: string;
};

const STATE_VIEW: Record<LifecycleState, StateView> = {
  showcased: { tone: "amber", Icon: Eye, pillKey: "showcased", bodyKey: "showcased" },
  interest: { tone: "amber", Icon: Handshake, pillKey: "interest", bodyKey: "interest" },
  pending: { tone: "amber", Icon: Clock, pillKey: "pendingApproval", bodyKey: "pending" },
  matched: { tone: "green", Icon: BadgeCheck, pillKey: "matched", bodyKey: "matched" },
  placed: { tone: "green", Icon: BadgeCheck, pillKey: "placed", bodyKey: "placed" },
  notShowcased: { tone: "gray", Icon: Lock, pillKey: "notShowcased", bodyKey: "notShowcased" },
};

// Pill chrome per tone — mirrors the employer dashboard's green-on-completion /
// amber-on-wayfinding / neutral-gray idiom (Spec 16 unlocked pill), full dark
// parity. brandCareer-700 text clears AA; DEFAULT amber is icon/background only.
const PILL_TONE: Record<Tone, string> = {
  amber:
    "bg-brandCareer-50 text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer",
  green:
    "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  gray: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-white/60",
};

const ICON_TONE: Record<Tone, string> = {
  amber: "text-brandCareer",
  green: "text-green-600 dark:text-green-300",
  gray: "text-gray-400",
};

/**
 * Spec 21 — the worker's single status surface. It tells a logged-in worker
 * where they are in the lifecycle (showcased → interest → pending RoNa →
 * matched/legal processing) and reinforces that RoNa Legal is the SINGLE point
 * of contact. SYMMETRIC GATE: it never shows employer identity/contact — only
 * the PII-free counts the status RPC returns.
 *
 * MIRRORS app/[locale]/health/(gated)/randevu/[holdId]/page.tsx: a force-dynamic,
 * noindex, session-reading gated page (await params → hasLocale guard →
 * setRequestLocale → getTranslations → service-role read fn → designed graceful
 * fallback → summary <section> cards; never crash). Auth/redirect mirrors the
 * sibling worker/profile page (no session → /career/login; session but no worker
 * profile row → /career/worker/profile builder, never a dead empty page).
 *
 * Identity is derived server-side from the trusted cookie session and passed to
 * the read RPCs as the explicit user id (R1); the RPCs re-verify ownership and
 * worker-self isolation (R8 #3), so worker A's id never returns worker B's
 * status. R7: the worker is NEVER charged — no fee/price/payment string exists on
 * this surface, and the WorkerStatus payload carries no money field.
 */
export default async function WorkerDashboardPage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const l = locale as Locale;
  const d = (k: string, values?: Record<string, string | number>) =>
    t(`careerVertical.worker.dashboard.${k}`, values);

  // Identity from the trusted session — NEVER the request (R1). Anon → redirect
  // to the role-routed login (mirror worker/profile; no status read for an
  // anonymous viewer).
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: CAREER_ROUTES.login, locale: l });
  // After redirect(), `user` is non-null on the live path; narrow for the reads.
  const workerUser = user!;

  // Two scoped reads in parallel (R1: each re-verifies ownership via the explicit
  // user id). A genuine RPC failure THROWS → caught by the gated group error.tsx;
  // a null status / null profile is a real "no rows" (handled below, never as an
  // error). We need the profile to distinguish "no worker profile row at all"
  // (→ start the builder) from a real lifecycle status.
  const [profile, status] = await Promise.all([
    getWorkerProfile(workerUser.id),
    getWorkerStatus(workerUser.id),
  ]);

  // Session but no career worker profile row → send them to the builder
  // (Spec 21 §Edge cases), not a dead empty dashboard. If the profile exists but
  // the status RPC returned null (race / not-yet-derived), fall back to a synthetic
  // not-showcased status so the page always renders a banner (never blank).
  if (!profile) redirect({ href: CAREER_ROUTES.workerProfile, locale: l });
  // After redirect(), `profile` is non-null on the live path; narrow for the read.
  const workerProfile = profile!;

  const resolved: WorkerStatus = status ?? {
    workerCode: workerProfile.workerCode,
    verificationStatus: workerProfile.verificationStatus ?? "pending",
    isShowcased: workerProfile.isShowcased,
    readinessScore: workerProfile.readinessScore,
    interestCount: 0,
    approvedCount: 0,
    placedCount: 0,
  };

  const state = deriveState(resolved);
  const view = STATE_VIEW[state];
  const StateIcon = view.Icon;

  const numberFmt = new Intl.NumberFormat(intlLocale(l));
  const readiness = resolved.readinessScore;
  const showReadinessStrip = state === "showcased" || state === "notShowcased";
  // Anonymized interest tally — a COUNT only, surfaced just on the interest state
  // (symmetric gate: never who, never which requisition). R8 #3.
  const showTally = state === "interest" && resolved.interestCount > 0;

  return (
    <div className="bg-brandCareer-50/40 dark:bg-transparent">
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-28">
        {/* 1) Header — brand lockup + serif title + short subhead. */}
        <header>
          <VerticalBrand vertical="career" size="sm" />
          <h1 className="mt-2 font-serif text-3xl font-light tracking-tight text-gray-900 dark:text-white">
            {d("title")}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-gray-500 dark:text-white/50">
            {d("subtitle")}
          </p>
        </header>

        {/* 2) Primary status banner — the page's signature element: the
            furthest-advanced lifecycle state at a glance. aria-live so AT
            announces the resolved state on load. */}
        <section
          aria-live="polite"
          className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-premium-sm dark:border-white/10 dark:bg-white/5"
        >
          <div className="flex items-start gap-4">
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${PILL_TONE[view.tone]}`}
            >
              <StateIcon className={`h-6 w-6 ${ICON_TONE[view.tone]}`} />
            </span>
            <div className="min-w-0">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${PILL_TONE[view.tone]}`}
              >
                {d(`statuses.${view.pillKey}`)}
              </span>
              <p className="mt-3 text-base text-gray-700 dark:text-white/80">
                {d(`body.${view.bodyKey}`)}
              </p>
              {showTally && (
                <p className="mt-2 text-sm font-medium text-brandCareer-700 dark:text-brandCareer">
                  {d("interestTally", { count: numberFmt.format(resolved.interestCount) })}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* 3) "RoNa Legal is your single point of contact" reassurance band —
            shown on EVERY state (the symmetric-gate promise, visually weighted).
            No employer is ever named anywhere on this surface. */}
        <section className="mt-4 flex items-start gap-3 rounded-2xl bg-brandCareer-50 p-5 dark:bg-brandCareer/10">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brandCareer" />
          <div>
            <h2 className="text-sm font-semibold text-brandCareer-700 dark:text-brandCareer">
              {d("singleContact.title")}
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-white/70">
              {d("singleContact.body")}
            </p>
          </div>
        </section>

        {/* 4) Profile-readiness strip — only when showcased / not-showcased.
            Server-provided readiness number + links to improve the profile.
            No employer data (R8). */}
        {showReadinessStrip && (
          <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-premium-sm dark:border-white/10 dark:bg-white/5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
                {d("readinessLabel")}
              </h2>
              <span className="text-sm font-semibold tabular-nums text-brandCareer-700 dark:text-brandCareer">
                {readiness != null ? `${numberFmt.format(readiness)}%` : "—"}
              </span>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-brandCareer-50 dark:bg-brandCareer/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-600"
                style={{ width: `${Math.min(Math.max(readiness ?? 0, 0), 100)}%` }}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-3 border-t border-gray-100 pt-4 dark:border-white/5">
              <Link
                href={CAREER_ROUTES.workerProfile}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-brandCareer-700 transition-colors hover:text-brandCareer dark:text-brandCareer"
              >
                <UserPen className="h-4 w-4" />
                {d("editProfile")}
              </Link>
              <Link
                href={CAREER_ROUTES.workerDocuments}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-brandCareer-700 transition-colors hover:text-brandCareer dark:text-brandCareer"
              >
                <FileText className="h-4 w-4" />
                {d("manageDocuments")}
              </Link>
            </div>
          </section>
        )}

        {/* 5) Next-steps / what-happens-next — 2–3 short lines tailored to the
            current state. All copy under careerVertical.worker.dashboard.nextSteps.*
            (R7-audited: never a money step). */}
        <section className="mt-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
            {d("nextSteps.heading")}
          </h2>
          <ul className="space-y-2.5">
            {[1, 2, 3].map((n) => {
              const key = `nextSteps.${state}.${n}`;
              const line = d(key);
              // Render only lines that actually resolve (a missing 3rd line falls
              // back to the key — skip it rather than show a raw dotted path).
              if (line === key || line.startsWith("careerVertical.")) return null;
              return (
                <li
                  key={n}
                  className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-white/70"
                >
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-brandCareer-700 dark:text-brandCareer rtl:rotate-180" />
                  <span>{line}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
