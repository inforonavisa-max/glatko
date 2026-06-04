/**
 * G-AUTH-3: Supabase Send Email Hook receiver.
 *
 * Supabase calls this endpoint for every transactional auth email. We:
 *   1. Verify the standardwebhooks HMAC signature using SUPABASE_AUTH_HOOK_SECRET.
 *   2. Resolve the user's locale (priority: user_metadata.preferred_locale → 'me').
 *   3. Render the matching React Email template via `buildAuthEmail`.
 *   4. Send via the existing `sendEmail` (Resend + analytics tags).
 *
 * Returning a non-2xx tells Supabase to fall back to its built-in templates.
 * That's our safety net if anything in the hook chain breaks.
 */
import { Webhook } from "standardwebhooks";
import { type NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/send-email";
import {
  buildAuthEmail,
  resolveLocale,
  type AuthHookEmailData,
  type AuthHookUser,
} from "@/lib/email/auth-templates";
import { glatkoCaptureException } from "@/lib/sentry/glatko-capture";

type AuthHookPayload = {
  user: AuthHookUser;
  email_data: AuthHookEmailData;
};

const SUPPORTED_LOCALES = [
  "me",
  "sr",
  "en",
  "tr",
  "de",
  "it",
  "ru",
  "ar",
  "uk",
] as const;

const SUPPORTED_TYPES = [
  "signup",
  "recovery",
  "magiclink",
  "email_change",
  "reauthentication",
] as const;

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function decodeHookSecret(raw: string): string {
  // Supabase issues secrets as `v1,whsec_<base64>`. The standardwebhooks
  // library expects either the bare base64 (preceded by `whsec_`) or the
  // full `v1,whsec_...` form. Strip the `v1,` prefix if present.
  return raw.startsWith("v1,") ? raw.slice(3) : raw;
}

export async function GET() {
  // Health check: lets Rohat (and Vercel preview) confirm the route is
  // deployed without leaking the secret-verification result.
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/auth/email-hook",
    supportedLocales: SUPPORTED_LOCALES,
    supportedTypes: SUPPORTED_TYPES,
  });
}

export async function POST(request: NextRequest) {
  const secret = process.env.SUPABASE_AUTH_HOOK_SECRET;
  if (!secret) {
    console.error("[GLATKO:auth-email-hook] SUPABASE_AUTH_HOOK_SECRET unset");
    return jsonError("Hook secret not configured", 503);
  }

  const body = await request.text();
  const headers = {
    "webhook-id": request.headers.get("webhook-id") ?? "",
    "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
    "webhook-signature": request.headers.get("webhook-signature") ?? "",
  };

  let payload: AuthHookPayload;
  try {
    const wh = new Webhook(decodeHookSecret(secret));
    payload = wh.verify(body, headers) as AuthHookPayload;
  } catch (err) {
    console.warn(
      "[GLATKO:auth-email-hook] signature verify failed",
      err instanceof Error ? err.message : err,
    );
    return jsonError("Invalid webhook signature", 401);
  }

  const actionType = payload?.email_data?.email_action_type;
  // Recipient = the account's CURRENT email. A phone-only account adding its
  // first email (email_change) has no current email, so fall back to the new
  // address — mirrors the SMS hook's user.new_phone handling. Email-having
  // flows (signup / recovery / magiclink / normal email change) keep recipient
  // = user.email EXACTLY as before, so their behaviour is unchanged.
  const recipientEmail =
    payload?.user?.email ||
    (actionType === "email_change" ? payload?.user?.new_email : undefined);

  if (!recipientEmail || !actionType) {
    return jsonError("Malformed hook payload", 400);
  }

  const locale = resolveLocale(payload.user.user_metadata?.preferred_locale);

  let built;
  try {
    built = buildAuthEmail({
      user: payload.user,
      emailData: payload.email_data,
      locale,
    });
  } catch (err) {
    glatkoCaptureException(err, {
      module: "auth-email-hook",
      type: payload.email_data.email_action_type,
      locale,
    });
    return jsonError("Template build failed", 500);
  }

  const result = await sendEmail({
    to: recipientEmail,
    subject: built.subject,
    react: built.react,
    text: built.text,
    skipRateLimit: true, // auth flow drops are worse than burning the bucket
    tags: [
      { name: "category", value: "auth" },
      { name: "type", value: built.type },
      { name: "locale", value: locale },
    ],
    // RFC 8058 one-click unsubscribe + Gmail per-user threading. List-Unsub
    // is technically optional for transactional mail but materially lifts
    // Gmail "Promotions tab" / spam scoring on new domains.
    headers: {
      "List-Unsubscribe": `<${built.unsubscribeUrl}>, <mailto:noreply@glatko.app?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "X-Entity-Ref-ID": payload.user.id,
    },
  });

  if (!result.success) {
    glatkoCaptureException(new Error(result.error), {
      module: "auth-email-hook",
      type: built.type,
      locale,
    });
    return jsonError(result.error, 502);
  }

  return NextResponse.json({
    success: true,
    messageId: result.messageId,
    type: built.type,
    locale,
  });
}
