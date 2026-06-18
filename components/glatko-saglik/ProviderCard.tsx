import Image from "next/image";
import { BadgeCheck, MapPin, Clock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { HealthProviderCard } from "@/lib/saglik/queries";
import { intlLocale } from "@/lib/saglik/intl";

type CardSlot = {
  startUtc: string;
  endUtc: string;
  localTime: string;
  date: string;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Directory list card (§1.4 rule 2 — the conversion heart). Sync server-render,
 * no client JS. Localized labels are passed in (the parent page owns the
 * translator), keeping this a plain presentational component. Accent (sky /
 * brandHealth) is wayfinding only — the "Verified" badge + the available-slot
 * time chips (§1.5); name/links stay neutral.
 *
 * HTML rule: <a> cannot nest inside <a>. The outer element is a plain <div>; the
 * identity block is ONE inner <Link> to the profile, and each time chip is its
 * own <Link> carrying the chosen slot via the `slot` query param.
 */
export function ProviderCard({
  provider,
  slots,
  locale,
  labels,
  distanceLabel,
}: {
  provider: HealthProviderCard;
  slots: CardSlot[];
  locale: string;
  labels: { verified: string; noAvailability: string };
  /** "Near me" result distance chip (e.g. "16 km away"); omitted when absent. */
  distanceLabel?: string;
}) {
  // me/sr → Latin Sırpça (aksi halde me→İngilizce, sr→Kiril); bkz. lib/saglik/intl.ts.
  const weekdayFmt = new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "short",
    timeZone: "Europe/Podgorica",
  });

  return (
    <div className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-premium-sm transition-all hover:border-gray-300 hover:shadow-premium-md dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20">
      <Link
        href={{ pathname: "/health/uzman/[slug]", params: { slug: provider.slug } }}
        className="block"
      >
        <div className="flex gap-4">
          {provider.photoUrl ? (
            <Image
              src={provider.photoUrl}
              alt={provider.fullName}
              width={64}
              height={64}
              className="h-16 w-16 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-brandHealth-50 text-lg font-semibold text-brandHealth-700 dark:bg-brandHealth/15 dark:text-brandHealth">
              {initials(provider.fullName)}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-gray-900 dark:text-white">
                  {provider.title ? `${provider.title} ` : ""}
                  {provider.fullName}
                </h3>
                <p className="truncate text-sm text-gray-500 dark:text-white/50">
                  {provider.specialtyName}
                </p>
              </div>
              {provider.verified && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brandHealth-50 px-2 py-0.5 text-xs font-medium text-brandHealth-700 dark:bg-brandHealth/15 dark:text-brandHealth">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  {labels.verified}
                </span>
              )}
            </div>

            {provider.location && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-500 dark:text-white/50">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {provider.location.city}
                  {provider.location.address ? ` · ${provider.location.address}` : ""}
                </span>
                {distanceLabel && (
                  <span className="shrink-0 rounded-md bg-brandHealth-50 px-1.5 py-0.5 text-xs font-medium text-brandHealth-700 dark:bg-brandHealth/15 dark:text-brandHealth">
                    {distanceLabel}
                  </span>
                )}
              </p>
            )}

            {provider.languages.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {provider.languages.map((lang) => (
                  <span
                    key={lang}
                    className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium uppercase text-gray-500 dark:bg-white/10 dark:text-white/50"
                  >
                    {lang}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Link>

      {/* Available-slot row — up to 3 clickable time chips (each its own link,
          carrying the chosen slot), or a neutral "soon" state when empty. */}
      <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3 dark:border-white/5">
        <Clock className="h-4 w-4 shrink-0 text-brandHealth" />
        {slots.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {slots.slice(0, 3).map((s) => {
              const weekdayShort = weekdayFmt.format(new Date(`${s.date}T12:00:00Z`));
              return (
                <Link
                  key={s.startUtc}
                  href={{
                    pathname: "/health/uzman/[slug]",
                    params: { slug: provider.slug },
                    query: { slot: s.startUtc },
                  }}
                  className="inline-flex items-center rounded-lg bg-brandHealth-50 px-2 py-1 text-xs font-medium text-brandHealth-700 hover:bg-brandHealth-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brandHealth focus-visible:ring-offset-1 dark:bg-brandHealth/15 dark:text-brandHealth dark:hover:bg-brandHealth/25 dark:focus-visible:ring-offset-0"
                >
                  {weekdayShort} {s.localTime}
                </Link>
              );
            })}
          </div>
        ) : (
          <span className="text-sm text-gray-400 dark:text-white/40">
            {labels.noAvailability}
          </span>
        )}
      </div>
    </div>
  );
}
