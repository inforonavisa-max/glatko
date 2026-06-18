import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { createClient } from "@/supabase/server";
import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { listSectors, resolveCareerRole } from "@/lib/kariyer/queries";
import {
  RequisitionWizard,
  type RequisitionSector,
} from "@/components/glatko-kariyer/requisition/RequisitionWizard";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
};

// R11 — this page reads auth.getUser() (cookie session) to resolve the employer
// identity, so it can never be statically rendered/ISR-cached. The gated career
// route group is already flag-quarantined (middleware + the (gated) layout's
// notFound()); noindex is inherited from app/[locale]/career/layout.tsx's robots
// quarantine, so no buildAlternates / indexable metadata is added here (Spec 14:
// gated + noindex, mirror the health gated pages).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  return { title: t("careerVertical.employer.requisitionWizard.title") };
}

/**
 * Spec 14 — the demand-side conversion surface: an employer turns a hiring need
 * into a `career_requisitions` row (`status='submitted'`). This server wrapper
 * (force-dynamic, R11) resolves identity SERVER-SIDE (never the client) and the
 * seeded sector list, then hands them to the client `RequisitionWizard`:
 *  - no session            → redirect to /career/login (the wizard never renders
 *    for an anonymous viewer);
 *  - session but NOT an employer → same redirect (R1/R8 #2 — only an employer can
 *    create a requisition; the wizard's POST route re-checks ownership too);
 *  - employer              → render the wizard with the seeded sectors + the
 *    employer's id (used ONLY to key the per-employer draft + to know we are
 *    authed; it is NEVER sent in the POST body — the route derives it from the
 *    cookie session, R1).
 *
 * MIRRORS app/[locale]/health/coming-soon/page.tsx's server-page preamble (await
 * params → hasLocale guard → setRequestLocale → getTranslations; generateMetadata
 * returns {} on a locale miss). Accent = amber / brandCareer throughout the
 * rendered wizard (IMPL-CONTRACT). R7: the worker is never charged — the only
 * money-adjacent control in this flow is the employer's service-path choice.
 */
export default async function NewRequisitionPage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const l = locale as Locale;

  // Identity is resolved server-side and re-verified by the write RPC (R1); it is
  // never trusted from the client. auth.uid() is the cookie session here.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: "/career/login", locale: l });
  // After redirect(), `user` is non-null on the live path; narrow for the RPC.
  const employerUser = user!;

  // Only an employer may create a requisition. A worker / role-less account is
  // bounced to the role-routed login (Spec 14 §"locked / not-an-employer").
  const role = await resolveCareerRole(employerUser.id);
  if (role !== "employer") redirect({ href: "/career/login", locale: l });

  // Seeded sector list (Construction + Hospitality at launch, 9-locale labels —
  // localized by the read-RPC). At C0 there is no separate `career.trades` table
  // exposed to the app layer (see docs/career/specs/taxonomy.md §"How this maps to
  // the data model"); the seeded sectors double as the role/trade picker — exactly
  // how the worker profile wizard sources its trade `<select>` from `listSectors`.
  // We compose the wizard's `RequisitionSector[]` from that single source so the
  // employer's role picker stays consistent with every other career surface.
  const sectors = await listSectors(l);
  const wizardSectors: RequisitionSector[] = sectors.map((s) => ({
    slug: s.slug,
    name: s.name ?? s.slug,
    trades: sectors.map((tr) => ({ slug: tr.slug, name: tr.name ?? tr.slug })),
  }));

  return (
    <div className="bg-brandCareer-50/40 dark:bg-transparent">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-28">
        <RequisitionWizard sectors={wizardSectors} employerId={employerUser.id} />
      </div>
    </div>
  );
}
