import { withSentryConfig } from "@sentry/nextjs";
import bundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// G-PERF-2 Faz 6: opt-in bundle analyzer.
// Run with `ANALYZE=true npm run build`; reports drop into .next/analyze/.
// Disabled by default so the production build chain stays unchanged.
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cjqappdfyxgytdyeytwv.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "cdn.sanity.io" },
    ],
    formats: ["image/avif", "image/webp"],
    // Compensate for Supabase Storage's `cache-control: no-cache` default —
    // hero images are immutable and OK to cache aggressively at the Next layer.
    minimumCacheTTL: 31536000,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
  async redirects() {
    const localePattern = "/:locale(me|en|tr|sr|de|it|ru|ar|uk)";
    const renames = [
      { from: "general-cleaning", to: "regular-cleaning" },
      { from: "villa-airbnb", to: "villa-cleaning" },
      { from: "engine-service", to: "boat-engine-service" },
      { from: "captain-hire", to: "captain-daily" },
      { from: "winterization", to: "winter-storage" },
      { from: "charter-prep", to: "charter-cleaning" },
    ];
    const slugRenames = renames.map(({ from, to }) => ({
      source: `${localePattern}/services/${from}`,
      destination: `/:locale/services/${to}`,
      permanent: true,
    }));
    // G-CAT-3: /providers retired in favour of /services + premium search
    const providersRetired = [
      {
        source: `${localePattern}/providers`,
        destination: "/:locale/services?openSearch=1",
        permanent: true,
      },
      {
        source: `${localePattern}/providers/:path*`,
        destination: "/:locale/services?openSearch=1",
        permanent: true,
      },
    ];

    // G-I18N-PATHS: pre-localization English slugs → new per-locale slugs.
    // Mirrors the per-locale entries in `i18n/routing.ts` `pathnames`. EN is
    // canonical, so no entries for /en/. Each route adds two redirects:
    // top-level (`/tr/login → /tr/giris-yap`) and parametric child where
    // applicable (`/tr/services/:slug → /tr/hizmetler/:slug`).
    const localeSlugs = {
      "/become-a-pro": {
        tr: "/profesyonel-ol",
        de: "/profi-werden",
        it: "/diventa-professionista",
        ru: "/stat-professionalom",
        uk: "/staty-profesionalom",
        sr: "/postani-profesionalac",
        me: "/postani-profesionalac",
        ar: "/kun-muhtarif",
      },
      "/login": {
        tr: "/giris-yap",
        de: "/anmelden",
        it: "/accedi",
        ru: "/vkhod",
        uk: "/vkhid",
        sr: "/prijava",
        me: "/prijava",
        ar: "/tasjil-al-dukhul",
      },
      "/register": {
        tr: "/kayit-ol",
        de: "/registrieren",
        it: "/registrati",
        ru: "/registratsiya",
        uk: "/reyestratsiia",
        sr: "/registracija",
        me: "/registracija",
        ar: "/inshaa-hisab",
      },
      "/forgot-password": {
        tr: "/sifremi-unuttum",
        de: "/passwort-vergessen",
        it: "/password-dimenticata",
        ru: "/zabyl-parol",
        uk: "/zabuv-parol",
        sr: "/zaboravljena-lozinka",
        me: "/zaboravljena-lozinka",
        ar: "/nasit-kalimat-al-murur",
      },
      "/reset-password": {
        tr: "/sifre-sifirla",
        de: "/passwort-zuruecksetzen",
        it: "/reimposta-password",
        ru: "/sbros-parolya",
        uk: "/skyd-parolya",
        sr: "/resetovanje-lozinke",
        me: "/resetovanje-lozinke",
        ar: "/iaadat-taiin-kalimat-al-murur",
      },
      "/services": {
        tr: "/hizmetler",
        de: "/dienstleistungen",
        it: "/servizi",
        ru: "/uslugi",
        uk: "/posluhy",
        sr: "/usluge",
        me: "/usluge",
        ar: "/al-khadamat",
      },
      "/how-it-works": {
        tr: "/nasil-calisir",
        de: "/so-funktioniert-es",
        it: "/come-funziona",
        ru: "/kak-eto-rabotaet",
        uk: "/yak-tse-pratsyuye",
        sr: "/kako-funkcionise",
        me: "/kako-funkcionise",
        ar: "/kayfa-yamal",
      },
      "/about": {
        tr: "/hakkimizda",
        de: "/ueber-uns",
        it: "/chi-siamo",
        ru: "/o-nas",
        uk: "/pro-nas",
        sr: "/o-nama",
        me: "/o-nama",
        ar: "/man-nahnu",
      },
      "/contact": {
        tr: "/iletisim",
        de: "/kontakt",
        it: "/contatti",
        ru: "/kontakty",
        uk: "/kontakty",
        sr: "/kontakt",
        me: "/kontakt",
        ar: "/ittasil-bina",
      },
      "/privacy": {
        tr: "/gizlilik",
        de: "/datenschutz",
        // it stays "/privacy" (identity in pathnames), no redirect
        ru: "/konfidentsialnost",
        uk: "/konfidentsialnist",
        sr: "/privatnost",
        me: "/privatnost",
        ar: "/al-khususiya",
      },
      "/terms": {
        tr: "/kullanim-kosullari",
        de: "/nutzungsbedingungen",
        it: "/termini",
        ru: "/usloviya",
        uk: "/umovy",
        sr: "/uslovi",
        me: "/uslovi",
        ar: "/al-shuroot",
      },
      // Health-specific privacy notice (H10). Mirrors i18n/routing.ts "/health-privacy".
      // EN stays "/health-privacy" (canonical, no redirect). NOT flag-gated.
      "/health-privacy": {
        tr: "/saglik-gizlilik",
        de: "/gesundheit-datenschutz",
        it: "/privacy-salute",
        ru: "/zdorove-konfidentsialnost",
        uk: "/zdorovya-konfidentsialnist",
        sr: "/zdravlje-privatnost",
        me: "/zdravlje-privatnost",
        ar: "/khususiyat-al-sihha",
      },
      "/cookies": {
        tr: "/cerez-politikasi",
        // de + it stay "/cookies" (identity), no redirect
        ru: "/fayly-cookie",
        uk: "/fayly-cookie",
        sr: "/kolacici",
        me: "/kolacici",
        ar: "/al-kukiz",
      },
    };

    const localizedRedirects = [];
    for (const [enSlug, perLocale] of Object.entries(localeSlugs)) {
      for (const [locale, newSlug] of Object.entries(perLocale)) {
        // Top-level: /tr/login → /tr/giris-yap
        localizedRedirects.push({
          source: `/${locale}${enSlug}`,
          destination: `/${locale}${newSlug}`,
          permanent: true,
        });
        // Parametric child: /tr/services/:slug → /tr/hizmetler/:slug
        // Applies to /services and /become-a-pro (which has /founding subroute).
        localizedRedirects.push({
          source: `/${locale}${enSlug}/:rest*`,
          destination: `/${locale}${newSlug}/:rest*`,
          permanent: true,
        });
      }
    }

    return [...providersRetired, ...slugRenames, ...localizedRedirects];
  },
};

const withIntl = withNextIntl(nextConfig);
const withAnalyzer = withBundleAnalyzer(withIntl);

export default withSentryConfig(withAnalyzer, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  hideSourceMaps: true,
  disableLogger: true,
  widenClientFileUpload: true,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  // Reliability: a transient Sentry API error (e.g. a 504 on `releases
  // finalize` or sourcemap upload) must NOT fail the whole build/deploy — a
  // healthy app build should ship even if Sentry is briefly down. Providing an
  // errorHandler tells the bundler plugin to WARN and continue instead of
  // throwing (default). Upload/release still happens normally when Sentry is
  // healthy — only the failure is made non-fatal. (@sentry/nextjs 8.55:
  // bundler-plugin-core Options.errorHandler — continues compilation unless the
  // callback itself throws.)
  errorHandler: (err) => {
    console.warn(
      "[sentry] release/sourcemap step failed — continuing build (non-fatal):",
      err?.message ?? err,
    );
  },
});
