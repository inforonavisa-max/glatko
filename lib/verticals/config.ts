import { HEALTH_ROUTES } from "@/lib/saglik/config";
import { CAREER_ROUTES } from "@/lib/kariyer/config";

/**
 * Cross-vertical switcher registry — single source for the 3-tab navigation
 * (MASTER_PLAN §1.2). Health route keys come from lib/saglik/config (the
 * sub-brand's own module); career is a placeholder until its sprint series.
 * VerticalsNav reads tabs from here so no `/health`/`/career` href literals
 * live in the component (1e — keeps a future subdomain carve-out to one file).
 *
 * `dictKey` indexes the `verticals.*` dictionary namespace; `accent` is the
 * Tailwind sub-brand token group (wayfinding only — see §1.5). `services`
 * keeps the existing teal brand and takes no accent group.
 */
export type VerticalKey = "services" | "career" | "health";

export type VerticalTabConfig = {
  key: VerticalKey;
  /** route key when the vertical is live (flag on) */
  liveHref: "/" | typeof CAREER_ROUTES.home | typeof HEALTH_ROUTES.home;
  /** route key while still dark (flag off) — coming-soon placeholder */
  comingSoonHref:
    | "/"
    | typeof CAREER_ROUTES.comingSoon
    | typeof HEALTH_ROUTES.comingSoon;
  accent: "teal" | "brandHealth" | "brandCareer";
};

export const VERTICAL_TABS: readonly VerticalTabConfig[] = [
  {
    key: "services",
    liveHref: "/",
    comingSoonHref: "/",
    accent: "teal",
  },
  {
    key: "career",
    liveHref: CAREER_ROUTES.home,
    comingSoonHref: CAREER_ROUTES.comingSoon,
    accent: "brandCareer",
  },
  {
    key: "health",
    liveHref: HEALTH_ROUTES.home,
    comingSoonHref: HEALTH_ROUTES.comingSoon,
    accent: "brandHealth",
  },
] as const;
