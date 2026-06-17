import { NextResponse } from "next/server";
import { createAdminClient } from "@/supabase/server";
import { isCareerVerticalEnabled } from "@/lib/kariyer/flags";
import { createWorkerProfile } from "@/lib/kariyer/booking";
import { locales } from "@/i18n/routing";

// R11: creates the auth user + writes encrypted PII via the service-role admin
// client (createAdminClient / career_create_worker_profile RPC) — never run at
// the edge. R5/R11: a mutation handler must never be statically optimized.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// E.164-ish: optional +, 6–15 digits after stripping separators (mirror health).
const PHONE_RE = /^\+?\d{6,15}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Source region is region-ONLY (never exact country — PART 4 anonymization);
// the canonical slugs are the careerVertical.pool.region.* dictionary keys the
// worker form `<select>` sends. Exact country is collected later in the gated
// profile builder, NOT here.
const REGIONS = new Set(["farEast", "middleEast", "africa", "balkans", "other"]);

type WorkerRegisterPayload = {
  email: string;
  password: string;
  phone: string;
  role: string;
  region: string;
  consent: boolean;
  language: string | null;
  locale: string;
};

function parsePayload(body: unknown): WorkerRegisterPayload | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const email = str(b.email).toLowerCase();
  // Password is NOT trimmed — leading/trailing whitespace is meaningful in a
  // credential; only verify the raw string is present and long enough.
  const password = typeof b.password === "string" ? b.password : "";
  const phone = str(b.phone).replace(/[\s().-]/g, "");
  const role = str(b.role);
  const region = str(b.region);
  // Consent is load-bearing (Art. 9 lawful basis) — must be the boolean `true`,
  // not a truthy string, mirroring health's `=== true` consent gates.
  const consent = b.consent === true;
  const language = str(b.language);
  const locale = str(b.locale);

  // R7: there is NO fee/price/payment/tier field on the worker side — none is
  // read from the body, so none can be persisted. Worker is never charged.
  if (email.length === 0 || email.length > 160 || !EMAIL_RE.test(email)) return null;
  if (password.length < 8 || password.length > 128) return null;
  if (!PHONE_RE.test(phone)) return null;
  if (role.length < 2 || role.length > 80) return null;
  if (!REGIONS.has(region)) return null;
  if (language.length > 16) return null;

  return {
    email,
    password,
    phone,
    role,
    region,
    consent,
    language: language || null,
    locale: (locales as readonly string[]).includes(locale) ? locale : "tr",
  };
}

// Locate an existing auth user by email when createUser reports a duplicate.
// The admin user pool is paged in memory (mirror app/[locale]/admin/users
// listUsers usage); a hit lets the worker-profile write resume idempotently
// without ever revealing "account exists" to the client (anti-enumeration).
async function findAuthUserIdByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit.id;
    if (users.length < 1000) break; // last page reached
  }
  return null;
}

/**
 * Worker registration (spec 18) — step 1 of the profile builder. Public form
 * under /api/, so lib/rateLimit.ts's "public-form" cap applies via middleware
 * (no per-route limiter, mirror the health waitlist route). Flag OFF → bare 404.
 *
 * Identity NEVER comes from the body: the route creates/binds the `auth` user
 * (service-role admin) and PASSES the resolved user id down to the RPC (R1).
 * The encrypted PII write goes through createWorkerProfile → the SECURITY
 * DEFINER RPC public.career_create_worker_profile (migration 075): the career
 * schema is not exposed over PostgREST, so the service-role client is the single
 * write path. Step 1 persists public-safe columns + consent only; deep profile
 * PII (dob/passport/exact country/skills/history) lands in later wizard steps,
 * so those args are null here. is_showcased=false / verification_status='pending'
 * are set inside the RPC.
 *
 * Anti-enumeration: a duplicate email (existing auth user and/or existing worker
 * profile) returns { ok: true } either way — never "account exists" (mirror the
 * health/employer idempotency contract). R7: no fee/price/payment arg anywhere.
 */
export async function POST(request: Request) {
  // Flag OFF → real 404 (mirror the interest route line 1; RULE R8 #8).
  if (!isCareerVerticalEnabled()) return new NextResponse(null, { status: 404 });

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
  // Consent is the lawful basis (Art. 9) — there is no legitimate-interest
  // fallback for worker special-category data. Block before any write. Distinct
  // 422 (not 400) so the client can surface the consent-specific message.
  if (!payload.consent) {
    return NextResponse.json({ error: "consent_required" }, { status: 422 });
  }

  const admin = createAdminClient();

  // ── Create or bind the auth user ──────────────────────────────────────────
  // email_confirm:true — the email is the credential; this is a first-party
  // form, not an invite flow. user_metadata mirrors createProvider's shape.
  let userId: string;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
    user_metadata: { career_role: "worker", preferred_locale: payload.language ?? payload.locale },
  });

  if (createErr || !created?.user) {
    // Most likely cause: the email already has an auth user. Resolve it and
    // resume — NEVER leak "account exists" to the client (anti-enumeration).
    const existingId = await findAuthUserIdByEmail(admin, payload.email);
    if (!existingId) {
      // No duplicate found → a genuine auth failure (no PII in logs).
      console.error("[career-worker-register] auth create failed:", createErr?.message ?? "unknown");
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
    userId = existingId;
  } else {
    userId = created.user.id;
  }

  // ── Write the worker profile (encrypted PII via the SECURITY DEFINER RPC) ──
  // Step-1 minimal: public-safe columns + contact + consent only. Deep PII
  // (dob/passport/exact country/address/skills/experience) is collected in the
  // gated wizard later → null here. R7: no tier/fee arg.
  let result;
  try {
    result = await createWorkerProfile({
      userId,
      fullName: null,
      dob: null,
      exactCountry: null,
      phone: payload.phone,
      email: payload.email,
      address: null,
      passportNo: null,
      role: payload.role,
      trade: payload.role,
      tier: null,
      experience: null,
      region: payload.region,
      age: null,
      languages: payload.language ? [payload.language] : [],
      skills: [],
      consent: payload.consent,
    });
  } catch (e) {
    console.error(
      "[career-worker-register] profile write threw:",
      e instanceof Error ? e.message : "unknown",
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  if (!result.ok) {
    // ALREADY_EXISTS = this user already has a worker profile (re-landing). Treat
    // as success and route them onward — anti-enumeration, idempotent (mirror
    // the health same-phone / employer same-email contract).
    if (result.code === "ALREADY_EXISTS") {
      return NextResponse.json({ ok: true });
    }
    // CONSENT_REQUIRED is defense-in-depth: the route already gated it (422
    // above), so reaching here means the boolean slipped past → surface 422.
    if (result.code === "CONSENT_REQUIRED") {
      return NextResponse.json({ error: "consent_required" }, { status: 422 });
    }
    // Anything else (PII_KEY_MISSING infra fault, NOT_OWNED, ERROR) is a server
    // fault — no payload in logs (the submission carries PII).
    console.error("[career-worker-register] profile write failed:", result.code);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // Success — public-safe response only (R7: no fee/contact/identity). The
  // client routes onward to /career/worker/profile (step 2 of the builder).
  return NextResponse.json({ ok: true, workerId: result.workerId });
}
