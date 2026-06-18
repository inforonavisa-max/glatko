/**
 * Glatko Sağlık — H8 PURE admin-metric + decision helpers (no I/O, unit-testable).
 *
 * Four concerns live here so the admin pages + the 079 RPCs share ONE tested rule each:
 *   1. noShowRate(completed, noShow) — the dashboard no-show figure, div-by-zero guarded
 *      (0 finished appointments → 0, never NaN/Infinity). Whole-percent helper too.
 *   2. weeklyBookings is supplied raw by the RPC; we only re-export a window predicate
 *      helper (isWithinLastDays) so the UTC inclusive-7-day boundary used by the metric
 *      card and any client-side recomputation never drift.
 *   3. occupancy reuse — re-exports computeOccupancy/countSlots/occupancyPercent from
 *      lib/saglik/occupancy.ts so the admin occupancy card runs the SAME tested engine
 *      (two generateAvailability runs → capacity vs free) as the provider dashboard.
 *   4. decision-state guard canDecide() — mirrors the 079 health_admin_decide_provider
 *      RPC: ONLY verification_status='pending' may be approved/rejected; approved/rejected
 *      are terminal (the RPC raises INVALID_DECISION). Plus buildAuditRow() — the exact
 *      audit-row shape + action strings the RPC writes, so the (separate) glatko app-side
 *      audit trail and any client display use the identical action vocabulary.
 *
 * maskPhone is re-exported from occupancy.ts (single source) for the appointment view.
 *
 * No `server-only` marker, no DB, no React → directly testable under vitest.
 */

import {
  computeOccupancy,
  countSlots,
  occupancyPercent,
  maskPhone,
} from "@/lib/saglik/occupancy";

// Re-export the occupancy engine glue so the admin occupancy card has ONE import.
export { computeOccupancy, countSlots, occupancyPercent, maskPhone };
export type { Occupancy } from "@/lib/saglik/occupancy";

// ─────────────────────────────────────────────────────────────────────────────
// No-show rate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * No-show rate over FINISHED appointments (completed + no_show). 0..1.
 * Div-by-zero guarded: 0 finished → 0 (a clinic with no completed/no-show history is
 * "0% no-show", the only sane reading — never NaN/Infinity). Negative inputs floored at 0.
 */
export function noShowRate(completedCount: number, noShowCount: number): number {
  const completed = Math.max(0, Math.floor(completedCount));
  const noShow = Math.max(0, Math.floor(noShowCount));
  const finished = completed + noShow;
  if (finished === 0) return 0;
  return Math.min(1, noShow / finished);
}

/** Whole-percent no-show (0..100) for display. */
export function noShowPercent(completedCount: number, noShowCount: number): number {
  return Math.round(noShowRate(completedCount, noShowCount) * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Weekly-bookings window predicate (UTC, inclusive 7-day boundary)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether `at` falls within the last `days` (default 7) ending at `now`, inclusive of the
 * exact boundary instant (at >= now - days). Mirrors the 079 metrics RPC window
 * (created_at >= p_now - interval '7 days'). Both args are Date/ISO; computed in absolute
 * (UTC) time so DST / locale never shift the boundary. Future `at` (> now) is excluded.
 */
export function isWithinLastDays(
  at: Date | string,
  now: Date | string,
  days = 7,
): boolean {
  const atMs = typeof at === "string" ? Date.parse(at) : at.getTime();
  const nowMs = typeof now === "string" ? Date.parse(now) : now.getTime();
  if (Number.isNaN(atMs) || Number.isNaN(nowMs)) return false;
  const floorMs = nowMs - days * 86_400_000;
  return atMs >= floorMs && atMs <= nowMs;
}

/** Count rows whose timestamp is within the last `days` (UTC inclusive boundary). */
export function weeklyBookings(
  createdAts: Array<Date | string>,
  now: Date | string,
  days = 7,
): number {
  let n = 0;
  for (const ts of createdAts) if (isWithinLastDays(ts, now, days)) n += 1;
  return n;
}

// ─────────────────────────────────────────────────────────────────────────────
// Decision-state guard (mirrors 079 health_admin_decide_provider)
// ─────────────────────────────────────────────────────────────────────────────

export type ProviderVerificationStatus = "pending" | "approved" | "rejected";
export type ProviderDecision = "approve" | "reject";

export type DecisionGuard =
  | { ok: true }
  | { ok: false; reason: "INVALID_DECISION" };

/**
 * Whether a provider in `status` may receive `decision`. Mirrors the 079 RPC: ONLY
 * 'pending' is decidable; 'approved'/'rejected' are terminal → INVALID_DECISION. The RPC
 * is the authority (it re-checks under FOR UPDATE); this gates the UI so the admin never
 * sees enabled approve/reject buttons on an already-decided provider.
 */
export function canDecide(
  status: ProviderVerificationStatus,
  _decision: ProviderDecision,
): DecisionGuard {
  if (status === "pending") return { ok: true };
  return { ok: false, reason: "INVALID_DECISION" };
}

/** Re-publish guard: only an APPROVED provider may be (re)published (mirrors 079 set_published). */
export function canPublish(status: ProviderVerificationStatus, toPublished: boolean): DecisionGuard {
  if (toPublished && status !== "approved") return { ok: false, reason: "INVALID_DECISION" };
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier set (mirrors 079 health_admin_set_tier in-RPC validation)
// ─────────────────────────────────────────────────────────────────────────────

export const HEALTH_PROVIDER_TIERS = ["free", "premium", "business"] as const;
export type HealthProviderTier = (typeof HEALTH_PROVIDER_TIERS)[number];

export function isValidTier(tier: string): tier is HealthProviderTier {
  return (HEALTH_PROVIDER_TIERS as readonly string[]).includes(tier);
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit-row shape builder (the EXACT action strings the 079 RPC raises)
// ─────────────────────────────────────────────────────────────────────────────

/** The action strings the 079 admin RPCs write to health.audit_log. */
export const HEALTH_ADMIN_AUDIT_ACTIONS = {
  approve: "admin_provider_approve",
  reject: "admin_provider_reject",
  publish: "admin_provider_publish",
  unpublish: "admin_provider_unpublish",
  setTier: "admin_provider_set_tier",
} as const;

export type HealthAdminAuditAction =
  (typeof HEALTH_ADMIN_AUDIT_ACTIONS)[keyof typeof HEALTH_ADMIN_AUDIT_ACTIONS];

export type HealthAuditRow = {
  actor_id: string;
  action: HealthAdminAuditAction;
  target_table: "providers" | "appointments";
  target_id: string;
  payload: Record<string, unknown>;
};

/**
 * Build a health.audit_log row shape (for the SEPARATE app-side glatko trail / any client
 * display) using the EXACT action vocabulary the 079 definer writes. The canonical health
 * audit row is written INSIDE the RPC (in-tx); this helper only guarantees the app side
 * uses identical action strings so the two never drift.
 */
export function buildAuditRow(
  actorId: string,
  action: HealthAdminAuditAction,
  targetTable: "providers" | "appointments",
  targetId: string,
  payload: Record<string, unknown> = {},
): HealthAuditRow {
  return { actor_id: actorId, action, target_table: targetTable, target_id: targetId, payload };
}
