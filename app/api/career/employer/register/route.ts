import { NextResponse } from "next/server";
import { createClient } from "@/supabase/server";
import { isCareerVerticalEnabled } from "@/lib/kariyer/flags";
import { createEmployerAccount } from "@/lib/kariyer/booking";
import { locales } from "@/i18n/routing";

// R11: createEmployerAccount writes encrypted contact PII via the service-role
// admin client (createAdminClient inside the wrapper) — never run at the edge.
export const runtime = "nodejs";
// Write-only mutation handler; no caching / no static optimization. Mirrors
// health's waitlist POST posture.
export const dynamic = "force-dynamic";

// Seeded launch sectors (career.sectors slugs, migration 078). Validated here
// as defense-in-depth — the seeded enum is Construction + Hospitality at launch;
// anything else is a hard 400 before the RPC. Mirrors health's SPECIALTIES set.
const SECTORS = new Set(["construction", "hospitality"]);

// Optional expected-hiring-volume buckets (UX select; not persisted by the RPC
// today, but validated so a bad client value is a clean 400 not a silent pass).
const HIRING_VOLUMES = new Set(["1-5", "6-20", "20+"]);

// E.164-ish: optional +, 6–15 digits after stripping separators (mirror health).
const PHONE_RE = /^\+?\d{6,15}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type RegisterPayload = {
  company: string;
  sector: string;
  hiringVolume: string | null;
  city: string;
  contactName: string;
  email: string;
  phone: string;
  contactLanguage: string;
  consent: true;
  locale: string;
};

function parsePayload(body: unknown): RegisterPayload | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const company = str(b.company);
  const sector = str(b.sector);
  const hiringVolume = str(b.hiringVolume);
  const city = str(b.city);
  const contactName = str(b.contactName);
  const email = str(b.email);
  const phone = str(b.phone).replace(/[\s().-]/g, "");
  const contactLanguage = str(b.contactLanguage);
  const consent = b.consent === true;
  const locale = str(b.locale);

  // Company (required 2–160) + sector (seeded slug) + city (required 2–80).
  if (company.length < 2 || company.length > 160) return null;
  if (!SECTORS.has(sector)) return null;
  if (city.length < 2 || city.length > 80) return null;
  // Hiring volume is optional; when present it must be a known bucket.
  if (hiringVolume && !HIRING_VOLUMES.has(hiringVolume)) return null;

  // Contact (required name 2–120, valid email ≤160, phone E.164-ish required).
  if (contactName.length < 2 || contactName.length > 120) return null;
  if (email.length === 0 || email.length > 160 || !EMAIL_RE.test(email)) {
    return null;
  }
  if (!PHONE_RE.test(phone)) return null;

  // Consent is load-bearing (B2B contact, but still GDPR/PDPA) — block submit
  // server-side too (defense-in-depth; the client also gates on this).
  if (!consent) return null;

  return {
    company,
    sector,
    hiringVolume: hiringVolume || null,
    city,
    contactName,
    email,
    phone,
    contactLanguage:
      (locales as readonly string[]).includes(contactLanguage)
        ? contactLanguage
        : "",
    consent: true,
    locale: (locales as readonly string[]).includes(locale) ? locale : "tr",
  };
}

/**
 * Career employer self-registration (spec 11). Flag-guarded — returns a bare 404
 * while CAREER_VERTICAL_ENABLED is off (RULE R8 #8; mirror the interest route's
 * guard line 1). Public-form rate-limited under /api/ (lib/rateLimit.ts
 * "public-form", R12). Identity comes from the cookie session (auth.getUser()),
 * NEVER the request body (RULE R1).
 *
 * The account is written through createEmployerAccount → the SECURITY DEFINER RPC
 * public.career_create_employer_account (migration 075); the career schema is not
 * exposed over PostgREST and anon/authenticated have no grant, so the service-role
 * client is the single write path. One account per user (ALREADY_EXISTS) — to
 * avoid account enumeration we surface that as success ({ ok: true }), mirroring
 * health's same-phone idempotency. The contact (name·email·phone·language) is
 * encrypted inside the RPC.
 *
 * RULE R7: this is the EMPLOYER side — no fee/price/payment field here or anywhere
 * on the worker side; payment UI is downstream (unlock/commission).
 */
export async function POST(request: Request) {
  // Flag OFF → real 404 (mirror interest route line 1; RULE R8 #8).
  if (!isCareerVerticalEnabled()) return new NextResponse(null, { status: 404 });

  // Auth — employer identity comes from the session, NEVER the body (RULE R1).
  // No session → 401; the client treats 401 as "route to /career/login".
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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

  // The RPC takes company + a single contact blob; pack the validated contact
  // fields into one line so the encrypted column carries everything the owner
  // needs to verify the account (the RPC only persists company + encrypted
  // contact today — sector/volume/locale are intake context, not yet columns).
  const contactLine = [
    payload.contactName,
    payload.email,
    payload.phone,
    payload.contactLanguage || payload.locale,
  ]
    .filter(Boolean)
    .join(" · ");

  let result;
  try {
    result = await createEmployerAccount({
      userId: user.id,
      company: payload.company,
      contact: contactLine,
    });
  } catch (e) {
    // No payload in logs — the submission contains PII (name/email/phone).
    console.error(
      "[career-employer-register] unexpected:",
      e instanceof Error ? e.message : "unknown",
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  if (!result.ok) {
    // ALREADY_EXISTS → anti-enumeration: surface as success so a returning user
    // can't probe which emails/accounts exist (spec §"do NOT leak account already
    // exists"). The account is idempotent per-user, so re-registering is a no-op.
    if (result.code === "ALREADY_EXISTS") {
      return NextResponse.json({ ok: true });
    }
    // SECTOR_INVALID (blank company, reused stable code) → bad input → 400;
    // everything else is an unexpected server fault. No PII in logs.
    if (result.code === "SECTOR_INVALID" || result.code === "CONSENT_REQUIRED") {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }
    console.error("[career-employer-register] write failed:", result.code);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, employerId: result.employerId });
}
