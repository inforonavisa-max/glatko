/**
 * Glatko Sağlık — H7b PURE provider-ops helpers (no I/O, unit-testable).
 *
 * Three concerns live here so the dashboard/list pages + the SQL RPCs share ONE
 * tested rule each:
 *   1. computeOccupancy — the booked/free/total/rate figures for a window. The
 *      caller runs the SAME pure generateAvailability() engine TWICE (once with the
 *      real busy[] → free slots, once with busy=[] → capacity slots) so the % matches
 *      exactly what patients can book (buffer/min-notice/grid/daily-cap/overrides honored
 *      identically). This function just turns those two slot counts + the confirmed count
 *      into the dashboard numbers, guarding div-by-zero.
 *   2. canTransition — the appointment status-transition rule (mirrors the 078
 *      health_provider_set_appointment_status RPC): only 'confirmed' may move to
 *      completed/no_show/cancelled; same-state is an idempotent no-op; terminal states
 *      are frozen.
 *   3. maskPhone — the TS mirror of the in-RPC SQL mask ('•••' || right(phone,3)). It
 *      exists ONLY to (a) unit-test the rule and (b) format/display an ALREADY-masked
 *      value on the client. It must NEVER receive real cleartext — the RPC masks PII in
 *      SQL before it ever leaves the security-definer (RLS §2.2 'ad + maskeli tel').
 *
 * No `server-only` marker, no DB, no React → directly testable under vitest.
 */

import type { DaySlots } from "@/lib/saglik/availability";

export type AppointmentStatus = "confirmed" | "cancelled" | "completed" | "no_show";

/** The provider-driven status actions (what 078 set_appointment_status accepts). */
export const PROVIDER_STATUS_ACTIONS = ["completed", "no_show", "cancelled"] as const;
export type ProviderStatusAction = (typeof PROVIDER_STATUS_ACTIONS)[number];

export type Occupancy = {
  /** Confirmed appointments booked in the window (from busy[]). */
  booked: number;
  /** Still-bookable free slots (real-busy engine run). */
  free: number;
  /** Total bookable capacity (empty-busy engine run). */
  total: number;
  /** booked / capacity, 0..1. Capacity 0 (closed / no working slots) → 0, never NaN. */
  rate: number;
};

/** Count the slots across a DaySlots[] window (engine output). */
export function countSlots(days: DaySlots[]): number {
  let n = 0;
  for (const d of days) n += d.slots.length;
  return n;
}

/**
 * Cap-aware capacity count for a DaySlots[] window. The capacity run feeds the engine
 * busy=[]/holds=[] so daily_cap NEVER shrinks it (confirmedPerDay is built from busy[]
 * only). We therefore clamp each day's grid count to `dailyCap` HERE so a configured cap
 * bounds the denominator the same way it bounds the free run — otherwise a fully-capped
 * day reads far below 100% (e.g. booked=cap against the full ungated grid). dailyCap=null
 * (no cap) → plain slot count.
 */
export function countCapacitySlots(days: DaySlots[], dailyCap: number | null): number {
  if (dailyCap == null) return countSlots(days);
  const cap = Math.max(0, dailyCap);
  let n = 0;
  for (const d of days) n += Math.min(d.slots.length, cap);
  return n;
}

/**
 * Occupancy from the two engine runs + the confirmed count. capacity = free + booked
 * is NOT used (a booked slot no longer appears as free, and the empty-busy run already
 * yields the true capacity incl. the slots the bookings occupy) — we take capacity from
 * the empty-busy run directly. daily_cap can NOT shrink the empty-busy run (the engine
 * derives its per-day cap from busy[], which is empty there), so the caller passes a
 * cap-aware capacity via countCapacitySlots() — overrides shrink both runs natively.
 *
 * rate = booked / total. When total is 0 (provider closed that window, or daily-cap
 * already 0) the rate is 0 (not NaN, not Infinity) — a closed day is "0% busy", which is
 * the only sane dashboard reading.
 */
export function computeOccupancy(
  capacitySlotCount: number,
  freeSlotCount: number,
  confirmedCount: number,
): Occupancy {
  const total = Math.max(0, capacitySlotCount);
  const free = Math.max(0, freeSlotCount);
  const booked = Math.max(0, confirmedCount);
  const rate = total > 0 ? Math.min(1, booked / total) : 0;
  return { booked, free, total, rate };
}

/** Whole-percent occupancy (0..100) for display. */
export function occupancyPercent(o: Occupancy): number {
  return Math.round(o.rate * 100);
}

export type TransitionResult =
  | { ok: true; idempotent: boolean }
  | { ok: false; reason: "INVALID_STATUS" };

/**
 * Whether an appointment in `from` may move to `to` (a provider action). Mirrors the
 * 078 RPC: confirmed→completed/no_show/cancelled allowed; from==to is an idempotent
 * no-op (ok:true, idempotent:true); every other transition (terminal→anything, or a
 * non-action target) is rejected. Pure — the RPC is the authority, this gates the UI.
 */
export function canTransition(from: AppointmentStatus, to: ProviderStatusAction): TransitionResult {
  if (from === to) return { ok: true, idempotent: true };
  if (from === "confirmed") return { ok: true, idempotent: false };
  return { ok: false, reason: "INVALID_STATUS" };
}

/**
 * Mask an E.164 phone to its last `keep` (default 3) digits, redacting the rest with a
 * bullet prefix — the EXACT mirror of the SQL `'•••' || right(<phone>, N)` rule used
 * inside the 078 list/dashboard RPCs. Short/empty inputs never throw (they return the
 * bullets + whatever tail exists). Display-only: it must never be fed real cleartext on
 * the client — the RPC has already masked before the value leaves the database.
 */
export function maskPhone(value: string | null | undefined, keep = 3): string {
  const v = (value ?? "").trim();
  const tail = keep > 0 ? v.slice(-keep) : "";
  return `•••${tail}`;
}
