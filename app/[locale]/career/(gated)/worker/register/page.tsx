import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { HardHat } from "lucide-react";
import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { createClient } from "@/supabase/server";
import { resolveCareerRole } from "@/lib/kariyer/queries";
import { WorkerRegisterForm } from "@/components/glatko-kariyer/WorkerRegisterForm";
import { VerticalBrand } from "@/components/glatko/verticals/VerticalBrand";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
};

// R11 — reads auth.getUser() to bounce an already-registered worker straight to
// their profile builder, so the render is per-session and must NEVER be cached.
// (Twin of the employer register page, which is force-dynamic for the same
// auth-read reason.)
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  // noindex is inherited from app/[locale]/career/layout.tsx — do NOT add
  // buildAlternates/indexable metadata to this gated subtree (IMPL-CONTRACT).
  return { title: t("careerVertical.worker.register.seoTitle") };
}

/**
 * Worker registration (Spec 18) — the worker-side entry into the multi-step
 * profile builder, and the structural twin of the employer register page, but
 * on the side the platform NEVER charges (R7). Mirrors
 * `app/[locale]/health/coming-soon/page.tsx`: a short value-prop hero + a card
 * that wraps the intake form. Like the employer page it lives INSIDE the
 * `(gated)` group (so it 404s while CAREER_VERTICAL_ENABLED is off), it is
 * `force-dynamic` (R11), and it reads the trusted session server-side to
 * redirect an already-authed worker onward.
 *
 * Identity comes from `auth.getUser()` (the verified uid), NEVER the request —
 * the `career` schema is off PostgREST, so the role lookup is a SECURITY DEFINER
 * RPC keyed by that uid (R1). Anon / non-worker sessions fall through to the
 * form; the route handler creates/links the auth user + worker profile.
 *
 * R7 — there is no fee/price/payment UI anywhere on this surface; the form's
 * "always free for you — the employer pays" strip is the only money-adjacent
 * copy, and it is reassurance, not a charge.
 */
export default async function WorkerRegisterPage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const l = locale as Locale;

  // Already-authed worker → skip the form, continue to the profile builder
  // (R11). The role is resolved from the verified session uid via the read-RPC;
  // an employer or anon session simply renders the registration form below.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && (await resolveCareerRole(user.id)) === "worker") {
    redirect({
      href: "/career/worker/profile",
      locale: l,
    });
  }

  const t = await getTranslations();

  return (
    <div className="bg-brandCareer-50/60 dark:bg-transparent">
      <div className="mx-auto max-w-2xl px-4 pb-24 pt-32">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brandCareer-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
            <HardHat className="h-3.5 w-3.5" />
            {t("careerVertical.worker.landing.title")}
          </span>
          {/* Named sub-brand lockup is the hero (mirror coming-soon) */}
          <h1 className="mt-6">
            <VerticalBrand vertical="career" size="lg" />
          </h1>
          <p className="mx-auto mt-3 text-lg text-gray-700 dark:text-white/80">
            {t("careerVertical.worker.register.title")}
          </p>
          <p className="mx-auto mt-3 max-w-xl text-gray-600 dark:text-white/60">
            {t("careerVertical.worker.register.subtitle")}
          </p>
        </div>

        <div className="mt-12 rounded-2xl border border-gray-200 bg-white p-6 shadow-premium-sm dark:border-white/10 dark:bg-white/5 sm:p-8">
          {/* The form owns its own "already have an account → login" footer, so
              the page does NOT add a page-level login block (unlike the employer
              page, whose form keeps the login link in its success panel only). */}
          <WorkerRegisterForm locale={l} />
        </div>
      </div>
    </div>
  );
}
