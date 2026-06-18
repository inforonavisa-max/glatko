import { NextResponse } from "next/server";
import { cancelAppointment, enqueueCancelledNotice } from "@/lib/saglik/booking";
import { isHealthVerticalEnabled } from "@/lib/saglik/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 48-char lowercase hex manage_token: encode(gen_random_bytes(24),'hex').
const TOKEN_RE = /^[0-9a-f]{48}$/;

/**
 * H5b appointment cancel (K2). Public endpoint keyed on the appointment
 * manage_token from the confirmation link. All logic lives in
 * lib/saglik/booking.cancelAppointment, which routes through the SECURITY
 * DEFINER RPC public.health_cancel_appointment — the health schema is not
 * exposed over PostgREST, so the service-role client is the single write
 * path. The token is the only secret, so it never appears in logs.
 */
export async function POST(request: Request) {
  if (!isHealthVerticalEnabled()) {
    return new NextResponse(null, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const token =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).token
      : undefined;
  if (typeof token !== "string" || !TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  let result;
  try {
    result = await cancelAppointment(token);
  } catch (e) {
    // No token in logs — it is the appointment's only credential.
    console.error("[health-cancel] failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  if (result.ok) {
    // H6: queue the patient 'cancelled' notice (idempotent; the cron delivers it).
    // Best-effort — a queue hiccup must not turn a successful cancel into an error.
    await enqueueCancelledNotice(token);
    return NextResponse.json({ ok: true, status: "cancelled" });
  }
  if (result.reason === "NOT_FOUND") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (result.reason === "NOT_CANCELLABLE") {
    return NextResponse.json({ error: "not_cancellable" }, { status: 409 });
  }
  return NextResponse.json({ error: "unavailable" }, { status: 503 });
}
