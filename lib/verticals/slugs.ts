import { routing } from "@/i18n/routing";
import { HEALTH_ROUTES } from "@/lib/saglik/config";

/**
 * Localized URL segments for the vertical surfaces, derived from the
 * i18n/routing.ts pathnames map so middleware guards can never drift from
 * the slugs next-intl actually serves (single source — same rationale as
 * buildAlternates in lib/seo.ts). Route KEYS come from lib/saglik/config so
 * the health module owns its own paths (carve-out: EXTRACTION.md).
 */
function firstSegments(entry: string | Record<string, string>): Set<string> {
  const paths = typeof entry === "string" ? [entry] : Object.values(entry);
  return new Set(paths.map((p) => p.split("/")[1]));
}

export const HEALTH_FIRST_SEGMENTS = firstSegments(
  routing.pathnames[HEALTH_ROUTES.home],
);

export const CAREER_FIRST_SEGMENTS = firstSegments(routing.pathnames["/career"]);

/**
 * Bare (locale-stripped) paths of the coming-soon page — the only health
 * route that stays reachable while HEALTH_VERTICAL_ENABLED=false (K2).
 */
export const HEALTH_COMING_SOON_BARE_PATHS: ReadonlySet<string> = new Set(
  Object.values(routing.pathnames[HEALTH_ROUTES.comingSoon]),
);

/**
 * Bare (locale-stripped) paths of the career coming-soon page — the only
 * career route that stays reachable while CAREER_VERTICAL_ENABLED=false (C0).
 * Mirrors HEALTH_COMING_SOON_BARE_PATHS; the middleware career flag-guard
 * carves these out of the 404 rewrite so the placeholder stays live.
 */
export const CAREER_COMING_SOON_BARE_PATHS: ReadonlySet<string> = new Set(
  Object.values(routing.pathnames["/career/coming-soon"]),
);

/**
 * Provider-side surface (H7a — doctor onboarding/profile/calendar). Derived from
 * the i18n/routing.ts pathnames map (same single-source rationale as
 * HEALTH_FIRST_SEGMENTS) so the middleware flag guard covers ALL 9 localized
 * provider-tree prefixes (saglik-pro / health-pro / gesundheit-pro / salute-pro /
 * zdorove-pro / zdorovya-pro / zdravlje-pro / al-sihha-pro), not just tr/en. The
 * bare top segment is what 404s while HEALTH_VERTICAL_ENABLED=false.
 */
export const HEALTH_PRO_FIRST_SEGMENTS = firstSegments(
  routing.pathnames["/health-pro/basvuru"],
);
