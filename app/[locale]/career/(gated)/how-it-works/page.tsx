import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  ClipboardList,
  Eye,
  EyeOff,
  FileCheck2,
  Handshake,
  Lock,
  ScrollText,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { CAREER_ROUTES } from "@/lib/kariyer/config";
import { VerticalBrand } from "@/components/glatko/verticals/VerticalBrand";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
};

// Static marketing explainer — BUILD-RULES R5: marketing pages keep ISR, NOT
// force-dynamic. This page reads no auth/cookies, so it stays static at 1h.
export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  // noindex inheritance: the whole /career subtree is robots:noindex via
  // app/[locale]/career/layout.tsx; no buildAlternates/indexable metadata here
  // (IMPL-CONTRACT: gated career pages never emit indexable metadata).
  return {
    title: t("careerVertical.howItWorks.seoTitle"),
    robots: { index: false, follow: false },
  };
}

/**
 * Career "How It Works" (Spec 02): the gated-model explainer. Mirrors the HEALTH
 * vertical's marketing-page chrome (app/[locale]/health/(gated)/page.tsx) and the
 * numbered step-card layout of the services-side /how-it-works page, with the
 * sky/teal → amber (brandCareer) accent substitution. Renders BOTH lifecycle
 * paths transparently, the two revenue paths, and the load-bearing Employer-Pays
 * guarantee (R7 — no fee/price wording on any worker step). Pure static i18n
 * content + internal CTAs; no auth, no DB, no signed URLs. The (gated) group
 * layout owns the flag check — this page never re-checks it. Reachable only
 * where CAREER_VERTICAL_ENABLED=true (Preview/Dev on, Prod off → real 404).
 */
export default async function CareerHowItWorksPage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();

  // Employer path — primary, sequential. Dictionary carries 5 vetted steps
  // (careerVertical.howItWorks.employerPath.step{1..5}); render what exists,
  // never hardcode copy (IMPL-CONTRACT i18n rule).
  const employerSteps = [
    { icon: ClipboardList, title: t("careerVertical.howItWorks.employerPath.step1Title"), body: t("careerVertical.howItWorks.employerPath.step1Body") },
    { icon: Users, title: t("careerVertical.howItWorks.employerPath.step2Title"), body: t("careerVertical.howItWorks.employerPath.step2Body") },
    { icon: Handshake, title: t("careerVertical.howItWorks.employerPath.step3Title"), body: t("careerVertical.howItWorks.employerPath.step3Body") },
    { icon: Wallet, title: t("careerVertical.howItWorks.employerPath.step4Title"), body: t("careerVertical.howItWorks.employerPath.step4Body") },
    { icon: BadgeCheck, title: t("careerVertical.howItWorks.employerPath.step5Title"), body: t("careerVertical.howItWorks.employerPath.step5Body") },
  ];

  // Worker path — distinct sub-section. R7: ZERO fee/price language on this side;
  // the symmetric gate (owner brokers all contact) is stated in the copy itself.
  const workerSteps = [
    { icon: UserPlus, title: t("careerVertical.howItWorks.workerPath.step1Title"), body: t("careerVertical.howItWorks.workerPath.step1Body") },
    { icon: FileCheck2, title: t("careerVertical.howItWorks.workerPath.step2Title"), body: t("careerVertical.howItWorks.workerPath.step2Body") },
    { icon: ShieldCheck, title: t("careerVertical.howItWorks.workerPath.step3Title"), body: t("careerVertical.howItWorks.workerPath.step3Body") },
    { icon: EyeOff, title: t("careerVertical.howItWorks.workerPath.step4Title"), body: t("careerVertical.howItWorks.workerPath.step4Body") },
    { icon: Handshake, title: t("careerVertical.howItWorks.workerPath.step5Title"), body: t("careerVertical.howItWorks.workerPath.step5Body") },
  ];

  return (
    <div className="bg-brandCareer-50/60 dark:bg-transparent">
      {/* Top glow — amber wash mirroring the services how-it-works hero. */}
      <div className="relative">
        <div className="absolute inset-x-0 top-0 -z-10 h-[480px] bg-gradient-to-b from-brandCareer/[0.10] via-amber-500/[0.04] to-transparent dark:from-brandCareer/[0.08]" />
      </div>

      <div className="mx-auto max-w-5xl px-4 pb-24 pt-28 sm:px-6">
        {/* 1 — Hero */}
        <section className="text-center">
          <VerticalBrand vertical="career" size="md" className="mb-4" />
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-brandCareer-50 bg-brandCareer-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brandCareer-700 dark:border-brandCareer/30 dark:bg-brandCareer/15 dark:text-brandCareer">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {t("careerVertical.howItWorks.title")}
          </div>
          <h1 className="font-serif text-4xl font-light leading-tight tracking-tight text-gray-900 dark:text-white sm:text-5xl">
            {t("careerVertical.howItWorks.title")}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-gray-600 dark:text-white/70 sm:text-lg">
            {t("careerVertical.howItWorks.subtitle")}
          </p>
        </section>

        {/* 2 — Employer path (primary) */}
        <section className="mt-16">
          <div className="mb-6 text-center">
            <h2 className="font-serif text-2xl font-light text-gray-900 dark:text-white">
              {t("careerVertical.howItWorks.employerPath.title")}
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-white/60">
              {t("careerVertical.howItWorks.employerPath.subtitle")}
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {employerSteps.map((s, i) => {
              const Icon = s.icon;
              return (
                <div
                  key={i}
                  className="relative rounded-2xl border border-gray-200/60 bg-white/70 p-6 backdrop-blur-sm transition-all hover:-translate-y-1 hover:shadow-lg dark:border-white/[0.08] dark:bg-white/[0.03]"
                >
                  <div className="absolute -top-4 left-6 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brandCareer to-brandCareer-700 text-sm font-bold text-white shadow-md">
                    {i + 1}
                  </div>
                  <Icon className="mt-4 h-6 w-6 text-brandCareer-700 dark:text-brandCareer" aria-hidden />
                  <h3 className="mt-3 text-base font-semibold text-gray-900 dark:text-white">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-white/60">
                    {s.body}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* 3 — Worker path (distinct sub-section, free-for-you) */}
        <section className="mt-16">
          <div className="mb-6 text-center">
            <h2 className="font-serif text-2xl font-light text-gray-900 dark:text-white">
              {t("careerVertical.howItWorks.workerPath.title")}
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-white/60">
              {t("careerVertical.howItWorks.workerPath.subtitle")}
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {workerSteps.map((s, i) => {
              const Icon = s.icon;
              return (
                <div
                  key={i}
                  className="relative rounded-2xl border border-gray-200/60 bg-white/70 p-6 backdrop-blur-sm transition-all hover:-translate-y-1 hover:shadow-lg dark:border-white/[0.08] dark:bg-white/[0.03]"
                >
                  <div className="absolute -top-4 left-6 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brandCareer to-brandCareer-700 text-sm font-bold text-white shadow-md">
                    {i + 1}
                  </div>
                  <Icon className="mt-4 h-6 w-6 text-brandCareer-700 dark:text-brandCareer" aria-hidden />
                  <h3 className="mt-3 text-base font-semibold text-gray-900 dark:text-white">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-white/60">
                    {s.body}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* 4 — Two revenue paths (employer-facing copy only) */}
        <section className="mt-16">
          <div className="mb-6 text-center">
            <h2 className="font-serif text-2xl font-light text-gray-900 dark:text-white">
              {t("careerVertical.howItWorks.revenuePaths.title")}
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-white/60">
              {t("careerVertical.howItWorks.revenuePaths.subtitle")}
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-premium-sm dark:border-white/10 dark:bg-white/5 sm:p-8">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brandCareer-50 dark:bg-brandCareer/15">
                <Handshake className="h-5 w-5 text-brandCareer-700 dark:text-brandCareer" aria-hidden />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
                {t("careerVertical.howItWorks.revenuePaths.commissionTitle")}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-white/60">
                {t("careerVertical.howItWorks.revenuePaths.commissionBody")}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-premium-sm dark:border-white/10 dark:bg-white/5 sm:p-8">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brandCareer-50 dark:bg-brandCareer/15">
                <ScrollText className="h-5 w-5 text-brandCareer-700 dark:text-brandCareer" aria-hidden />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
                {t("careerVertical.howItWorks.revenuePaths.fullServiceTitle")}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-white/60">
                {t("careerVertical.howItWorks.revenuePaths.fullServiceBody")}
              </p>
            </div>
          </div>
        </section>

        {/* 5 — Employer-Pays banner (load-bearing, R7) */}
        <section className="mt-16 rounded-3xl border border-brandCareer-50 bg-gradient-to-br from-brandCareer/[0.10] via-amber-500/[0.04] to-transparent p-8 backdrop-blur-sm dark:border-brandCareer/20 dark:from-brandCareer/[0.12] sm:p-10">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brandCareer-50 dark:bg-brandCareer/15">
              <ShieldCheck className="h-6 w-6 text-brandCareer-700 dark:text-brandCareer" aria-hidden />
            </span>
            <div>
              <h2 className="font-serif text-2xl font-light text-gray-900 dark:text-white">
                {t("careerVertical.howItWorks.employerPays.title")}
              </h2>
              <p className="mt-2 text-sm text-gray-700 dark:text-white/70">
                {t("careerVertical.howItWorks.employerPays.body")}
              </p>
              <p className="mt-3 text-xs font-medium text-brandCareer-700 dark:text-brandCareer">
                {t("careerVertical.howItWorks.employerPays.legalNote")}
              </p>
            </div>
          </div>
        </section>

        {/* What unlocks after approval + payment — locked-look panel (visual only) */}
        <section className="mt-16 grid gap-6 sm:grid-cols-2">
          {/* Anonymized (shown today) */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-brandCareer-700 dark:text-brandCareer" aria-hidden />
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {t("careerVertical.howItWorks.workerPath.step4Title")}
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-white/60">
              {t("careerVertical.howItWorks.workerPath.step4Body")}
            </p>
          </div>
          {/* Locked dossier (until approval + payment) */}
          <div className="relative overflow-hidden rounded-2xl border border-brandCareer-50 bg-brandCareer-50/40 p-6 dark:border-brandCareer/20 dark:bg-brandCareer/[0.06]">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-brandCareer-700 dark:text-brandCareer" aria-hidden />
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {t("careerVertical.howItWorks.employerPath.step4Title")}
              </h3>
            </div>
            {/* Blurred placeholder text — visual-only "locked dossier" look, no real PII. */}
            <p className="mt-3 select-none text-sm leading-relaxed text-gray-500 blur-[1px] dark:text-white/40">
              {t("careerVertical.howItWorks.workerPath.step2Body")}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-white/60">
              {t("careerVertical.howItWorks.employerPath.step4Body")}
            </p>
          </div>
        </section>

        {/* 6 — Trust strip */}
        <section className="mt-16">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brandCareer-50 px-4 py-1.5 text-xs font-semibold text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
              {t("careerVertical.trust.verifiedByRonaLegalShort")}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brandCareer-50 px-4 py-1.5 text-xs font-semibold text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              {t("careerVertical.trust.guarantee")}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brandCareer-50 px-4 py-1.5 text-xs font-semibold text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
              <Wallet className="h-3.5 w-3.5" aria-hidden />
              {t("careerVertical.trust.employerPaysShort")}
            </span>
          </div>
        </section>

        {/* 7 — Dual CTA band */}
        <section className="mt-16 text-center">
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={CAREER_ROUTES.employer}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-8 py-3.5 text-sm font-semibold text-white shadow-xl shadow-amber-500/25 transition-transform hover:-translate-y-0.5"
            >
              {t("careerVertical.landing.dualCta.employerCta")}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href={CAREER_ROUTES.worker}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-brandCareer-50 bg-white px-8 py-3.5 text-sm font-semibold text-brandCareer-700 transition-colors hover:border-brandCareer/40 dark:border-brandCareer/30 dark:bg-white/5 dark:text-brandCareer"
            >
              {t("careerVertical.landing.dualCta.workerCta")}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
