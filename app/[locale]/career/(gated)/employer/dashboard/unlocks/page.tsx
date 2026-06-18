import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Inbox } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { createClient } from "@/supabase/server";
import {
  getEmployerUnlocks,
  resolveCareerRole,
  type EmployerUnlock,
} from "@/lib/kariyer/queries";
import {
  UnlockCenter,
  type UnlockCenterRow,
} from "@/components/glatko-kariyer/UnlockCenter";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
};

// R5/R11 — this surface reads auth.getUser() AND renders one employer's
// per-row unlock/payment state; it must NEVER be ISR-cached and served to
// another employer (cross-employer dossier leak). Health's session-gated
// booking page is force-dynamic for the same reason. nodejs runtime because the
// data layer uses the service-role admin client (server-only). noindex is
// inherited from the (gated) group / app/[locale]/career/layout.tsx.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  // noindex is inherited from app/[locale]/career/layout.tsx — do NOT add
  // buildAlternates/indexable metadata to this gated subtree (IMPL-CONTRACT).
  return { title: t("careerVertical.employer.unlocks.seoTitle") };
}

/**
 * Unlock / Reveal Center (Spec 16) — the TERMINAL surface of the reveal flow and
 * the ONLY place an employer ever sees a worker's full dossier. Mirrors health's
 * `app/[locale]/health/(gated)/randevu/[holdId]/page.tsx`: a force-dynamic,
 * noindex, session-reading gated page that reads rows via a service-role data fn,
 * renders a designed empty state when there are none, and otherwise hands the
 * resolved row list to a client island — never crashing on an empty result.
 *
 * Identity is derived server-side from the trusted session (auth.getUser()),
 * NEVER the request. No session / non-employer → redirect to `/career/login`
 * (locale-aware), so dossier data is never read without a verified employer.
 *
 * R1/R8 #2: `getEmployerUnlocks` passes the verified uid as an explicit arg to a
 * SECURITY DEFINER RPC that re-verifies ownership — employer A's id never returns
 * employer B's unlocks.
 *
 * R8 #1 (column-set firewall): the base read returns ONLY anonymized fields
 * (workerCode + gate state). This page maps each row into the island's
 * {@link UnlockCenterRow} shape WITHOUT fabricating identity — identity, the fee
 * summary, and the document manifest stay null/empty for every row that is not
 * yet `unlocked`, so no private field reaches the client on a locked row. (The
 * Phase-2 enriched read will hydrate those fields for unlocked rows; the gate
 * stays the RPC + signer, R6.)
 */
export default async function EmployerUnlocksPage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const l = locale as Locale;

  // Verified session → must be an employer. Anon / worker / non-employer never
  // reads dossier rows; bounce to the career login (mirror health's session
  // gate). The role lookup is a SECURITY DEFINER RPC keyed by the trusted uid.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (await resolveCareerRole(user.id)) !== "employer") {
    redirect({ href: "/career/login", locale: l });
  }
  // After redirect(), `user` is non-null on the live path; narrow for the RPC.
  const employerUser = user!;

  const t = await getTranslations();
  const u = (k: string) => t(`careerVertical.employer.unlocks.${k}`);

  // R1: the verified uid is passed explicitly; the RPC re-verifies ownership.
  // A genuine RPC failure THROWS here (caught by the (gated) error.tsx) — an
  // empty array is a legitimately-empty list, never a hidden outage.
  const unlocks = await getEmployerUnlocks(employerUser.id);

  // Newest-first (Spec 16: one card per row, newest first).
  const rows: UnlockCenterRow[] = unlocks
    .slice()
    .sort((a, b) => b.interestAt.localeCompare(a.interestAt))
    .map(toUnlockRow);

  return (
    <div className="bg-brandCareer-50/40 dark:bg-transparent">
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-28">
        <h1 className="font-serif text-3xl font-light tracking-tight text-gray-900 dark:text-white">
          {u("title")}
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-white/50">
          {u("subhead")}
        </p>

        {rows.length === 0 ? (
          /* Designed empty state (mirror health's graceful "not found" geometry:
             centered icon + title + body + amber link). This is NOT an error —
             the employer simply has zero reveal_unlocks rows yet. */
          <div className="mt-16 text-center">
            <Inbox className="mx-auto h-9 w-9 text-brandCareer-700 dark:text-brandCareer" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
              {u("emptyTitle")}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500 dark:text-white/50">
              {u("emptyBody")}
            </p>
            <Link
              href="/career/pool"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brandCareer-700 hover:underline dark:text-brandCareer"
            >
              {t("careerVertical.pool.title")}
            </Link>
          </div>
        ) : (
          <UnlockCenter rows={rows} locale={l} />
        )}
      </div>
    </div>
  );
}

/**
 * Map an anonymized {@link EmployerUnlock} read into the island's
 * {@link UnlockCenterRow}. R8 #1: identity (name/contact/location), the fee
 * summary, and the document manifest are NEVER fabricated here — they stay
 * null/empty because the Phase-0 read projects only anonymized columns. `role`
 * and `trade` are likewise absent from the base showcase-safe read, so they are
 * null until the enriched Phase-2 read hydrates them; the island already renders
 * the header from whatever is present. `available` defaults true (a consent
 * revoke / de-showcase flag arrives with the enriched read).
 */
function toUnlockRow(row: EmployerUnlock): UnlockCenterRow {
  return {
    ...row,
    role: null,
    trade: null,
    available: true,
    fee: null,
    revealedName: null,
    revealedContact: null,
    revealedLocation: null,
    documents: [],
  };
}
