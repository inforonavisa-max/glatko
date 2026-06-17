import createIntlMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/supabase/middleware';
import { enforceRateLimit } from '@/lib/rateLimit';
import { locales, routing } from '@/i18n/routing';
import { isHealthVerticalEnabled } from '@/lib/saglik/flags';
import { isCareerVerticalEnabled } from '@/lib/kariyer/flags';
import {
  HEALTH_FIRST_SEGMENTS,
  HEALTH_COMING_SOON_BARE_PATHS,
  HEALTH_PRO_FIRST_SEGMENTS,
  CAREER_FIRST_SEGMENTS,
  CAREER_COMING_SOON_BARE_PATHS,
} from '@/lib/verticals/slugs';

const intlMiddleware = createIntlMiddleware(routing);

const HREFLANG_LOCALES = ['tr', 'en', 'de', 'it', 'ru', 'uk', 'sr', 'me', 'ar'] as const;
// Explicit Latin script subtags so Google does not have to infer script
// from the region code; matches lib/seo.ts and the rendered <html lang>.
const HREFLANG_MAP: Record<string, string> = {
  me: 'sr-Latn-ME',
  sr: 'sr-Latn-RS',
};

const PRIVATE_BARE_PREFIXES = [
  '/dashboard',
  '/inbox',
  '/pro/dashboard',
  '/admin',
  '/settings',
  '/review',
];

function isLocaleSegment(seg: string): boolean {
  return (locales as readonly string[]).includes(seg);
}

/** HTTP Link header alternates — no JS; skip private app routes. */
function addHreflangHeaders(response: NextResponse, pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return;

  const maybeLocale = segments[0];
  if (!isLocaleSegment(maybeLocale)) return;

  const bare = '/' + segments.slice(1).join('/');
  if (
    PRIVATE_BARE_PREFIXES.some((p) => bare === p || bare.startsWith(`${p}/`))
  ) {
    return;
  }

  // H0 SEO quarantine: health + career verticals are noindex until launch
  // (MASTER_PLAN Demir Kural 8) — advertising hreflang alternates for
  // noindex/404 surfaces would only feed GSC junk. DELETE (not just skip):
  // the next-intl middleware emits its own alternate Link header, which our
  // header normally overwrites — skipping alone would leak intl's version.
  // H11 launch PR removes the health entries here with the noindex metadata.
  const first = segments[1] ?? '';
  if (
    HEALTH_FIRST_SEGMENTS.has(first) ||
    CAREER_FIRST_SEGMENTS.has(first) ||
    HEALTH_PRO_FIRST_SEGMENTS.has(first)
  ) {
    response.headers.delete('Link');
    return;
  }

  const cleanPath = bare === '/' ? '' : bare;

  const links = HREFLANG_LOCALES.map((l) => {
    const tag = HREFLANG_MAP[l] ?? l;
    return `<https://glatko.app/${l}${cleanPath}>; rel="alternate"; hreflang="${tag}"`;
  });
  links.push(`<https://glatko.app/en${cleanPath}>; rel="alternate"; hreflang="x-default"`);

  response.headers.set('Link', links.join(', '));
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // IndexNow ownership endpoint at /{KEY}.txt (root). Search engines fetch
    // this file as plain text containing the key. Handled in middleware so it
    // skips next-intl locale routing and rate limiting.
    const indexNowKey = process.env.INDEXNOW_KEY;
    if (indexNowKey && pathname === `/${indexNowKey}.txt`) {
        return new NextResponse(indexNowKey, {
            status: 200,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }

    // ── G-DEADCODE: hard 308s for retired routes ──────────────────────────
    // /inbox(+/<id>) → /messages, /my-requests (EXACT) → /dashboard/requests,
    // /review/<id> → /dashboard/requests. Page-level redirects under the
    // [locale] segment are SOFT (200 + streamed NEXT_REDIRECT payload, see
    // the provider/[id] lesson, PR #92) — middleware is the only place a
    // real HTTP 308 can be issued.
    //
    // ⚠️ The /inbox rule is LOAD-BEARING — do not remove it even though the
    // route is gone: the approved WhatsApp template `bid_accepted_tr` has a
    // dynamic URL button registered at Infobip with the FIXED prefix
    // `https://glatko.app/tr/inbox/{{1}}` (re-approval required to change
    // it; see lib/notifications/whatsapp-templates.ts). This redirect is the
    // only thing keeping that button alive.
    {
        const segs = pathname.split('/').filter(Boolean);
        if (segs.length >= 1 && isLocaleSegment(segs[0])) {
            const locale = segs[0];
            const rest = segs.slice(1);
            let target: string | null = null;
            if (rest[0] === 'inbox') {
                target = `/${locale}/messages`;
            } else if (rest.length === 1 && rest[0] === 'my-requests') {
                target = `/${locale}/dashboard/requests`;
            } else if (rest.length === 2 && rest[0] === 'review') {
                target = `/${locale}/dashboard/requests`;
            }
            if (target) {
                return NextResponse.redirect(new URL(target, request.url), 308);
            }
        }
    }

    // ── H0: health vertical flag guard ────────────────────────────────────
    // HEALTH_VERTICAL_ENABLED=false (Production) → every localized /saglik/*
    // (+ future /saglik-pro/*) URL 404s, EXCEPT the coming-soon page (K2).
    // Slug sets derive from i18n/routing.ts via lib/verticals/slugs.ts, so
    // the guard cannot drift from the pathnames map. Defense-in-depth: the
    // app/[locale]/health/(gated)/ layout also calls notFound().
    if (!isHealthVerticalEnabled()) {
        const segs = pathname.split('/').filter(Boolean);
        if (segs.length >= 2 && isLocaleSegment(segs[0])) {
            const bare = '/' + segs.slice(1).join('/');
            const first = segs[1];
            const blocked =
                HEALTH_PRO_FIRST_SEGMENTS.has(first) ||
                (HEALTH_FIRST_SEGMENTS.has(first) &&
                    !HEALTH_COMING_SOON_BARE_PATHS.has(bare));
            if (blocked) {
                // Rewrite to a never-matching path → Next renders its 404
                // page with a real 404 status (no redirect, no soft-200).
                return NextResponse.rewrite(
                    new URL(`/${segs[0]}/__health-disabled-404`, request.url),
                );
            }
        }
    }

    // ── C0: career vertical flag guard ────────────────────────────────────
    // CAREER_VERTICAL_ENABLED=false (Production) → every localized /career/*
    // (/kariyer, /karriere, /carriera, …) URL 404s, EXCEPT the coming-soon
    // page (C0). Slug sets derive from i18n/routing.ts via
    // lib/verticals/slugs.ts, so the guard cannot drift from the pathnames
    // map. Defense-in-depth: the app/[locale]/career/(gated)/ layout also
    // calls notFound(). Clone of the H0 block above.
    if (!isCareerVerticalEnabled()) {
        const segs = pathname.split('/').filter(Boolean);
        if (segs.length >= 2 && isLocaleSegment(segs[0])) {
            const bare = '/' + segs.slice(1).join('/');
            const first = segs[1];
            const blocked =
                CAREER_FIRST_SEGMENTS.has(first) &&
                !CAREER_COMING_SOON_BARE_PATHS.has(bare);
            if (blocked) {
                // Rewrite to a never-matching path → Next renders its 404
                // page with a real 404 status (no redirect, no soft-200).
                return NextResponse.rewrite(
                    new URL(`/${segs[0]}/__career-disabled-404`, request.url),
                );
            }
        }
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-pathname', pathname);
    const requestWithPath = new NextRequest(request.url, {
        headers: requestHeaders,
    });

    if (pathname.startsWith('/api/') || pathname.startsWith('/auth/')) {
        const limited = await enforceRateLimit(request);
        if (limited) return limited;
        return await updateSession(requestWithPath);
    }

    const limited = await enforceRateLimit(request);
    if (limited) return limited;

    const intlResponse = intlMiddleware(requestWithPath);

    const supabaseResponse = await updateSession(requestWithPath);

    if (intlResponse.headers.get('location')) {
        return intlResponse;
    }

    intlResponse.headers.forEach((value, key) => {
        supabaseResponse.headers.set(key, value);
    });

    intlResponse.cookies.getAll().forEach((cookie) => {
        supabaseResponse.cookies.set(cookie.name, cookie.value);
    });

    addHreflangHeaders(supabaseResponse, pathname);

    return supabaseResponse;
}

export const config = {
    matcher: [
        // Skip Next internals, sitemap/robots, image assets, AND font assets
        // (G-CAT-4: /fonts/*.ttf is fetched same-origin by next/og handlers,
        // and would otherwise be 307'd into a locale-prefixed 404).
        '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|llms.txt|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ttf|otf|woff|woff2|txt)$).*)',
    ],
};
