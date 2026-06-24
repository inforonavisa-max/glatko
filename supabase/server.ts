import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const MIN_SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

export function mergeSessionCookieOptions(options: CookieOptions): CookieOptions {
  const maxAge =
    options.maxAge != null
      ? Math.max(options.maxAge, MIN_SESSION_COOKIE_MAX_AGE)
      : MIN_SESSION_COOKIE_MAX_AGE
  return {
    ...options,
    path: options.path ?? '/',
    sameSite: options.sameSite ?? 'lax',
    secure: options.secure ?? process.env.NODE_ENV === 'production',
    maxAge,
  }
}

export function createClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !key || process.env.NEXT_PHASE === 'phase-production-build') {
        return createServerClient(
            url || 'http://localhost:54321',
            key || 'dummy-key',
            { cookies: { get: () => undefined, set: () => {}, remove: () => {} } }
        )
    }

    const cookieStore = cookies()

    return createServerClient(
        url,
        key,
        {
            cookies: {
                get(name: string) {
                    return cookieStore.get(name)?.value
                },
                set(name: string, value: string, options: CookieOptions) {
                    try {
                        cookieStore.set({ name, value, ...mergeSessionCookieOptions(options) })
                    } catch {
                        // Server Component context
                    }
                },
                remove(name: string, options: CookieOptions) {
                    try {
                        cookieStore.set({ name, value: '', ...options })
                    } catch {
                        // Server Component context
                    }
                },
            },
        }
    )
}

export function createAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
        // Fail loud in production: a missing service-role key there is an operator
        // misconfig. Silently returning a dead-localhost client masks it as opaque
        // connection-refused 500s / silent cron no-ops. Keep the localhost fallback
        // only for local dev/test (matches supabase/service-role.ts).
        if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
            throw new Error(
                'SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required in production',
            )
        }
        return createSupabaseClient('http://localhost:54321', 'dummy-key')
    }

    return createSupabaseClient(
        url,
        key,
        { auth: { autoRefreshToken: false, persistSession: false } }
    )
}
