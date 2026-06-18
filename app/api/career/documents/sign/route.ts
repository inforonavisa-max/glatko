import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient, createAdminClient } from "@/supabase/server";
import { isCareerVerticalEnabled } from "@/lib/kariyer/flags";
import { canAccessDocument } from "@/lib/kariyer/gate";
import { signWorkerDocument } from "@/lib/kariyer/storage";
import { checkCareerInterestLimit } from "@/lib/kariyer/otp-rate-limit";

// Service-role read-signing path; reads the cookie session for identity, mints a
// short-lived signed URL for a GATED ORIGINAL, and writes an access-log row. Never
// statically cached (R5/R11). Mirrors app/api/health/holds/route.ts's guard +
// validation + error shape; the gate logic is career-specific (R6 + Spec 16).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Short TTL — a gated PII original must not linger as a live URL. Matches the
// storage layer's own DEFAULT_TTL_SECONDS posture (the worker re-fetches per view).
const SIGNED_READ_TTL = 60;

// Salt the IP before it ever touches the access-log (PDPA/GDPR: store a hash, not a
// raw address — same convention as lib/rateLimit.ts / lib/kariyer/otp-rate-limit.ts).
const ACCESS_LOG_SALT = process.env.RATE_LIMIT_SALT || "dev-no-salt";

// Only `documentId` (+ optional `unlockId`) is accepted — NO identity in the body
// (RULE R1: the caller is derived from the cookie session). Unknown keys ignored
// defensively; an explicit `null` unlockId reads as absent (worker-self read path).
function readBody(b: unknown): { documentId: string; unlockId: string | null } | null {
  if (typeof b !== "object" || b === null) return null;
  const o = b as Record<string, unknown>;
  const documentId = typeof o.documentId === "string" ? o.documentId.trim() : "";
  const unlockId =
    typeof o.unlockId === "string" && o.unlockId.trim().length > 0
      ? o.unlockId.trim()
      : null;
  return { documentId, unlockId };
}

function getClientIp(headers: Headers): string {
  const order = ["cf-connecting-ip", "x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"];
  for (const h of order) {
    const v = headers.get(h);
    if (v) return v.split(",")[0]?.trim() || "unknown";
  }
  return "unknown";
}

function hashIp(ip: string): string | null {
  if (!ip || ip === "unknown") return null;
  return createHash("sha256").update(`${ip}:${ACCESS_LOG_SALT}`).digest("hex");
}

export async function POST(request: Request) {
  // Flag OFF → real 404 (mirror holds route line 1; RULE R8 #8).
  if (!isCareerVerticalEnabled()) return new NextResponse(null, { status: 404 });

  // Auth — identity comes from the session, NEVER the body (RULE R1). No session →
  // 401; the client treats 401 as "route to /career/login".
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
  if (!UUID_RE.test(body.documentId)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if (body.unlockId !== null && !UUID_RE.test(body.unlockId)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  // Lightweight per-caller + per-IP cap. This is an /api surface (R12: the
  // public-form cap applies even though the page itself is auth-gated). Keyed on
  // the authed user id; the interest limiter is the nearest gate-write window and
  // FAILS-OPEN inside, so a 429 only on a real window hit.
  const limit = await checkCareerInterestLimit(user.id, getClientIp(request.headers));
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited", reason: limit.reason }, { status: 429 });
  }

  // GATE re-check (RULE R6 + R8 #4) — fail-closed. career_can_access_document
  // encodes BOTH branches that authorize a gated original: (a) the worker reading
  // their OWN document, OR (b) an employer whose reveal_unlocks row is
  // owner_approved=true AND payment_status='paid'. R1: the user id is PASSED to the
  // RPC (never auth.uid() inside). Any ambiguous/error result → false → 403.
  let allowed: boolean;
  try {
    allowed = await canAccessDocument(user.id, body.documentId);
  } catch (e) {
    console.error("[career-sign] gate check failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  if (!allowed) {
    // No identity/doc data on a denial — only a stable code (mirror interest route).
    return NextResponse.json({ error: "forbidden", code: "GATE_LOCKED" }, { status: 403 });
  }

  // Resolve the gated original's storage PATH and write the access-log row in one
  // service-role hop (R6: log on EVERY issuance). The `career` schema is NOT exposed
  // to PostgREST, so this goes through a SECURITY DEFINER RPC (createAdminClient,
  // service_role) — never `.from('career.*')` from app code. The RPC re-asserts the
  // gate predicate, inserts a career_document_access_log row (document_id, the caller
  // as accessed_by, the optional unlock id, salted ip hash), and returns the PATH.
  // It NEVER returns identity/PII — only the storage path (R8 #9).
  const admin = createAdminClient();
  let storagePath: string;
  try {
    const { data, error } = await admin.rpc("career_sign_document", {
      p_user_id: user.id,
      p_document_id: body.documentId,
      p_unlock_id: body.unlockId,
      p_ip_hash: hashIp(getClientIp(request.headers)),
    });
    if (error) {
      // A late gate failure inside the RPC surfaces as GATE_LOCKED → 403; any other
      // RPC error is an infra fault → 503. Log no PII (just the message).
      console.error("[career-sign] resolve failed:", error.message);
      const denied = error.message.includes("GATE_LOCKED") || error.message.includes("NOT_OWNED");
      return denied
        ? NextResponse.json({ error: "forbidden", code: "GATE_LOCKED" }, { status: 403 })
        : NextResponse.json({ error: "unavailable" }, { status: 503 });
    }
    const path = (data as { storagePath?: string } | null)?.storagePath;
    if (typeof path !== "string" || path.length === 0) {
      // No path back from a gated-true caller means the row vanished (de-showcased /
      // consent-revoked between gate and resolve) — treat as a denial, not a crash.
      return NextResponse.json({ error: "forbidden", code: "GATE_LOCKED" }, { status: 403 });
    }
    storagePath = path;
  } catch (e) {
    console.error("[career-sign] resolve threw:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  // Mint the short-lived signed URL for the gated ORIGINAL (career-worker bucket).
  // signWorkerDocument refuses any path outside that bucket as defense-in-depth; it
  // does NOT re-check the gate (this route owns the gate + audit-log ordering).
  let signedUrl: string;
  try {
    signedUrl = await signWorkerDocument(storagePath, SIGNED_READ_TTL);
  } catch (e) {
    console.error("[career-sign] sign failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  // Success — a short-lived URL the client opens once and never persists. NO
  // identity/contact/payment data on this path (R7: the worker is never charged;
  // this surface carries zero fee/price wording either direction).
  return NextResponse.json({ signedUrl });
}
