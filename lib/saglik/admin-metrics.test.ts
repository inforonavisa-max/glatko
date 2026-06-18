import { describe, it, expect } from "vitest";
import {
  noShowRate,
  noShowPercent,
  isWithinLastDays,
  weeklyBookings,
  canDecide,
  canPublish,
  isValidTier,
  buildAuditRow,
  computeOccupancy,
  countSlots,
  occupancyPercent,
  maskPhone,
  HEALTH_ADMIN_AUDIT_ACTIONS,
  HEALTH_PROVIDER_TIERS,
} from "@/lib/saglik/admin-metrics";
import { generateAvailability } from "@/lib/saglik/availability";
import type { AvailabilityInputs } from "@/lib/saglik/availability";

// ─────────────────────────────────────────────────────────────────────────────
// noShowRate — div-by-zero + edges
// ─────────────────────────────────────────────────────────────────────────────
describe("noShowRate", () => {
  it("0 finished appointments → 0 (no NaN / Infinity)", () => {
    const r = noShowRate(0, 0);
    expect(r).toBe(0);
    expect(Number.isNaN(r)).toBe(false);
    expect(Number.isFinite(r)).toBe(true);
  });

  it("all completed, none no_show → 0", () => {
    expect(noShowRate(10, 0)).toBe(0);
  });

  it("1 no_show of 4 finished (3 completed + 1 no_show) → 0.25", () => {
    expect(noShowRate(3, 1)).toBe(0.25);
  });

  it("all no_show → 1 (capped)", () => {
    expect(noShowRate(0, 5)).toBe(1);
  });

  it("whole-percent rounding (1 of 3 → 33%)", () => {
    expect(noShowPercent(2, 1)).toBe(33);
  });

  it("negative inputs floored at 0 (never throws)", () => {
    expect(noShowRate(-3, -1)).toBe(0);
    expect(noShowRate(-1, 2)).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// weeklyBookings window math (UTC inclusive 7-day boundary)
// ─────────────────────────────────────────────────────────────────────────────
describe("weeklyBookings / isWithinLastDays", () => {
  const now = new Date("2026-06-17T12:00:00.000Z");

  it("includes the exact 7-day boundary instant (inclusive)", () => {
    const boundary = new Date("2026-06-10T12:00:00.000Z"); // now - 7d exactly
    expect(isWithinLastDays(boundary, now, 7)).toBe(true);
  });

  it("excludes one millisecond before the boundary", () => {
    const justBefore = new Date("2026-06-10T11:59:59.999Z");
    expect(isWithinLastDays(justBefore, now, 7)).toBe(false);
  });

  it("excludes future timestamps (> now)", () => {
    const future = new Date("2026-06-18T00:00:00.000Z");
    expect(isWithinLastDays(future, now, 7)).toBe(false);
  });

  it("counts only rows inside the window", () => {
    const rows = [
      "2026-06-17T00:00:00.000Z", // in
      "2026-06-11T00:00:00.000Z", // in
      "2026-06-10T12:00:00.000Z", // boundary in
      "2026-06-09T00:00:00.000Z", // out (before)
      "2026-07-01T00:00:00.000Z", // out (future)
    ];
    expect(weeklyBookings(rows, now, 7)).toBe(3);
  });

  it("malformed timestamp is ignored, never throws", () => {
    expect(isWithinLastDays("not-a-date", now)).toBe(false);
    expect(weeklyBookings(["garbage", "2026-06-17T00:00:00.000Z"], now)).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// occupancy reuse — two generateAvailability runs → computeOccupancy
// ─────────────────────────────────────────────────────────────────────────────
describe("occupancy reuse (admin card runs the same engine)", () => {
  const baseInputs: AvailabilityInputs = {
    serviceDurationMin: 30,
    settings: {
      bufferMin: 0,
      minNoticeMin: 0,
      horizonDays: 7,
      dailyCap: null,
      slotGridMin: 30,
    },
    // Monday 09:00–11:00 at one location → 4 slots of 30 min.
    schedules: [
      { weekday: 0, startTime: "09:00", endTime: "11:00", validFrom: null, validUntil: null },
    ],
    overrides: [],
    busy: [],
    holds: [],
  };

  // A Monday window in UTC (2026-06-15 is a Monday).
  const opts = {
    from: new Date("2026-06-15T00:00:00.000Z"),
    to: new Date("2026-06-16T00:00:00.000Z"),
    now: new Date("2026-06-15T00:00:00.000Z"),
    timeZone: "Europe/Podgorica",
  };

  it("capacity run (busy=[]) vs free run (one busy) → correct occupancy rate", () => {
    const capacityDays = generateAvailability({ ...baseInputs, busy: [] }, opts);
    const capacity = countSlots(capacityDays);
    expect(capacity).toBeGreaterThan(0);

    // Occupy the first slot.
    const firstSlot = capacityDays.flatMap((d) => d.slots)[0];
    const freeDays = generateAvailability(
      { ...baseInputs, busy: [{ start: firstSlot.startUtc, end: firstSlot.endUtc }] },
      opts,
    );
    const free = countSlots(freeDays);

    const occ = computeOccupancy(capacity, free, 1);
    expect(occ.total).toBe(capacity);
    expect(occ.booked).toBe(1);
    expect(occ.rate).toBeCloseTo(1 / capacity, 5);
    expect(occupancyPercent(occ)).toBe(Math.round((1 / capacity) * 100));
  });

  it("closed window (no schedule) → capacity 0 → rate 0, never NaN", () => {
    const closedDays = generateAvailability({ ...baseInputs, schedules: [] }, opts);
    const capacity = countSlots(closedDays);
    expect(capacity).toBe(0);
    const occ = computeOccupancy(capacity, 0, 0);
    expect(occ.rate).toBe(0);
    expect(Number.isNaN(occ.rate)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// decision-state guard — mirrors the 079 RPC
// ─────────────────────────────────────────────────────────────────────────────
describe("canDecide / canPublish (mirror 079 RPC)", () => {
  it("pending → approve allowed", () => {
    expect(canDecide("pending", "approve")).toEqual({ ok: true });
  });

  it("pending → reject allowed", () => {
    expect(canDecide("pending", "reject")).toEqual({ ok: true });
  });

  it("approved → approve/reject blocked (terminal)", () => {
    expect(canDecide("approved", "approve")).toEqual({ ok: false, reason: "INVALID_DECISION" });
    expect(canDecide("approved", "reject")).toEqual({ ok: false, reason: "INVALID_DECISION" });
  });

  it("rejected → blocked (terminal)", () => {
    expect(canDecide("rejected", "approve")).toEqual({ ok: false, reason: "INVALID_DECISION" });
  });

  it("re-publish only allowed on approved providers", () => {
    expect(canPublish("approved", true)).toEqual({ ok: true });
    expect(canPublish("pending", true)).toEqual({ ok: false, reason: "INVALID_DECISION" });
    // Unpublish (to=false) is always allowed regardless of status.
    expect(canPublish("pending", false)).toEqual({ ok: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// tier set validation (mirrors 079 in-RPC check)
// ─────────────────────────────────────────────────────────────────────────────
describe("isValidTier", () => {
  it("accepts the allowed set", () => {
    for (const t of HEALTH_PROVIDER_TIERS) expect(isValidTier(t)).toBe(true);
  });
  it("rejects anything outside the set", () => {
    expect(isValidTier("platinum")).toBe(false);
    expect(isValidTier("")).toBe(false);
    expect(isValidTier("FREE")).toBe(false); // case-sensitive (RPC lowercases before check)
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// audit-shape builder — EXACT action strings the RPC raises
// ─────────────────────────────────────────────────────────────────────────────
describe("buildAuditRow + action vocabulary", () => {
  it("action strings match the 079 RPC raises exactly", () => {
    expect(HEALTH_ADMIN_AUDIT_ACTIONS.approve).toBe("admin_provider_approve");
    expect(HEALTH_ADMIN_AUDIT_ACTIONS.reject).toBe("admin_provider_reject");
    expect(HEALTH_ADMIN_AUDIT_ACTIONS.unpublish).toBe("admin_provider_unpublish");
    expect(HEALTH_ADMIN_AUDIT_ACTIONS.publish).toBe("admin_provider_publish");
    expect(HEALTH_ADMIN_AUDIT_ACTIONS.setTier).toBe("admin_provider_set_tier");
  });

  it("returns the canonical {actor_id, action, target_table, target_id, payload} shape", () => {
    const row = buildAuditRow(
      "actor-1",
      HEALTH_ADMIN_AUDIT_ACTIONS.approve,
      "providers",
      "prov-1",
      { to: "approved" },
    );
    expect(row).toEqual({
      actor_id: "actor-1",
      action: "admin_provider_approve",
      target_table: "providers",
      target_id: "prov-1",
      payload: { to: "approved" },
    });
  });

  it("defaults payload to an empty object", () => {
    const row = buildAuditRow("a", HEALTH_ADMIN_AUDIT_ACTIONS.unpublish, "providers", "p");
    expect(row.payload).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// maskPhone reuse — '•••' + last 3, short/empty never throws
// ─────────────────────────────────────────────────────────────────────────────
describe("maskPhone reuse", () => {
  it("masks to bullets + last 3 digits", () => {
    expect(maskPhone("+38267123456")).toBe("•••456");
  });
  it("empty / null / short input never throws", () => {
    expect(maskPhone("")).toBe("•••");
    expect(maskPhone(null)).toBe("•••");
    expect(maskPhone(undefined)).toBe("•••");
    expect(maskPhone("12")).toBe("•••12");
  });
});
