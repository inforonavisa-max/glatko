import {
  BedDouble,
  Briefcase,
  ChefHat,
  ConciergeBell,
  Drill,
  Hammer,
  HardHat,
  Paintbrush,
  Plug,
  Sparkles,
  UtensilsCrossed,
  Wine,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Career taxonomy slug → lucide icon (amber/brandCareer accent applied by the
 * caller). Slugs are the seed identifiers (migration 078: Construction +
 * Hospitality); anything unmapped falls back to a neutral default, so a new
 * sector/trade never breaks the UI. Only icons confirmed to exist in
 * lucide-react are referenced.
 */

/** Top-level sector slug → icon. */
const SECTOR_ICON_BY_SLUG: Record<string, LucideIcon> = {
  construction: HardHat,
  hospitality: ConciergeBell,
};

/** Per-trade slug → icon (the structured roles inside a sector). */
const TRADE_ICON_BY_SLUG: Record<string, LucideIcon> = {
  // Construction trades.
  mason: Hammer,
  welder: Zap,
  electrician: Plug,
  plumber: Wrench,
  painter: Paintbrush,
  carpenter: Drill,
  // Hospitality trades.
  waiter: ConciergeBell,
  housekeeper: BedDouble,
  cook: ChefHat,
  chef: ChefHat,
  bartender: Wine,
  cleaner: Sparkles,
};

/** Resolve a sector slug to its icon (defaults to UtensilsCrossed-free Briefcase). */
export function sectorIcon(slug: string): LucideIcon {
  return SECTOR_ICON_BY_SLUG[slug] ?? Briefcase;
}

/** Resolve a trade/role slug to its icon (defaults to Briefcase). */
export function tradeIcon(slug: string): LucideIcon {
  return TRADE_ICON_BY_SLUG[slug] ?? Briefcase;
}

// UtensilsCrossed is the alternate hospitality glyph kept available for callers
// that prefer it over ConciergeBell (per plan PART 2 sector tiles).
export { UtensilsCrossed };
