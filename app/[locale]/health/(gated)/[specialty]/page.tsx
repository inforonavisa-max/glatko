import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ChevronLeft, SearchX } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { listSpecialties, providersBySpecialty } from "@/lib/saglik/queries";
import { specialtyIcon } from "@/lib/saglik/specialty-icons";
import { ProviderCard } from "@/components/glatko-saglik/ProviderCard";

type Props = {
  params:
    | Promise<{ locale: string; specialty: string }>
    | { locale: string; specialty: string };
};

export const revalidate = 3600;

/**
 * Pre-render the seed specialty slugs (ISR). Best-effort: if the DB is
 * unreachable at build time, fall back to on-demand rendering (dynamicParams
 * stays on) — the page still validates the slug and 404s unknown specialties.
 */
export async function generateStaticParams() {
  try {
    const specialties = await listSpecialties("en");
    return specialties.map((s) => ({ specialty: s.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, specialty } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const specialties = await listSpecialties(locale as Locale);
  const match = specialties.find((s) => s.slug === specialty);
  return { title: match ? match.name : undefined };
}

export default async function SpecialtyListPage({ params }: Props) {
  const { locale, specialty } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const l = locale as Locale;
  const d = (k: string) => t(`healthVertical.directory.${k}`);

  // Validate the specialty + get its localized name (unknown slug → 404).
  const specialties = await listSpecialties(l);
  const specialtyInfo = specialties.find((s) => s.slug === specialty);
  if (!specialtyInfo) notFound();

  const providers = await providersBySpecialty(specialty, l);
  const Icon = specialtyIcon(specialty);

  return (
    <div className="bg-brandHealth-50/40 dark:bg-transparent">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-28">
        <Link
          href="/health"
          className="inline-flex items-center gap-1 text-sm font-medium text-teal-600 hover:underline dark:text-teal-400"
        >
          <ChevronLeft className="h-4 w-4" />
          {d("allSpecialties")}
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brandHealth-50 dark:bg-brandHealth/15">
            <Icon className="h-6 w-6 text-brandHealth" />
          </span>
          <div>
            <h1 className="font-serif text-3xl font-light tracking-tight text-gray-900 dark:text-white">
              {specialtyInfo.name}
            </h1>
            <p className="text-sm text-gray-500 dark:text-white/50">
              {d("specialtyIntro")}
            </p>
          </div>
        </div>

        {providers.length === 0 ? (
          /* Empty state — designed, not a fake card. */
          <div className="mt-12 rounded-2xl border border-dashed border-gray-300 bg-white/50 p-10 text-center dark:border-white/15 dark:bg-white/5">
            <SearchX className="mx-auto h-8 w-8 text-gray-400" />
            <h2 className="mt-4 font-semibold text-gray-900 dark:text-white">
              {d("emptyTitle")}
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500 dark:text-white/50">
              {d("emptyBody")}
            </p>
          </div>
        ) : (
          <div className="mt-8 grid gap-4">
            {providers.map((p) => (
              <ProviderCard
                key={p.slug}
                provider={p}
                labels={{ verified: d("verified"), availabilitySoon: d("availabilitySoon") }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
