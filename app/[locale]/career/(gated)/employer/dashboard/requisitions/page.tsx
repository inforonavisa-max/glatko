import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { CalendarClock, FileText, Plus, Users, Building2, Briefcase } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { createClient } from "@/supabase/server";
import {
  getEmployerRequisitions,
  resolveCareerRole,
  type RequisitionSummary,
} from "@/lib/kariyer/queries";
import { intlLocale } from "@/lib/kariyer/intl";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
};

// R11 — reads auth.getUser() / the cookie session to scope the list to THIS
// employer; the render is per-session and must NEVER be cached. noindex is
// inherited from app/[locale]/career/layout.tsx, but the booking page mirror
// (randevu/[holdId]) also pins it explicitly on the gated, quarantined surface.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

// ─────────────────────────────────────────────────────────────────────────────
// Status pill colour map (PART 2 §6 pipeline). Amber is RESERVED for the single
// "act now" state (shortlist_ready); in-progress stages are neutral gray;
// positive/terminal stages are green. Any unknown/future status string coerces
// to the gray fallback — the card never throws on an unmapped pipeline stage.
// ─────────────────────────────────────────────────────────────────────────────
type PillTone = "amber" | "gray" | "green";

const STATUS_TONE: Record<string, PillTone> = {
  submitted: "gray",
  under_curation: "gray",
  interest_expressed: "gray",
  shortlist_ready: "amber",
  approved: "green",
  placed: "green",
  in_guarantee: "green",
};

const PILL_CLASS: Record<PillTone, string> = {
  amber:
    "bg-brandCareer-50 text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer",
  gray: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-white/60",
  green:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
};

/** Coerce roles_jsonb (trade → headcount map) into a total headcount, defensively. */
function totalHeadcount(rolesJsonb: unknown): number {
  if (!rolesJsonb || typeof rolesJsonb !== "object") return 0;
  let sum = 0;
  for (const v of Object.values(rolesJsonb as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) sum += Math.floor(n);
  }
  return sum;
}

/** Count of distinct roles in the requisition (for the "N roles" suffix). */
function roleCount(rolesJsonb: unknown): number {
  if (!rolesJsonb || typeof rolesJsonb !== "object") return 0;
  return Object.keys(rolesJsonb as Record<string, unknown>).length;
}

/**
 * My Requisitions list (Spec 13) — the employer's first authed screen. Mirrors
 * the gated booking page (`app/[locale]/health/(gated)/randevu/[holdId]/page.tsx`):
 * server component, `setRequestLocale`, `notFound()` on a bad locale, reads the
 * trusted session, calls ONE read helper, and renders a designed graceful screen
 * (never a crash) for every state. Differences (IMPL-CONTRACT + Spec 13): amber
 * accent (`brandCareer`) swaps health's teal, and the surface is `force-dynamic`
 * (R11) because the list is scoped to the authed employer.
 *
 * Identity comes from `auth.getUser()` (the verified uid), NEVER the request /
 * URL — the `career` schema is off PostgREST, so the read is a SECURITY DEFINER
 * RPC keyed by that uid and re-verified against `employer_accounts.user_id` (R1 +
 * R8 #2 cross-employer denial). A foreign / guessed id surfaces zero rows.
 *
 * R7 — there is NO fee/price/payment UI on this surface (and none ever on the
 * worker side); unlock/payment lives downstream in the unlock center.
 */
export default async function EmployerRequisitionsPage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations();
  const d = (k: string) => t(`careerVertical.employerDashboard.requisitions.${k}`);

  // Trusted session → role. Anon → /career/login. Authed non-employer (worker /
  // none) → the "this area is for employers" screen (never another employer's
  // data, never a fake-empty list implying they have an account).
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
    return (
      <div className="mx-auto max-w-md px-4 pb-24 pt-40 text-center">
        <Building2 className="mx-auto h-9 w-9 text-gray-400" />
        <h1 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
          {d("notEmployerTitle")}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500 dark:text-white/50">
          {d("notEmployerBody")}
        </p>
        <Link
          href="/career/employer/register"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brandCareer px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brandCareer/25 transition-all hover:bg-brandCareer-700"
        >
          {d("registerCta")}
        </Link>
      </div>
    );
  }

  // R1 + R8 #2 — the employer's OWN requisitions, scoped + re-verified by the RPC
  // via the verified uid passed as p_employer_user_id. A genuine RPC failure
  // throws and is caught by the gated-group error.tsx (never a fake-empty list).
  const requisitions = await getEmployerRequisitions(employerUser.id);

  // me/sr → Latin Sırpça; Europe/Podgorica (mirror ProviderCard / booking).
  const dateFmt = new Intl.DateTimeFormat(intlLocale(l), {
    timeZone: "Europe/Podgorica",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="bg-brandCareer-50/40 dark:bg-transparent">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-28">
        {/* Header row — title left, primary amber "Yeni Talep" CTA right. */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-serif text-3xl font-light tracking-tight text-gray-900 dark:text-white">
              {d("title")}
            </h1>
            {requisitions.length > 0 && (
              <p className="mt-2 text-sm text-gray-500 dark:text-white/50">
                {d("countLabel").replace("{count}", String(requisitions.length))}
              </p>
            )}
          </div>
          <Link
            href="/career/employer/dashboard/requisitions/new"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brandCareer px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brandCareer/25 transition-all hover:bg-brandCareer-700"
          >
            <Plus className="h-4 w-4" />
            {d("newCta")}
          </Link>
        </header>

        {requisitions.length === 0 ? (
          /* Empty (the common first-login state) — a designed, dashed-border
             block with the single amber CTA. NOT an error, NOT a fake card. */
          <div className="mt-12 rounded-2xl border border-dashed border-gray-300 bg-white/50 p-10 text-center dark:border-white/15 dark:bg-white/5">
            <FileText className="mx-auto h-8 w-8 text-gray-400" />
            <h2 className="mt-4 font-semibold text-gray-900 dark:text-white">
              {d("emptyTitle")}
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500 dark:text-white/50">
              {d("emptyBody")}
            </p>
            <Link
              href="/career/employer/dashboard/requisitions/new"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brandCareer px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brandCareer/25 transition-all hover:bg-brandCareer-700"
            >
              <Plus className="h-4 w-4" />
              {d("newCta")}
            </Link>
          </div>
        ) : (
          /* Success — status-pill card list. Each card is ONE <Link> to the
             detail (Spec 14); no nested anchors (the CTA lives in the header). */
          <ul className="mt-8 space-y-3">
            {requisitions.map((r) => (
              <li key={r.id}>
                <RequisitionRow requisition={r} dateFmt={dateFmt} d={d} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * One requisition row — a bordered card that is a single <Link> to the detail.
 * Pure presentational: status pill (amber only for shortlist_ready), the sector
 * + role/headcount title summary, and a muted meta row (created date + service
 * path). No worker identity, no contact, no fee (R7). Inlined here because this
 * surface is a single-file deliverable; labels come from the page translator.
 */
function RequisitionRow({
  requisition: r,
  dateFmt,
  d,
}: {
  requisition: RequisitionSummary;
  dateFmt: Intl.DateTimeFormat;
  d: (k: string) => string;
}) {
  const tone: PillTone = STATUS_TONE[r.status] ?? "gray";
  const statusLabel = d(`status.${r.status}`);
  const headcount = totalHeadcount(r.rolesJsonb);
  const roles = roleCount(r.rolesJsonb);
  const sectorLabel = r.sector ? d(`sector.${r.sector}`) : d("sectorUnknown");
  const servicePathLabel = d(`servicePath.${r.servicePath}`);

  return (
    <Link
      href={{
        pathname: "/career/employer/dashboard/requisitions/[id]",
        params: { id: r.id },
      }}
      className="group block rounded-2xl border border-gray-200 bg-white p-5 shadow-premium-sm transition-all hover:border-gray-300 hover:shadow-premium-md dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
            <Briefcase className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="truncate">{sectorLabel}</span>
          </h3>
          {roles > 0 && (
            <p className="mt-1 text-sm text-gray-500 dark:text-white/50">
              {d("rolesSummary")
                .replace("{roles}", String(roles))
                .replace("{headcount}", String(headcount))}
            </p>
          )}
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${PILL_CLASS[tone]}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-gray-100 pt-3 text-sm text-gray-500 dark:border-white/5 dark:text-white/50">
        <span className="flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          {dateFmt.format(new Date(r.createdAt))}
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 shrink-0" />
          {servicePathLabel}
        </span>
      </div>
    </Link>
  );
}
