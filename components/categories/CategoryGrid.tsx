"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { FocusCard } from "@/components/aceternity/focus-cards";
import type { TooltipItem } from "@/components/aceternity/animated-tooltip";
import { resolveIcon } from "@/lib/utils/categoryIcon";
import { getSeasonalBadge } from "@/lib/utils/seasonalBadge";
import { cn } from "@/lib/utils";

// Hover-only kit components — defer their framer-motion weight off the
// initial /[locale] bundle. ssr:false so they don't render server-side
// (the badges would only flash for a frame anyway), and loading:null
// keeps the spot blank until hover triggers the chunk fetch.
const AnimatedTooltip = dynamic(
  () =>
    import("@/components/aceternity/animated-tooltip").then((m) => ({
      default: m.AnimatedTooltip,
    })),
  { ssr: false, loading: () => null },
);

const HoverBorderGradient = dynamic(
  () =>
    import("@/components/aceternity/hover-border-gradient").then((m) => ({
      default: m.HoverBorderGradient,
    })),
  { ssr: false, loading: () => null },
);

export type P0CategoryCard = FocusCard & {
  id: string;
  slug: string;
  icon: string;
  seasonal: string | null;
  active_months: number[] | null;
  pro_count: number;
  subs: { slug: string; label: string }[];
};

const PLACEHOLDER_AVATAR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 56 56'><rect width='56' height='56' fill='%2314b8a6'/><text x='50%' y='52%' font-size='20' text-anchor='middle' dominant-baseline='middle' fill='white' font-family='system-ui'>★</text></svg>`,
  );

export function CategoryGrid({ cards }: { cards: P0CategoryCard[] }) {
  const t = useTranslations();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8 w-full">
      {cards.map((card, index) => {
        const seasonal = getSeasonalBadge({
          seasonal: card.seasonal,
          active_months: card.active_months,
        });
        const Icon = resolveIcon(card.icon);
        const proItems: TooltipItem[] =
          card.pro_count > 0
            ? [
                {
                  id: card.id,
                  name: t("pros.activeCount", { count: card.pro_count }),
                  designation: t("pros.headline"),
                  image: PLACEHOLDER_AVATAR,
                },
              ]
            : [];

        return (
          <Link
            key={card.id}
            href={{ pathname: "/services/[slug]", params: { slug: card.slug } }}
            aria-label={`${card.title}, ${t("categories.subCount", { count: card.subs.length })}, ${t("pros.activeCount", { count: card.pro_count })}`}
            className={cn(
              "group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-4 focus-visible:ring-offset-[#F8F6F0] dark:focus-visible:ring-offset-[#0b1f23]",
              "motion-reduce:transition-none",
            )}
          >
            <div className="relative w-full overflow-hidden rounded-2xl bg-gray-100 dark:bg-neutral-900 h-72 md:h-80">
              {/* hero_image_url can be NULL in DB — empty src would render a
                  broken <img>; the card bg + gradient overlay carry the layout */}
              {card.src && (
                <Image
                  src={card.src}
                  alt={card.title}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  className={cn(
                    "object-cover will-change-transform",
                    "transition-transform duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
                    "[@media(hover:hover)]:group-hover:scale-[1.05]",
                    "motion-reduce:transition-none motion-reduce:[transform:none]",
                  )}
                  priority={index < 4}
                />
              )}

              {/* Bottom gradient + content overlay */}
              <div className="absolute inset-x-0 bottom-0 z-10 p-5 bg-gradient-to-t from-black/85 via-black/45 to-black/10">
                <div className="flex items-center gap-2.5 mb-2">
                  <Icon className="h-5 w-5 text-teal-300 shrink-0" aria-hidden />
                  <h3 className="text-white font-serif text-lg sm:text-xl font-bold leading-tight tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
                    {card.title}
                  </h3>
                </div>
                {card.subs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {card.subs.slice(0, 3).map((sub) => (
                      <span
                        key={sub.slug}
                        className="rounded-full bg-white/25 backdrop-blur-md border border-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white"
                      >
                        {sub.label}
                      </span>
                    ))}
                  </div>
                )}
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-300">
                  {t("categories.view")} →
                </span>
              </div>

              {/* Seasonal badge — top-right */}
              {seasonal && (
                <div className="absolute top-3 right-3 z-20">
                  <HoverBorderGradient
                    as="div"
                    containerClassName="text-[11px]"
                    className="!px-3 !py-1 text-[11px] font-semibold whitespace-nowrap"
                    aria-label={t(`seasonal.${seasonal.status}`)}
                  >
                    <span aria-hidden>{seasonal.emoji}</span>
                    <span className="ml-1.5">
                      {t(`seasonal.${seasonal.status}`)}
                    </span>
                  </HoverBorderGradient>
                </div>
              )}

              {/* Pro count tooltip — top-left */}
              {proItems.length > 0 && (
                <div className="absolute top-3 left-3 z-20 flex items-center">
                  <AnimatedTooltip items={proItems} />
                </div>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
