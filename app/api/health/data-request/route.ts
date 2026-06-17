import { NextResponse } from "next/server";
import { requestDataAction, type DataRequestType } from "@/lib/saglik/booking";
import { isHealthVerticalEnabled } from "@/lib/saglik/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 48-char lowercase hex manage_token: encode(gen_random_bytes(24),'hex').
const TOKEN_RE = /^[0-9a-f]{48}$/;
const VALID_TYPES: readonly DataRequestType[] = ["delete", "export"];

/**
 * H10 data-subject rights intake (PDPL 15-day SLA). Public endpoint keyed on the
 * appointment manage_token from the confirmation/manage link — the patient already
 * proves identity by holding that token. All logic lives in
 * lib/saglik/booking.requestDataAction → the SECURITY DEFINER RPC
 * public.health_request_data_action, which resolves the patient from the token
 * itself (never trusts a client id) and records a queue row + a PII-free audit
 * entry. The token is the only secret, so it never appears in logs.
 *
 * Rate-limit: covered by the middleware /api/health/* "public-form" limiter
 * (12/min per-IP). Flag-gated → 404 when the vertical is off.
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

  const o = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const token = o.token;
  const type = o.type;

  if (typeof token !== "string" || !TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if (typeof type !== "string" || !VALID_TYPES.includes(type as DataRequestType)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  let result;
  try {
    result = await requestDataAction(token, type as DataRequestType);
  } catch (e) {
    // No token in logs — it is the appointment's only credential.
    console.error("[health-data-request] route failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  if (result.ok) {
    return NextResponse.json({ ok: true });
  }
  if (result.reason === "NOT_FOUND") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (result.reason === "INVALID_TYPE") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  return NextResponse.json({ error: "unavailable" }, { status: 503 });
}
