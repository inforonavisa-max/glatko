import { describe, it, expect } from "vitest";
import {
  parseHealthFilters,
  buildFilterQuery,
  hasActiveFilters,
  emptyFilters,
  applyClientFilters,
  haversineKm,
  isWithinThisWeek,
  addDaysIso,
  coastalClusterFallback,
  nearbyCitySuggestions,
  RADIUS_DEFAULT_KM,
  RADIUS_MAX_KM,
  RADIUS_MIN_KM,
  type HealthFilters,
  type FilterableProvider,
} from "./filters";
import { getCityBySlug } from "@/lib/glatko/cities";

// ── parseHealthFilters ────────────────────────────────────────────────────────
describe("parseHealthFilters — defensive parse", () => {
  it("empty searchParams → neutral filters", () => {
    expect(parseHealthFilters({})).toEqual(emptyFilters());
    expect(parseHealthFilters(new URLSearchParams())).toEqual(emptyFilters());
  });

  it("valid full combo round-trips through buildFilterQuery", () => {
    const f: HealthFilters = {
      city: "budva",
      langs: ["en", "me"],
      mode: "video",
      avail: "week",
      near: { lat: 42.29, lng: 18.84, radiusKm: 20 },
    };
    const round = parseHealthFilters(buildFilterQuery(f));
    expect(round).toEqual(f);
  });

  it("unknown city slug is dropped (not in GLATKO_CITIES)", () => {
    expect(parseHealthFilters({ city: "atlantis" }).city).toBeNull();
    expect(parseHealthFilters({ city: "budva" }).city).toBe("budva");
  });

  it("mode not in enum is dropped", () => {
    expect(parseHealthFilters({ mode: "telepathy" }).mode).toBeNull();
    expect(parseHealthFilters({ mode: "home_visit" }).mode).toBe("home_visit");
  });

  it("langs csv: split + lowercase + filter-known + dedupe + sort", () => {
    expect(parseHealthFilters({ lang: "EN,me,en,xx,DE" }).langs).toEqual([
      "de",
      "en",
      "me",
    ]);
    expect(parseHealthFilters({ lang: "" }).langs).toEqual([]);
    expect(parseHealthFilters({ lang: "zz,qq" }).langs).toEqual([]);
  });

  it("avail accepts only 'week'", () => {
    expect(parseHealthFilters({ avail: "week" }).avail).toBe("week");
    expect(parseHealthFilters({ avail: "month" }).avail).toBeNull();
  });

  it("radius clamps: default when absent, min/max bounds, negative→default", () => {
    // r without lat/lng → near is null (no coords) but the clamp itself is unit-tested:
    expect(parseHealthFilters({ lat: "42", lng: "19" }).near?.radiusKm).toBe(
      RADIUS_DEFAULT_KM,
    );
    expect(parseHealthFilters({ lat: "42", lng: "19", r: "999" }).near?.radiusKm).toBe(
      RADIUS_MAX_KM,
    );
    expect(parseHealthFilters({ lat: "42", lng: "19", r: "0" }).near?.radiusKm).toBe(
      RADIUS_DEFAULT_KM,
    );
    expect(parseHealthFilters({ lat: "42", lng: "19", r: "-5" }).near?.radiusKm).toBe(
      RADIUS_DEFAULT_KM,
    );
    expect(parseHealthFilters({ lat: "42", lng: "19", r: "0.5" }).near?.radiusKm).toBe(
      RADIUS_MIN_KM,
    );
  });

  it("near requires BOTH lat and lng (one alone → null)", () => {
    expect(parseHealthFilters({ lat: "42" }).near).toBeNull();
    expect(parseHealthFilters({ lng: "19" }).near).toBeNull();
    expect(parseHealthFilters({ lat: "abc", lng: "19" }).near).toBeNull();
    expect(parseHealthFilters({ lat: "42.3", lng: "19.2" }).near).toEqual({
      lat: 42.3,
      lng: 19.2,
      radiusKm: RADIUS_DEFAULT_KM,
    });
  });

  it("near rejects out-of-range coords (garbage link ?lat=999&lng=999 → null)", () => {
    expect(parseHealthFilters({ lat: "999", lng: "999" }).near).toBeNull();
    expect(parseHealthFilters({ lat: "91", lng: "19" }).near).toBeNull();
    expect(parseHealthFilters({ lat: "42", lng: "181" }).near).toBeNull();
    expect(parseHealthFilters({ lat: "-91", lng: "0" }).near).toBeNull();
    // Boundary values are valid (inclusive range).
    expect(parseHealthFilters({ lat: "90", lng: "-180" }).near).toEqual({
      lat: 90,
      lng: -180,
      radiusKm: RADIUS_DEFAULT_KM,
    });
  });

  it("URLSearchParams and plain-record readers agree; array param takes first", () => {
    const rec = parseHealthFilters({ city: ["budva", "kotor"], mode: "video" });
    expect(rec.city).toBe("budva");
    expect(rec.mode).toBe("video");
  });

  it("buildFilterQuery omits empty/null fields (clean URL)", () => {
    expect(buildFilterQuery(emptyFilters()).toString()).toBe("");
    const q = buildFilterQuery({ ...emptyFilters(), city: "kotor", langs: ["en"] });
    expect(q.get("city")).toBe("kotor");
    expect(q.get("lang")).toBe("en");
    expect(q.has("mode")).toBe(false);
  });

  it("hasActiveFilters reflects any active dimension", () => {
    expect(hasActiveFilters(emptyFilters())).toBe(false);
    expect(hasActiveFilters({ ...emptyFilters(), city: "bar" })).toBe(true);
    expect(hasActiveFilters({ ...emptyFilters(), avail: "week" })).toBe(true);
  });
});

// ── applyClientFilters matrix ─────────────────────────────────────────────────
const FIX: FilterableProvider[] = [
  // Podgorica psychologist, en/me, in_person+video
  {
    slug: "pod-psy",
    languages: ["en", "me"],
    modes: ["in_person", "video"],
    citySlug: "podgorica",
    location: { lat: 42.4304, lng: 19.2594 },
  },
  // Budva dentist, me/sr/en, in_person+home_visit
  {
    slug: "bud-dent",
    languages: ["me", "sr", "en"],
    modes: ["in_person", "home_visit"],
    citySlug: "budva",
    location: { lat: 42.2911, lng: 18.8401 },
  },
  // Kotor physio, de only, video
  {
    slug: "kot-physio",
    languages: ["de"],
    modes: ["video"],
    citySlug: "kotor",
    location: { lat: 42.4247, lng: 18.7712 },
  },
];

function f(p: Partial<HealthFilters>): HealthFilters {
  return { ...emptyFilters(), ...p };
}

describe("applyClientFilters — combination correctness", () => {
  it("no filters → all", () => {
    expect(applyClientFilters(FIX, emptyFilters()).map((p) => p.slug)).toEqual([
      "pod-psy",
      "bud-dent",
      "kot-physio",
    ]);
  });

  it("city filter", () => {
    expect(applyClientFilters(FIX, f({ city: "budva" })).map((p) => p.slug)).toEqual([
      "bud-dent",
    ]);
    expect(applyClientFilters(FIX, f({ city: "tivat" }))).toHaveLength(0);
  });

  it("single language (provider must HAVE it)", () => {
    expect(applyClientFilters(FIX, f({ langs: ["de"] })).map((p) => p.slug)).toEqual([
      "kot-physio",
    ]);
    expect(applyClientFilters(FIX, f({ langs: ["en"] })).map((p) => p.slug)).toEqual([
      "pod-psy",
      "bud-dent",
    ]);
  });

  it("multiple languages = OR / overlap (provider must speak ANY — mirrors SQL `&&`)", () => {
    // en∪me → pod-psy(en,me) + bud-dent(me,sr,en); kot-physio(de) excluded.
    expect(applyClientFilters(FIX, f({ langs: ["en", "me"] })).map((p) => p.slug)).toEqual(
      ["pod-psy", "bud-dent"],
    );
    // de∪en → every provider speaks one of them (kot-physio via de, the rest via en).
    expect(applyClientFilters(FIX, f({ langs: ["de", "en"] })).map((p) => p.slug)).toEqual([
      "pod-psy",
      "bud-dent",
      "kot-physio",
    ]);
    // A language no provider speaks → none.
    expect(applyClientFilters(FIX, f({ langs: ["ar"] }))).toHaveLength(0);
  });

  it("mode filter", () => {
    expect(applyClientFilters(FIX, f({ mode: "home_visit" })).map((p) => p.slug)).toEqual(
      ["bud-dent"],
    );
    expect(applyClientFilters(FIX, f({ mode: "video" })).map((p) => p.slug)).toEqual([
      "pod-psy",
      "kot-physio",
    ]);
  });

  it("city × language × mode cross product narrows correctly", () => {
    // Budva + en + in_person → only bud-dent
    expect(
      applyClientFilters(FIX, f({ city: "budva", langs: ["en"], mode: "in_person" })).map(
        (p) => p.slug,
      ),
    ).toEqual(["bud-dent"]);
    // Budva + video → none (Budva dentist has no video)
    expect(
      applyClientFilters(FIX, f({ city: "budva", mode: "video" })),
    ).toHaveLength(0);
  });

  it("near: radius gate + distance ascending sort", () => {
    // From Kotor centre, 20km → kot-physio (0km) + bud-dent (~16km), Podgorica excluded
    const near = { lat: 42.4247, lng: 18.7712, radiusKm: 20 };
    const got = applyClientFilters(FIX, f({ near })).map((p) => p.slug);
    expect(got).toEqual(["kot-physio", "bud-dent"]);
    // 5km → only kot-physio
    expect(
      applyClientFilters(FIX, f({ near: { ...near, radiusKm: 5 } })).map((p) => p.slug),
    ).toEqual(["kot-physio"]);
  });

  it("near + city combine", () => {
    const near = { lat: 42.4247, lng: 18.7712, radiusKm: 50 };
    expect(
      applyClientFilters(FIX, f({ near, city: "budva" })).map((p) => p.slug),
    ).toEqual(["bud-dent"]);
  });

  it("avail=week cross-ref: drops providers with no slot in window; degrades when data absent", () => {
    const todayIso = "2026-06-17";
    const inWindow = addDaysIso(todayIso, 3); // 2026-06-20
    const outOfWindow = addDaysIso(todayIso, 10); // 2026-06-27
    const slotDates = {
      "pod-psy": [inWindow],
      "bud-dent": [outOfWindow],
      "kot-physio": [], // no slots
    };
    expect(
      applyClientFilters(FIX, f({ avail: "week" }), { nextSlotDates: slotDates, todayIso }).map(
        (p) => p.slug,
      ),
    ).toEqual(["pod-psy"]);
    // No cross-ref data → avail is a no-op (availability outage degrade → show all)
    expect(applyClientFilters(FIX, f({ avail: "week" })).map((p) => p.slug)).toEqual([
      "pod-psy",
      "bud-dent",
      "kot-physio",
    ]);
  });
});

// ── isWithinThisWeek + addDaysIso ─────────────────────────────────────────────
describe("isWithinThisWeek — 7-day local window", () => {
  const today = "2026-06-17";
  it("today is in window", () => {
    expect(isWithinThisWeek([today], today)).toBe(true);
  });
  it("day 6 (last inclusive day) is in window; day 7 is out", () => {
    expect(isWithinThisWeek([addDaysIso(today, 6)], today)).toBe(true);
    expect(isWithinThisWeek([addDaysIso(today, 7)], today)).toBe(false);
  });
  it("past date is out; empty slots is out", () => {
    expect(isWithinThisWeek([addDaysIso(today, -1)], today)).toBe(false);
    expect(isWithinThisWeek([], today)).toBe(false);
  });
  it("any slot in window passes (mixed dates)", () => {
    expect(
      isWithinThisWeek([addDaysIso(today, 30), addDaysIso(today, 2)], today),
    ).toBe(true);
  });
  it("addDaysIso crosses month boundary correctly", () => {
    expect(addDaysIso("2026-06-30", 1)).toBe("2026-07-01");
    expect(addDaysIso("2026-01-01", -1)).toBe("2025-12-31");
  });
});

// ── haversineKm ───────────────────────────────────────────────────────────────
describe("haversineKm — great-circle distance", () => {
  const budva = getCityBySlug("budva")!;
  const kotor = getCityBySlug("kotor")!;
  const podgorica = getCityBySlug("podgorica")!;
  const bar = getCityBySlug("bar")!;

  it("Budva↔Kotor ≈ 16 km (matches PostGIS ST_DistanceSphere ~15.9km)", () => {
    expect(haversineKm(budva, kotor)).toBeGreaterThan(13);
    expect(haversineKm(budva, kotor)).toBeLessThan(19);
  });
  it("Podgorica↔Bar ≈ 40 km", () => {
    expect(haversineKm(podgorica, bar)).toBeGreaterThan(34);
    expect(haversineKm(podgorica, bar)).toBeLessThan(46);
  });
  it("symmetry", () => {
    expect(haversineKm(budva, kotor)).toBeCloseTo(haversineKm(kotor, budva), 6);
  });
  it("zero distance for the same point", () => {
    expect(haversineKm(budva, budva)).toBeCloseTo(0, 6);
  });
});

// ── K3 coastal clustering ─────────────────────────────────────────────────────
describe("coastalClusterFallback — K3 Budva/Tivat/Kotor → Podgorica", () => {
  it("coastal cluster cities resolve to Podgorica", () => {
    expect(coastalClusterFallback("budva")).toBe("podgorica");
    expect(coastalClusterFallback("tivat")).toBe("podgorica");
    expect(coastalClusterFallback("kotor")).toBe("podgorica");
  });
  it("non-coastal cities are unaffected", () => {
    expect(coastalClusterFallback("podgorica")).toBeNull();
    expect(coastalClusterFallback("niksic")).toBeNull();
    expect(coastalClusterFallback("bar")).toBeNull();
  });
});

describe("nearbyCitySuggestions", () => {
  it("coastal origin puts Podgorica (cluster fallback) first", () => {
    const sug = nearbyCitySuggestions("budva", 3).map((c) => c.slug);
    expect(sug[0]).toBe("podgorica");
    expect(sug).not.toContain("budva"); // origin excluded
    expect(sug).toHaveLength(3);
  });
  it("non-coastal origin → nearest-by-distance, origin excluded", () => {
    const sug = nearbyCitySuggestions("podgorica", 3).map((c) => c.slug);
    expect(sug).not.toContain("podgorica");
    expect(sug).toHaveLength(3);
    // nearest to Podgorica should include Tuzi/Zeta/Danilovgrad-class neighbours
    expect(sug.every((s) => getCityBySlug(s) !== undefined)).toBe(true);
  });
  it("no origin → first N SSOT centres", () => {
    const sug = nearbyCitySuggestions(null, 3).map((c) => c.slug);
    expect(sug).toEqual(["podgorica", "niksic", "herceg-novi"]);
  });
  it("unknown origin → first N SSOT centres (defensive)", () => {
    expect(nearbyCitySuggestions("atlantis", 2)).toHaveLength(2);
  });
});
