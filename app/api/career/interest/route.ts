import { NextResponse } from "next/server";
import { createClient } from "@/supabase/server";
import { isCareerVerticalEnabled } from "@/lib/kariyer/flags";
import { WORKER_CODE_RE } from "@/lib/kariyer/worker-code";
import { checkCareerInterestLimit } from "@/lib/kariyer/otp-rate-limit";
import { expressInterest, dispatchInterestNotice } from "@/lib/kariyer/booking";

// Service-role write path (RPC runs as service_role); reads the cookie session for
// the employer identity, so it can never be statically cached. R5/R11.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only `workerCode` (+ optional `requisitionId`) is accepted — NO identity in the
// body (RULE R1: the employer is derived from the cookie session). Unknown extra
// keys are ignored defensively; an explicit `null` requisitionId reads as absent.
function readBody(b: unknown): { workerCode: string; requisitionId: string | null } | null {
  if (typeof b !== "object" || b === null) return null;
  const o = b as Record<string, unknown>;
  const workerCode = typeof o.workerCode === "string" ? o.workerCode.trim() : "";
  const requisitionId =
    typeof o.requisitionId === "string" && o.requisitionId.trim().length > 0
      ? o.requisitionId.trim()
      : null;
  return { workerCode, requisitionId };
}

function getClientIp(headers: Headers): string {
  const order = ["cf-connecting-ip", "x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"];
  for (const h of order) {
    const v = headers.get(h);
    if (v) return v.split(",")[0]?.trim() || "unknown";
  }
  return "unknown";
}

export async function POST(request: Request) {
  // Flag OFF → real 404 (mirror holds route line 1; RULE R8 #8).
  if (!isCareerVerticalEnabled()) return new NextResponse(null, { status: 404 });

  // Auth — employer identity comes from the session, NEVER the body (RULE R1).
  // No session → 401; the client treats 401 as "route to /career/login".
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const body = readBody(raw);
  if (!body) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  if (!WORKER_CODE_RE.test(body.workerCode)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if (body.requisitionId !== null && !UUID_RE.test(body.requisitionId)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  // Lightweight per-employer + per-IP cap (RULE R12: the gate WRITE is the
  // abuse-magnet surface). Keyed on the authed user id (stable per-employer id).
  // FAIL-OPEN inside the limiter; a 429 only on a real window hit.
  const limit = await checkCareerInterestLimit(user.id, getClientIp(request.headers));
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited", reason: limit.reason }, { status: 429 });
  }

  // RPC (service-role). R1: employer id passed explicitly (never auth.uid() inside).
  // R3: the RPC re-verifies the requisition is owned by this employer AND the
  // worker_code resolves to an is_showcased=true worker, else RAISE NOT_OWNED /
  // WORKER_NOT_FOUND. An absent requisitionId resolves to NOT_OWNED (no matching
  // requisition row) → 403, per the spec's add-to-requisition contract (R10).
  let result;
  try {
    result = await expressInterest({
      employerUserId: user.id,
      workerCode: body.workerCode,
      requisitionId: body.requisitionId ?? "",
    });
  } catch (e) {
    console.error("[career-interest] express failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  if (!result.ok) {
    // Business-code → HTTP mapping (spec §"Business-code → HTTP/toast mapping").
    // NOT_OWNED (R3 denial) → 403; WORKER_NOT_FOUND → 404; anything else → 400.
    // The response NEVER carries identity/contact/doc data — only a stable code.
    const status =
      result.code === "NOT_OWNED" ? 403 : result.code === "WORKER_NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: "interest_failed", code: result.code }, { status });
  }

  // RULE R10 owner-notify — best-effort, PII-free, NEVER blocks/throws the request.
  // `await` it (dispatch swallows its own errors), so a notice outage can't fail the
  // already-committed gate row. Idempotent re-submits (created=false) still re-notify;
  // the owner dedups in the console.
  await dispatchInterestNotice({
    unlockId: result.unlockId,
    workerCode: body.workerCode,
    requisitionId: body.requisitionId ?? "",
  });

  // Success — the gate row is in state 'interest' (dossier STILL locked, no unlock).
  // `existing:true` when the row pre-existed (idempotent; client shows the success
  // pill, no error toast). NO identity/contact/payment data on this path (R7).
  return NextResponse.json({ ok: true, status: "interest", existing: !result.created });
}
