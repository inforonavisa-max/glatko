import { getSiteUrl } from "@/lib/email/resend";
import type { LanguageCode } from "@/dictionaries";

/**
 * Faz 3-A — resolve an ABSOLUTE, locale-prefixed deep link for an external-channel
 * notification (SMS {{link}} + WhatsApp/Viber button URL).
 *
 * Built fresh here on purpose: lib/glatko/notification-href.ts is for the in-app
 * next-intl router and returns RELATIVE path objects ({ pathname, params }) —
 * unusable for external channels, which need absolute URLs. Route choices align
 * with the email side (lib/email/dispatch.ts buildEmailForType), which matches the
 * approved template intent (e.g. bid_rejected → "new requests list").
 *
 * Wired + unit-tested in Faz 3-A but NOT yet called by external-dispatch.ts —
 * Faz 3-B connects it to the cascade. Additive; changes no current behavior.
 */

/** First non-empty string among the given data keys (handles camel/snake aliases). */
function firstString(
  data: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const k of keys) {
    const v = data[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "";
}

/** Absolute, locale-prefixed URL. Mirrors lib/email/dispatch.ts buildLocalizedPath. */
function localizedUrl(locale: LanguageCode, path: string): string {
  const base = getSiteUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}/${locale}${p}`;
}

export function resolveExternalLink(
  type: string,
  data: Record<string, unknown> | null | undefined,
  locale: LanguageCode,
): string {
  const d = data ?? {};
  const requestId = firstString(d, "requestId", "request_id");
  const threadId = firstString(d, "threadId", "thread_id");
  const conversationId = firstString(d, "conversationId", "conversation_id");

  switch (type) {
    case "new_quote":
      return localizedUrl(
        locale,
        requestId ? `/my-requests/${requestId}` : "/my-requests",
      );
    case "new_request_match":
      return localizedUrl(
        locale,
        requestId
          ? `/pro/dashboard/requests/${requestId}`
          : "/pro/dashboard/requests",
      );
    case "thread_message":
      return localizedUrl(
        locale,
        threadId ? `/messages/${threadId}` : "/messages",
      );
    case "new_bid":
    case "status_change":
      return localizedUrl(
        locale,
        requestId ? `/dashboard/requests/${requestId}` : "/dashboard/requests",
      );
    case "bid_accepted":
      // Accepting a bid always creates a conversation (conversationId in data),
      // so open it. Safe fallback to the request detail if it is ever absent.
      if (conversationId) {
        return localizedUrl(locale, `/inbox/${conversationId}`);
      }
      return localizedUrl(
        locale,
        requestId ? `/dashboard/requests/${requestId}` : "/pro/dashboard",
      );
    case "bid_rejected":
      // Template intent "new requests list" — aligned with the email route.
      return localizedUrl(locale, "/pro/dashboard/requests");
    case "review":
    case "verification_approved":
      return localizedUrl(locale, "/pro/dashboard");
    case "verification_rejected":
      return localizedUrl(locale, "/pro/dashboard/profile");
    default:
      return localizedUrl(locale, "/notifications");
  }
}
