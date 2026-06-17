import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  ChevronRight,
  HandCoins,
  ShieldCheck,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { VerticalBrand } from "@/components/glatko/verticals/VerticalBrand";
import {
  LockedTeaserCard,
  LOCKED_TEASER_WORKERS,
} from "@/components/glatko-kariyer/LockedTeaserCard";
import { CAREER_ROUTES } from "@/lib/kariyer/config";
import { listSectors } from "@/lib/kariyer/queries";
import { sectorIcon } from "@/lib/kariyer/category-icons";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
};

// Static marketing page (spec 01 §Caching / IMPL-CONTRACT page-rendering rule):
// the only server read is the public-safe sectors RPC — nothing per-viewer —
// so this stays ISR. force-dynamic is for the pool surfaces, NOT this one.
export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  // noindex for the whole career subtree is set by app/[locale]/career/layout.tsx
  // (robots:{index:false}). We only contribute the title here — no buildAlternates.
  return { title: t("careerVertical.landing.seoTitle") };
}

/**
 * İş & Kariyer landing / hero (spec 01-landing). Mirrors the health gated home
 * (app/[locale]/health/(gated)/page.tsx) structurally, swapping content + accent
 * to amber / brandCareer. ONE server read — listSectors() via the SECURITY
 * DEFINER read-RPC (career schema is never touched by the browser); the teaser
 * cards are hardcoded anonymized placeholders (no showcase-view read, no PII).
 *
 * Layout top→bottom: amber hero + VerticalBrand, dual CTA (employer primary
 * gradient / worker outline + "free for you"), trust strip, locked teaser-card
 * row, sector tiles, 3-step "how it works" diagram. Worker side carries NO
 * fee/price wording (R7). Reachable only where CAREER_VERTICAL_ENABLED=true.
 */
export default async function CareerLandingPage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const l = locale as Locale;

  const sectors = await listSectors(l);

  const steps = [
    {
      title: t("careerVertical.landing.steps.step1Title"),
      body: t("careerVertical.landing.steps.step1Body"),
    },
    {
      title: t("careerVertical.landing.steps.step2Title"),
      body: t("careerVertical.landing.steps.step2Body"),
    },
    {
      title: t("careerVertical.landing.steps.step3Title"),
      body: t("careerVertical.landing.steps.step3Body"),
    },
  ];

  return (
    <div className="bg-brandCareer-50/60 dark:bg-transparent">
      <section className="mx-auto max-w-3xl px-4 pb-16 pt-32 text-center">
        <VerticalBrand vertical="career" size="md" className="mb-3" />
        <h1 className="font-serif text-4xl font-light tracking-tight text-gray-900 dark:text-white sm:text-5xl">
          {t("careerVertical.landing.hero.title")}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-gray-600 dark:text-white/60">
          {t("careerVertical.landing.hero.subtitle")}
        </p>

        {/* Dual CTA row (replaces health's inert search): employer primary
            (amber gradient) + worker secondary (outline amber, free-for-you). */}
        <div className="mx-auto mt-10 flex max-w-2xl flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
          <Link
            href={CAREER_ROUTES.employerJoin}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 transition-all hover:shadow-amber-500/40"
          >
            {t("careerVertical.landing.dualCta.employerCta")}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Link>
          <Link
            href={CAREER_ROUTES.workerJoin}
            className="flex flex-col items-center justify-center rounded-xl border border-brandCareer-50 bg-white px-6 py-2.5 text-sm font-semibold text-brandCareer-700 transition-colors hover:border-brandCareer hover:bg-brandCareer-50 dark:border-brandCareer/30 dark:bg-white/5 dark:text-brandCareer dark:hover:bg-brandCareer/10"
          >
            <span>{t("careerVertical.landing.dualCta.workerCta")}</span>
            <span className="mt-0.5 text-xs font-normal text-brandCareer-700/70 dark:text-brandCareer/70">
              {t("careerVertical.landing.hero.trustNote")}
            </span>
          </Link>
        </div>

        {/* Trust strip — static pills, no data. "Employer Pays" is the ONLY
            money-direction statement on this page (R7). */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brandCareer-50 px-3 py-1.5 text-xs font-medium text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
            <BadgeCheck className="h-3.5 w-3.5" />
            {t("careerVertical.landing.trustStrip.verifiedTitle")}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brandCareer-50 px-3 py-1.5 text-xs font-medium text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
            <HandCoins className="h-3.5 w-3.5" />
            {t("careerVertical.landing.trustStrip.employerPaysTitle")}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brandCareer-50 px-3 py-1.5 text-xs font-medium text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t("careerVertical.landing.trustStrip.anonymousTitle")}
          </span>
        </div>
      </section>

      {/* Locked teaser-card row — hardcoded anonymized placeholders (NOT a
          showcase-view read; zero real identity). The page's "locked"
          affordance, signalling "browse the gated pool to see more". */}
      <section className="mx-auto max-w-5xl px-4 pb-20">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
          {t("careerVertical.landing.teaser.title")}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-gray-500 dark:text-white/50">
          {t("careerVertical.landing.teaser.subtitle")}
        </p>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LOCKED_TEASER_WORKERS.map((worker) => (
            <LockedTeaserCard
              key={worker.workerCode}
              worker={worker}
              labels={{
                verified: t("careerVertical.landing.trustStrip.verifiedTitle"),
                locked: t("careerVertical.landing.teaser.lockedLabel"),
              }}
            />
          ))}
        </div>
        <div className="mt-6 text-center">
          <Link
            href={CAREER_ROUTES.pool}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brandCareer-700 transition-colors hover:text-brandCareer dark:text-brandCareer dark:hover:text-brandCareer"
          >
            {t("careerVertical.landing.teaser.viewPoolCta")}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </div>
      </section>

      {/* Sector tiles — one per seeded sector (Construction + Hospitality, mig
          078), read server-side via listSectors. Omitted entirely when the RPC
          returns [] (defensive; no broken empty grid). */}
      {sectors.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 pb-20">
          <h2 className="mb-2 text-center text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
            {t("careerVertical.landing.sectorsTitle")}
          </h2>
          <p className="mx-auto mb-6 max-w-xl text-center text-sm text-gray-500 dark:text-white/50">
            {t("careerVertical.landing.sectorsSubtitle")}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {sectors.map((s) => {
              const Icon = sectorIcon(s.slug);
              return (
                <Link
                  key={s.slug}
                  href={{
                    pathname: "/career/sectors/[sector]",
                    params: { sector: s.slug },
                  }}
                  className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 hover:shadow-premium-sm dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brandCareer-50 dark:bg-brandCareer/15">
                    <Icon className="h-5 w-5 text-brandCareer" />
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {s.name}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* 3-step "how it works" diagram — amber numbered circles, connector
          chevrons between steps on desktop (flip in RTL). */}
      <section className="mx-auto max-w-5xl px-4 pb-24">
        <h2 className="mb-8 text-center text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
          {t("careerVertical.landing.steps.title")}
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
            {t("careerVertical.landing.dualCta.workerSecondary")}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </div>
      </section>
    </div>
  );
}
