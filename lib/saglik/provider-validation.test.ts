import { describe, it, expect } from "vitest";

import {
  profileSchema,
  licenseSchema,
  locationSchema,
  serviceSchema,
  scheduleSetSchema,
  scheduleRowSchema,
  settingsSchema,
  slugify,
  slugWithSuffix,
  normalizeLanguages,
  resolveCity,
  hasWeekdayOverlap,
  buildLicensePath,
} from "./provider-validation";

describe("profileSchema", () => {
  it("rejects empty full_name", () => {
    const r = profileSchema.safeParse({ providerType: "doctor", fullName: "" });
    expect(r.success).toBe(false);
  });

  it("rejects invalid provider_type", () => {
    const r = profileSchema.safeParse({ providerType: "surgeon", fullName: "Dr A" });
    expect(r.success).toBe(false);
  });

  it("accepts the five valid provider types", () => {
    for (const pt of ["doctor", "dentist", "psychologist", "physio", "other"] as const) {
      const r = profileSchema.safeParse({ providerType: pt, fullName: "Dr A" });
      expect(r.success).toBe(true);
    }
  });

  it("rejects bio with a non-locale key", () => {
    const r = profileSchema.safeParse({
      providerType: "doctor",
      fullName: "Dr A",
      bio: { en: "ok", xx: "bad" },
    });
    expect(r.success).toBe(false);
  });

  it("accepts per-locale bio", () => {
    const r = profileSchema.safeParse({
      providerType: "doctor",
      fullName: "Dr A",
      bio: { en: "hello", sr: "zdravo" },
    });
    expect(r.success).toBe(true);
  });

  it("lowercases + dedupes languages", () => {
    const r = profileSchema.parse({
      providerType: "doctor",
      fullName: "Dr A",
      languages: ["EN", "en", " Sr ", "ru", "RU"],
    });
    expect(r.languages).toEqual(["en", "sr", "ru"]);
  });
});

describe("normalizeLanguages", () => {
  it("drops blanks, lowercases, dedupes preserving order", () => {
    expect(normalizeLanguages([" De ", "de", "", "IT"])).toEqual(["de", "it"]);
  });
  it("handles null/undefined", () => {
    expect(normalizeLanguages(null)).toEqual([]);
    expect(normalizeLanguages(undefined)).toEqual([]);
  });
});

describe("locationSchema", () => {
  it("rejects a city that is not a Montenegro municipality", () => {
    const r = locationSchema.safeParse({
      label: "Clinic",
      address: "Main St 1",
      city: "Belgrade",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a GLATKO_CITIES key and derives lat/lng from the seat", () => {
    const r = locationSchema.parse({
      label: "Clinic",
      address: "Main St 1",
      city: "podgorica",
    });
    expect(r.city).toBe("Podgorica");
    expect(typeof r.lat).toBe("number");
    expect(typeof r.lng).toBe("number");
    expect(r.lat).toBeCloseTo(42.4304, 2);
  });

  it("accepts the official city name too", () => {
    const r = locationSchema.parse({
      label: "Clinic",
      address: "Main St 1",
      city: "Kotor",
    });
    expect(r.city).toBe("Kotor");
  });

  it("rejects lat/lng outside Montenegro bounds", () => {
    const r = locationSchema.safeParse({
      label: "Clinic",
      address: "Main St 1",
      city: "Podgorica",
      lat: 10,
      lng: 10,
    });
    expect(r.success).toBe(false);
  });

  it("keeps provided in-bounds lat/lng", () => {
    const r = locationSchema.parse({
      label: "Clinic",
      address: "Main St 1",
      city: "Podgorica",
      lat: 42.44,
      lng: 19.26,
    });
    expect(r.lat).toBe(42.44);
    expect(r.lng).toBe(19.26);
  });
});

describe("resolveCity", () => {
  it("resolves by key", () => {
    expect(resolveCity("budva")?.name).toBe("Budva");
  });
  it("resolves by name", () => {
    expect(resolveCity("Tivat")?.name).toBe("Tivat");
  });
  it("returns null for unknown", () => {
    expect(resolveCity("Atlantis")).toBeNull();
  });
});

describe("serviceSchema", () => {
  const base = { name: { en: "Checkup" }, mode: "in_person" as const };

  it("rejects duration_min 4 (below 5)", () => {
    expect(serviceSchema.safeParse({ ...base, durationMin: 4 }).success).toBe(false);
  });
  it("accepts 5", () => {
    expect(serviceSchema.safeParse({ ...base, durationMin: 5 }).success).toBe(true);
  });
  it("accepts 240", () => {
    expect(serviceSchema.safeParse({ ...base, durationMin: 240 }).success).toBe(true);
  });
  it("rejects 241", () => {
    expect(serviceSchema.safeParse({ ...base, durationMin: 241 }).success).toBe(false);
  });
  it("rejects negative price", () => {
    expect(serviceSchema.safeParse({ ...base, durationMin: 30, priceEur: -1 }).success).toBe(false);
  });
  it("allows omitted price", () => {
    expect(serviceSchema.safeParse({ ...base, durationMin: 30 }).success).toBe(true);
  });
  it("exhaustively accepts every mode + rejects junk", () => {
    for (const mode of ["in_person", "video", "home_visit"] as const) {
      expect(serviceSchema.safeParse({ name: { en: "X" }, durationMin: 30, mode }).success).toBe(true);
    }
    expect(serviceSchema.safeParse({ name: { en: "X" }, durationMin: 30, mode: "telepathy" }).success).toBe(false);
  });
  it("rejects empty name object", () => {
    expect(serviceSchema.safeParse({ name: {}, durationMin: 30, mode: "video" }).success).toBe(false);
  });
});

describe("scheduleRowSchema", () => {
  it("rejects weekday 7", () => {
    expect(scheduleRowSchema.safeParse({ weekday: 7, startTime: "09:00", endTime: "10:00" }).success).toBe(false);
  });
  it("accepts weekday 0..6", () => {
    for (let wd = 0; wd <= 6; wd++) {
      expect(scheduleRowSchema.safeParse({ weekday: wd, startTime: "09:00", endTime: "10:00" }).success).toBe(true);
    }
  });
  it("rejects start >= end", () => {
    expect(scheduleRowSchema.safeParse({ weekday: 0, startTime: "10:00", endTime: "09:00" }).success).toBe(false);
    expect(scheduleRowSchema.safeParse({ weekday: 0, startTime: "10:00", endTime: "10:00" }).success).toBe(false);
  });
  it("rejects malformed time", () => {
    expect(scheduleRowSchema.safeParse({ weekday: 0, startTime: "9:00", endTime: "10:00" }).success).toBe(false);
    expect(scheduleRowSchema.safeParse({ weekday: 0, startTime: "25:00", endTime: "26:00" }).success).toBe(false);
  });
});

describe("hasWeekdayOverlap", () => {
  it("detects overlapping rows on the same weekday", () => {
    expect(
      hasWeekdayOverlap([
        { weekday: 0, startTime: "09:00", endTime: "12:00" },
        { weekday: 0, startTime: "11:00", endTime: "14:00" },
      ]),
    ).toBe(true);
  });
  it("allows adjacent rows (end == next start)", () => {
    expect(
      hasWeekdayOverlap([
        { weekday: 0, startTime: "09:00", endTime: "12:00" },
        { weekday: 0, startTime: "12:00", endTime: "15:00" },
      ]),
    ).toBe(false);
  });
  it("does not conflate different weekdays", () => {
    expect(
      hasWeekdayOverlap([
        { weekday: 0, startTime: "09:00", endTime: "17:00" },
        { weekday: 1, startTime: "09:00", endTime: "17:00" },
      ]),
    ).toBe(false);
  });
});

describe("scheduleSetSchema", () => {
  it("rejects an overlapping set", () => {
    const r = scheduleSetSchema.safeParse({
      locationId: "00000000-0000-0000-0000-000000000001",
      rows: [
        { weekday: 2, startTime: "09:00", endTime: "12:00" },
        { weekday: 2, startTime: "10:00", endTime: "11:00" },
      ],
    });
    expect(r.success).toBe(false);
  });
  it("accepts adjacent rows", () => {
    const r = scheduleSetSchema.safeParse({
      locationId: "00000000-0000-0000-0000-000000000001",
      rows: [
        { weekday: 2, startTime: "09:00", endTime: "12:00" },
        { weekday: 2, startTime: "12:00", endTime: "15:00" },
      ],
    });
    expect(r.success).toBe(true);
  });
});

describe("settingsSchema", () => {
  const ok = { bufferMin: 0, minNoticeMin: 120, horizonDays: 60, dailyCap: null, slotGridMin: 15 as const };
  it("accepts a sane row", () => {
    expect(settingsSchema.safeParse(ok).success).toBe(true);
  });
  it("rejects negative buffer", () => {
    expect(settingsSchema.safeParse({ ...ok, bufferMin: -1 }).success).toBe(false);
  });
  it("rejects horizon 0 and 181", () => {
    expect(settingsSchema.safeParse({ ...ok, horizonDays: 0 }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...ok, horizonDays: 181 }).success).toBe(false);
  });
  it("rejects a slot grid outside the allowed set", () => {
    expect(settingsSchema.safeParse({ ...ok, slotGridMin: 7 }).success).toBe(false);
  });
  it("accepts each allowed slot grid", () => {
    for (const g of [5, 10, 15, 20, 30, 60] as const) {
      expect(settingsSchema.safeParse({ ...ok, slotGridMin: g }).success).toBe(true);
    }
  });
  it("rejects daily_cap 0 but allows null or positive", () => {
    expect(settingsSchema.safeParse({ ...ok, dailyCap: 0 }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...ok, dailyCap: null }).success).toBe(true);
    expect(settingsSchema.safeParse({ ...ok, dailyCap: 12 }).success).toBe(true);
  });
});

describe("slugify", () => {
  it("is url-safe, accent-stripped, lowercased", () => {
    expect(slugify("Dr. Miloš Đoković")).toBe("dr-milos-dokovic");
    expect(slugify("  Ana   Petrović  ")).toBe("ana-petrovic");
    expect(slugify("Çağrı Şahin")).toBe("cagri-sahin");
  });
  it("falls back to 'provider' for empty/symbol-only input", () => {
    expect(slugify("")).toBe("provider");
    expect(slugify("!!!")).toBe("provider");
  });
  it("collision suffixing is deterministic", () => {
    expect(slugWithSuffix("ana-petrovic", 0)).toBe("ana-petrovic");
    expect(slugWithSuffix("ana-petrovic", 1)).toBe("ana-petrovic-1");
    expect(slugWithSuffix("ana-petrovic", 3)).toBe("ana-petrovic-3");
  });
});

describe("buildLicensePath", () => {
  it("forces the userId folder prefix", () => {
    const r = buildLicensePath("uid-123", "license.pdf");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.path).toBe("uid-123/license.pdf");
  });
  it("rejects a disallowed extension", () => {
    const r = buildLicensePath("uid", "license.exe");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_ext");
  });
  it("accepts pdf/jpg/jpeg/png", () => {
    for (const ext of ["pdf", "jpg", "jpeg", "png"]) {
      expect(buildLicensePath("uid", `doc.${ext}`).ok).toBe(true);
    }
  });
  it("sanitizes traversal + weird chars from the stem", () => {
    const r = buildLicensePath("uid", "../../etc/pa ss?.png");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.path.startsWith("uid/")).toBe(true);
      expect(r.path.includes("..")).toBe(false);
      expect(r.path.includes("/etc/")).toBe(false);
    }
  });
  it("rejects an empty filename", () => {
    const r = buildLicensePath("uid", "");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty");
  });
});

describe("licenseSchema", () => {
  it("accepts all-optional (number only)", () => {
    expect(licenseSchema.safeParse({ licenseNumber: "12345" }).success).toBe(true);
  });
  it("accepts a file path", () => {
    expect(licenseSchema.safeParse({ filePath: "uid/license.pdf" }).success).toBe(true);
  });
});
