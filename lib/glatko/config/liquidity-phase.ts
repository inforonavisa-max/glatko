/**
 * Liquidity gate phase — Master Plan v1.1, Cephe 4 (Content Volume).
 *
 * A service × city page is published (indexable) only when its category × city
 * combination clears the phase threshold; otherwise it stays a "coming soon"
 * noindex placeholder. The threshold is intentionally phased:
 *
 *   M0-M2 (now → +2 months): providers only        (>= providers)
 *   M3+   (+3 months):        providers AND bids     (>= providers AND >= bids)
 *
 * Moving to M3+ is a ONE-LINE change here (`LIQUIDITY_PHASE`). The bid criterion
 * is represented in the threshold type but stays INERT until the phase flips and
 * a later migration adds the bid-count RPC (table glatko_bids) — see
 * lib/glatko/liquidity.ts. This keeps M0-M2 strictly provider-based per v1.1.
 */
export type LiquidityPhase = "M0-M2" | "M3+";

export const LIQUIDITY_PHASE: LiquidityPhase = "M0-M2";

export const LIQUIDITY_THRESHOLDS: Record<
  LiquidityPhase,
  { providers: number; bids?: number }
> = {
  "M0-M2": { providers: 3 },
  "M3+": { providers: 3, bids: 5 },
};

/** Threshold for the currently active phase. */
export const ACTIVE_THRESHOLD = LIQUIDITY_THRESHOLDS[LIQUIDITY_PHASE];
