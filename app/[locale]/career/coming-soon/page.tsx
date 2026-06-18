import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Briefcase } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { CareerWaitlistForm } from "@/components/glatko-kariyer/CareerWaitlistForm";
import { VerticalBrand } from "@/components/glatko/verticals/VerticalBrand";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  // noindex — this surface is SEO-quarantined (career subtree is dark/gated).
  return {
    title: t("careerVertical.seoTitle"),
    robots: { index: false, follow: false },
  };
}

/**
 * The only career route that stays live in Production while the vertical is
 * dark — short value proposition + dual (employer/worker) waitlist form,
 * seeding both supply and demand before launch. Every other /career/** path is
 * middleware-quarantined to a real 404 while CAREER_VERTICAL_ENABLED is off
 * (BUILD-RULES R8 §8). Static-eligible (no auth read), so revalidate like the
 * other career marketing pages.
 */
export const revalidate = 3600;

export default async function CareerComingSoonPage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <div className="bg-brandCareer-50/60 dark:bg-transparent">
      <div className="mx-auto max-w-2xl px-4 pb-24 pt-32">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brandCareer-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
            <Briefcase className="h-3.5 w-3.5" />
            {t("careerVertical.comingSoon.badge")}
          </span>
          {/* Named sub-brand lockup is the coming-soon hero */}
          <h1 className="mt-6">
            <VerticalBrand vertical="career" size="lg" />
          </h1>
          <p className="mx-auto mt-3 text-lg text-gray-700 dark:text-white/80">
            {t("careerVertical.comingSoon.title")}
          </p>
          <p className="mx-auto mt-3 max-w-xl text-gray-600 dark:text-white/60">
            {t("careerVertical.comingSoon.subtitle")}
          </p>
        </div>

        <div className="mt-12 rounded-2xl border border-gray-200 bg-white p-6 shadow-premium-sm dark:border-white/10 dark:bg-white/5 sm:p-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t("careerVertical.comingSoon.waitlistTitle")}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-white/50">
            {t("careerVertical.comingSoon.waitlistSubtitle")}
          </p>
          <CareerWaitlistForm locale={locale as Locale} />
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/"
            className="text-sm font-medium text-brandCareer-700 hover:underline dark:text-brandCareer"
          >
            {t("careerVertical.comingSoon.backHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}
