import { describe, it, expect } from "vitest";

import {
  computeOccupancy,
  occupancyPercent,
  countSlots,
  countCapacitySlots,
  canTransition,
  maskPhone,
} from "./occupancy";
import type { DaySlots, SlotInfo } from "./availability";

/** Minimal SlotInfo for count tests (only the shape matters, not the times). */
function slot(id: string): SlotInfo {
  return { startUtc: `2026-06-17T0${id.charCodeAt(0) % 9}:00:00.000Z`, endUtc: "", localTime: "" };
}

// ─────────────────────────────────────────────────────────────────────────────
// computeOccupancy — capacity vs free slot counts → rate/booked/free/total.
// ─────────────────────────────────────────────────────────────────────────────
describe("computeOccupancy", () => {
  it("0 confirmed → 0%", () => {
    const o = computeOccupancy(8, 8, 0);
    expect(o.booked).toBe(0);
    expect(o.total).toBe(8);
    expect(o.rate).toBe(0);
    expect(occupancyPercent(o)).toBe(0);
  });

  it("half booked → 50%", () => {
    const o = computeOccupancy(8, 4, 4);
    expect(o.rate).toBeCloseTo(0.5, 5);
    expect(occupancyPercent(o)).toBe(50);
  });

  it("fully booked day → 100%", () => {
    const o = computeOccupancy(6, 0, 6);
    expect(o.rate).toBe(1);
    expect(occupancyPercent(o)).toBe(100);
  });

  it("no working slots (div-by-zero) → rate 0, not NaN", () => {
    const o = computeOccupancy(0, 0, 0);
    expect(o.total).toBe(0);
    expect(o.rate).toBe(0);
    expect(Number.isNaN(o.rate)).toBe(false);
    expect(occupancyPercent(o)).toBe(0);
  });

  it("daily-cap-capped day: capacity already shrunk by cap, booked counts the booking", () => {
    // A day where the cap is 3 (capacity slots = 3) and 3 are booked → 100%, free 0.
    const o = computeOccupancy(3, 0, 3);
    expect(o.total).toBe(3);
    expect(o.booked).toBe(3);
    expect(o.rate).toBe(1);
  });

  it("never exceeds 100% even if confirmed > capacity (defensive clamp)", () => {
    // Overrides could remove working hours after a booking → booked > current capacity.
    const o = computeOccupancy(2, 0, 5);
    expect(o.rate).toBe(1);
    expect(occupancyPercent(o)).toBe(100);
  });

  it("clamps negative inputs to 0 (never produces negative figures)", () => {
    const o = computeOccupancy(-3, -1, -2);
    expect(o.total).toBe(0);
    expect(o.free).toBe(0);
    expect(o.booked).toBe(0);
    expect(o.rate).toBe(0);
  });
});

describe("countSlots", () => {
  it("sums slot counts across days", () => {
    const days: DaySlots[] = [
      { date: "2026-06-17", slots: [slot("a"), slot("b")] },
      { date: "2026-06-18", slots: [] },
      { date: "2026-06-19", slots: [slot("c")] },
    ];
    expect(countSlots(days)).toBe(3);
  });

  it("empty window → 0", () => {
    expect(countSlots([])).toBe(0);
  });
});

describe("countCapacitySlots", () => {
  const days: DaySlots[] = [
    { date: "2026-06-17", slots: [slot("a"), slot("b"), slot("c"), slot("d")] }, // 4
    { date: "2026-06-18", slots: [slot("e"), slot("f")] }, // 2
  ];

  it("dailyCap null → plain slot count (no clamp)", () => {
    expect(countCapacitySlots(days, null)).toBe(6);
  });

  it("clamps each day's grid count to the cap (cap=3 → 3 + 2 = 5)", () => {
    // The empty-busy capacity run never applies daily_cap, so without this clamp a fully
    // capped day would over-report capacity and drag occupancy below 100%.
    expect(countCapacitySlots(days, 3)).toBe(5);
  });

  it("cap larger than any day's grid → unchanged", () => {
    expect(countCapacitySlots(days, 10)).toBe(6);
  });

  it("cap 0 → capacity 0 (closed by cap)", () => {
    expect(countCapacitySlots(days, 0)).toBe(0);
  });

  it("a single fully-capped day reads 100% via computeOccupancy", () => {
    // Grid has 8 capacity slots, cap=3, all 3 booked → capacity clamps to 3, free 0,
    // booked 3 → 100% (was ~37% before the cap-aware denominator fix).
    const oneDay: DaySlots[] = [
      { date: "2026-06-17", slots: Array.from({ length: 8 }, (_, i) => slot(String.fromCharCode(97 + i))) },
    ];
    const capacity = countCapacitySlots(oneDay, 3);
    expect(capacity).toBe(3);
    const o = computeOccupancy(capacity, 0, 3);
    expect(occupancyPercent(o)).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// canTransition — provider status-action rule (mirrors the 078 RPC).
// ─────────────────────────────────────────────────────────────────────────────
describe("canTransition", () => {
  it("confirmed → completed/no_show/cancelled all allowed (non-idempotent)", () => {
    for (const to of ["completed", "no_show", "cancelled"] as const) {
      const r = canTransition("confirmed", to);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.idempotent).toBe(false);
    }
  });

  it("same-state is an idempotent no-op", () => {
    const r = canTransition("completed", "completed");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.idempotent).toBe(true);
  });

  it("cancelled → anything (else) rejected", () => {
    expect(canTransition("cancelled", "completed").ok).toBe(false);
    expect(canTransition("cancelled", "no_show").ok).toBe(false);
  });

  it("completed → cancelled rejected", () => {
    const r = canTransition("completed", "cancelled");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("INVALID_STATUS");
  });

  it("no_show → completed rejected", () => {
    expect(canTransition("no_show", "completed").ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// maskPhone — mirrors the SQL '•••' || right(phone,3) rule. Display-only.
// ─────────────────────────────────────────────────────────────────────────────
describe("maskPhone", () => {
  it("'+38267123456' → '•••456' (last 3)", () => {
    expect(maskPhone("+38267123456")).toBe("•••456");
  });

  it("honors a custom keep length", () => {
    expect(maskPhone("+38267123456", 2)).toBe("•••56");
    expect(maskPhone("+38267123456", 4)).toBe("•••3456");
  });

  it("NEVER returns the full number", () => {
    const masked = maskPhone("+38267123456");
    expect(masked).not.toContain("38267123");
    expect(masked.replace(/[•]/g, "").length).toBeLessThanOrEqual(3);
  });

  it("short / empty inputs never throw", () => {
    expect(maskPhone("12")).toBe("•••12");
    expect(maskPhone("")).toBe("•••");
    expect(maskPhone(null)).toBe("•••");
    expect(maskPhone(undefined)).toBe("•••");
  });

  it("keep=0 → only the bullets (full redaction)", () => {
    expect(maskPhone("+38267123456", 0)).toBe("•••");
  });
});
