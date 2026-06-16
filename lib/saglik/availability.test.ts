import { describe, it, expect } from "vitest";
import {
  generateAvailability,
  flattenNextSlots,
  firstDayWithSlots,
  type AvailabilityInputs,
  type AvailabilityScheduleRow,
} from "./availability";

const TZ = "Europe/Podgorica";

const DEFAULT_SETTINGS = {
  bufferMin: 0,
  minNoticeMin: 0,
  horizonDays: 365,
  dailyCap: null as number | null,
  slotGridMin: 15,
};

/** Schedule for all 7 weekdays (so any test date matches without weekday fuss). */
function everyDay(startTime: string, endTime: string): AvailabilityScheduleRow[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    startTime,
    endTime,
    validFrom: null,
    validUntil: null,
  }));
}

function mkInputs(p: Partial<AvailabilityInputs>): AvailabilityInputs {
  return {
    serviceDurationMin: p.serviceDurationMin ?? 30,
    settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
    schedules: p.schedules ?? everyDay("09:00:00", "17:00:00"),
    overrides: p.overrides ?? [],
    busy: p.busy ?? [],
    holds: p.holds ?? [],
  };
}

/** Single local-day window (winter +1h → both bounds map to the same local date). */
function oneDay(date: string): { from: Date; to: Date } {
  return { from: new Date(`${date}T00:00:00Z`), to: new Date(`${date}T12:00:00Z`) };
}

function localTimes(days: ReturnType<typeof generateAvailability>): string[] {
  return days.flatMap((d) => d.slots.map((s) => s.localTime));
}

describe("generateAvailability — normal day", () => {
  it("produces the correct count on a grid (duration fits within working hours)", () => {
    // 09:00–17:00, 30-min service, 15-min grid → starts 09:00…16:30 = 31 slots.
    const days = generateAvailability(mkInputs({}), {
      ...oneDay("2026-01-05"),
      now: new Date("2026-01-01T00:00:00Z"),
      timeZone: TZ,
    });
    expect(days).toHaveLength(1);
    const t = localTimes(days);
    expect(t).toHaveLength(31);
    expect(t[0]).toBe("09:00");
    expect(t[t.length - 1]).toBe("16:30");
    // 2026-01-05 is winter (CET, +1) → 09:00 local = 08:00 UTC.
    expect(days[0].slots[0].startUtc).toBe("2026-01-05T08:00:00.000Z");
    expect(days[0].slots[0].endUtc).toBe("2026-01-05T08:30:00.000Z");
  });

  it("respects slot_grid_min (30-min grid halves the candidate starts)", () => {
    const days = generateAvailability(
      mkInputs({ settings: { ...DEFAULT_SETTINGS, slotGridMin: 30 } }),
      { ...oneDay("2026-01-05"), now: new Date("2026-01-01T00:00:00Z"), timeZone: TZ },
    );
    const t = localTimes(days);
    expect(t).toEqual([
      "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
      "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
    ]);
  });
});

describe("generateAvailability — DST transitions", () => {
  it("DST spring-forward: the non-existent wall hour (02:00–02:59) is skipped", () => {
    // 2026-03-29 01:00 UTC: clocks jump 02:00 → 03:00 local. Schedule 01:00–05:00.
    const days = generateAvailability(
      mkInputs({ schedules: everyDay("01:00:00", "05:00:00"), settings: { ...DEFAULT_SETTINGS, slotGridMin: 30 } }),
      {
        from: new Date("2026-03-29T00:00:00Z"),
        to: new Date("2026-03-29T12:00:00Z"),
        now: new Date("2026-03-01T00:00:00Z"),
        timeZone: TZ,
      },
    );
    const t = localTimes(days);
    expect(t).not.toContain("02:00");
    expect(t).not.toContain("02:30");
    expect(t).toContain("01:30");
    expect(t).toContain("03:00");
    expect(t).toEqual(["01:00", "01:30", "03:00", "03:30", "04:00", "04:30"]);

    // Real elapsed time between 01:30 (CET) and 03:00 (CEST) is one grid step (30 min)
    // — proof the missing hour was skipped, not merely relabelled.
    const get = (lt: string) => days[0].slots.find((s) => s.localTime === lt)!;
    const gapMs = Date.parse(get("03:00").startUtc) - Date.parse(get("01:30").startUtc);
    expect(gapMs).toBe(30 * 60_000);
  });

  it("DST fall-back: the repeated wall hour is counted once (not doubled)", () => {
    // 2026-10-25 01:00 UTC: clocks fall 03:00 → 02:00 local. Schedule 01:00–05:00.
    const days = generateAvailability(
      mkInputs({ schedules: everyDay("01:00:00", "05:00:00"), settings: { ...DEFAULT_SETTINGS, slotGridMin: 30 } }),
      {
        from: new Date("2026-10-25T00:00:00Z"),
        to: new Date("2026-10-25T12:00:00Z"),
        now: new Date("2026-10-01T00:00:00Z"),
        timeZone: TZ,
      },
    );
    const t = localTimes(days);
    expect(t).toHaveLength(8);
    expect(t).toEqual(["01:00", "01:30", "02:00", "02:30", "03:00", "03:30", "04:00", "04:30"]);
    expect(t.filter((x) => x === "02:00")).toHaveLength(1); // not doubled

    const instants = days[0].slots.map((s) => Date.parse(s.startUtc));
    for (let i = 1; i < instants.length; i++) {
      expect(instants[i]).toBeGreaterThan(instants[i - 1]); // strictly increasing
    }
    // The extra (repeated) hour shows as a 90-min real gap between 01:30 (CEST) and
    // 02:00 (CET) — the fall-back hour really happened, but only one wall label is offered.
    const get = (lt: string) => days[0].slots.find((s) => s.localTime === lt)!;
    const gapMs = Date.parse(get("02:00").startUtc) - Date.parse(get("01:30").startUtc);
    expect(gapMs).toBe(90 * 60_000);
  });
});

describe("generateAvailability — boundaries & overrides", () => {
  it("midnight boundary: no slot overflows past the working-interval end", () => {
    const days = generateAvailability(
      mkInputs({ schedules: everyDay("23:00:00", "23:59:59") }),
      { ...oneDay("2026-01-05"), now: new Date("2026-01-01T00:00:00Z"), timeZone: TZ },
    );
    const t = localTimes(days);
    expect(t).toEqual(["23:00", "23:15"]); // 23:30 would end 24:00 → dropped
    // Last slot ends 23:45 local, still on the same calendar day.
    expect(days[0].slots[1].endUtc).toBe("2026-01-05T22:45:00.000Z"); // 23:45 CET
  });

  it("break override splits the day (no slots inside the break)", () => {
    const days = generateAvailability(
      mkInputs({
        settings: { ...DEFAULT_SETTINGS, slotGridMin: 60 },
        overrides: [{ date: "2026-01-05", startTime: "12:00:00", endTime: "13:00:00", kind: "break" }],
      }),
      { ...oneDay("2026-01-05"), now: new Date("2026-01-01T00:00:00Z"), timeZone: TZ },
    );
    const t = localTimes(days);
    expect(t).toEqual(["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"]);
    expect(t).not.toContain("12:00");
  });

  it("holiday override: no slots that day", () => {
    const days = generateAvailability(
      mkInputs({ overrides: [{ date: "2026-01-05", startTime: null, endTime: null, kind: "holiday" }] }),
      { ...oneDay("2026-01-05"), now: new Date("2026-01-01T00:00:00Z"), timeZone: TZ },
    );
    expect(days).toHaveLength(1);
    expect(days[0].slots).toHaveLength(0);
  });

  it("extra override: adds working time where no schedule exists", () => {
    const days = generateAvailability(
      mkInputs({
        schedules: [], // no recurring schedule at all
        settings: { ...DEFAULT_SETTINGS, slotGridMin: 30 },
        overrides: [{ date: "2026-01-05", startTime: "14:00:00", endTime: "16:00:00", kind: "extra" }],
      }),
      { ...oneDay("2026-01-05"), now: new Date("2026-01-01T00:00:00Z"), timeZone: TZ },
    );
    expect(localTimes(days)).toEqual(["14:00", "14:30", "15:00", "15:30"]);
  });
});

describe("generateAvailability — conflicts (busy / holds / buffer)", () => {
  it("confirmed appointment overlap removes the taken slot", () => {
    const days = generateAvailability(
      mkInputs({
        settings: { ...DEFAULT_SETTINGS, slotGridMin: 30 },
        busy: [{ start: "2026-01-05T09:00:00.000Z", end: "2026-01-05T09:30:00.000Z" }], // 10:00–10:30 CET
      }),
      { ...oneDay("2026-01-05"), now: new Date("2026-01-01T00:00:00Z"), timeZone: TZ },
    );
    const t = localTimes(days);
    expect(t).not.toContain("10:00");
    expect(t).toContain("09:30"); // ends exactly at 10:00 (half-open) → allowed
    expect(t).toContain("10:30");
  });

  it("active slot_hold overlap removes the held slot", () => {
    const days = generateAvailability(
      mkInputs({
        settings: { ...DEFAULT_SETTINGS, slotGridMin: 30 },
        holds: [{ start: "2026-01-05T10:00:00.000Z", end: "2026-01-05T10:30:00.000Z" }], // 11:00–11:30 CET
      }),
      { ...oneDay("2026-01-05"), now: new Date("2026-01-01T00:00:00Z"), timeZone: TZ },
    );
    const t = localTimes(days);
    expect(t).not.toContain("11:00");
    expect(t).toContain("10:30");
    expect(t).toContain("11:30");
  });

  it("buffer enforces a gap on both sides of a confirmed appointment", () => {
    // confirmed 10:00–10:30 CET (09:00–09:30Z); buffer 15 → blocked 09:45–10:45 local.
    const days = generateAvailability(
      mkInputs({
        settings: { ...DEFAULT_SETTINGS, slotGridMin: 15, bufferMin: 15 },
        busy: [{ start: "2026-01-05T09:00:00.000Z", end: "2026-01-05T09:30:00.000Z" }],
      }),
      { ...oneDay("2026-01-05"), now: new Date("2026-01-01T00:00:00Z"), timeZone: TZ },
    );
    const t = localTimes(days);
    expect(t).toContain("09:15"); // ends 09:45 → 15-min gap before 10:00 ✓
    expect(t).not.toContain("09:30"); // ends 10:00, < 15-min gap → blocked
    expect(t).not.toContain("10:00");
    expect(t).not.toContain("10:30"); // < 15-min gap after 10:30 → blocked
    expect(t).toContain("10:45"); // 15-min gap after → allowed
  });
});

describe("generateAvailability — policy windows (notice / horizon / cap)", () => {
  it("min_notice removes slots too soon from now", () => {
    // now = 2026-01-05 09:00 CET (08:00Z); minNotice 120 → earliest 11:00 local.
    const days = generateAvailability(
      mkInputs({ settings: { ...DEFAULT_SETTINGS, slotGridMin: 60, minNoticeMin: 120 } }),
      { ...oneDay("2026-01-05"), now: new Date("2026-01-05T08:00:00Z"), timeZone: TZ },
    );
    const t = localTimes(days);
    expect(t).not.toContain("09:00");
    expect(t).not.toContain("10:00");
    expect(t[0]).toBe("11:00");
  });

  it("horizon_days removes slots too far in the future", () => {
    const days = generateAvailability(
      mkInputs({ settings: { ...DEFAULT_SETTINGS, slotGridMin: 240, horizonDays: 2 } }),
      {
        from: new Date("2026-01-05T00:00:00Z"),
        to: new Date("2026-01-12T20:00:00Z"),
        now: new Date("2026-01-05T00:00:00Z"),
        timeZone: TZ,
      },
    );
    const withSlots = days.filter((d) => d.slots.length > 0).map((d) => d.date);
    expect(withSlots).toContain("2026-01-06");
    expect(withSlots).not.toContain("2026-01-09"); // beyond now + 2 days
  });

  it("daily_cap: a day whose confirmed count reached the cap offers no slots", () => {
    const busy = [
      { start: "2026-01-05T08:00:00.000Z", end: "2026-01-05T08:30:00.000Z" }, // 09:00 CET
      { start: "2026-01-05T09:00:00.000Z", end: "2026-01-05T09:30:00.000Z" }, // 10:00 CET
    ];
    const capped = generateAvailability(
      mkInputs({ settings: { ...DEFAULT_SETTINGS, dailyCap: 2 }, busy }),
      { ...oneDay("2026-01-05"), now: new Date("2026-01-01T00:00:00Z"), timeZone: TZ },
    );
    expect(capped[0].slots).toHaveLength(0); // 2 confirmed == cap 2 → day full

    const notCapped = generateAvailability(
      mkInputs({ settings: { ...DEFAULT_SETTINGS, dailyCap: 5 }, busy }),
      { ...oneDay("2026-01-05"), now: new Date("2026-01-01T00:00:00Z"), timeZone: TZ },
    );
    expect(notCapped[0].slots.length).toBeGreaterThan(0); // under cap → slots remain
    expect(localTimes(notCapped)).not.toContain("09:00"); // but the 2 booked times are gone
    expect(localTimes(notCapped)).not.toContain("10:00");
  });
});

describe("generateAvailability — schedule selection", () => {
  it("weekday convention is 0=Monday (DB), not 0=Sunday (JS)", () => {
    const monOnly: AvailabilityScheduleRow[] = [
      { weekday: 0, startTime: "09:00:00", endTime: "12:00:00", validFrom: null, validUntil: null },
    ];
    // 2026-01-05 is a Monday; 2026-01-06 is a Tuesday.
    const mon = generateAvailability(mkInputs({ schedules: monOnly }), {
      ...oneDay("2026-01-05"),
      now: new Date("2026-01-01T00:00:00Z"),
      timeZone: TZ,
    });
    const tue = generateAvailability(mkInputs({ schedules: monOnly }), {
      ...oneDay("2026-01-06"),
      now: new Date("2026-01-01T00:00:00Z"),
      timeZone: TZ,
    });
    expect(mon[0].slots.length).toBeGreaterThan(0);
    expect(tue[0].slots).toHaveLength(0);
  });

  it("valid_from / valid_until bound the schedule to a date window", () => {
    const bounded = everyDay("09:00:00", "12:00:00").map((s) => ({
      ...s,
      validFrom: "2026-01-10",
      validUntil: "2026-01-20",
    }));
    const before = generateAvailability(mkInputs({ schedules: bounded }), {
      ...oneDay("2026-01-05"),
      now: new Date("2026-01-01T00:00:00Z"),
      timeZone: TZ,
    });
    const inside = generateAvailability(mkInputs({ schedules: bounded }), {
      ...oneDay("2026-01-15"),
      now: new Date("2026-01-01T00:00:00Z"),
      timeZone: TZ,
    });
    const after = generateAvailability(mkInputs({ schedules: bounded }), {
      ...oneDay("2026-01-25"),
      now: new Date("2026-01-01T00:00:00Z"),
      timeZone: TZ,
    });
    expect(before[0].slots).toHaveLength(0);
    expect(inside[0].slots.length).toBeGreaterThan(0);
    expect(after[0].slots).toHaveLength(0);
  });

  it("no schedule → every queried day is empty (not an error)", () => {
    const days = generateAvailability(mkInputs({ schedules: [] }), {
      from: new Date("2026-01-05T00:00:00Z"),
      to: new Date("2026-01-07T20:00:00Z"),
      now: new Date("2026-01-01T00:00:00Z"),
      timeZone: TZ,
    });
    expect(days).toHaveLength(3);
    expect(days.every((d) => d.slots.length === 0)).toBe(true);
  });
});

describe("helpers", () => {
  it("flattenNextSlots returns the first N slots across days; firstDayWithSlots finds the first non-empty day", () => {
    const days = generateAvailability(
      mkInputs({
        settings: { ...DEFAULT_SETTINGS, slotGridMin: 240 },
        overrides: [{ date: "2026-01-05", startTime: null, endTime: null, kind: "holiday" }],
      }),
      {
        from: new Date("2026-01-05T00:00:00Z"),
        to: new Date("2026-01-07T20:00:00Z"),
        now: new Date("2026-01-01T00:00:00Z"),
        timeZone: TZ,
      },
    );
    const next3 = flattenNextSlots(days, 3);
    expect(next3).toHaveLength(3);
    expect(next3[0].date).toBe("2026-01-06"); // 01-05 is a holiday → skipped
    const first = firstDayWithSlots(days);
    expect(first?.date).toBe("2026-01-06");
  });
});
