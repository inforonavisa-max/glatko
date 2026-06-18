import { NextResponse } from "next/server";
import { createClient } from "@/supabase/server";
import { isCareerVerticalEnabled } from "@/lib/kariyer/flags";
import { createRequisition } from "@/lib/kariyer/booking";

// Service-role write path (the RPC runs as service_role); the employer identity is
// read from the cookie session, so this can never be statically cached. R5/R11.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Demand-side conversion surface: an authed employer turns a hiring need into a
// `career_requisitions` row (status='submitted'). Mirrors the health write-route
// idiom (holds/otp): flag-guard → auth.getUser() (401 if none) → hand-rolled body
// validation (no zod) → service-role RPC → business-code → HTTP mapping → JSON.
//
// RULE R1: the employer id comes from the SESSION, never the request body; it is
// passed explicitly to the RPC (p_employer_user_id), which re-verifies ownership.
// RULE R7: the only money-adjacent field here is the EMPLOYER's service_path
// choice (commission vs full_service); there is no worker-side fee/price field.
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_PATHS = ["commission", "full_service"] as const;
type ServicePath = (typeof SERVICE_PATHS)[number];

// Sane ceilings so a malformed/abusive body can't smuggle an unbounded jsonb blob
// past the route into the RPC. The RPC is the authority on SECTOR_INVALID; these
// are pure shape guards (defense-in-depth, spec §"API 400").
const MAX_ROLE_ROWS = 50;
const MAX_HEADCOUNT = 9999;
const MAX_STRING_ITEMS = 64;

function isPositiveInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_HEADCOUNT;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .slice(0, MAX_STRING_ITEMS);
}

type ValidatedBody = {
  sector: string;
  rolesJsonb: Record<string, number>;
  requirements: {
    experienceBand: string | null;
    certifications: string[];
    languages: string[];
    minTier: string | null;
  };
  termsJsonb: {
    wageMin: number;
    wageMax: number;
    currency: string;
    hours: string | null;
    accommodation: { provided: boolean; note: string | null };
    duration: string | null;
    startDate: string;
    note: string | null;
  };
  servicePath: ServicePath;
};

// Returns the validated/normalized body, or a string error code for a 400.
// No identity is read from the body (R1); unknown extra keys are ignored.
function readBody(b: unknown): ValidatedBody | string {
  if (typeof b !== "object" || b === null) return "invalid_payload";
  const o = b as Record<string, unknown>;

  // ── sector (required; RPC re-validates against the seeded list) ────────────
  const sector = typeof o.sector === "string" ? o.sector.trim() : "";
  if (!sector || sector.length > 80) return "invalid_sector";

  // ── roles map: { [role]: headcount } — ≥1 valid row, positive-int counts ───
  const rawRoles = o.roles;
  if (typeof rawRoles !== "object" || rawRoles === null || Array.isArray(rawRoles)) {
    return "invalid_roles";
  }
  const rolesEntries = Object.entries(rawRoles as Record<string, unknown>);
  if (rolesEntries.length === 0 || rolesEntries.length > MAX_ROLE_ROWS) {
    return "invalid_roles";
  }
  const rolesJsonb: Record<string, number> = {};
  for (const [role, count] of rolesEntries) {
    const key = role.trim();
    if (!key || key.length > 120) return "invalid_roles";
    if (!isPositiveInt(count)) return "invalid_roles";
    rolesJsonb[key] = count;
  }
  if (Object.keys(rolesJsonb).length === 0) return "invalid_roles";

  // ── requirements (ALL optional — an open requisition is valid; never block) ─
  const rawReq =
    typeof o.requirements === "object" && o.requirements !== null && !Array.isArray(o.requirements)
      ? (o.requirements as Record<string, unknown>)
      : {};
  const experienceBand =
    typeof rawReq.experienceBand === "string" && rawReq.experienceBand.trim()
      ? rawReq.experienceBand.trim().slice(0, 80)
      : null;
  const minTier =
    typeof rawReq.minTier === "string" && rawReq.minTier.trim()
      ? rawReq.minTier.trim().slice(0, 80)
      : null;
  const requirements = {
    experienceBand,
    certifications: asStringArray(rawReq.certifications),
    languages: asStringArray(rawReq.languages),
    minTier,
  };

  // ── terms (MNE mediation-law disclosure; wage range REQUIRED + load-bearing) ─
  const rawTerms =
    typeof o.terms === "object" && o.terms !== null && !Array.isArray(o.terms)
      ? (o.terms as Record<string, unknown>)
      : null;
  if (!rawTerms) return "invalid_terms";

  const wageMin = rawTerms.wageMin;
  const wageMax = rawTerms.wageMax;
  if (
    typeof wageMin !== "number" ||
    typeof wageMax !== "number" ||
    !Number.isFinite(wageMin) ||
    !Number.isFinite(wageMax) ||
    wageMin < 0 ||
    wageMax < 0 ||
    wageMin > wageMax // wage min ≤ max (spec §"Wage min > max")
  ) {
    return "invalid_terms";
  }

  const currency =
    typeof rawTerms.currency === "string" && rawTerms.currency.trim()
      ? rawTerms.currency.trim().toUpperCase().slice(0, 3)
      : "EUR"; // currency mismatch / absent defaults to EUR (spec §"Wage min > max")

  const startDateRaw = typeof rawTerms.startDate === "string" ? rawTerms.startDate.trim() : "";
  if (!startDateRaw || !Number.isFinite(Date.parse(startDateRaw))) return "invalid_terms";

  const hours =
    typeof rawTerms.hours === "string" && rawTerms.hours.trim()
      ? rawTerms.hours.trim().slice(0, 200)
      : null;
  const duration =
    typeof rawTerms.duration === "string" && rawTerms.duration.trim()
      ? rawTerms.duration.trim().slice(0, 200)
      : null;

  const accProvided = rawTerms.accommodationProvided === true;
  const accNote =
    typeof rawTerms.accommodationNote === "string" && rawTerms.accommodationNote.trim()
      ? rawTerms.accommodationNote.trim().slice(0, 500)
      : null;

  const note =
    typeof o.note === "string" && o.note.trim() ? o.note.trim().slice(0, 1000) : null;

  const termsJsonb = {
    wageMin,
    wageMax,
    currency,
    hours,
    accommodation: { provided: accProvided, note: accNote },
    duration,
    startDate: startDateRaw,
    note,
  };

  // ── service_path (required; exactly one of the two cards; R7 employer-side) ─
  const servicePathRaw = typeof o.servicePath === "string" ? o.servicePath.trim() : "";
  if (!(SERVICE_PATHS as readonly string[]).includes(servicePathRaw)) {
    return "invalid_service_path";
  }
  const servicePath = servicePathRaw as ServicePath;

  return { sector, rolesJsonb, requirements, termsJsonb, servicePath };
}

export async function POST(request: Request) {
  // Flag OFF → real 404 (mirror holds/interest route; RULE R8 #8).
  if (!isCareerVerticalEnabled()) return new NextResponse(null, { status: 404 });

  // Auth — employer identity comes from the session, NEVER the body (RULE R1).
  // No session → 401; the client treats 401 as "route to /career/login" (the
  // persisted draft survives, so the employer returns to a restored wizard).
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
  if (typeof body === "string") {
    return NextResponse.json({ error: body }, { status: 400 });
  }

  // RPC (service-role). R1: employer id passed explicitly (never auth.uid()
  // inside). R3-style ownership re-check inside the RPC: it re-verifies the caller
  // owns the career_employer_accounts row (else NOT_OWNED) and validates the
  // sector slug (SECTOR_INVALID). Insert is status='submitted'.
  let result;
  try {
    result = await createRequisition({
      employerUserId: user.id,
      sector: body.sector,
      rolesJsonb: body.rolesJsonb,
      requirements: body.requirements,
      termsJsonb: body.termsJsonb,
      servicePath: body.servicePath,
    });
  } catch (e) {
    console.error(
      "[career-requisitions] create failed:",
      e instanceof Error ? e.message : "unknown",
    );
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  if (!result.ok) {
    // Business-code → HTTP mapping (spec §"Edge cases"). NOT_OWNED (the
    // cross-employer denial, R8 #2) → 403; every other known RAISE → 400. The
    // response carries only the stable code — never identity/contact/payment data.
    const status = result.code === "NOT_OWNED" ? 403 : 400;
    return NextResponse.json({ error: "requisition_failed", code: result.code }, { status });
  }

  // Success — the requisition row is committed in state 'submitted'. The client
  // fires its analytics event and flips to the confirmation screen.
  return NextResponse.json({ ok: true, requisitionId: result.requisitionId });
}
