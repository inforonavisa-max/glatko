import { describe, expect, it, vi } from "vitest";

/**
 * H9 — /api/health/reschedule route logic: the business-code → HTTP-status contract
 * and the terminal-failure (cookie-drop) classification. These live in the pure
 * helper module (Next route files can't export non-handlers); the admin client is
 * mocked so importing lib/saglik/booking (pulled transitively) touches no real I/O.
 */

vi.mock("@/supabase/server", () => ({
  createAdminClient: () => ({ rpc: vi.fn() }),
  createClient: () => ({ auth: { getUser: vi.fn() } }),
}));
vi.mock("@/lib/sms/infobip", () => ({ sendSms: vi.fn(async () => ({ ok: false })) }));
vi.mock("@/lib/email/send-email", () => ({ sendEmail: vi.fn(async () => ({ success: false })) }));

import { statusFor, isTerminalFailure } from "@/lib/saglik/reschedule-route-status";
import type { RescheduleErrorCode } from "@/lib/saglik/booking";

describe("statusFor — code → HTTP status", () => {
  const cases: Array<[RescheduleErrorCode, number]> = [
    ["SLOT_TAKEN", 409],
    ["RESCHEDULE_SCOPE_MISMATCH", 409],
    ["OLD_NOT_CANCELLABLE", 409],
    ["HOLD_EXPIRED", 410],
    ["OLD_SLOT_PASSED", 410],
    ["NOT_FOUND", 404],
    ["HOLD_NOT_OWNED", 403],
    ["PATIENT_NOT_VERIFIED", 403],
    ["PATIENT_INVALID", 403],
    ["RESCHEDULE_IDENTITY_MISMATCH", 403],
    ["ERROR", 503],
  ];
  for (const [code, status] of cases) {
    it(`${code} → ${status}`, () => {
      expect(statusFor(code)).toBe(status);
    });
  }
});

describe("isTerminalFailure — drops the patient cookie only when the move can never complete", () => {
  it("terminal: slot/hold/window gone or no-op", () => {
    for (const c of ["SLOT_TAKEN", "HOLD_EXPIRED", "OLD_SLOT_PASSED", "OLD_NOT_CANCELLABLE", "NOT_FOUND"] as const) {
      expect(isTerminalFailure(c)).toBe(true);
    }
  });

  it("non-terminal: identity/scope/transport errors keep the binding for a retry", () => {
    for (const c of ["HOLD_NOT_OWNED", "PATIENT_NOT_VERIFIED", "PATIENT_INVALID", "RESCHEDULE_SCOPE_MISMATCH", "RESCHEDULE_IDENTITY_MISMATCH", "ERROR"] as const) {
      expect(isTerminalFailure(c)).toBe(false);
    }
  });
});
