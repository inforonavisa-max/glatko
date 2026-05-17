import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { locales } from '@/i18n/routing'

const MIN_SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

function mergeSessionCookieOptions(options: CookieOptions): CookieOptions {
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

function isProtectedBarePath(barePath: string): boolean {
  if (
    barePath.startsWith('/login') ||
    barePath.startsWith('/register') ||
    barePath.startsWith('/forgot-password') ||
    barePath.startsWith('/reset-password')
  ) {
    return false
  }
  return (
    barePath.startsWith('/dashboard') ||
    barePath.startsWith('/profile') ||
    barePath.startsWith('/admin') ||
    barePath.startsWith('/notifications') ||
    barePath.startsWith('/settings')
  )
}

export async function updateSession(request: NextRequest) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) {
        return NextResponse.next({ request: { headers: request.headers } })
    }

    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    // Use the official @supabase/ssr getAll/setAll pattern. The deprecated
    // get/set/remove API was used previously and reassigned `response` per
    // `set` call, which clobbered earlier Set-Cookie entries during a chunked
    // token refresh — see supabase/ssr cookies.js:50-67. setAll receives the
    // entire batch in one call, so we mutate request cookies and rebuild the
    // response exactly once.
    const supabase = createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    for (const { name, value } of cookiesToSet) {
                        request.cookies.set(name, value)
                    }
                    response = NextResponse.next({
                        request: { headers: request.headers },
                    })
                    for (const { name, value, options } of cookiesToSet) {
                        response.cookies.set(name, value, mergeSessionCookieOptions(options))
                    }
                },
            },
        }
    )

    const { data: { user } } = await supabase.auth.getUser()

    const pathname = request.nextUrl.pathname

    let barePath = pathname
    for (const locale of locales) {
        if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
            barePath = pathname.slice(locale.length + 1) || '/'
            break
        }
    }

    const isProtected = isProtectedBarePath(barePath)

    if (!user && isProtected) {
        const url = request.nextUrl.clone()
        const localePrefix = pathname !== barePath ? pathname.slice(0, pathname.length - barePath.length) : ''
        url.pathname = `${localePrefix}/login`
        url.searchParams.set('redirected', '1')
        url.searchParams.set('redirect', barePath)
        return NextResponse.redirect(url)
    }

    return response
}
