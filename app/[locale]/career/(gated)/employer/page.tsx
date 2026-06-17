import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  ChevronRight,
  EyeOff,
  HandCoins,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Wallet,
  Workflow,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { VerticalBrand } from "@/components/glatko/verticals/VerticalBrand";
import { CAREER_ROUTES } from "@/lib/kariyer/config";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
};

// Static marketing page (spec 10 §Caching / IMPL-CONTRACT page-rendering rule):
// employer value-prop funnel — ZERO DB reads, ZERO auth, nothing per-viewer — so
// it stays ISR. force-dynamic is for the pool/dashboard surfaces, NOT this one.
export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  // noindex for the whole career subtree is set by app/[locale]/career/layout.tsx
  // (robots:{index:false}). We only contribute the title here — no buildAlternates.
  return {
    title: t("careerVertical.employer.landingPage.seoTitle"),
    robots: { index: false, follow: false },
  };
}

/**
 * İş & Kariyer employer landing / value prop (Spec 10). Mirrors the HEALTH gated
 * home (app/[locale]/health/(gated)/page.tsx) static-marketing chrome — serif h1,
 * centered sections, section grids — swapping content + accent to amber /
 * brandCareer. Unlike the health home there is NO search form and NO read-RPC:
 * this page is fully static, the demand-side conversion funnel for employers →
 * register. Layout top→bottom: amber hero + VerticalBrand + eyebrow pill, primary
 * CTA row (register gradient / browse-pool outline), trust strip, benefits grid,
 * 3-step "how it works" (employer lens), two pricing paths, closing CTA band.
 *
 * R7: every money/fee phrase is employer-direction only — "Employer Pays / free
 * for workers", "you pay only on a successful placement". No fee wording ever
 * attaches to the worker. The (gated) group layout owns the flag check — this
 * page never re-checks it. Reachable only where CAREER_VERTICAL_ENABLED=true.
 */
export default async function CareerEmployerLandingPage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();

  // Benefit cards — static, no data. Amber-tinted lucide icon + title + one line.
  const benefits = [
    {
      icon: BadgeCheck,
      title: t("careerVertical.employer.landingPage.benefits.verifiedTitle"),
      body: t("careerVertical.employer.landingPage.benefits.verifiedBody"),
    },
    {
      icon: EyeOff,
      title: t("careerVertical.employer.landingPage.benefits.anonymousTitle"),
      body: t("careerVertical.employer.landingPage.benefits.anonymousBody"),
    },
    {
      icon: ScrollText,
      title: t("careerVertical.employer.landingPage.benefits.lifecycleTitle"),
      body: t("careerVertical.employer.landingPage.benefits.lifecycleBody"),
    },
    {
      icon: RefreshCw,
      title: t("careerVertical.employer.landingPage.benefits.guaranteeTitle"),
      body: t("careerVertical.employer.landingPage.benefits.guaranteeBody"),
    },
    {
      icon: Wallet,
      title: t("careerVertical.employer.landingPage.benefits.escrowTitle"),
      body: t("careerVertical.employer.landingPage.benefits.escrowBody"),
    },
    {
      icon: UserCheck,
      title: t("careerVertical.employer.landingPage.benefits.matcherTitle"),
      body: t("careerVertical.employer.landingPage.benefits.matcherBody"),
    },
  ];

  // 3-step employer lens — numbered amber circles, connector chevrons on desktop.
  const steps = [
    {
      title: t("careerVertical.employer.landingPage.howItWorks.step1Title"),
      body: t("careerVertical.employer.landingPage.howItWorks.step1Body"),
    },
    {
      title: t("careerVertical.employer.landingPage.howItWorks.step2Title"),
      body: t("careerVertical.employer.landingPage.howItWorks.step2Body"),
    },
    {
      title: t("careerVertical.employer.landingPage.howItWorks.step3Title"),
      body: t("careerVertical.employer.landingPage.howItWorks.step3Body"),
    },
  ];

  return (
    <div className="bg-brandCareer-50/60 dark:bg-transparent">
      {/* 1 — Hero */}
      <section className="mx-auto max-w-3xl px-4 pb-16 pt-32 text-center">
        <VerticalBrand vertical="career" size="md" className="mb-3" />
        <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-brandCareer-50 bg-brandCareer-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brandCareer-700 dark:border-brandCareer/30 dark:bg-brandCareer/15 dark:text-brandCareer">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {t("careerVertical.employer.landingPage.eyebrow")}
        </div>
        <h1 className="font-serif text-4xl font-light tracking-tight text-gray-900 dark:text-white sm:text-5xl">
          {t("careerVertical.employer.landingPage.title")}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-gray-600 dark:text-white/60">
          {t("careerVertical.employer.landingPage.subtitle")}
        </p>

        {/* 2 — Primary CTA row: register (amber gradient) + browse pool (outline).
            Pool login is enforced downstream, not on this page. */}
        <div className="mx-auto mt-10 flex max-w-2xl flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
          <Link
            href={CAREER_ROUTES.employerRegister}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 transition-all hover:shadow-amber-500/40"
          >
            {t("careerVertical.employer.landingPage.registerCta")}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Link>
          <Link
            href={CAREER_ROUTES.pool}
            className="flex items-center justify-center rounded-xl border border-brandCareer-50 bg-white px-6 py-3 text-sm font-semibold text-brandCareer-700 transition-colors hover:border-brandCareer hover:bg-brandCareer-50 dark:border-brandCareer/30 dark:bg-white/5 dark:text-brandCareer dark:hover:bg-brandCareer/10"
          >
            {t("careerVertical.employer.landingPage.poolCta")}
          </Link>
        </div>

        {/* 3 — Trust strip. "Employer Pays / free for workers" is the ONLY
            money-direction statement here (R7). */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brandCareer-50 px-3 py-1.5 text-xs font-medium text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
            <BadgeCheck className="h-3.5 w-3.5" />
            {t("careerVertical.employer.landingPage.trust.verified")}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brandCareer-50 px-3 py-1.5 text-xs font-medium text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
            <HandCoins className="h-3.5 w-3.5" />
            {t("careerVertical.employer.landingPage.trust.employerPays")}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brandCareer-50 px-3 py-1.5 text-xs font-medium text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
            <RefreshCw className="h-3.5 w-3.5" />
            {t("careerVertical.employer.landingPage.trust.guarantee")}
          </span>
        </div>
      </section>

      {/* 4 — Value-prop / benefits grid (mirrors the health specialty grid). */}
      <section className="mx-auto max-w-5xl px-4 pb-20">
        <h2 className="mb-6 text-center text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
          {t("careerVertical.employer.landingPage.benefits.title")}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b) => {
            const Icon = b.icon;
            return (
              <div
                key={b.title}
                className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-gray-300 hover:shadow-premium-sm dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brandCareer-50 dark:bg-brandCareer/15">
                  <Icon className="h-5 w-5 text-brandCareer" aria-hidden />
                </span>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {b.title}
                </h3>
                <p className="text-sm leading-relaxed text-gray-500 dark:text-white/50">
                  {b.body}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5 — 3-step "how it works" (employer lens) — amber numbered circles,
          connector chevrons between steps on desktop (flip in RTL). */}
      <section className="mx-auto max-w-5xl px-4 pb-20">
        <h2 className="mb-8 text-center text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
          {t("careerVertical.employer.landingPage.howItWorks.title")}
        </h2>
        <ol className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-center">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="flex flex-1 flex-col items-center sm:flex-row sm:items-start"
            >
              <div className="flex flex-1 flex-col items-center px-2 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brandCareer-50 text-lg font-semibold text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
                  {i + 1}
                </span>
                <h3 className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">
                  {step.title}
                </h3>
                <p className="mt-1 max-w-xs text-sm text-gray-500 dark:text-white/50">
                  {step.body}
                </p>
              </div>
              {i < steps.length - 1 && (
                <ChevronRight
                  aria-hidden="true"
                  className="mx-2 hidden h-6 w-6 shrink-0 self-center text-brandCareer/50 rtl:rotate-180 sm:block"
                />
              )}
            </li>
          ))}
        </ol>
        <div className="mt-8 text-center">
          <Link
            href={CAREER_ROUTES.howItWorks}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brandCareer-700 transition-colors hover:text-brandCareer dark:text-brandCareer dark:hover:text-brandCareer"
          >
            {t("careerVertical.employer.landingPage.howItWorks.fullLink")}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </div>
      </section>

      {/* 6 — Pricing-paths band — commission-only vs full-service. Employer-
          direction money language ONLY (R7); "you pay only on placement". */}
      <section className="mx-auto max-w-3xl px-4 pb-20">
        <div className="mb-6 text-center">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
            {t("careerVertical.employer.landingPage.pricing.title")}
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-white/50">
            {t("careerVertical.employer.landingPage.pricing.subtitle")}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-white/5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brandCareer-50 dark:bg-brandCareer/15">
              <HandCoins className="h-5 w-5 text-brandCareer" aria-hidden />
            </span>
            <h3 className="mt-4 text-base font-semibold text-gray-900 dark:text-white">
              {t("careerVertical.employer.landingPage.pricing.commissionTitle")}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-white/50">
              {t("careerVertical.employer.landingPage.pricing.commissionBody")}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-white/5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brandCareer-50 dark:bg-brandCareer/15">
              <Workflow className="h-5 w-5 text-brandCareer" aria-hidden />
            </span>
            <h3 className="mt-4 text-base font-semibold text-gray-900 dark:text-white">
              {t("careerVertical.employer.landingPage.pricing.fullServiceTitle")}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-white/50">
              {t("careerVertical.employer.landingPage.pricing.fullServiceBody")}
            </p>
          </div>
        </div>
      </section>

      {/* 7 — Closing CTA band — repeats the primary register CTA + reassurance. */}
      <section className="mx-auto max-w-3xl px-4 pb-24 text-center">
        <div className="rounded-3xl border border-brandCareer-50 bg-gradient-to-br from-brandCareer/[0.10] via-amber-500/[0.04] to-transparent p-8 backdrop-blur-sm dark:border-brandCareer/20 dark:from-brandCareer/[0.12] sm:p-10">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brandCareer-50 dark:bg-brandCareer/15">
            <ShieldCheck className="h-6 w-6 text-brandCareer-700 dark:text-brandCareer" aria-hidden />
          </span>
          <h2 className="mt-4 font-serif text-2xl font-light text-gray-900 dark:text-white">
            {t("careerVertical.employer.landingPage.closing.title")}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-600 dark:text-white/60">
            {t("careerVertical.employer.landingPage.closing.subtitle")}
          </p>
          <div className="mt-6">
            <Link
              href={CAREER_ROUTES.employerRegister}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-8 py-3.5 text-sm font-semibold text-white shadow-xl shadow-amber-500/25 transition-transform hover:-translate-y-0.5"
            >
              {t("careerVertical.employer.landingPage.registerCta")}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
