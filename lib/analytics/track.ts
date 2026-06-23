// lib/analytics/track.ts
//
// Glatko analytics event tracking — customer-side conversion funnel.
//
// All events go through window.gtag() wrapper (IArguments type) because
// GA4 tracker ignores raw dataLayer.push([Array]) pushes; only the
// arguments-object pushes produced by the gtag function are recognized.
// See G-ADS-2.1 hotfix (commit 850c0e9) for the discovery context.
//
// Safe to call from any client component; no-op on the server or if
// dataLayer / gtag are not available yet (e.g. before GTM init).

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gtag?: (...args: any[]) => void;
  }
}

export type GlatkoEventName =
  | "customer_signup"
  | "customer_job_posted"
  | "customer_contact_clicked"
  | "customer_bid_accepted"
  | "customer_message_sent"
  // Supply-side (provider/pro acquisition). Fired when a pro completes the
  // /become-a-pro application — the conversion for pro-acquisition Search/
  // Demand Gen campaigns. Counterpart to customer_job_posted on the demand side.
  | "pro_signup";

export type GlatkoContactChannel = "whatsapp" | "viber" | "phone" | "email";

export interface GlatkoEventParams {
  // Common
  currency?: string;
  value?: number;
  event_category?: string;
  // Funnel-specific (optional, vary by event)
  signup_method?: string;
  customer_user_id?: string;
  job_id?: string;
  job_category?: string;
  bid_id?: string;
  provider_id?: string;
  provider_slug?: string;
  contact_channel?: GlatkoContactChannel;
  thread_id?: string;
  conversation_id?: string;
}

/**
 * Track a customer-side conversion event.
 *
 * Safe to call from any client component — no-op if window/gtag/dataLayer
 * are unavailable. Defines the gtag() helper on first call if missing so
 * we work even if the inline beforeInteractive script hasn't run yet.
 *
 * @example
 *   trackEvent("customer_job_posted", { job_id: row.id, job_category: cat });
 */
export function trackEvent(
  eventName: GlatkoEventName,
  params: GlatkoEventParams = {},
): void {
  if (typeof window === "undefined") return;

  // Ensure dataLayer exists (in case event fires before GTM init).
  // Note: Window.dataLayer is declared globally by @next/third-parties.
  window.dataLayer = window.dataLayer || [];

  // Define local gtag wrapper if not present. Using `arguments` is what
  // makes the pushed entry IArguments-typed — required by GA4 (see file
  // header). Use a non-arrow function to capture arguments correctly.
  if (typeof window.gtag !== "function") {
    window.gtag = function gtag() {
      window.dataLayer = window.dataLayer || [];
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer.push(arguments);
    };
  }

  // Default params merged with caller overrides.
  const fullParams: GlatkoEventParams = {
    currency: "EUR",
    value: 0,
    event_category: "customer_funnel",
    ...params,
  };

  window.gtag("event", eventName, fullParams);

  // Additive belt-and-suspenders for Google Ads: also emit a literal top-level
  // `event` push so a GTM Custom Event trigger (event === "glatko_conversion")
  // fires WITHOUT depending on GTM's gtag-arguments normalization, exposing flat
  // top-level params (the gtag push above nests them under eventModel.*). This
  // drives the Google Ads conversion tag; GTM decides which events count via a
  // {{DLV - conversion_name}} trigger condition. GA4 + Meta keep reading the
  // gtag push above — untouched.
  window.dataLayer.push({
    event: "glatko_conversion",
    conversion_name: eventName,
    conversion_value: fullParams.value ?? 0,
    conversion_currency: fullParams.currency ?? "EUR",
    job_category: fullParams.job_category,
    job_id: fullParams.job_id,
  });

  // Dev-mode debug log — production builds strip console.debug minification-safe.
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.debug("[trackEvent]", eventName, fullParams);
  }
}

// === Meta Pixel + CAPI paralel send (G-ADS-4a) ===

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

/**
 * Generate UUID for event deduplication (Pixel + CAPI same event_id).
 * Browser crypto.randomUUID() supported in modern browsers + Node 19+.
 */
function generateEventId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for very old browsers
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Same as trackEvent() but also fires:
 * - Meta Pixel (fbq) browser-side
 * - Meta CAPI (server-side via /api/meta/capi)
 *
 * Use this for conversion events that should be sent to BOTH GA4 and Meta.
 * Pixel + CAPI share event_id for deduplication.
 *
 * Skeleton-mode safe: if NEXT_PUBLIC_META_PIXEL_ID env is empty, Meta parts
 * are no-op and only GA4 fires. This lets the function ship before Meta
 * Business Manager setup is complete (G-ADS-4b will populate env + upgrade
 * existing trackEvent() callsites to trackEventWithMeta).
 */
export function trackEventWithMeta(
  eventName: GlatkoEventName,
  params: GlatkoEventParams = {},
): void {
  // Always fire GA4 (existing behavior)
  trackEvent(eventName, params);

  if (typeof window === "undefined") return;

  // Skip Meta if Pixel ID missing (skeleton mode)
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  if (!pixelId) return;

  // Map Glatko event to Meta standard event name
  const metaEventMap: Record<GlatkoEventName, string> = {
    customer_signup: "CompleteRegistration",
    customer_job_posted: "Lead",
    customer_contact_clicked: "Contact",
    customer_bid_accepted: "Purchase",
    customer_message_sent: "SubmitApplication",
    // Pro application completed → registration completion in Meta's taxonomy
    // (parallels customer_signup).
    pro_signup: "CompleteRegistration",
  };
  const metaEventName = metaEventMap[eventName];
  if (!metaEventName) return;

  const eventId = generateEventId();

  // 1. Browser-side Pixel
  if (typeof window.fbq === "function") {
    window.fbq(
      "track",
      metaEventName,
      {
        currency: params.currency ?? "EUR",
        value: params.value ?? 0,
        content_category: params.job_category,
        content_ids: params.job_id ? [params.job_id] : undefined,
      },
      { eventID: eventId },
    );
  }

  // 2. Server-side CAPI (fire-and-forget, don't block UI)
  void fetch("/api/meta/capi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_name: metaEventName,
      event_id: eventId,
      event_source_url: window.location.href,
      custom_data: {
        currency: params.currency ?? "EUR",
        value: params.value ?? 0,
        content_category: params.job_category,
        content_ids: params.job_id ? [params.job_id] : undefined,
        job_id: params.job_id,
        job_category: params.job_category,
        bid_id: params.bid_id,
        provider_id: params.provider_id,
        contact_channel: params.contact_channel,
      },
    }),
  }).catch(() => {
    // CAPI failure is non-blocking — Pixel already fired browser-side
  });

  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.debug("[trackEventWithMeta]", eventName, "→", metaEventName, {
      eventId,
    });
  }
}
