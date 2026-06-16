import { defineRouting } from "next-intl/routing";

export const locales = ["tr", "en", "de", "it", "ru", "uk", "sr", "me", "ar"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "tr";

export const localeNames: Record<Locale, string> = {
  tr: "Türkçe",
  en: "English",
  de: "Deutsch",
  it: "Italiano",
  ru: "Русский",
  uk: "Українська",
  sr: "Српски",
  me: "Crnogorski",
  ar: "العربية",
};

/**
 * SEO public routes get per-locale slugs; auth-protected internal routes
 * (admin/dashboard/inbox/settings/messages/notifications/pro-dashboard) keep
 * a single English slug — they're not indexed and translating them adds no
 * SEO value while expanding the redirect/maintenance surface.
 *
 * Adding/removing a route here requires:
 *   1. Matching folder under app/[locale]/
 *   2. If renamed (per-locale form), corresponding 301 redirect in
 *      next.config.mjs so legacy /[locale]/old-slug links don't 404
 *   3. Hard-coded URLs (sitemap, hreflang via buildAlternates) automatically
 *      pick up the new slug because they read from this map via
 *      getPathname() from @/i18n/navigation.
 */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
  pathnames: {
    "/": "/",
    "/onboarding": "/onboarding",

    // Blog — slug comes from Sanity localeSlug; URL prefix stays as /blog
    "/blog": "/blog",
    "/blog/[slug]": "/blog/[slug]",

    // Auth
    "/login": {
      tr: "/giris-yap",
      en: "/login",
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
      en: "/register",
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
      en: "/forgot-password",
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
      en: "/reset-password",
      de: "/passwort-zuruecksetzen",
      it: "/reimposta-password",
      ru: "/sbros-parolya",
      uk: "/skyd-parolya",
      sr: "/resetovanje-lozinke",
      me: "/resetovanje-lozinke",
      ar: "/iaadat-taiin-kalimat-al-murur",
    },

    // Become-a-pro funnel (parent + founding sub-page localize parent prefix)
    "/become-a-pro": {
      tr: "/profesyonel-ol",
      en: "/become-a-pro",
      de: "/profi-werden",
      it: "/diventa-professionista",
      ru: "/stat-professionalom",
      uk: "/staty-profesionalom",
      sr: "/postani-profesionalac",
      me: "/postani-profesionalac",
      ar: "/kun-muhtarif",
    },
    "/become-a-pro/founding": {
      tr: "/profesyonel-ol/founding",
      en: "/become-a-pro/founding",
      de: "/profi-werden/founding",
      it: "/diventa-professionista/founding",
      ru: "/stat-professionalom/founding",
      uk: "/staty-profesionalom/founding",
      sr: "/postani-profesionalac/founding",
      me: "/postani-profesionalac/founding",
      ar: "/kun-muhtarif/founding",
    },

    // Services
    "/services": {
      tr: "/hizmetler",
      en: "/services",
      de: "/dienstleistungen",
      it: "/servizi",
      ru: "/uslugi",
      uk: "/posluhy",
      sr: "/usluge",
      me: "/usluge",
      ar: "/al-khadamat",
    },
    "/services/[slug]": {
      tr: "/hizmetler/[slug]",
      en: "/services/[slug]",
      de: "/dienstleistungen/[slug]",
      it: "/servizi/[slug]",
      ru: "/uslugi/[slug]",
      uk: "/posluhy/[slug]",
      sr: "/usluge/[slug]",
      me: "/usluge/[slug]",
      ar: "/al-khadamat/[slug]",
    },

    // Service × city (programmatic SEO — G-PSEO-FOUNDATION). Slug + city are
    // locale-neutral identifiers (category slug + city slug from
    // lib/glatko/cities.ts); only the path prefix is localized, mirroring
    // "/services/[slug]". Registering here lets buildAlternates/localizedUrl/
    // Link resolve canonical + 9-locale hreflang from the single source.
    "/services/[slug]/[city]": {
      tr: "/hizmetler/[slug]/[city]",
      en: "/services/[slug]/[city]",
      de: "/dienstleistungen/[slug]/[city]",
      it: "/servizi/[slug]/[city]",
      ru: "/uslugi/[slug]/[city]",
      uk: "/posluhy/[slug]/[city]",
      sr: "/usluge/[slug]/[city]",
      me: "/usluge/[slug]/[city]",
      ar: "/al-khadamat/[slug]/[city]",
    },

    // Health vertical (H0 — docs/health/MASTER_PLAN.md). Folder lives at
    // app/[locale]/health/*; per-locale slugs follow the services pattern.
    // While HEALTH_VERTICAL_ENABLED is false, middleware 404s everything
    // under these prefixes except the coming-soon page.
    "/health": {
      tr: "/saglik",
      en: "/health",
      de: "/gesundheit",
      it: "/salute",
      ru: "/zdorove",
      uk: "/zdorovya",
      sr: "/zdravlje",
      me: "/zdravlje",
      ar: "/al-sihha",
    },
    "/health/coming-soon": {
      tr: "/saglik/yakinda",
      en: "/health/coming-soon",
      de: "/gesundheit/demnaechst",
      it: "/salute/prossimamente",
      ru: "/zdorove/skoro",
      uk: "/zdorovya/nezabarom",
      sr: "/zdravlje/uskoro",
      me: "/zdravlje/uskoro",
      ar: "/al-sihha/qariban",
    },
    // Health directory (H2). [specialty] is the locale-neutral specialty slug
    // (e.g. 'dis-hekimi'); only the path prefix is localized, mirroring
    // "/services/[slug]". 'uzman' (specialist) stays constant — these routes are
    // gated + noindex (SEO quarantine), so the URL segment isn't index-bound.
    "/health/[specialty]": {
      tr: "/saglik/[specialty]",
      en: "/health/[specialty]",
      de: "/gesundheit/[specialty]",
      it: "/salute/[specialty]",
      ru: "/zdorove/[specialty]",
      uk: "/zdorovya/[specialty]",
      sr: "/zdravlje/[specialty]",
      me: "/zdravlje/[specialty]",
      ar: "/al-sihha/[specialty]",
    },
    "/health/uzman/[slug]": {
      tr: "/saglik/uzman/[slug]",
      en: "/health/uzman/[slug]",
      de: "/gesundheit/uzman/[slug]",
      it: "/salute/uzman/[slug]",
      ru: "/zdorove/uzman/[slug]",
      uk: "/zdorovya/uzman/[slug]",
      sr: "/zdravlje/uzman/[slug]",
      me: "/zdravlje/uzman/[slug]",
      ar: "/al-sihha/uzman/[slug]",
    },

    // Work & career vertical placeholder (K1 — own coming-soon page)
    "/career": {
      tr: "/kariyer",
      en: "/career",
      de: "/karriere",
      it: "/carriera",
      ru: "/karera",
      uk: "/kariera",
      sr: "/karijera",
      me: "/karijera",
      ar: "/al-wazaif",
    },

    // Static info pages
    "/how-it-works": {
      tr: "/nasil-calisir",
      en: "/how-it-works",
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
      en: "/about",
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
      en: "/contact",
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
      en: "/privacy",
      de: "/datenschutz",
      it: "/privacy",
      ru: "/konfidentsialnost",
      uk: "/konfidentsialnist",
      sr: "/privatnost",
      me: "/privatnost",
      ar: "/al-khususiya",
    },
    "/terms": {
      tr: "/kullanim-kosullari",
      en: "/terms",
      de: "/nutzungsbedingungen",
      it: "/termini",
      ru: "/usloviya",
      uk: "/umovy",
      sr: "/uslovi",
      me: "/uslovi",
      ar: "/al-shuroot",
    },
    "/cookies": {
      tr: "/cerez-politikasi",
      en: "/cookies",
      de: "/cookies",
      it: "/cookies",
      ru: "/fayly-cookie",
      uk: "/fayly-cookie",
      sr: "/kolacici",
      me: "/kolacici",
      ar: "/al-kukiz",
    },
    "/gdpr": "/gdpr",

    // Other public/lead-gen — kept as identity (low traffic, no per-locale spec yet)
    "/founding-customer": "/founding-customer",
    "/request-service": "/request-service",
    "/email-preferences": "/email-preferences",
    "/pros/[slug]": "/pros/[slug]",
    "/provider/[id]": "/provider/[id]",

    // Internal (auth-protected, no SEO value) — identity
    "/dashboard/requests": "/dashboard/requests",
    "/dashboard/requests/[id]": "/dashboard/requests/[id]",
    "/inbox": "/inbox",
    "/inbox/[conversationId]": "/inbox/[conversationId]",
    "/messages": "/messages",
    "/messages/[id]": "/messages/[id]",
    "/my-requests/[id]": "/my-requests/[id]",
    "/notifications": "/notifications",
    "/review/[requestId]": "/review/[requestId]",
    "/settings/notifications": "/settings/notifications",
    "/settings/profile": "/settings/profile",
    "/settings/security": "/settings/security",

    // Pro dashboard — identity
    "/pro/dashboard": "/pro/dashboard",
    "/pro/dashboard/availability": "/pro/dashboard/availability",
    "/pro/dashboard/bids": "/pro/dashboard/bids",
    "/pro/dashboard/leads": "/pro/dashboard/leads",
    "/pro/dashboard/packages": "/pro/dashboard/packages",
    "/pro/dashboard/profile": "/pro/dashboard/profile",
    "/pro/dashboard/requests": "/pro/dashboard/requests",
    "/pro/dashboard/upgrade-tier": "/pro/dashboard/upgrade-tier",

    // Admin — identity
    "/admin": "/admin",
    "/admin/categories": "/admin/categories",
    "/admin/launch-metrics": "/admin/launch-metrics",
    "/admin/professionals": "/admin/professionals",
    "/admin/professionals/[id]": "/admin/professionals/[id]",
    "/admin/requests": "/admin/requests",
    "/admin/users": "/admin/users",
    "/admin/users/[id]": "/admin/users/[id]",
  },
});
