"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Briefcase, HeartPulse, Wrench, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * H0: 3-tab vertical navigation (Hizmetler · İş & Kariyer · Sağlık) —
 * Airbnb-style scroll collapse adapted from the Fijaka header pattern
 * (sahibinden-ai-frontend/frontend/components/header/{index,CategoryTabs}.tsx):
 * hysteresis thresholds prevent state oscillation, icons collapse via
 * AnimatePresence, the active underline is a layoutId spring.
 *
 * Color rules (MASTER_PLAN §1.5, K7-r2): accents appear ONLY on tab icons,
 * active indicators and the small "soon" badges — services keeps the
 * existing teal brand, health uses the `health` (sky) tokens, career the
 * `career` (amber) tokens. Buttons/links everywhere else stay teal.
 */

const COMPACT_AT = 60; // scroll DOWN past this → compact
const TOP_AT = 20; // scroll UP past this → back to expanded

type VerticalTab = {
  key: "services" | "career" | "health";
  icon: LucideIcon;
  soonBadge: boolean;
  // Static class strings so the Tailwind content scanner sees them.
  iconActive: string;
  underline: string;
  badge: string;
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

  const tabs: Array<VerticalTab & { href: "/" | "/career" | "/health" | "/health/coming-soon" }> = [
    {
      key: "services",
      href: "/",
      icon: Wrench,
      soonBadge: false,
      iconActive: "text-teal-600 dark:text-teal-400",
      underline: "bg-teal-500",
      badge: "",
    },
    {
      key: "career",
      href: "/career",
      icon: Briefcase,
      soonBadge: true,
      iconActive: "text-career-600",
      underline: "bg-career-600",
      badge: "bg-career-100 text-career-700 dark:bg-career-600/15 dark:text-career-600",
    },
    {
      key: "health",
      href: healthEnabled ? "/health" : "/health/coming-soon",
      icon: HeartPulse,
      soonBadge: !healthEnabled,
      iconActive: "text-health-600",
      underline: "bg-health-600",
      badge: "bg-health-100 text-health-700 dark:bg-health-600/15 dark:text-health-600",
    },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href.split("/").slice(0, 2).join("/"));

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
          const active = isActive(tab.href);
          const Icon = tab.icon;
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
                    <Icon
                      className={cn(
                        "h-5 w-5 transition-colors duration-200",
                        active
                          ? tab.iconActive
                          : "text-gray-400 dark:text-white/40",
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
                      tab.badge,
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
                    tab.underline,
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
