import type { RescheduleErrorCode } from "@/lib/saglik/booking";

/**
 * H9 — the /api/health/reschedule code → HTTP-status contract, extracted as a pure
 * module so it is unit-testable (Next.js route files may only export HTTP-method
 * handlers + a fixed set of config keys; extra exports fail the build type-check).
 *
 *   SLOT_TAKEN / RESCHEDULE_SCOPE_MISMATCH / OLD_NOT_CANCELLABLE → 409
 *   HOLD_EXPIRED / OLD_SLOT_PASSED                               → 410 (gone)
 *   NOT_FOUND                                                    → 404
 *   HOLD_NOT_OWNED / PATIENT_NOT_VERIFIED / PATIENT_INVALID /
 *   RESCHEDULE_IDENTITY_MISMATCH                                 → 403
 *   ERROR (+ anything else)                                      → 503
 */
export function statusFor(code: RescheduleErrorCode): number {
  switch (code) {
    case "SLOT_TAKEN":
    case "RESCHEDULE_SCOPE_MISMATCH":
    case "OLD_NOT_CANCELLABLE":
      return 409;
    case "HOLD_EXPIRED":
    case "OLD_SLOT_PASSED":
      return 410;
    case "NOT_FOUND":
      return 404;
    case "HOLD_NOT_OWNED":
    case "PATIENT_NOT_VERIFIED":
    case "PATIENT_INVALID":
    case "RESCHEDULE_IDENTITY_MISMATCH":
      return 403;
    default:
      return 503;
  }
}

/**
 * The new slot/hold or the manage window is gone → the move can never complete on a
 * retry, so the route drops the one-shot verified-patient cookie (shared-device
 * protection). Identity/scope/transport errors keep the binding so the user can retry.
 */
export function isTerminalFailure(code: RescheduleErrorCode): boolean {
  return (
    code === "SLOT_TAKEN" ||
    code === "HOLD_EXPIRED" ||
    code === "OLD_SLOT_PASSED" ||
    code === "OLD_NOT_CANCELLABLE" ||
    code === "NOT_FOUND"
  );
}
