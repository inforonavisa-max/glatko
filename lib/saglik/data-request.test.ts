import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * H10 #2 — patient data-rights intake seam (requestDataAction). Asserts:
 *   - args are built field-by-field (token + type only; no client passthrough),
 *   - RPC-raised codes map to the stable reason union,
 *   - NEITHER the token NOR any PII reaches console on the error path (the token is
 *     the appointment's only credential — encodes the H10 PII DoD as a proof).
 */

const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
let nextResult: { data: unknown; error: { message: string } | null } = { data: null, error: null };

vi.mock("@/supabase/server", () => ({
  createAdminClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve(nextResult);
    },
  }),
}));

// booking.ts pulls SMS/email senders transitively; stub them so importing the module
// under vitest-node doesn't try to reach Infobip/Resend.
vi.mock("@/lib/sms/infobip", () => ({ sendSms: vi.fn() }));
vi.mock("@/lib/email/send-email", () => ({ sendEmail: vi.fn() }));

import { requestDataAction } from "./booking";

const TOKEN = "a".repeat(48);

beforeEach(() => {
  rpcCalls.length = 0;
  nextResult = { data: null, error: null };
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("requestDataAction", () => {
  it("forwards manage_token + type field-by-field", async () => {
    nextResult = { data: { ok: true, requestId: "req-1" }, error: null };
    const res = await requestDataAction(TOKEN, "delete");
    expect(rpcCalls[0].name).toBe("health_request_data_action");
    expect(rpcCalls[0].args).toEqual({ p_manage_token: TOKEN, p_type: "delete" });
    expect(res).toEqual({ ok: true, requestId: "req-1" });
  });

  it("maps NOT_FOUND / INVALID_TYPE to the reason union", async () => {
    nextResult = { data: null, error: { message: 'raised "NOT_FOUND"' } };
    expect(await requestDataAction(TOKEN, "export")).toEqual({ ok: false, reason: "NOT_FOUND" });

    nextResult = { data: null, error: { message: "INVALID_TYPE seen" } };
    expect(await requestDataAction(TOKEN, "export")).toEqual({ ok: false, reason: "INVALID_TYPE" });

    nextResult = { data: null, error: { message: "weird db error" } };
    expect(await requestDataAction(TOKEN, "export")).toEqual({ ok: false, reason: "ERROR" });
  });

  it("never logs the manage_token (or any 48-hex value) on the error path", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    nextResult = { data: null, error: { message: "weird db error" } };
    await requestDataAction(TOKEN, "delete");
    for (const call of spy.mock.calls) {
      for (const arg of call) {
        const s = typeof arg === "string" ? arg : JSON.stringify(arg);
        expect(s).not.toContain(TOKEN);
        expect(s).not.toMatch(/\b[0-9a-f]{48}\b/);
      }
    }
  });
});
