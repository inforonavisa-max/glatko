/**
 * G-AUTH-3: token_hash redeemer for Supabase email links (recovery, signup,
 * magiclink, email_change). The Auth Hook embeds this URL in the CTA button:
 *   /auth/confirm?token_hash=<hash>&type=<type>&next=<safe-internal-path>
 *
 * `verifyOtp` exchanges the hash for a session and writes the auth cookie
 * via the same `mergeSessionCookieOptions` wrapper G-AUTH-1 introduced.
 *
 * /auth/callback (existing) keeps handling the OAuth `code` flow. They are
 * intentionally separate — different inputs, different verifyOtp/exchange
 * APIs, different failure modes.
 */
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { mergeSessionCookieOptions } from "@/supabase/server";
import { glatkoCaptureException } from "@/lib/sentry/glatko-capture";
import { defaultLocale } from "@/i18n/routing";
import { isSafeInternalPath } from "@/lib/auth/redirect";

// Mirrors the verifyOtp `type` parameter from @supabase/supabase-js.
// Inlined here so we don't depend on the gotrue-js export surface.
type EmailOtpType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "email";

const VALID_TYPES: ReadonlySet<EmailOtpType> = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

// Shared open-redirect guard (also rejects backslash-prefixed paths).
const isValidNext = isSafeInternalPath;

function loginRedirect(origin: string, error: string): NextResponse {
  return NextResponse.redirect(`${origin}/${defaultLocale}/login?error=${error}`);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type");
  const rawNext = url.searchParams.get("next");

  const origin = url.origin;

  if (!tokenHash || !rawType) {
    return loginRedirect(origin, "auth-confirm-missing-params");
  }
  if (!VALID_TYPES.has(rawType as EmailOtpType)) {
    return loginRedirect(origin, "auth-confirm-invalid-type");
  }
  const type = rawType as EmailOtpType;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) {
    return loginRedirect(origin, "auth-confirm-failed");
  }

  const next = isValidNext(rawNext) ? rawNext : "/";
  const response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, mergeSessionCookieOptions(options));
        });
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    glatkoCaptureException(error, {
      module: "auth-confirm",
      type,
    });
    return loginRedirect(origin, "auth-confirm-failed");
  }

  return response;
}
