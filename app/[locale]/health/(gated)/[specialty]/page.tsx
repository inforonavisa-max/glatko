import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { listSpecialties } from "@/lib/saglik/queries";
import { parseHealthFilters, type SearchParamsLike } from "@/lib/saglik/filters";
import { SpecialtyDirectory } from "@/components/glatko-saglik/SpecialtyDirectory";

type Props = {
  params:
    | Promise<{ locale: string; specialty: string }>
    | { locale: string; specialty: string };
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

export const revalidate = 3600;

// No generateStaticParams on purpose. The data comes from the public read-RPC
// over supabase-js, whose fetch is non-cacheable (dynamic); pinning this route
// to build-time static generation triggers DYNAMIC_SERVER_USAGE and a 500 on
// prod builds. Instead it renders on demand and is ISR-cached for `revalidate`
// seconds — identical to the home and profile pages. Unknown specialties 404.
//
// H3: this page now reads searchParams (city/lang/mode/avail/near) and renders
// the FilterBar + filtered list (the city filter has a canonical PATH form at
// /health/[specialty]/[city]). SEO quarantine is automatic (middleware Link
// delete + sitemap omission + the gated layout flag-guard); no robots wiring is
// needed here because the route is unreachable while the flag is off.

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, specialty } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const specialties = await listSpecialties(locale as Locale);
  const match = specialties.find((s) => s.slug === specialty);
  return {
    title: match ? match.name : undefined,
    // Defensive noindex in case the flag ever flips before launch SEO is signed
    // off; the home/profile pages rely on middleware, this is belt-and-braces.
    robots: { index: false, follow: false },
  };
}

export default async function SpecialtyListPage({ params, searchParams }: Props) {
  const { locale, specialty } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const l = locale as Locale;

  // Validate the specialty + get its localized name (unknown slug → 404).
  const specialties = await listSpecialties(l);
  const specialtyInfo = specialties.find((s) => s.slug === specialty);
  if (!specialtyInfo) notFound();

  const sp = ((await Promise.resolve(searchParams)) ?? {}) as SearchParamsLike;
  const filters = parseHealthFilters(sp);

  return (
    <SpecialtyDirectory
      specialtySlug={specialty}
      specialtyName={specialtyInfo.name}
      locale={l}
      filters={filters}
    />
  );
}
