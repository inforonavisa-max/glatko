import { describe, it, expect, vi } from "vitest";

// dictionaries/index.ts uses React's `cache` (a Next/React-canary API absent in
// the plain `react` vitest loads). Polyfill it as identity so getDictionary —
// pulled in transitively by external-dispatch — imports cleanly under Node.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});

import {
  composeSmsText,
  deliverExternal,
  type ExternalSenders,
} from "@/lib/notifications/external-dispatch";
import { resolveExternalLink } from "@/lib/notifications/external-link";
import { getDictionary } from "@/dictionaries";

/**
 * G-PROVIDER-RESPONSE-FLOW-01 — the post-notification action chain.
 *
 * The founding-pro live case: a matched pro got a linkless, English SMS and
 * could not reach the request to send a quote. These tests lock the fix:
 *   A  the outbound SMS now carries a deep link (composeSmsText 3rd arg),
 *   E  new_request_match links to /pro/dashboard/leads (the quote screen),
 *      NOT the view-only /pro/dashboard/requests/[id],
 *   B  the SMS body is the recipient-locale copy, not the stored English.
 */

/** Approved decision for an SMS-only recipient (WhatsApp not eligible). */
function smsDecision(locale: "me" | "en" | "tr" = "me") {
  return {
    send: true as const,
    phone: "+38260000000",
    order: ["viber", "whatsapp", "sms"] as Array<"viber" | "whatsapp" | "sms">,
    critical: false,
    locale,
    whatsappEligible: false,
  };
}

/** Fake transports that capture the SMS text and never hit the network. */
function fakeSenders(over: Partial<ExternalSenders> = {}): {
  senders: ExternalSenders;
  sent: { text: string | null };
} {
  const sent: { text: string | null } = { text: null };
  const senders: ExternalSenders = {
    sendWhatsAppTemplate: async () => ({ ok: false, error: "not_eligible" }),
    sendSms: async ({ text }) => {
      sent.text = text;
      return { ok: true, messageId: "test-msg-1" };
    },
    loadStatusDict: async () => ({}),
    loadSmsCopy: async (type, locale) =>
      type === "new_request_match" ? `LOCAL_${locale}` : undefined,
    ...over,
  };
  return { senders, sent };
}

describe("resolveExternalLink — new_request_match (E)", () => {
  it("points to the actionable /leads screen, not the view-only request page", () => {
    const url = resolveExternalLink(
      "new_request_match",
      { requestId: "req-123" },
      "me",
    );
    expect(url).toMatch(/\/me\/pro\/dashboard\/leads$/);
    // Must NOT route to the view-only detail page (bid intake closed there).
    expect(url).not.toContain("/pro/dashboard/requests");
  });

  it("ignores requestId (leads is a list, not an [id] route)", () => {
    const withId = resolveExternalLink("new_request_match", { requestId: "x" }, "en");
    const without = resolveExternalLink("new_request_match", {}, "en");
    expect(withId).toBe(without);
    expect(without).toMatch(/\/en\/pro\/dashboard\/leads$/);
  });
});

describe("composeSmsText — link handling (A)", () => {
  it("appends the link after the message", () => {
    expect(composeSmsText("Title", "Body", "https://x/y")).toBe(
      "Title: Body https://x/y",
    );
  });

  it("never truncates the link, only the message", () => {
    const longMsg = "x".repeat(400);
    const link = "https://glatko.app/me/pro/dashboard/leads";
    const out = composeSmsText(longMsg, undefined, link);
    expect(out.endsWith(link)).toBe(true);
    expect(out.length).toBeLessThanOrEqual(160);
  });

  it("is unchanged when no link is given (backward compatible)", () => {
    expect(composeSmsText("Title", "Body")).toBe("Title: Body");
  });
});

describe("deliverExternal — SMS path (A + B + E)", () => {
  it("sends the recipient-locale body + the /leads deep link, not English", async () => {
    const { senders, sent } = fakeSenders();
    const res = await deliverExternal(
      {
        type: "new_request_match",
        title: "New matching request",
        body: 'A new request in your area matches your services: "x".',
        data: { requestId: "req-123" },
      },
      smsDecision("me"),
      senders,
    );

    expect(res).toEqual({ sent: true, channel: "sms" });
    expect(sent.text).toContain("LOCAL_me"); // localized copy used
    expect(sent.text).toMatch(/\/me\/pro\/dashboard\/leads$/); // deep link present
    expect(sent.text).not.toContain("New matching request"); // no stored English
  });

  it("falls back to stored title/body for non-localized types, still with a link", async () => {
    const { senders, sent } = fakeSenders();
    const res = await deliverExternal(
      {
        type: "verification_approved",
        title: "You're verified",
        body: "Your profile is live.",
        data: {},
      },
      smsDecision("en"),
      senders,
    );

    expect(res.sent).toBe(true);
    expect(sent.text).toContain("You're verified");
    expect(sent.text).toMatch(/https?:\/\//); // a deep link was appended
  });
});

describe("dictionary wiring — newRequestMatch.sms exists in every locale (B)", () => {
  const locales = ["tr", "en", "ru", "ar", "me", "uk", "it", "de", "sr"] as const;
  it.each(locales)("%s has a non-empty localized SMS string", async (loc) => {
    const dict = (await getDictionary(loc)) as {
      notifications?: { newRequestMatch?: { sms?: string } };
    };
    const sms = dict.notifications?.newRequestMatch?.sms;
    expect(typeof sms).toBe("string");
    expect((sms ?? "").trim().length).toBeGreaterThan(0);
  });
});
