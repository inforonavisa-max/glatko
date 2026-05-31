// lib/analytics/consent.ts
//
// Single source of truth for cookie-consent state + Consent Mode v2 mapping
// (G-ADS-5 granular consent). Pure helpers — no DOM side effects — so this stays
// unit-testable and importable from anywhere.
//
// ⚠️ Two inline `beforeInteractive` scripts re-implement readConsent() +
// categoriesToConsentMode() as raw JS because they run BEFORE hydration and
// cannot import this module:
//   - app/layout.tsx                      → <Script id="gtm-consent-mount-restore">
//   - components/glatko/analytics/MetaPixel.tsx → <Script id="fbq-consent-default">
// Keep the localStorage format and the category→signal mapping in sync across
// all three. The G-ADS-2.1 returning-visitor fix (gcs=G111) depends on the
// mount-restore script applying these signals within wait_for_update.

export const CONSENT_KEY = "glatko-cookie-consent";
export const CONSENT_VERSION = 2;

export type ConsentValue = "granted" | "denied";

/** User-facing consent categories. `necessary` is always granted. */
export type ConsentCategories = {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
};

/** Persisted shape in localStorage (versioned JSON). */
export type ConsentState = {
  v: number;
  necessary: true;
  analytics: boolean;
  marketing: boolean;
};

/**
 * Map the 3 user-facing categories onto the 7 Google Consent Mode v2 signals.
 * - Necessary → security_storage (always granted)
 * - Analytics → analytics_storage, functionality_storage, personalization_storage
 * - Marketing → ad_storage, ad_user_data, ad_personalization
 */
export function categoriesToConsentMode(
  c: ConsentCategories,
): Record<string, ConsentValue> {
  const analytics: ConsentValue = c.analytics ? "granted" : "denied";
  const marketing: ConsentValue = c.marketing ? "granted" : "denied";
  return {
    security_storage: "granted",
    analytics_storage: analytics,
    functionality_storage: analytics,
    personalization_storage: analytics,
    ad_storage: marketing,
    ad_user_data: marketing,
    ad_personalization: marketing,
  };
}

/**
 * Read the stored consent, or `null` if the visitor has not chosen yet.
 *
 * Backward-compat: the pre-G-ADS-5 value was the literal string `"accepted"`
 * (binary all-or-nothing). Treat it as a full grant so returning visitors keep
 * their consent — and the banner stays hidden — without being re-asked.
 */
export function readConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  if (raw === "accepted") {
    return { v: CONSENT_VERSION, necessary: true, analytics: true, marketing: true };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "analytics" in parsed) {
      const p = parsed as Partial<ConsentState>;
      return {
        v: CONSENT_VERSION,
        necessary: true,
        analytics: !!p.analytics,
        marketing: !!p.marketing,
      };
    }
  } catch {
    /* malformed JSON — treat as "no consent yet" */
  }
  return null;
}

/** Persist the chosen categories (necessary is forced on). */
export function writeConsent(c: ConsentCategories): void {
  if (typeof window === "undefined") return;
  const state: ConsentState = {
    v: CONSENT_VERSION,
    necessary: true,
    analytics: c.analytics,
    marketing: c.marketing,
  };
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify(state));
  } catch {
    /* storage blocked (private mode / quota) — non-fatal */
  }
}

/** Meta Pixel consent is binary (grant/revoke); map it to the marketing category. */
export function fbqConsentFromCategories(c: ConsentCategories): "grant" | "revoke" {
  return c.marketing ? "grant" : "revoke";
}
