import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient, mergeSessionCookieOptions } from '@/supabase/server';
import { trySendCustomerWelcomeEmail } from '@/lib/email/customer-welcome';
import { glatkoCaptureException } from '@/lib/sentry/glatko-capture';
import { defaultLocale } from '@/i18n/routing';
import { isSafeInternalPath } from '@/lib/auth/redirect';

function resolveBaseUrl(request: NextRequest): string {
  const url = new URL(request.url);
  return url.origin;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const rawNext = url.searchParams.get('next') ?? '/';
  const next = isSafeInternalPath(rawNext) ? rawNext : '/';

  const baseUrl = resolveBaseUrl(request);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnon) {
    return NextResponse.redirect(`${baseUrl}/${defaultLocale}/login?error=auth-callback-failed`);
  }

  if (code) {
    const response = NextResponse.redirect(`${baseUrl}${next}`);
    const supabase = createServerClient(supabaseUrl, supabaseAnon, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Defense in depth: enforce the same 30-day minimum maxAge
            // that middleware/server already use, so OAuth first-login
            // cookies aren't session-only.
            response.cookies.set(name, value, mergeSessionCookieOptions(options));
          });
        },
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data?.user;
        if (user?.id) {
          const fullName =
            (user.user_metadata?.full_name as string | undefined) ??
            (user.user_metadata?.name as string | undefined) ??
            null;
          const admin = createAdminClient();
          await admin.from('profiles').upsert({
            id: user.id,
            full_name: fullName,
            updated_at: new Date().toISOString(),
          });
          await trySendCustomerWelcomeEmail(user.id);
        }
      } catch (err) {
        glatkoCaptureException(err, { module: "auth-callback-profile" });
      }
      return response;
    }
  }

  return NextResponse.redirect(`${baseUrl}/${defaultLocale}/login?error=auth-callback-failed`);
}
