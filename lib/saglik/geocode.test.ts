import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// next/cache unstable_cache is a passthrough under vitest (no Next runtime); stub
// it to just invoke the factory so geocodeCity's L1 layer runs the real fetch path.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

// Sentry capture is non-blocking + side-effecting; spy on it for the quota tripwire.
const captureSpy = vi.fn();
vi.mock("@/lib/sentry/glatko-capture", () => ({
  glatkoCaptureMessage: (...args: unknown[]) => captureSpy(...args),
}));

import {
  geocodeCity,
  reverseGeocode,
  normalizeQuery,
  matchCity,
  _geocodeCounters,
  _resetGeocodeCounters,
} from "./geocode";

const TOKEN_KEY = "NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN";

describe("normalizeQuery", () => {
  it("strips accents, lowercases, collapses non-alphanumerics", () => {
    expect(normalizeQuery("Nikšić")).toBe("niksic");
    expect(normalizeQuery("  Herceg  Novi ")).toBe("herceg novi");
    expect(normalizeQuery("Žabljak")).toBe("zabljak");
  });
});

describe("matchCity — accent-insensitive name/slug", () => {
  it("matches by name (accented) and slug", () => {
    expect(matchCity("budva")?.slug).toBe("budva");
    expect(matchCity("Nikšić")?.slug).toBe("niksic");
    expect(matchCity("herceg-novi")?.slug).toBe("herceg-novi");
  });
  it("returns null for unknown / empty", () => {
    expect(matchCity("Atlantis")).toBeNull();
    expect(matchCity("")).toBeNull();
  });
});

describe("geocodeCity — two-layer + graceful fallback", () => {
  const realFetch = globalThis.fetch;
  const realToken = process.env[TOKEN_KEY];

  beforeEach(() => {
    delete process.env[TOKEN_KEY];
    _resetGeocodeCounters();
    captureSpy.mockClear();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    if (realToken === undefined) delete process.env[TOKEN_KEY];
    else process.env[TOKEN_KEY] = realToken;
    vi.restoreAllMocks();
  });

  it("L0: known city short-circuits — ZERO Mapbox calls", async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    const pt = await geocodeCity("Budva");
    expect(pt).toEqual({ lat: 42.2911, lng: 18.84, source: "cities" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("token absent → null, no fetch (graceful)", async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    const pt = await geocodeCity("some random street address");
    expect(pt).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("Mapbox 200 with a result → {lat,lng,source:mapbox}", async () => {
    process.env[TOKEN_KEY] = "pk.test";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ features: [{ center: [18.7712, 42.4247] }] }),
    })) as unknown as typeof fetch;
    const pt = await geocodeCity("a place that is not in cities");
    expect(pt).toEqual({ lat: 42.4247, lng: 18.7712, source: "mapbox" });
  });

  it("Mapbox non-200 → null (graceful)", async () => {
    process.env[TOKEN_KEY] = "pk.test";
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    expect(await geocodeCity("unknown place 200x")).toBeNull();
  });

  it("Mapbox throws → null (graceful)", async () => {
    process.env[TOKEN_KEY] = "pk.test";
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await geocodeCity("unknown place throw")).toBeNull();
  });

  it("Mapbox zero results → null (graceful)", async () => {
    process.env[TOKEN_KEY] = "pk.test";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ features: [] }),
    })) as unknown as typeof fetch;
    expect(await geocodeCity("nowhere zero")).toBeNull();
  });

  it("empty input → null", async () => {
    expect(await geocodeCity("   ")).toBeNull();
  });

  it("a real (cache-miss) Mapbox call increments the quota counter; no alarm under threshold", async () => {
    process.env[TOKEN_KEY] = "pk.test";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ features: [{ center: [18.7712, 42.4247] }] }),
    })) as unknown as typeof fetch;
    expect(_geocodeCounters().calls).toBe(0);
    await geocodeCity("a place that increments");
    expect(_geocodeCounters().calls).toBe(1);
    expect(_geocodeCounters().alarmFired).toBe(false);
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it("quota 80% tripwire fires EXACTLY once at the threshold (latched)", async () => {
    process.env[TOKEN_KEY] = "pk.test";
    process.env.MAPBOX_MONTHLY_FREE = "2"; // 80% of 2 = 1.6 → fires on the 2nd call
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ features: [{ center: [18.7712, 42.4247] }] }),
    })) as unknown as typeof fetch;
    try {
      await geocodeCity("call one not in cities");
      expect(captureSpy).not.toHaveBeenCalled(); // 1 < 1.6
      await geocodeCity("call two not in cities");
      expect(_geocodeCounters().alarmFired).toBe(true);
      expect(captureSpy).toHaveBeenCalledTimes(1);
      await geocodeCity("call three not in cities");
      // Latched: a second crossing does NOT re-fire.
      expect(captureSpy).toHaveBeenCalledTimes(1);
    } finally {
      delete process.env.MAPBOX_MONTHLY_FREE;
    }
  });

  it("transient failure (non-200) is NOT cached — a later success resolves", async () => {
    // The negative-cache distinction: fetchMapbox throws on transient failure so
    // unstable_cache does not memoize the outage; geocodeCity still returns null.
    process.env[TOKEN_KEY] = "pk.test";
    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call += 1;
      if (call === 1) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => ({ features: [{ center: [18.7712, 42.4247] }] }) };
    }) as unknown as typeof fetch;
    // 1st: transient → graceful null (not thrown to caller).
    expect(await geocodeCity("flaky place query")).toBeNull();
    // 2nd: Mapbox recovered → real result (would be impossible if null had been cached).
    expect(await geocodeCity("flaky place query")).toEqual({
      lat: 42.4247,
      lng: 18.7712,
      source: "mapbox",
    });
  });
});

describe("reverseGeocode — geolocation passthrough", () => {
  it("valid coords pass through", () => {
    expect(reverseGeocode(42.44, 19.26)).toEqual({
      lat: 42.44,
      lng: 19.26,
      source: "cities",
    });
  });
  it("out-of-range / non-finite → null", () => {
    expect(reverseGeocode(91, 0)).toBeNull();
    expect(reverseGeocode(0, 181)).toBeNull();
    expect(reverseGeocode(Number.NaN, 0)).toBeNull();
  });
});
