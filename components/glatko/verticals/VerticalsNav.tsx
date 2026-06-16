"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Briefcase, HeartPulse, Wrench, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { VERTICAL_TABS, type VerticalKey } from "@/lib/verticals/config";
import {
  HEALTH_FIRST_SEGMENTS,
  CAREER_FIRST_SEGMENTS,
} from "@/lib/verticals/slugs";

/**
 * H0: 3-tab vertical navigation (Hizmetler · İş · Sağlık) — Airbnb-style
 * scroll collapse adapted from the Fijaka header pattern
 * (sahibinden-ai-frontend/frontend/components/header/{index,CategoryTabs}.tsx):
 * hysteresis thresholds prevent state oscillation, icons collapse via
 * AnimatePresence, the active underline is a layoutId spring.
 *
 * Tabs come from lib/verticals/config (single source — no href literals here,
 * 1e). Labels stay SHORT (the bare vertical word); the named sub-brand lockup
 * lives in VerticalBrand on section heroes (§1.6). Color rules (§1.5): accents
 * appear ONLY on tab icons, active indicators and the small "soon" badges,
 * drawn exclusively from each vertical's brand-token group — services keeps
 * teal, health uses brandHealth (sky), career brandCareer (amber).
 */

const COMPACT_AT = 60; // scroll DOWN past this → compact
const TOP_AT = 20; // scroll UP past this → back to expanded

const ICONS: Record<VerticalKey, LucideIcon> = {
  services: Wrench,
  career: Briefcase,
  health: HeartPulse,
};

// Static class strings per accent group so the Tailwind content scanner
// keeps them. Text-bearing badge uses the 700 shade (AA contrast); the
// DEFAULT sky-600 is for icons/indicators only (§1.5 contrast note).
const ACCENT_CLASSES: Record<
  "teal" | "brandHealth" | "brandCareer",
  { icon: string; underline: string; badge: string }
> = {
  teal: {
    icon: "text-teal-600 dark:text-teal-400",
    underline: "bg-teal-500",
    badge: "",
  },
  brandHealth: {
    icon: "text-brandHealth dark:text-brandHealth",
    underline: "bg-brandHealth",
    badge:
      "bg-brandHealth-50 text-brandHealth-700 dark:bg-brandHealth/15 dark:text-brandHealth",
  },
  brandCareer: {
    icon: "text-brandCareer dark:text-brandCareer",
    underline: "bg-brandCareer",
    badge:
      "bg-brandCareer-50 text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer",
  },
};

export function VerticalsNav({ healthEnabled }: { healthEnabled: boolean }) {
  const t = useTranslations("verticals");
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const [compact, setCompact] = useState(false);

  // Hysteresis: separate down/up thresholds (Fijaka pattern) so the bar
  // never flickers when the user hovers around a single threshold.
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setCompact((prev) => {
        if (!prev && y > COMPACT_AT) return true;
        if (prev && y < TOP_AT) return false;
        return prev;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Debounce the icon collapse so AnimatePresence doesn't flicker on
  // fast scroll direction changes (Fijaka CategoryTabs.tsx:27-34).
  const [debouncedCompact, setDebouncedCompact] = useState(compact);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCompact(compact), 150);
    return () => clearTimeout(timer);
  }, [compact]);

  const tabs = VERTICAL_TABS.map((tab) => {
    // Health swings between the live homepage and the coming-soon placeholder
    // based on the flag (K2); the other verticals have a single target.
    const href =
      tab.key === "health"
        ? healthEnabled
          ? tab.liveHref
          : tab.comingSoonHref
        : tab.liveHref;
    // "Soon" badge: career always; health only while dark.
    const soonBadge =
      tab.key === "career" || (tab.key === "health" && !healthEnabled);
    return {
      ...tab,
      href,
      soonBadge,
      accentClasses: ACCENT_CLASSES[tab.accent],
    };
  });

  // Active vertical is derived from the first path segment, matched against the
  // localized slug sets (HEALTH/CAREER_FIRST_SEGMENTS cover all 9 locales —
  // /saglik, /health, /zdravlje, … — so this works whether usePathname returns
  // the internal or the localized form). Anything else → services (default).
  const firstSegment = (pathname ?? "/").split("/").filter(Boolean)[0] ?? "";
  const activeKey: VerticalKey = HEALTH_FIRST_SEGMENTS.has(firstSegment)
    ? "health"
    : CAREER_FIRST_SEGMENTS.has(firstSegment)
      ? "career"
      : "services";

  return (
    <nav
      aria-label={t("ariaLabel")}
      className={cn(
        // mt-16 clears the fixed h-16 header at rest; sticky top-16 docks the
        // bar right under it once the page scrolls.
        "sticky top-16 z-40 mt-16 w-full transition-[background-color,border-color,box-shadow] duration-300 ease-out",
        compact
          ? "border-b border-black/5 bg-white/95 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/95"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div
        className={cn(
          "scrollbar-none mx-auto flex max-w-7xl items-center justify-center overflow-x-auto px-4",
          "transition-all duration-300 ease-out",
          compact ? "gap-x-6 py-1.5 sm:gap-x-10" : "gap-x-8 py-3 sm:gap-x-14",
        )}
      >
        {tabs.map((tab) => {
          const active = tab.key === activeKey;
          const Icon = ICONS[tab.key];
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={cn(
                "group relative flex min-w-[4.5rem] shrink-0 flex-col items-center justify-center text-center",
                "transition-all duration-300 ease-out",
                compact ? "gap-0.5 px-2" : "gap-1.5 px-3",
              )}
            >
              <AnimatePresence initial={false}>
                {!debouncedCompact && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: reduced ? 0 : 0.2 }}
                    className="relative"
                  >
                    {/* Tab icon always carries its vertical's accent (§1.5
                        allows "sekme ikonu" unconditionally) so the three
                        sub-brands stay visually distinct side-by-side —
                        teal / amber / sky — persistent wayfinding. Active
                        state is shown by the label weight + underline, not by
                        re-coloring the icon. Inactive tabs dim via opacity so
                        the active one still reads as primary. */}
                    <Icon
                      className={cn(
                        "h-5 w-5 transition-opacity duration-200",
                        tab.accentClasses.icon,
                        active ? "opacity-100" : "opacity-70",
                      )}
                      strokeWidth={1.5}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <span className="relative flex items-center gap-1">
                <span
                  className={cn(
                    "whitespace-nowrap transition-all duration-200",
                    compact
                      ? "text-xs font-medium"
                      : "text-[11px] font-medium uppercase tracking-[0.08em]",
                    active
                      ? "text-gray-900 dark:text-white"
                      : "text-gray-500 group-hover:text-gray-900 dark:text-white/60 dark:group-hover:text-white",
                  )}
                >
                  {t(tab.key)}
                </span>
                {tab.soonBadge && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-px text-[8px] font-bold uppercase leading-none tracking-wider",
                      tab.accentClasses.badge,
                    )}
                  >
                    {t("soon")}
                  </span>
                )}
              </span>

              {active && (
                <motion.div
                  layoutId="verticalsNavUnderline"
                  className={cn(
                    "absolute -bottom-1 left-1 right-1 h-[2.5px] rounded-full",
                    tab.accentClasses.underline,
                  )}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 400, damping: 30 }
                  }
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
