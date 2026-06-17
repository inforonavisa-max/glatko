import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { SearchX } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { VerticalBrand } from "@/components/glatko/verticals/VerticalBrand";
import { listSectors } from "@/lib/kariyer/queries";
import { sectorIcon } from "@/lib/kariyer/category-icons";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
};

// ISR — static marketing taxonomy (BUILD-RULES R5: only /career/pool* is
// force-dynamic; the sectors hub is ISR-cached like the health directory home).
export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  // Title only — the career layout already injects noindex for the whole vertical
  // subtree, so we never hand-set robots here (mirror health home).
  return { title: t("careerVertical.sectors.seoTitle") };
}

// No generateStaticParams on purpose. The data comes from the public read-RPC
// over supabase-js, whose fetch is non-cacheable (dynamic); pinning this route to
// build-time static generation triggers DYNAMIC_SERVER_USAGE and a 500 on prod
// builds. Instead it renders on demand and is ISR-cached for `revalidate`
// seconds — identical to the health home (which works this way).

/**
 * Career Sectors hub (§1.4 directory home analog): taxonomy-only tile grid of the
 * seeded sectors (Construction + Hospitality) linking into each sector's detail
 * page. No inert search form — the hub is pure marketing taxonomy. All sector data
 * is read server-side via the SECURITY DEFINER read-RPC (lib/kariyer/queries — the
 * career schema is never touched by the browser). Reachable only where
 * CAREER_VERTICAL_ENABLED=true (the (gated) layout 404s otherwise).
 */
export default async function CareerSectorsPage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const l = locale as Locale;

  const sectors = await listSectors(l);

  return (
    <div className="bg-brandCareer-50/60 dark:bg-transparent">
      <section className="mx-auto max-w-3xl px-4 pb-16 pt-32 text-center">
        <VerticalBrand vertical="career" size="md" className="mb-3" />
        <h1 className="font-serif text-4xl font-light tracking-tight text-gray-900 dark:text-white sm:text-5xl">
          {t("careerVertical.sectors.title")}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-gray-600 dark:text-white/60">
          {t("careerVertical.sectors.subtitle")}
        </p>
      </section>

      {/* Sector tile grid (real navigation into each sector's detail page) */}
      <section className="mx-auto max-w-5xl px-4 pb-24">
        {sectors.length === 0 ? (
          /* Empty state — designed dashed card, not a blank grid or fake tile.
             Only reachable if the seed didn't apply. */
          <div className="mx-auto mt-12 max-w-md rounded-2xl border border-dashed border-gray-300 bg-white/50 p-10 text-center dark:border-white/15 dark:bg-white/5">
            <SearchX className="mx-auto h-8 w-8 text-gray-400" />
            <h2 className="mt-4 font-semibold text-gray-900 dark:text-white">
              {t("careerVertical.sectors.emptyTitle")}
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500 dark:text-white/50">
              {t("careerVertical.sectors.emptyBody")}
            </p>
          </div>
        ) : (
          <>
            <h2 className="mb-6 text-center text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
              {t("careerVertical.sectors.title")}
            </h2>
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
          </>
        )}
      </section>
    </div>
  );
}
