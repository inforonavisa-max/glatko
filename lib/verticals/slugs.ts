import { routing } from "@/i18n/routing";

/**
 * Localized URL segments for the vertical surfaces, derived from the
 * i18n/routing.ts pathnames map so middleware guards can never drift from
 * the slugs next-intl actually serves (single source — same rationale as
 * buildAlternates in lib/seo.ts).
 */
function firstSegments(entry: string | Record<string, string>): Set<string> {
  const paths = typeof entry === "string" ? [entry] : Object.values(entry);
  return new Set(paths.map((p) => p.split("/")[1]));
}

export const HEALTH_FIRST_SEGMENTS = firstSegments(routing.pathnames["/health"]);

export const CAREER_FIRST_SEGMENTS = firstSegments(routing.pathnames["/career"]);

/**
 * Bare (locale-stripped) paths of the coming-soon page — the only health
 * route that stays reachable while HEALTH_VERTICAL_ENABLED=false (K2).
 */
export const HEALTH_COMING_SOON_BARE_PATHS: ReadonlySet<string> = new Set(
  Object.values(routing.pathnames["/health/coming-soon"]),
);

/**
 * Provider-side surface (H7) has no routes yet; the guard is registered
 * ahead of time so the prefix can never leak before launch.
 */
export const HEALTH_PRO_FIRST_SEGMENTS = new Set(["saglik-pro", "health-pro"]);
