import { NextResponse } from "next/server";
import { joinWaitlist } from "@/lib/kariyer/booking";

// R11: writes PII via the service-role admin client (createAdminClient inside
// joinWaitlist) — never run at the edge.
export const runtime = "nodejs";
// Write-only intake; no caching / no static optimization. Mirrors health's POST
// route posture (a mutation handler must never be treated as static).
export const dynamic = "force-dynamic";

// Two intake types. Sent as a hidden field by CareerWaitlistForm; the column is
// a career.waitlist_audience enum, so anything else is a hard 400 before the RPC.
const AUDIENCES = new Set(["employer", "worker"]);

// E.164-ish: optional +, 6–15 digits after stripping separators (mirror health).
const PHONE_RE = /^\+?\d{6,15}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type WaitlistPayload = {
  audience: "employer" | "worker";
  name: string;
  // Email is REQUIRED here (unlike the optional UX hint): career_waitlist_join
  // (migration 075) hashes it into email_hash as the dedupe/idempotency key and
  // RAISEs CONSENT_REQUIRED on a blank value — so we reject empty email up front
  // with a clean 400 instead of bouncing off the RPC.
  email: string;
  phone: string | null;
  sector: string | null;
  region: string | null;
};

function parsePayload(body: unknown): WaitlistPayload | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const audience = str(b.audience);
  const name = str(b.name);
  const email = str(b.email);
  const phone = str(b.phone).replace(/[\s().-]/g, "");
  // sector/region are free-text waitlist columns (NOT validated against
  // career.sectors — only career_create_requisition does that). Worker intake
  // carries `region`, employer intake carries `sector`; either may be blank.
  const sector = str(b.sector);
  const region = str(b.region);

  if (!AUDIENCES.has(audience)) return null;
  if (name.length < 2 || name.length > 120) return null;
  if (email.length === 0 || email.length > 160 || !EMAIL_RE.test(email)) {
    return null;
  }
  // Phone is optional at the API layer (the RPC accepts null); when present it
  // must look like a phone number.
  if (phone && !PHONE_RE.test(phone)) return null;
  if (sector.length > 80) return null;
  if (region.length > 80) return null;

  return {
    audience: audience as "employer" | "worker",
    name,
    email,
    phone: phone || null,
    sector: sector || null,
    region: region || null,
  };
}

/**
 * Career dual waitlist intake (spec 32). Public form, NO flag guard — this is a
 * DARK-LAUNCH intake: /career/coming-soon is the only career route that returns
 * 200 while CAREER_VERTICAL_ENABLED is off, and it must keep collecting supply
 * even before launch. Writes go through joinWaitlist → the SECURITY DEFINER RPC
 * public.career_waitlist_join (migration 075); the career schema is not exposed
 * over PostgREST and anon/authenticated have no grant on the function, so the
 * service-role client is the single write path. Resubmits with the same email
 * upsert instead of erroring (idempotent on email_hash).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const payload = parsePayload(body);
  if (!payload) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const result = await joinWaitlist({
    audience: payload.audience,
    email: payload.email,
    name: payload.name,
    phone: payload.phone,
    sector: payload.sector,
    region: payload.region,
  });

  if (!result.ok) {
    // CONSENT_REQUIRED here means a blank/invalid contact slipped past the
    // parser — treat as a 400; everything else is an unexpected server fault.
    // No payload in logs — the submission contains PII (name/phone/email).
    if (result.code === "CONSENT_REQUIRED") {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }
    console.error("[career-waitlist] write failed:", result.code);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
