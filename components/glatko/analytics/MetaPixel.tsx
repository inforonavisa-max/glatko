"use client";

import Script from "next/script";

interface MetaPixelProps {
  pixelId: string;
}

/**
 * Meta Pixel client-side integration with Consent Mode v2 awareness.
 *
 * Mirror of GA4 Consent Mode pattern:
 * - Default state: revoked (denied) — set in inline script BEFORE fbq init
 * - CookieConsent "Accept" → fbq('consent', 'grant')
 * - localStorage check on mount-restore (same pattern as G-ADS-2.1 hotfix)
 *
 * If pixelId empty/undefined, renders nothing (no-op skeleton mode).
 */
export function MetaPixel({ pixelId }: MetaPixelProps) {
  if (!pixelId) return null;

  return (
    <>
      {/* Consent default — must run BEFORE fbq init (G-ADS-2.1 pattern).
          beforeInteractive is required: fbq stub + consent('revoke') must
          execute before any fbevents.js call queues a page_view. Mirrors
          gtm-consent-default in app/layout.tsx. */}
      {/* eslint-disable-next-line @next/next/no-before-interactive-script-outside-document */}
      <Script id="fbq-consent-default" strategy="beforeInteractive">
        {`
          !function(f,b,e,v,n,t,s){
            if(f.fbq)return;
            n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;
            n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)
          }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');

          // Consent default: revoked (denied equivalent)
          fbq('consent', 'revoke');

          // Mount-restore: Meta consent is binary, so grant only when the
          // marketing category is allowed (G-ADS-5). Backward-compat: the
          // legacy "accepted" string = full grant. Mirrors the marketing→fbq
          // mapping in lib/analytics/consent.ts.
          try {
            var raw = (typeof localStorage !== 'undefined')
              ? localStorage.getItem('glatko-cookie-consent')
              : null;
            var marketing = false;
            if (raw === 'accepted') {
              marketing = true;
            } else if (raw) {
              marketing = !!JSON.parse(raw).marketing;
            }
            if (marketing) {
              fbq('consent', 'grant');
            }
          } catch(e) {}

          fbq('init', '${pixelId}');
          fbq('track', 'PageView');
        `}
      </Script>

      {/* noscript fallback — JS-disabled tracking */}
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}
