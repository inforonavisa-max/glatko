import type { Metadata } from "next";
import Image from "next/image";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  CalendarClock,
  ChevronLeft,
  Clock,
  Languages,
  MapPin,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { getProvider, type HealthProviderService } from "@/lib/saglik/queries";

type Props = {
  params:
    | Promise<{ locale: string; slug: string }>
    | { locale: string; slug: string };
};

export const revalidate = 3600;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const provider = await getProvider(slug, locale as Locale);
  return { title: provider ? `${provider.title ?? ""} ${provider.fullName}`.trim() : undefined };
}

function modeLabel(mode: HealthProviderService["mode"]): string {
  if (mode === "video") return "modeVideo";
  if (mode === "home_visit") return "modeHomeVisit";
  return "modeInPerson";
}

/**
 * Provider profile (§1.4 rule 3): two columns. Left = facts (bio, services +
 * pricing, address/map placeholder, languages, specialties). Right = sticky
 * booking widget area — a reserved placeholder until H4/H5 wire real slots; on
 * mobile it collapses to a fixed bottom "Book" bar (disabled for now). Only
 * published+approved providers resolve; anything else → 404 (getProvider returns
 * null for unpublished/unknown). Read entirely server-side via the read-RPC.
 */
export default async function ProviderProfilePage({ params }: Props) {
  const { locale, slug } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const l = locale as Locale;
  const d = (k: string) => t(`healthVertical.directory.${k}`);

  const provider = await getProvider(slug, l);
  if (!provider) notFound();

  const primaryLocation = provider.locations[0] ?? null;

  return (
    <div className="bg-brandHealth-50/40 pb-28 dark:bg-transparent lg:pb-0">
      <div className="mx-auto max-w-5xl px-4 pb-24 pt-28">
        <Link
          href="/health"
          className="inline-flex items-center gap-1 text-sm font-medium text-teal-600 hover:underline dark:text-teal-400"
        >
          <ChevronLeft className="h-4 w-4" />
          {d("allSpecialties")}
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_20rem]">
          {/* LEFT — facts */}
          <div>
            {/* Header */}
            <div className="flex gap-4">
              {provider.photoUrl ? (
                <Image
                  src={provider.photoUrl}
                  alt={provider.fullName}
                  width={80}
                  height={80}
                  className="h-20 w-20 shrink-0 rounded-2xl object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-brandHealth-50 text-2xl font-semibold text-brandHealth-700 dark:bg-brandHealth/15 dark:text-brandHealth">
                  {initials(provider.fullName)}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="font-serif text-3xl font-light tracking-tight text-gray-900 dark:text-white">
                  {provider.title ? `${provider.title} ` : ""}
                  {provider.fullName}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {provider.specialties.map((s) => (
                    <span
                      key={s.slug}
                      className="text-sm text-gray-500 dark:text-white/50"
                    >
                      {s.name}
                    </span>
                  ))}
                  {provider.verified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brandHealth-50 px-2 py-0.5 text-xs font-medium text-brandHealth-700 dark:bg-brandHealth/15 dark:text-brandHealth">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      {d("verified")}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Bio */}
            {provider.bio && (
              <section className="mt-8">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
                  {d("aboutLabel")}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-white/70">
                  {provider.bio}
                </p>
              </section>
            )}

            {/* Services & pricing */}
            {provider.services.length > 0 && (
              <section className="mt-8">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
                  {d("servicesLabel")}
                </h2>
                <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-white/5 dark:border-white/10">
                  {provider.services.map((svc, i) => (
                    <li key={i} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                          {svc.name}
                        </p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-gray-500 dark:text-white/50">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {svc.durationMin} {d("minutesShort")}
                          </span>
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-white/10">
                            {d(modeLabel(svc.mode))}
                          </span>
                        </p>
                      </div>
                      {/* §K4: price hidden when null */}
                      {svc.priceEur != null && (
                        <span className="shrink-0 text-sm font-semibold text-gray-900 dark:text-white">
                          €{svc.priceEur}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Address + map placeholder (Mapbox arrives in H3) */}
            {primaryLocation && (
              <section className="mt-8">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
                  {d("addressLabel")}
                </h2>
                <p className="mt-2 flex items-start gap-2 text-sm text-gray-600 dark:text-white/70">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brandHealth" />
                  <span>
                    {primaryLocation.label}
                    <br />
                    {primaryLocation.address}, {primaryLocation.city}
                  </span>
                </p>
                <div className="mt-3 flex h-40 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-400 dark:border-white/15 dark:bg-white/5 dark:text-white/30">
                  {d("mapSoon")}
                </div>
              </section>
            )}

            {/* Languages */}
            {provider.languages.length > 0 && (
              <section className="mt-8">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
                  <Languages className="h-4 w-4" />
                  {d("languagesLabel")}
                </h2>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {provider.languages.map((lang) => (
                    <span
                      key={lang}
                      className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium uppercase text-gray-600 dark:bg-white/10 dark:text-white/60"
                    >
                      {lang}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* RIGHT — sticky booking widget placeholder (desktop). H4/H5 fills it. */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-2xl border border-gray-200 bg-white p-5 shadow-premium-sm dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center gap-2 text-gray-900 dark:text-white">
                <CalendarClock className="h-5 w-5 text-brandHealth" />
                <span className="text-sm font-semibold">{d("bookingSoon")}</span>
              </div>
              <button
                type="button"
                disabled
                className="mt-4 w-full rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-3 text-sm font-semibold text-white opacity-60 disabled:cursor-not-allowed"
              >
                {d("bookCta")}
              </button>
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile bottom booking bar (§1.4 rule 3) — disabled until H5. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 p-3 backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/95 lg:hidden">
        <button
          type="button"
          disabled
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-3 text-sm font-semibold text-white opacity-60 disabled:cursor-not-allowed"
        >
          <CalendarClock className="h-4 w-4" />
          {d("bookCta")} · {d("bookingSoon")}
        </button>
      </div>
    </div>
  );
}
