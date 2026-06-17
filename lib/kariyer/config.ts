/**
 * Glatko Kariyer — single config source for the İş & Kariyer sub-brand
 * (career-vertical-plan-v1.md PART 2). Same "named, modular, separable later
 * WITHOUT a rewrite" posture as Glatko Sağlık: everything host/path/token-shaped
 * for the vertical is declared here so a future carve-out (kariyer.glatko.app or
 * its own domain) is a one-file change. DO NOT scatter "/career" literals or
 * amber hex values across components — import from here.
 *
 * RULE R14: this file MUST exist before the coordinator edits
 * lib/verticals/config.ts (which imports CAREER_ROUTES).
 */

/**
 * next-intl route keys (see i18n/routing.ts `pathnames`). Keys are the
 * locale-neutral identifiers; the per-locale slug (/kariyer, /karijera, …) is
 * resolved by next-intl from the pathnames map. `Link`/`getPathname` accept
 * these keys directly. Canonical English segment is `career`; gated/internal
 * segments stay identity (English) like Health's `uzman`/`randevu`.
 */
export const CAREER_ROUTES = {
  /** İş & Kariyer landing/hero. */
  home: "/career",
  /** Public coming-soon placeholder shown while the flag is dark. */
  comingSoon: "/career/coming-soon",
  /** How It Works (gated-model explainer, both paths). */
  howItWorks: "/career/how-it-works",
  /** Sectors hub. */
  sectors: "/career/sectors",
  /** Talent Pool browse (anonymized cards + filters) — core employer screen. */
  pool: "/career/pool",
  /** Employer landing / value prop. */
  employer: "/career/employer",
  /** Employer registration. */
  employerRegister: "/career/employer/register",
  /** Employer dashboard. */
  employerDashboard: "/career/employer/dashboard",
  /** Worker landing (free-for-you messaging — ILO Employer Pays). */
  worker: "/career/worker",
  /** Worker registration. */
  workerRegister: "/career/worker/register",
  /** Worker profile builder (multi-step). */
  workerProfile: "/career/worker/profile",
  /** Worker document & photo upload center. */
  workerDocuments: "/career/worker/documents",
  /** Worker dashboard / status. */
  workerDashboard: "/career/worker/dashboard",
  /** Role-routed login (may reuse global auth). */
  login: "/career/login",
  /**
   * Target of the career header's "are you an employer? join" link. Today this
   * is the employer landing; flip THIS one constant if a dedicated apply route
   * ships — the header derives the href from here only and never hardcodes a
   * localized slug.
   */
  employerJoin: "/career/employer",
  /**
   * Target of the career header's "are you a worker? join" link (free-for-you).
   * Flip THIS one constant if a dedicated apply route ships.
   */
  workerJoin: "/career/worker",
} as const;

/**
 * Future host for the carved-out sub-brand. `null` today = served under the
 * main app at glatko.app/<locale>/career. When the carve-out happens this
 * becomes "kariyer.glatko.app" and the URL builder switches origins — nothing
 * else in the codebase needs to change.
 */
export const CAREER_HOST: string | null = null;

/** Internal, non-localized brand name (logs, admin, analytics dimensions). */
export const CAREER_INTERNAL_NAME = "Glatko Kariyer";

/** Tailwind accent token group for this vertical (see tailwind.config.ts). */
export const CAREER_ACCENT_TOKEN = "brandCareer" as const;
