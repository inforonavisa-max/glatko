import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * H10 #2 — admin data-rights wrappers (consent records + delete/export queue).
 * Asserts the lib/saglik/admin wrappers (a) build RPC args FIELD-BY-FIELD (no client
 * payload passthrough), (b) map RPC-raised codes to the stable union, and (c) the
 * returned shape carries only masked phone/name — NEVER raw phone or email.
 *
 * Mocks the service-role client so no DB is touched (mirrors the geocode test style).
 */

// Captured RPC calls: [name, args].
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
// The result the next rpc() call returns (data/error), set per-test.
let nextResult: { data: unknown; error: { message: string } | null } = { data: null, error: null };

vi.mock("@/supabase/server", () => ({
  createAdminClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve(nextResult);
    },
  }),
}));

import {
  listConsents,
  listDataRequests,
  resolveDataRequest,
} from "./admin";

beforeEach(() => {
  rpcCalls.length = 0;
  nextResult = { data: null, error: null };
});

describe("listConsents", () => {
  it("calls health_admin_list_consents with field-by-field limit/offset only", async () => {
    nextResult = { data: [], error: null };
    await listConsents(50, 100);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("health_admin_list_consents");
    expect(rpcCalls[0].args).toEqual({ p_limit: 50, p_offset: 100 });
  });

  it("returns the masked shape and never exposes email / raw phone", async () => {
    nextResult = {
      data: [
        {
          id: "p1",
          patientPhoneMasked: "•••456",
          patientNameMasked: "A•••",
          consentHealthAt: "2026-06-01T10:00:00Z",
          consentMarketingAt: null,
          createdAt: "2026-06-01T10:00:00Z",
        },
      ],
      error: null,
    };
    const rows = await listConsents(50, 0);
    expect(rows[0].patientPhoneMasked.startsWith("•••")).toBe(true);
    // No 'email' or raw-phone field in the typed shape.
    expect(Object.keys(rows[0])).not.toContain("email");
    expect(Object.keys(rows[0])).not.toContain("phone");
  });

  it("throws on a genuine RPC failure", async () => {
    nextResult = { data: null, error: { message: "boom" } };
    await expect(listConsents(50, 0)).rejects.toThrow(/health_admin_list_consents/);
  });
});

describe("listDataRequests", () => {
  it("forwards status/limit/offset field-by-field", async () => {
    nextResult = { data: [], error: null };
    await listDataRequests("pending", 51, 0);
    expect(rpcCalls[0].name).toBe("health_admin_list_data_requests");
    expect(rpcCalls[0].args).toEqual({ p_status: "pending", p_limit: 51, p_offset: 0 });
  });

  it("masked phone/name only — no email in the row shape", async () => {
    nextResult = {
      data: [
        {
          id: "r1",
          patientId: "p1",
          type: "delete",
          status: "pending",
          requestedAt: "2026-06-10T08:00:00Z",
          resolvedAt: null,
          patientPhoneMasked: "•••456",
          patientNameMasked: "A•••",
        },
      ],
      error: null,
    };
    const rows = await listDataRequests("pending", 50, 0);
    expect(rows[0].patientPhoneMasked.startsWith("•••")).toBe(true);
    expect(Object.keys(rows[0])).not.toContain("email");
  });
});

describe("resolveDataRequest", () => {
  it("forwards actorId/requestId/status and returns ok on success", async () => {
    nextResult = { data: { ok: true, status: "fulfilled" }, error: null };
    const res = await resolveDataRequest("actor-1", "req-1", "fulfilled");
    expect(rpcCalls[0].name).toBe("health_admin_resolve_data_request");
    expect(rpcCalls[0].args).toEqual({
      p_actor_id: "actor-1",
      p_request_id: "req-1",
      p_status: "fulfilled",
    });
    expect(res).toEqual({ ok: true, status: "fulfilled" });
  });

  it("maps NOT_FOUND / INVALID_STATUS to the stable union (never throws)", async () => {
    nextResult = { data: null, error: { message: 'pg: "NOT_FOUND"' } };
    expect(await resolveDataRequest("a", "r", "rejected")).toEqual({ ok: false, code: "NOT_FOUND" });

    nextResult = { data: null, error: { message: "raised INVALID_STATUS here" } };
    expect(await resolveDataRequest("a", "r", "fulfilled")).toEqual({
      ok: false,
      code: "INVALID_STATUS",
    });

    nextResult = { data: null, error: { message: "some other failure" } };
    expect(await resolveDataRequest("a", "r", "fulfilled")).toEqual({ ok: false, code: "ERROR" });
  });
});
