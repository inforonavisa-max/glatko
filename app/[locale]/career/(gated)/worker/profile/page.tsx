import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { createClient } from "@/supabase/server";
import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { listSectors } from "@/lib/kariyer/queries";
import { WorkerProfileWizard } from "@/components/glatko-kariyer/WorkerProfileWizard";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
};

// R11 — this page reads auth.getUser() (cookie session) to resolve the worker
// identity, so it can never be statically rendered / ISR-cached. The gated
// career route group is already flag-quarantined (middleware + the (gated)
// layout's notFound()); noindex is inherited from app/[locale]/career/layout.tsx's
// robots quarantine, so no buildAlternates / indexable metadata is added here
// (Spec 19: gated + noindex, mirror the health gated pages).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  return { title: t("careerVertical.worker.profileWizard.title") };
}

/**
 * Spec 19 — the supply-side conversion surface: a logged-in worker turns their
 * account into a `career_worker_profiles` row + linked docs/consents. This
 * server wrapper (force-dynamic, R11) resolves identity SERVER-SIDE (never the
 * client) plus the seeded trade list, then hands them to the client
 * `WorkerProfileWizard`:
 *  - no session → redirect to /career/login (the wizard never renders for an
 *    anonymous viewer; the persisted per-worker draft survives so the worker
 *    returns to a restored wizard after re-auth — Spec 19 §"API 401").
 *  - session  → render the wizard with the seeded sectors + the worker's id
 *    (used ONLY to key the per-worker draft + to know we are authed; it is
 *    NEVER sent in the POST body — the route derives it from the cookie session
 *    and the write RPC re-verifies ownership, R1).
 *
 * MIRRORS app/[locale]/health/coming-soon/page.tsx's server-page preamble (await
 * params → hasLocale guard → setRequestLocale → getTranslations; generateMetadata
 * returns {} on a locale miss). Accent = amber / brandCareer throughout the
 * rendered wizard (IMPL-CONTRACT). R7: the worker is NEVER charged — there is no
 * fee/price/payment control anywhere in this flow.
 */
export default async function WorkerProfilePage({ params }: Props) {
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
  // After redirect(), `user` is non-null on the live path; narrow for the reads.
  const workerUser = user!;

  // Prefill (display only — never POSTed). Name comes from the auth user's
  // metadata (no extra `profiles` round-trip on this worker-facing surface);
  // falls back to null so the wizard shows the email instead.
  const meta = (workerUser.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    (typeof meta.full_name === "string" && meta.full_name.trim()
      ? meta.full_name
      : typeof meta.name === "string" && meta.name.trim()
        ? meta.name
        : null) ?? null;

  // Seeded role/trade list (Construction + Hospitality at launch, 9-locale labels
  // localized by the read-RPC — R9 so the trade `<select>` and per-trade skill
  // picker are never empty). At C0 there is no separate `career.trades` table
  // exposed to the app layer (docs/career/specs/taxonomy.md): the seeded sectors
  // double as the role/trade picker — the same single source every other career
  // surface reads (e.g. the requisition wizard).
  const sectors = await listSectors(l);

  return (
    <div className="bg-brandCareer-50/40 dark:bg-transparent">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-28">
        <WorkerProfileWizard
          userId={workerUser.id}
          userEmail={workerUser.email ?? ""}
          displayName={displayName}
          sectors={sectors}
        />
      </div>
    </div>
  );
}
