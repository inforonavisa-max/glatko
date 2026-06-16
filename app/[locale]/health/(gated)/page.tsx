import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { MapPin, Search, Stethoscope } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { VerticalBrand } from "@/components/glatko/verticals/VerticalBrand";
import { listSpecialties } from "@/lib/saglik/queries";
import { specialtyIcon } from "@/lib/saglik/specialty-icons";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
};

// ISR — matches the /services directory cadence (lib pattern, app/[locale]/services).
export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  return { title: t("healthVertical.seoTitle") };
}

const POPULAR_COUNT = 8;

/**
 * Health vertical home (§1.4 rule 1): hero does ONE job — a two-field search +
 * single button — then popular specialty chips, then the full specialty grid.
 * Search is inert until H3 (full search); the specialty chips/cards are the real,
 * working navigation into the directory. All specialty data is read server-side
 * via the SECURITY DEFINER read-RPCs (lib/saglik/queries — health schema is never
 * touched by the browser). Reachable only where HEALTH_VERTICAL_ENABLED=true.
 */
export default async function HealthHomePage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const l = locale as Locale;

  const specialties = await listSpecialties(l);
  const popular = specialties.slice(0, POPULAR_COUNT);

  return (
    <div className="bg-brandHealth-50/60 dark:bg-transparent">
      <section className="mx-auto max-w-3xl px-4 pb-16 pt-32 text-center">
        <VerticalBrand vertical="health" size="md" className="mb-3" />
        <h1 className="font-serif text-4xl font-light tracking-tight text-gray-900 dark:text-white sm:text-5xl">
          {t("healthVertical.landing.title")}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-gray-600 dark:text-white/60">
          {t("healthVertical.landing.subtitle")}
        </p>

        {/* Hero search — present but inert until H3 (full search). */}
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
        <p className="mt-3 text-xs text-gray-400 dark:text-white/30">
          {t("healthVertical.directory.searchSoonNote")}
        </p>

        {/* Popular specialty chips (real navigation into the directory) */}
        {popular.length > 0 && (
          <>
            <p className="mt-10 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white/40">
              {t("healthVertical.landing.popular")}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {popular.map((s) => (
                <Link
                  key={s.slug}
                  href={{ pathname: "/health/[specialty]", params: { specialty: s.slug } }}
                  className="rounded-full border border-brandHealth-50 bg-white px-4 py-1.5 text-sm text-brandHealth-700 transition-colors hover:border-brandHealth-100 dark:border-brandHealth/30 dark:bg-white/5 dark:text-brandHealth"
                >
                  {s.name}
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Full specialty grid */}
      <section className="mx-auto max-w-5xl px-4 pb-24">
        <h2 className="mb-6 text-center text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
          {t("healthVertical.directory.browseBySpecialty")}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {specialties.map((s) => {
            const Icon = specialtyIcon(s.slug);
            return (
              <Link
                key={s.slug}
                href={{ pathname: "/health/[specialty]", params: { specialty: s.slug } }}
                className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 hover:shadow-premium-sm dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brandHealth-50 dark:bg-brandHealth/15">
                  <Icon className="h-5 w-5 text-brandHealth" />
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {s.name}
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
