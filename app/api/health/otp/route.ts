import { NextResponse } from "next/server";
import { isHealthVerticalEnabled } from "@/lib/saglik/flags";
import { sendSms } from "@/lib/sms/infobip";
import {
  normalizePhone,
  phoneHash,
  generateOtpCode,
  otpCodeHash,
} from "@/lib/saglik/phone";
import { checkHealthOtpLimit } from "@/lib/saglik/otp-rate-limit";
import { createOtp, verifyOtp } from "@/lib/saglik/booking";
import { createClient } from "@/supabase/server";
import { locales, type Locale } from "@/i18n/routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CODE_RE = /^\d{6}$/;

// Backend SMS templates (not UI dictionary strings). {code} is interpolated.
const SMS_TEMPLATES: Record<Locale, string> = {
  tr: "Glatko Sağlık doğrulama kodunuz: {code}. 10 dakika geçerlidir.",
  en: "Your Glatko Health verification code: {code}. Valid for 10 minutes.",
  de: "Ihr Glatko Health Bestätigungscode: {code}. 10 Minuten gültig.",
  it: "Il tuo codice di verifica Glatko Health: {code}. Valido per 10 minuti.",
  ru: "Ваш код подтверждения Glatko Health: {code}. Действителен 10 минут.",
  uk: "Ваш код підтвердження Glatko Health: {code}. Дійсний 10 хвилин.",
  sr: "Vaš Glatko Health kod za potvrdu: {code}. Važi 10 minuta.",
  me: "Vaš Glatko Health kod za potvrdu: {code}. Važi 10 minuta.",
  ar: "رمز التحقق من Glatko Health: {code}. صالح لمدة 10 دقائق.",
};

function resolveLocale(v: unknown): Locale {
  return typeof v === "string" && (locales as readonly string[]).includes(v) ? (v as Locale) : "tr";
}

function getClientIp(headers: Headers): string {
  const order = ["cf-connecting-ip", "x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"];
  for (const h of order) {
    const v = headers.get(h);
    if (v) return v.split(",")[0]?.trim() || "unknown";
  }
  return "unknown";
}

// ── POST: issue a code ──────────────────────────────────────────────────────
export async function POST(request: Request) {
  if (!isHealthVerticalEnabled()) return new NextResponse(null, { status: 404 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const o = (raw ?? {}) as Record<string, unknown>;
  const e164 = normalizePhone(typeof o.phone === "string" ? o.phone : "");
  if (!e164) return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  const locale = resolveLocale(o.locale);

  const limit = await checkHealthOtpLimit(e164, getClientIp(request.headers));
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited", reason: limit.reason }, { status: 429 });
  }

  const code = generateOtpCode();
  const stored = await createOtp(phoneHash(e164), otpCodeHash(code));
  if (!stored) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  // Two-layer: SMS failure degrades gracefully; the code stays valid for a retry
  // path but the user is told delivery failed (no booking-flow crash).
  const sms = await sendSms({ to: e164, text: SMS_TEMPLATES[locale].replace("{code}", code) });
  if (!sms.ok) {
    console.error("[health-otp] sms send failed:", sms.error); // no PII (code/phone not logged)
    return NextResponse.json({ error: "sms_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

// ── PUT: verify a code + (on success) create the encrypted patient ──────────
export async function PUT(request: Request) {
  if (!isHealthVerticalEnabled()) return new NextResponse(null, { status: 404 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const o = (raw ?? {}) as Record<string, unknown>;

  const e164 = normalizePhone(typeof o.phone === "string" ? o.phone : "");
  const code = typeof o.code === "string" ? o.code.trim() : "";
  const fullName = typeof o.fullName === "string" ? o.fullName.trim() : "";
  const emailRaw = typeof o.email === "string" ? o.email.trim() : "";
  const consentHealth = o.consentHealth === true;
  const consentMarketing = o.consentMarketing === true;

  if (!e164) return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  if (!CODE_RE.test(code)) return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  if (fullName.length < 2 || fullName.length > 120) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }
  if (emailRaw && (emailRaw.length > 160 || !EMAIL_RE.test(emailRaw))) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (!consentHealth) {
    return NextResponse.json({ ok: false, reason: "CONSENT_REQUIRED" }, { status: 422 });
  }

  // H9: if a logged-in Glatko user is verifying, stamp patients.user_id so the
  // appointment shows up under "Randevularım". Guests (no session) → null. A getUser()
  // hiccup must never block booking → treat any failure as a guest (null user id).
  let userId: string | null = null;
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  const result = await verifyOtp({
    phoneHashHex: phoneHash(e164),
    codeHashHex: otpCodeHash(code),
    fullName,
    phoneE164: e164,
    email: emailRaw || null,
    consentHealth,
    consentMarketing,
    userId,
  });

  if (result.ok) {
    const res = NextResponse.json({ ok: true, patientId: result.patientId });
    // Bind the verified patient to this browser session (httpOnly) so the H5b
    // booking step takes the patient from the cookie, not a client-supplied id.
    res.cookies.set("glatko_hpatient", result.patientId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60,
    });
    return res;
  }
  return NextResponse.json(
    { ok: false, reason: result.reason, attemptsLeft: result.attemptsLeft },
    { status: result.reason === "ERROR" ? 503 : 422 },
  );
}
