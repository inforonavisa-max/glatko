import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * H9 — lib/saglik/booking.rescheduleAppointment + enqueueRescheduleProviderNotice
 * unit tests. The health schema is reached only via the public RPCs, so we mock the
 * admin client's .rpc() and assert: (1) a success jsonb maps to the discriminated
 * union, (2) each RPC graceful reason maps to the right code, (3) a transport error
 * maps to ERROR, (4) the provider enqueue never throws (best-effort). No real I/O.
 */

const rpc = vi.fn();
vi.mock("@/supabase/server", () => ({
  createAdminClient: () => ({ rpc }),
}));
// The SMS/email senders are pulled in transitively by booking.ts; stub so importing
// the module never touches Infobip/Resend (these paths are not exercised here).
vi.mock("@/lib/sms/infobip", () => ({ sendSms: vi.fn(async () => ({ ok: false })) }));
vi.mock("@/lib/email/send-email", () => ({ sendEmail: vi.fn(async () => ({ success: false })) }));

import { rescheduleAppointment, enqueueRescheduleProviderNotice } from "@/lib/saglik/booking";

const OK_PAYLOAD = {
  ok: true,
  oldAppointmentId: "00000000-0000-0000-0000-0000000000a1",
  newAppointmentId: "00000000-0000-0000-0000-0000000000b2",
  newManageToken: "ffffffffffffffffffffffffffffffffffffffffffffffff",
  slotStart: "2026-06-20T09:00:00.000Z",
  slotEnd: "2026-06-20T09:30:00.000Z",
  oldSlotStart: "2026-06-18T08:00:00.000Z",
  dispatch: {
    phoneE164: "+38269123456",
    email: null,
    patientName: "Marko",
    confirmSmsReminderId: "00000000-0000-0000-0000-0000000000c3",
    confirmEmailReminderId: null,
  },
  summary: {
    providerName: "Helena Novak",
    providerTitle: "Dr.",
    providerSlug: "dr-helena-novak",
    serviceName: "Pregled",
    serviceDurationMin: 30,
    servicePriceEur: null,
    locationLabel: "Klinika Budva",
    locationAddress: "Jadranski put 1",
    locationCity: "Budva",
  },
};

const ARGS = {
  oldManageToken: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  newHoldId: "00000000-0000-0000-0000-0000000000d4",
  sessionKey: "session-key-1234567890",
  patientId: "00000000-0000-0000-0000-0000000000e5",
  note: null,
  locale: "me" as const,
};

beforeEach(() => {
  rpc.mockReset();
});

describe("rescheduleAppointment — success mapping", () => {
  it("maps a success jsonb to {ok:true, idempotent:false, newManageToken, oldSlotStart, dispatch, summary}", async () => {
    rpc.mockResolvedValueOnce({ data: OK_PAYLOAD, error: null });
    const res = await rescheduleAppointment(ARGS);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.idempotent).toBe(false);
      if (!res.idempotent) {
        expect(res.newManageToken).toBe(OK_PAYLOAD.newManageToken);
        expect(res.newAppointmentId).toBe(OK_PAYLOAD.newAppointmentId);
        expect(res.oldAppointmentId).toBe(OK_PAYLOAD.oldAppointmentId);
        expect(res.oldSlotStart).toBe(OK_PAYLOAD.oldSlotStart);
        expect(res.slotStart).toBe(OK_PAYLOAD.slotStart);
        expect(res.dispatch.confirmSmsReminderId).toBe(OK_PAYLOAD.dispatch.confirmSmsReminderId);
        expect(res.summary.providerSlug).toBe("dr-helena-novak");
      }
    }
    expect(rpc).toHaveBeenCalledWith("health_reschedule_appointment", {
      p_old_manage_token: ARGS.oldManageToken,
      p_new_hold_id: ARGS.newHoldId,
      p_session_key: ARGS.sessionKey,
      p_patient_id: ARGS.patientId,
      p_note: null,
      p_locale: "me",
    });
  });

  it("maps the idempotent-replay payload (no dispatch/summary) to {ok:true, idempotent:true, newManageToken} without throwing", async () => {
    // The RPC's no-double-cancel branch (075/076): old appointment already cancelled +
    // rescheduled_to set → minimal payload. The TS layer MUST NOT try to read the absent
    // dispatch/summary (that crashed the route → 500 on a double-submit before the fix).
    const IDEMPOTENT_PAYLOAD = {
      ok: true,
      idempotent: true,
      oldAppointmentId: "00000000-0000-0000-0000-0000000000a1",
      newAppointmentId: "00000000-0000-0000-0000-0000000000b2",
      newManageToken: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0",
      // NO slotStart/slotEnd/oldSlotStart/dispatch/summary.
    };
    rpc.mockResolvedValueOnce({ data: IDEMPOTENT_PAYLOAD, error: null });
    const res = await rescheduleAppointment(ARGS);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.idempotent).toBe(true);
      if (res.idempotent) {
        expect(res.newManageToken).toBe(IDEMPOTENT_PAYLOAD.newManageToken);
        // The idempotent variant has NO dispatch/summary — the route short-circuits on it.
        expect("dispatch" in res).toBe(false);
        expect("summary" in res).toBe(false);
      }
    }
  });
});

describe("rescheduleAppointment — graceful reason → union code", () => {
  const cases: Array<[string, string]> = [
    ["SLOT_TAKEN", "SLOT_TAKEN"],
    ["HOLD_EXPIRED", "HOLD_EXPIRED"],
    ["HOLD_NOT_OWNED", "HOLD_NOT_OWNED"],
    ["PATIENT_NOT_VERIFIED", "PATIENT_NOT_VERIFIED"],
    ["PATIENT_INVALID", "PATIENT_INVALID"],
    ["OLD_NOT_CANCELLABLE", "OLD_NOT_CANCELLABLE"],
    ["OLD_SLOT_PASSED", "OLD_SLOT_PASSED"],
    ["RESCHEDULE_SCOPE_MISMATCH", "RESCHEDULE_SCOPE_MISMATCH"],
    ["RESCHEDULE_IDENTITY_MISMATCH", "RESCHEDULE_IDENTITY_MISMATCH"],
    ["NOT_FOUND", "NOT_FOUND"],
  ];
  for (const [reason, code] of cases) {
    it(`reason '${reason}' → code '${code}'`, async () => {
      rpc.mockResolvedValueOnce({ data: { ok: false, reason }, error: null });
      const res = await rescheduleAppointment(ARGS);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe(code);
    });
  }

  it("an unknown reason → ERROR", async () => {
    rpc.mockResolvedValueOnce({ data: { ok: false, reason: "SOMETHING_NEW" }, error: null });
    const res = await rescheduleAppointment(ARGS);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("ERROR");
  });

  it("a transport/PostgREST error → ERROR (no throw)", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "connection reset" } });
    const res = await rescheduleAppointment(ARGS);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("ERROR");
  });
});

describe("enqueueRescheduleProviderNotice — best-effort, never throws", () => {
  it("calls the enqueue RPC with both appointment ids", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await enqueueRescheduleProviderNotice("new-id", "old-id");
    expect(rpc).toHaveBeenCalledWith("health_enqueue_reschedule_provider", {
      p_new_appointment_id: "new-id",
      p_old_appointment_id: "old-id",
    });
  });

  it("swallows an RPC error (does not throw)", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(enqueueRescheduleProviderNotice("new-id", "old-id")).resolves.toBeUndefined();
  });

  it("swallows a thrown RPC (does not throw)", async () => {
    rpc.mockRejectedValueOnce(new Error("network"));
    await expect(enqueueRescheduleProviderNotice("new-id", "old-id")).resolves.toBeUndefined();
  });
});
