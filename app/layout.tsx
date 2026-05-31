import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";
import { GoogleTagManager } from "@next/third-parties/google";
import { MetaPixel } from "@/components/glatko/analytics/MetaPixel";

// BCP 47 lang tag for the <html lang> attribute. Decoupled from URL prefix
// so URLs stay short (/me/, /sr/) but crawlers see the explicit script subtag.
//   me → sr-Latn-ME (Montenegrin Latin script)
//   sr → sr-Latn-RS (Serbian Latin script as used on the .sr/ subtree)
const URL_LOCALE_TO_HTML_LANG: Record<string, string> = {
  ar: "ar",
  de: "de",
  en: "en",
  it: "it",
  me: "sr-Latn-ME",
  ru: "ru",
  sr: "sr-Latn-RS",
  tr: "tr",
  uk: "uk",
};

function resolveLocaleFromPath(pathname: string): string {
  const match = pathname.match(/^\/(ar|de|en|it|me|ru|sr|tr|uk)(?:\/|$)/);
  return match ? match[1] : "en";
}

const inter = Inter({
  subsets: ["latin", "cyrillic", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

// Cormorant weight usage audited 3 May 2026: only font-light (300),
// default (400), font-semibold (600), font-bold (700) appear with
// font-serif anywhere in the codebase. Weight 500 was loaded but never
// referenced — dropping it removes one woff2 from the critical font set.
const cormorant = Cormorant_Garamond({
  subsets: ["latin", "cyrillic", "latin-ext"],
  weight: ["300", "400", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});

// Search engine ownership verification meta tags. All three are env-gated so
// previews / local builds don't leak verification tokens into the HTML.
//   - GOOGLE_SITE_VERIFICATION: HTML tag method from Search Console (only used
//     for URL-prefix properties; Domain properties auto-verify via DNS, so this
//     is optional). Keeping it here as a backup verification method.
//   - YANDEX_VERIFICATION: yandex-verification meta from Yandex Webmaster.
//   - BING_SITE_VERIFICATION: msvalidate.01 meta from Bing Webmaster Tools.
//   - FACEBOOK_DOMAIN_VERIFICATION: facebook-domain-verification meta from Meta
//     Business (Brand Safety > Domains); required for iOS 14.5+ aggregated event
//     measurement on the Meta Pixel / Conversions API. Public token (visible in
//     HTML), env-gated only so previews/local builds stay clean.
const verificationOther: Record<string, string> = {};
if (process.env.BING_SITE_VERIFICATION) {
  verificationOther["msvalidate.01"] = process.env.BING_SITE_VERIFICATION;
}
if (process.env.FACEBOOK_DOMAIN_VERIFICATION) {
  verificationOther["facebook-domain-verification"] =
    process.env.FACEBOOK_DOMAIN_VERIFICATION;
}

export const metadata: Metadata = {
  title: {
    default: "Glatko — Montenegro's Premier Service Marketplace",
    template: "%s | Glatko",
  },
  description:
    "Find trusted professionals for home services, boat maintenance, and more in Montenegro. Get free quotes from verified experts.",
  metadataBase: new URL("https://glatko.app"),
  icons: {
    icon: "/icon.svg",
    apple: "/apple-icon.svg",
  },
  openGraph: {
    type: "website",
    siteName: "Glatko",
    locale: "en",
  },
  twitter: {
    card: "summary_large_image",
  },
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
    yandex: process.env.YANDEX_VERIFICATION,
    other: Object.keys(verificationOther).length > 0 ? verificationOther : undefined,
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // x-pathname is set by middleware (see middleware.ts). Used here to resolve
  // the locale for the <html lang> attribute on initial SSR — the previous
  // approach was a client-only useEffect (HtmlLangSetter) which left the
  // attribute empty for crawlers. See G-SEO-AUDIT M2/M11.
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "/";
  const urlLocale = resolveLocaleFromPath(pathname);
  const htmlLang = URL_LOCALE_TO_HTML_LANG[urlLocale] ?? "en";
  const dir = urlLocale === "ar" ? "rtl" : "ltr";

  return (
    <html lang={htmlLang} dir={dir} suppressHydrationWarning>
      <head>
        {/* Preconnect to Supabase: warms TLS so the first client-side
            REST/auth call (after hydration) doesn't pay the handshake cost. */}
        <link
          rel="preconnect"
          href="https://cjqappdfyxgytdyeytwv.supabase.co"
          crossOrigin="anonymous"
        />
        <link
          rel="dns-prefetch"
          href="https://cjqappdfyxgytdyeytwv.supabase.co"
        />
        {/* Consent Mode v2 defaults — must run before GTM loads so denied
            state is honored. Cookie banner (CookieConsent component) updates
            consent to granted on user accept. See G-ADS-2. */}
        <Script id="gtm-consent-default" strategy="beforeInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('consent', 'default', {
              'ad_storage': 'denied',
              'ad_user_data': 'denied',
              'ad_personalization': 'denied',
              'analytics_storage': 'denied',
              'functionality_storage': 'denied',
              'personalization_storage': 'denied',
              'security_storage': 'granted',
              'wait_for_update': 500
            });
            gtag('set', 'ads_data_redaction', true);
            gtag('set', 'url_passthrough', true);
          `}
        </Script>
        {/* Consent mount restore — sync localStorage check before GTM init,
            BEFORE React hydration. Returning visitors with a stored choice get
            their per-category consent applied within the wait_for_update window
            so GA4's first page_view collect carries the correct gcs signal
            (granted analytics → gcs=G111) instead of denied. Backward-compat:
            the legacy "accepted" string maps to a full grant. Granular format
            mirrors lib/analytics/consent.ts. See G-ADS-2.1 + G-ADS-5. */}
        <Script id="gtm-consent-mount-restore" strategy="beforeInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            try {
              var raw = (typeof localStorage !== 'undefined')
                ? localStorage.getItem('glatko-cookie-consent')
                : null;
              if (raw) {
                var analytics, marketing;
                if (raw === 'accepted') {
                  // Backward-compat: pre-G-ADS-5 "accepted" = full grant.
                  analytics = true; marketing = true;
                } else {
                  var p = JSON.parse(raw);
                  analytics = !!p.analytics; marketing = !!p.marketing;
                }
                gtag('consent', 'update', {
                  'security_storage': 'granted',
                  'analytics_storage': analytics ? 'granted' : 'denied',
                  'functionality_storage': analytics ? 'granted' : 'denied',
                  'personalization_storage': analytics ? 'granted' : 'denied',
                  'ad_storage': marketing ? 'granted' : 'denied',
                  'ad_user_data': marketing ? 'granted' : 'denied',
                  'ad_personalization': marketing ? 'granted' : 'denied'
                });
              }
            } catch(e) {}
          `}
        </Script>
      </head>
      <body
        className={`${inter.variable} ${cormorant.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors position="top-right" />
          <Analytics />
          <SpeedInsights />
        </ThemeProvider>
        {/* GTM placed outside ThemeProvider — it's a server-rendered <script>
            wrapper, has no theme/state dependency. Env-gated so dev/test
            builds without NEXT_PUBLIC_GTM_ID emit no GTM tag. See G-ADS-2. */}
        {process.env.NEXT_PUBLIC_GTM_ID && (
          <GoogleTagManager gtmId={process.env.NEXT_PUBLIC_GTM_ID} />
        )}
        {/* Meta Pixel skeleton — env-gated. When NEXT_PUBLIC_META_PIXEL_ID
            is empty, MetaPixel renders nothing (no fbq, no script load).
            See G-ADS-4a. */}
        {process.env.NEXT_PUBLIC_META_PIXEL_ID && (
          <MetaPixel pixelId={process.env.NEXT_PUBLIC_META_PIXEL_ID} />
        )}
      </body>
    </html>
  );
}
