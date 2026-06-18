import { afterEach, describe, expect, it, vi } from "vitest";
import { getAdminEmails, isAdminEmail } from "@/lib/admin";

/**
 * Pure-logic tests for the admin-identity gate. This is the AUTHORITATIVE authorization
 * check the H8 health-admin server actions (app/[locale]/admin/saglik/actions.ts) call
 * before every privileged RPC — every action does `if (!isAdminEmail(user?.email)) return
 * { success: false, error: "Unauthorized" }`. The "non-admin rejection" path (the H8
 * tests-build dimension) is exercised here at the pure layer: a non-allowlisted / null /
 * undefined / empty email must be rejected.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isAdminEmail — admin gate (default allowlist)", () => {
  it("accepts a default-allowlisted email (case/space-insensitive)", () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(isAdminEmail("rohat7746@gmail.com")).toBe(true);
    expect(isAdminEmail("Rohat7746@Gmail.com")).toBe(true);
    expect(isAdminEmail("  rohat7746@gmail.com  ")).toBe(true);
    expect(isAdminEmail("info@ronalegal.com")).toBe(true);
  });

  it("rejects a non-admin email (the non-admin rejection path)", () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(isAdminEmail("attacker@example.com")).toBe(false);
    expect(isAdminEmail("notadmin@gmail.com")).toBe(false);
  });

  it("rejects null / undefined / empty input without throwing", () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
    expect(isAdminEmail("   ")).toBe(false);
  });
});

describe("isAdminEmail — env override (ADMIN_EMAILS)", () => {
  it("uses the env allowlist when set, ignoring the hardcoded defaults", () => {
    vi.stubEnv("ADMIN_EMAILS", "ops@glatko.app, lead@glatko.app");
    expect(isAdminEmail("ops@glatko.app")).toBe(true);
    expect(isAdminEmail("lead@glatko.app")).toBe(true);
    // A default-allowlisted email is NO LONGER admin once the env overrides the set.
    expect(isAdminEmail("rohat7746@gmail.com")).toBe(false);
  });

  it("parses comma / semicolon / whitespace-separated entries", () => {
    vi.stubEnv("ADMIN_EMAILS", "a@x.com; b@x.com  c@x.com");
    const set = getAdminEmails();
    expect(set.has("a@x.com")).toBe(true);
    expect(set.has("b@x.com")).toBe(true);
    expect(set.has("c@x.com")).toBe(true);
  });

  it("falls back to the defaults when the env value is blank/whitespace", () => {
    vi.stubEnv("ADMIN_EMAILS", "   ");
    expect(isAdminEmail("rohat7746@gmail.com")).toBe(true);
  });
});
