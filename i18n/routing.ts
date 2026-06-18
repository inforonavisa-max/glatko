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
    // Health directory specialty × city (H3 — the canonical SEO form of the city
    // filter: a clean path segment, not ?city=). [specialty]=specialty slug,
    // [city]=GLATKO_CITIES slug — both locale-neutral; only the prefix is
    // localized, mirroring "/health/[specialty]" + "/services/[slug]/[city]".
    // Gated + noindex (SEO quarantine) until launch (H11).
    "/health/[specialty]/[city]": {
      tr: "/saglik/[specialty]/[city]",
      en: "/health/[specialty]/[city]",
      de: "/gesundheit/[specialty]/[city]",
      it: "/salute/[specialty]/[city]",
      ru: "/zdorove/[specialty]/[city]",
      uk: "/zdorovya/[specialty]/[city]",
      sr: "/zdravlje/[specialty]/[city]",
      me: "/zdravlje/[specialty]/[city]",
      ar: "/al-sihha/[specialty]/[city]",
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
    // Booking flow (H5a). [holdId] is a server-issued opaque UUID; gated +
    // noindex (SEO quarantine), so 'randevu' stays constant like 'uzman'.
    "/health/randevu/[holdId]": {
      tr: "/saglik/randevu/[holdId]",
      en: "/health/randevu/[holdId]",
      de: "/gesundheit/randevu/[holdId]",
      it: "/salute/randevu/[holdId]",
      ru: "/zdorove/randevu/[holdId]",
      uk: "/zdorovya/randevu/[holdId]",
      sr: "/zdravlje/randevu/[holdId]",
      me: "/zdravlje/randevu/[holdId]",
      ar: "/al-sihha/randevu/[holdId]",
    },
    // Booking confirmation (H5b). [token] = appointment manage_token (server-issued).
    "/health/randevu/onay/[token]": {
      tr: "/saglik/randevu/onay/[token]",
      en: "/health/randevu/onay/[token]",
      de: "/gesundheit/randevu/onay/[token]",
      it: "/salute/randevu/onay/[token]",
      ru: "/zdorove/randevu/onay/[token]",
      uk: "/zdorovya/randevu/onay/[token]",
      sr: "/zdravlje/randevu/onay/[token]",
      me: "/zdravlje/randevu/onay/[token]",
      ar: "/al-sihha/randevu/onay/[token]",
    },
    // Short appointment-manage link (H5b). [token] = manage_token; cancel from here.
    "/health/r/[token]": {
      tr: "/saglik/r/[token]",
      en: "/health/r/[token]",
      de: "/gesundheit/r/[token]",
      it: "/salute/r/[token]",
      ru: "/zdorove/r/[token]",
      uk: "/zdorovya/r/[token]",
      sr: "/zdravlje/r/[token]",
      me: "/zdravlje/r/[token]",
      ar: "/al-sihha/r/[token]",
    },
    // Reschedule sub-page (H9). [token] = old manage_token; pick a new slot here.
    "/health/r/[token]/reschedule": {
      tr: "/saglik/r/[token]/reschedule",
      en: "/health/r/[token]/reschedule",
      de: "/gesundheit/r/[token]/reschedule",
      it: "/salute/r/[token]/reschedule",
      ru: "/zdorove/r/[token]/reschedule",
      uk: "/zdorovya/r/[token]/reschedule",
      sr: "/zdravlje/r/[token]/reschedule",
      me: "/zdravlje/r/[token]/reschedule",
      ar: "/al-sihha/r/[token]/reschedule",
    },

    // Health PROVIDER tree (H7a — doctor onboarding + profile/calendar). Auth +
    // flag gated separately from the patient tree (folder app/[locale]/health-pro/*,
    // its OWN route group). tr=/saglik-pro/..., en=/health-pro/...; the bare top
    // segment ('saglik-pro'/'health-pro') is what HEALTH_PRO_FIRST_SEGMENTS guards.
    // Gated + noindex (SEO quarantine) until launch (H11).
    "/health-pro/basvuru": {
      tr: "/saglik-pro/basvuru",
      en: "/health-pro/basvuru",
      de: "/gesundheit-pro/basvuru",
      it: "/salute-pro/basvuru",
      ru: "/zdorove-pro/basvuru",
      uk: "/zdorovya-pro/basvuru",
      sr: "/zdravlje-pro/basvuru",
      me: "/zdravlje-pro/basvuru",
      ar: "/al-sihha-pro/basvuru",
    },
    "/health-pro/profil": {
      tr: "/saglik-pro/profil",
      en: "/health-pro/profil",
      de: "/gesundheit-pro/profil",
      it: "/salute-pro/profil",
      ru: "/zdorove-pro/profil",
      uk: "/zdorovya-pro/profil",
      sr: "/zdravlje-pro/profil",
      me: "/zdravlje-pro/profil",
      ar: "/al-sihha-pro/profil",
    },
    "/health-pro/ayarlar": {
      tr: "/saglik-pro/ayarlar",
      en: "/health-pro/ayarlar",
      de: "/gesundheit-pro/ayarlar",
      it: "/salute-pro/ayarlar",
      ru: "/zdorove-pro/ayarlar",
      uk: "/zdorovya-pro/ayarlar",
      sr: "/zdravlje-pro/ayarlar",
      me: "/zdravlje-pro/ayarlar",
      ar: "/al-sihha-pro/ayarlar",
    },
    "/health-pro/takvim": {
      tr: "/saglik-pro/takvim",
      en: "/health-pro/takvim",
      de: "/gesundheit-pro/takvim",
      it: "/salute-pro/takvim",
      ru: "/zdorove-pro/takvim",
      uk: "/zdorovya-pro/takvim",
      sr: "/zdravlje-pro/takvim",
      me: "/zdravlje-pro/takvim",
      ar: "/al-sihha-pro/takvim",
    },
    // H7b — provider day-ops landing (dashboard + appointment list + manual add).
    "/health-pro/randevular": {
      tr: "/saglik-pro/randevular",
      en: "/health-pro/randevular",
      de: "/gesundheit-pro/randevular",
      it: "/salute-pro/randevular",
      ru: "/zdorove-pro/randevular",
      uk: "/zdorovya-pro/randevular",
      sr: "/zdravlje-pro/randevular",
      me: "/zdravlje-pro/randevular",
      ar: "/al-sihha-pro/randevular",
    },
    // H7b — schedule override editor (holiday/break/extra).
    "/health-pro/randevular/override": {
      tr: "/saglik-pro/randevular/override",
      en: "/health-pro/randevular/override",
      de: "/gesundheit-pro/randevular/override",
      it: "/salute-pro/randevular/override",
      ru: "/zdorove-pro/randevular/override",
      uk: "/zdorovya-pro/randevular/override",
      sr: "/zdravlje-pro/randevular/override",
      me: "/zdravlje-pro/randevular/override",
      ar: "/al-sihha-pro/randevular/override",
    },

    // Work & career vertical (C0 — docs/career/career-vertical-plan-v1.md).
    // Folder lives at app/[locale]/career/*; per-locale slugs follow the
    // services/health pattern. While CAREER_VERTICAL_ENABLED is false,
    // middleware 404s everything under these prefixes except the coming-soon
    // page. The public prefix localizes (kariyer/karriere/carriera/…);
    // gated+internal segments (employer/worker/dashboard/requisitions/register/
    // pool/login/sectors/how-it-works/coming-soon + [sector]/[workerCode]/[id])
    // stay identity (English) like Health's `uzman`/`randevu` — these routes
    // are gated + noindex (SEO quarantine), so the inner segment isn't
    // index-bound. Accent = amber-600 (brandCareer) where Health uses sky-600.
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
    "/career/coming-soon": {
      tr: "/kariyer/coming-soon",
      en: "/career/coming-soon",
      de: "/karriere/coming-soon",
      it: "/carriera/coming-soon",
      ru: "/karera/coming-soon",
      uk: "/kariera/coming-soon",
      sr: "/karijera/coming-soon",
      me: "/karijera/coming-soon",
      ar: "/al-wazaif/coming-soon",
    },
    "/career/how-it-works": {
      tr: "/kariyer/how-it-works",
      en: "/career/how-it-works",
      de: "/karriere/how-it-works",
      it: "/carriera/how-it-works",
      ru: "/karera/how-it-works",
      uk: "/kariera/how-it-works",
      sr: "/karijera/how-it-works",
      me: "/karijera/how-it-works",
      ar: "/al-wazaif/how-it-works",
    },
    "/career/sectors": {
      tr: "/kariyer/sectors",
      en: "/career/sectors",
      de: "/karriere/sectors",
      it: "/carriera/sectors",
      ru: "/karera/sectors",
      uk: "/kariera/sectors",
      sr: "/karijera/sectors",
      me: "/karijera/sectors",
      ar: "/al-wazaif/sectors",
    },
    "/career/sectors/[sector]": {
      tr: "/kariyer/sectors/[sector]",
      en: "/career/sectors/[sector]",
      de: "/karriere/sectors/[sector]",
      it: "/carriera/sectors/[sector]",
      ru: "/karera/sectors/[sector]",
      uk: "/kariera/sectors/[sector]",
      sr: "/karijera/sectors/[sector]",
      me: "/karijera/sectors/[sector]",
      ar: "/al-wazaif/sectors/[sector]",
    },
    "/career/pool": {
      tr: "/kariyer/pool",
      en: "/career/pool",
      de: "/karriere/pool",
      it: "/carriera/pool",
      ru: "/karera/pool",
      uk: "/kariera/pool",
      sr: "/karijera/pool",
      me: "/karijera/pool",
      ar: "/al-wazaif/pool",
    },
    "/career/pool/[workerCode]": {
      tr: "/kariyer/pool/[workerCode]",
      en: "/career/pool/[workerCode]",
      de: "/karriere/pool/[workerCode]",
      it: "/carriera/pool/[workerCode]",
      ru: "/karera/pool/[workerCode]",
      uk: "/kariera/pool/[workerCode]",
      sr: "/karijera/pool/[workerCode]",
      me: "/karijera/pool/[workerCode]",
      ar: "/al-wazaif/pool/[workerCode]",
    },
    "/career/employer": {
      tr: "/kariyer/employer",
      en: "/career/employer",
      de: "/karriere/employer",
      it: "/carriera/employer",
      ru: "/karera/employer",
      uk: "/kariera/employer",
      sr: "/karijera/employer",
      me: "/karijera/employer",
      ar: "/al-wazaif/employer",
    },
    "/career/employer/register": {
      tr: "/kariyer/employer/register",
      en: "/career/employer/register",
      de: "/karriere/employer/register",
      it: "/carriera/employer/register",
      ru: "/karera/employer/register",
      uk: "/kariera/employer/register",
      sr: "/karijera/employer/register",
      me: "/karijera/employer/register",
      ar: "/al-wazaif/employer/register",
    },
    "/career/employer/dashboard": {
      tr: "/kariyer/employer/dashboard",
      en: "/career/employer/dashboard",
      de: "/karriere/employer/dashboard",
      it: "/carriera/employer/dashboard",
      ru: "/karera/employer/dashboard",
      uk: "/kariera/employer/dashboard",
      sr: "/karijera/employer/dashboard",
      me: "/karijera/employer/dashboard",
      ar: "/al-wazaif/employer/dashboard",
    },
    "/career/employer/dashboard/requisitions": {
      tr: "/kariyer/employer/dashboard/requisitions",
      en: "/career/employer/dashboard/requisitions",
      de: "/karriere/employer/dashboard/requisitions",
      it: "/carriera/employer/dashboard/requisitions",
      ru: "/karera/employer/dashboard/requisitions",
      uk: "/kariera/employer/dashboard/requisitions",
      sr: "/karijera/employer/dashboard/requisitions",
      me: "/karijera/employer/dashboard/requisitions",
      ar: "/al-wazaif/employer/dashboard/requisitions",
    },
    "/career/employer/dashboard/requisitions/new": {
      tr: "/kariyer/employer/dashboard/requisitions/new",
      en: "/career/employer/dashboard/requisitions/new",
      de: "/karriere/employer/dashboard/requisitions/new",
      it: "/carriera/employer/dashboard/requisitions/new",
      ru: "/karera/employer/dashboard/requisitions/new",
      uk: "/kariera/employer/dashboard/requisitions/new",
      sr: "/karijera/employer/dashboard/requisitions/new",
      me: "/karijera/employer/dashboard/requisitions/new",
      ar: "/al-wazaif/employer/dashboard/requisitions/new",
    },
    "/career/employer/dashboard/requisitions/[id]": {
      tr: "/kariyer/employer/dashboard/requisitions/[id]",
      en: "/career/employer/dashboard/requisitions/[id]",
      de: "/karriere/employer/dashboard/requisitions/[id]",
      it: "/carriera/employer/dashboard/requisitions/[id]",
      ru: "/karera/employer/dashboard/requisitions/[id]",
      uk: "/kariera/employer/dashboard/requisitions/[id]",
      sr: "/karijera/employer/dashboard/requisitions/[id]",
      me: "/karijera/employer/dashboard/requisitions/[id]",
      ar: "/al-wazaif/employer/dashboard/requisitions/[id]",
    },
    "/career/employer/dashboard/unlocks": {
      tr: "/kariyer/employer/dashboard/unlocks",
      en: "/career/employer/dashboard/unlocks",
      de: "/karriere/employer/dashboard/unlocks",
      it: "/carriera/employer/dashboard/unlocks",
      ru: "/karera/employer/dashboard/unlocks",
      uk: "/kariera/employer/dashboard/unlocks",
      sr: "/karijera/employer/dashboard/unlocks",
      me: "/karijera/employer/dashboard/unlocks",
      ar: "/al-wazaif/employer/dashboard/unlocks",
    },
    "/career/worker": {
      tr: "/kariyer/worker",
      en: "/career/worker",
      de: "/karriere/worker",
      it: "/carriera/worker",
      ru: "/karera/worker",
      uk: "/kariera/worker",
      sr: "/karijera/worker",
      me: "/karijera/worker",
      ar: "/al-wazaif/worker",
    },
    "/career/worker/register": {
      tr: "/kariyer/worker/register",
      en: "/career/worker/register",
      de: "/karriere/worker/register",
      it: "/carriera/worker/register",
      ru: "/karera/worker/register",
      uk: "/kariera/worker/register",
      sr: "/karijera/worker/register",
      me: "/karijera/worker/register",
      ar: "/al-wazaif/worker/register",
    },
    "/career/worker/profile": {
      tr: "/kariyer/worker/profile",
      en: "/career/worker/profile",
      de: "/karriere/worker/profile",
      it: "/carriera/worker/profile",
      ru: "/karera/worker/profile",
      uk: "/kariera/worker/profile",
      sr: "/karijera/worker/profile",
      me: "/karijera/worker/profile",
      ar: "/al-wazaif/worker/profile",
    },
    "/career/worker/documents": {
      tr: "/kariyer/worker/documents",
      en: "/career/worker/documents",
      de: "/karriere/worker/documents",
      it: "/carriera/worker/documents",
      ru: "/karera/worker/documents",
      uk: "/kariera/worker/documents",
      sr: "/karijera/worker/documents",
      me: "/karijera/worker/documents",
      ar: "/al-wazaif/worker/documents",
    },
    "/career/worker/dashboard": {
      tr: "/kariyer/worker/dashboard",
      en: "/career/worker/dashboard",
      de: "/karriere/worker/dashboard",
      it: "/carriera/worker/dashboard",
      ru: "/karera/worker/dashboard",
      uk: "/kariera/worker/dashboard",
      sr: "/karijera/worker/dashboard",
      me: "/karijera/worker/dashboard",
      ar: "/al-wazaif/worker/dashboard",
    },
    "/career/login": {
      tr: "/kariyer/login",
      en: "/career/login",
      de: "/karriere/login",
      it: "/carriera/login",
      ru: "/karera/login",
      uk: "/kariera/login",
      sr: "/karijera/login",
      me: "/karijera/login",
      ar: "/al-wazaif/login",
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
    // Health-specific privacy notice (H10 / PDPL Art.13). A SIBLING of /privacy &
    // /terms — a top-level segment, NOT under /health/, so the health flag-guard
    // middleware (which only blocks HEALTH_FIRST_SEGMENTS / HEALTH_PRO_FIRST_SEGMENTS)
    // NEVER 404s it. It MUST resolve while the vertical flag is OFF because the H5b
    // consent checkbox links to it. Slugs are deliberately distinct from every
    // health first-segment ({saglik,health,gesundheit,salute,zdorove,zdorovya,
    // zdravlje,al-sihha}) to avoid any collision.
    "/health-privacy": {
      tr: "/saglik-gizlilik",
      en: "/health-privacy",
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
    "/settings/appointments": "/settings/appointments",
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
