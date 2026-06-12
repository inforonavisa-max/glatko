import { NextResponse } from "next/server";
import { getSupabaseServiceRole } from "@/supabase/service-role";
import { locales } from "@/i18n/routing";

const SPECIALTIES = new Set([
  "dentist",
  "gp",
  "psychologist",
  "physio",
  "other",
]);

// E.164-ish: optional +, 6–15 digits after stripping separators
const PHONE_RE = /^\+?\d{6,15}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type WaitlistPayload = {
  fullName: string;
  specialty: string;
  city: string;
  phone: string;
  email: string;
  locale: string;
};

function parsePayload(body: unknown): WaitlistPayload | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const fullName = str(b.fullName);
  const specialty = str(b.specialty);
  const city = str(b.city);
  const phone = str(b.phone).replace(/[\s().-]/g, "");
  const email = str(b.email);
  const locale = str(b.locale);

  if (fullName.length < 2 || fullName.length > 120) return null;
  if (!SPECIALTIES.has(specialty)) return null;
  if (city.length < 2 || city.length > 80) return null;
  if (!PHONE_RE.test(phone)) return null;
  if (email && (email.length > 160 || !EMAIL_RE.test(email))) return null;

  return {
    fullName,
    specialty,
    city,
    phone,
    email,
    locale: (locales as readonly string[]).includes(locale) ? locale : "tr",
  };
}

/**
 * H0 doctor waitlist intake (K2). Public form, rate-limited as
 * "public-form" in lib/rateLimit.ts. Writes go through the SECURITY DEFINER
 * RPC public.health_waitlist_join (migration 065) — the health schema is
 * not exposed over PostgREST and anon/authenticated have no grant on the
 * function, so the service-role client is the single write path.
 * Resubmits with the same phone upsert instead of erroring (idempotent).
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

  try {
    const supabase = getSupabaseServiceRole();
    const { error } = await supabase.rpc("health_waitlist_join", {
      p_full_name: payload.fullName,
      p_specialty: payload.specialty,
      p_city: payload.city,
      p_phone: payload.phone,
      p_email: payload.email || null,
      p_locale: payload.locale,
    });

    if (error) {
      // No payload in logs — the submission contains PII (phone/email).
      console.error("[health-waitlist] rpc failed:", error.code, error.message);
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
  } catch (e) {
    console.error(
      "[health-waitlist] unexpected:",
      e instanceof Error ? e.message : "unknown",
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
