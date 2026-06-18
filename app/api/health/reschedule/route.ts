import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isHealthVerticalEnabled } from "@/lib/saglik/flags";
import {
  rescheduleAppointment,
  dispatchRescheduleConfirm,
  enqueueRescheduleProviderNotice,
} from "@/lib/saglik/booking";
import { statusFor, isTerminalFailure } from "@/lib/saglik/reschedule-route-status";
import { locales, type Locale } from "@/i18n/routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "glatko_hsess";
const PATIENT_COOKIE = "glatko_hpatient";
// 48-char lowercase hex manage_token: encode(gen_random_bytes(24),'hex').
const TOKEN_RE = /^[0-9a-f]{48}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Drop the one-shot verified-patient binding (httpOnly, set at OTP-verify). Cleared on
// success AND on terminal failures so a shared device can't reuse a stale credential.
function clearPatientCookie(res: NextResponse): void {
  res.cookies.set(PATIENT_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/**
 * H9 reschedule. A MOVE, not a cancel+rebook: the patient holds a NEW slot (same
 * provider/service/location) then confirms here. The patient + session are read from
 * httpOnly cookies (the patient binding is set at OTP-verify — a guest re-verifies on
 * the reschedule sub-page, a logged-in user is bound the same way). The migration-075
 * RPC books the NEW appointment FIRST (so SLOT_TAKEN leaves the old one intact), then
 * cancels the OLD one with cancel_reason='reschedule' in the SAME tx. On success the
 * single patient move notice goes out immediately + the provider move notice is queued.
 * The token is the only secret → it never appears in logs.
 */
export async function POST(request: Request) {
  if (!isHealthVerticalEnabled()) return new NextResponse(null, { status: 404 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const o = (raw ?? {}) as Record<string, unknown>;
  const token = typeof o.token === "string" ? o.token.trim() : "";
  const holdId = typeof o.holdId === "string" ? o.holdId.trim() : "";
  const note = typeof o.note === "string" ? o.note.trim().slice(0, 500) : "";
  const locale: Locale =
    typeof o.locale === "string" && (locales as readonly string[]).includes(o.locale)
      ? (o.locale as Locale)
      : "tr";

  if (!TOKEN_RE.test(token) || !UUID_RE.test(holdId)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const jar = cookies();
  const sessionKey = jar.get(SESSION_COOKIE)?.value ?? "";
  const patientId = jar.get(PATIENT_COOKIE)?.value ?? "";
  if (!sessionKey || !UUID_RE.test(patientId)) {
    // No verified patient bound to this session → must complete OTP first.
    return NextResponse.json({ error: "not_verified" }, { status: 403 });
  }

  let result;
  try {
    result = await rescheduleAppointment({
      oldManageToken: token,
      newHoldId: holdId,
      sessionKey,
      patientId,
      note: note || null,
      locale,
    });
  } catch (e) {
    // No token in logs — it is the appointment's only credential.
    console.error("[health-reschedule] failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  if (!result.ok) {
    const res = NextResponse.json(
      { error: "reschedule_failed", code: result.code },
      { status: statusFor(result.code) },
    );
    if (isTerminalFailure(result.code)) clearPatientCookie(res);
    return res;
  }

  // Idempotent replay (double-submit / network retry): the move + its notice already
  // happened on the first call, so the RPC returns ONLY the new token. Short-circuit —
  // redirect to the existing new appointment WITHOUT re-dispatching / re-enqueuing.
  if (result.idempotent) {
    const res = NextResponse.json({ ok: true, manageToken: result.newManageToken });
    clearPatientCookie(res);
    return res;
  }

  // ONE coherent patient move notice (SMS + email), immediate + best-effort. No standalone
  // 'cancelled' is ever queued for the old appointment (cancel_reason='reschedule' + the
  // cancel route — the sole caller of enqueueCancelledNotice — is never invoked here).
  // Defensive try/catch: the move is already committed in the DB; a render/send hiccup
  // must never 500 the request (the H6 cron still delivers the queued 'reschedule' rows).
  try {
    await dispatchRescheduleConfirm(result, locale);
    // Provider move notice (defensive re-enqueue; the RPC already inserted the row).
    // Queues a single 'reschedule_provider' email — NOT provider_new_booking.
    await enqueueRescheduleProviderNotice(result.newAppointmentId, result.oldAppointmentId);
  } catch (e) {
    console.error("[health-reschedule] dispatch failed:", e instanceof Error ? e.message : "unknown");
  }

  const res = NextResponse.json({ ok: true, manageToken: result.newManageToken });
  // The new appointment is booked + the move is done; clear the one-shot patient binding.
  clearPatientCookie(res);
  return res;
}
