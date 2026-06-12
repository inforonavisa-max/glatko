import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { HeartPulse, MapPin, Search, Stethoscope } from "lucide-react";
import { routing } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  return { title: t("healthVertical.seoTitle") };
}

const POPULAR_SPECIALTY_KEYS = ["dentist", "gp", "psychologist"] as const;

/**
 * H0 skeleton of the health vertical homepage. Layout follows the
 * Doktortakvimi simplicity contract (MASTER_PLAN §1.4): hero does ONE job —
 * two-field search + popular specialty chips. The search is intentionally
 * inert until H2/H3 wire the directory; this page is only reachable where
 * HEALTH_VERTICAL_ENABLED=true (Preview/Dev).
 */
export default async function HealthHomePage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <div className="bg-health-50/60 dark:bg-transparent">
      <section className="mx-auto max-w-3xl px-4 pb-24 pt-32 text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-health-100 dark:bg-health-600/15">
          <HeartPulse className="h-7 w-7 text-health-600" />
        </div>
        <h1 className="font-serif text-4xl font-light tracking-tight text-gray-900 dark:text-white sm:text-5xl">
          {t("healthVertical.landing.title")}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-gray-600 dark:text-white/60">
          {t("healthVertical.landing.subtitle")}
        </p>

        {/* Two-field search — H2/H3 wires it; disabled placeholder for now */}
        <form
          className="mx-auto mt-10 flex max-w-2xl flex-col gap-3 sm:flex-row"
          aria-label={t("healthVertical.landing.searchCta")}
        >
          <label className="relative flex-1">
            <Stethoscope className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              disabled
              placeholder={t("healthVertical.landing.searchSpecialty")}
              className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-11 pr-4 text-sm text-gray-900 placeholder:text-gray-400 disabled:cursor-not-allowed dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
          </label>
          <label className="relative sm:w-48">
            <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              disabled
              placeholder={t("healthVertical.landing.searchCity")}
              className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-11 pr-4 text-sm text-gray-900 placeholder:text-gray-400 disabled:cursor-not-allowed dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
          </label>
          <button
            type="button"
            disabled
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Search className="h-4 w-4" />
            {t("healthVertical.landing.searchCta")}
          </button>
        </form>

        {/* Popular specialty chips (factual, no rankings — §1.4 rule 6) */}
        <p className="mt-10 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white/40">
          {t("healthVertical.landing.popular")}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {POPULAR_SPECIALTY_KEYS.map((key) => (
            <span
              key={key}
              className="rounded-full border border-health-100 bg-white px-4 py-1.5 text-sm text-health-700 dark:border-health-600/30 dark:bg-white/5 dark:text-health-600"
            >
              {t(`healthVertical.specialties.${key}`)}
            </span>
          ))}
        </div>

        <p className="mt-16 text-sm text-gray-400 dark:text-white/30">
          {t("healthVertical.landing.skeletonNotice")}
        </p>
      </section>
    </div>
  );
}
