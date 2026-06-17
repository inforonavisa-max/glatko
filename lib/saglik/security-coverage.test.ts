import { describe, it, expect } from "vitest";
import { classifyRoute } from "@/lib/rateLimit";

/**
 * H10 #3 — rate-limit coverage lock. Every health API surface must keep its
 * route class so the middleware limiter (enforceRateLimit → classifyRoute) cannot
 * silently lose coverage in a refactor. The health vertical's ONLY rate-limit guard
 * is this classification, so this test is the regression fence for it.
 *
 * classifyRoute runs on locale-stripped pathnames; /api/* never carries a locale
 * prefix, so the bare paths below are exactly what it sees in production.
 */

describe("classifyRoute — health API rate-limit coverage", () => {
  const PUBLIC_FORM_HEALTH = [
    "/api/health/bookings",
    "/api/health/cancel",
    "/api/health/reschedule",
    "/api/health/holds",
    "/api/health/otp",
    "/api/health/slots",
    "/api/health/geocode",
    "/api/health/waitlist",
    "/api/health/data-request",
    "/api/health/provider/license-upload",
  ];

  it("every /api/health/* endpoint is public-form (12/min per-IP)", () => {
    for (const p of PUBLIC_FORM_HEALTH) {
      expect(classifyRoute(p), p).toBe("public-form");
    }
  });

  it("the EXACT /api/health uptime healthcheck is exempt (and only it)", () => {
    expect(classifyRoute("/api/health")).toBe("exception");
    // A trailing segment must NOT inherit the exemption.
    expect(classifyRoute("/api/health/")).toBe("public-form");
    expect(classifyRoute("/api/healthcheck")).not.toBe("exception");
  });

  it("the health-reminders cron is admin-sensitive", () => {
    expect(classifyRoute("/api/cron/health-reminders")).toBe("admin-sensitive");
  });

  it("a hypothetical /api/health/* sub-path stays covered (no carve-out)", () => {
    expect(classifyRoute("/api/health/provider/anything")).toBe("public-form");
    expect(classifyRoute("/api/health/foo/bar")).toBe("public-form");
  });
});
