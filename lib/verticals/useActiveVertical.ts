"use client";

import { usePathname } from "@/i18n/navigation";
import {
  HEALTH_FIRST_SEGMENTS,
  CAREER_FIRST_SEGMENTS,
} from "@/lib/verticals/slugs";
import type { VerticalKey } from "@/lib/verticals/config";

/**
 * Which vertical the current route belongs to, derived from the first path
 * segment matched against the localized slug sets (all 9 locales: /saglik,
 * /health, /zdravlje, …). Works whether usePathname returns the internal or
 * the localized form. Anything not health/career → services (default).
 *
 * Single source for both KATMAN 1 (VerticalsNav active indicator) and KATMAN 2
 * (the per-vertical header — currently shared, but the header reads this so its
 * content can branch per vertical later without more plumbing).
 */
export function useActiveVertical(): VerticalKey {
  const pathname = usePathname();
  const firstSegment = (pathname ?? "/").split("/").filter(Boolean)[0] ?? "";
  if (HEALTH_FIRST_SEGMENTS.has(firstSegment)) return "health";
  if (CAREER_FIRST_SEGMENTS.has(firstSegment)) return "career";
  return "services";
}
