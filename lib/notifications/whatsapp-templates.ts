import { resolveExternalLink } from "@/lib/notifications/external-link";
import {
  isStatusChangeCode,
  statusLabelFromDict,
} from "@/lib/notifications/status-labels";
import type { LanguageCode } from "@/dictionaries";
import type { WhatsAppButtonParam } from "@/lib/whatsapp/infobip";

/**
 * Faz 3-B — maps a fired notification to an approved Infobip WhatsApp template
 * + ordered placeholders. PURE (no IO): the caller passes the localized `status`
 * dictionary namespace, so this stays unit-testable. lib/whatsapp/infobip.ts is
 * the transport; this module owns all per-template knowledge.
 *
 * Template names follow `{type}_{lang}` (scripts/wa_template_batch.py), with two
 * manually-created TR pilots:
 *   - new_quote_tr  → has a URL button (NOT used).
 *   - new_quote_tr_v2 → BUTTON-FREE, body-only ([name, link]) → the one we send.
 *   - bid_accepted_tr → the ONLY button template we send: body {{1}} = customer
 *     name, deep link rides a dynamic URL button registered as
 *     `https://glatko.app/tr/inbox/{{1}}`, so the button parameter is the
 *     conversationId (a suffix), NOT the full URL.
 * Every other template is buttonless with the link in the body: {{1}}=content,
 * {{2}}=link for content types (LINK_POS=2); {{1}}=link for link-only types.
 */

/** WhatsApp template languages. `me` (Montenegrin) has no WA template → `sr`. */
export type WaTemplateLang =
  | "tr"
  | "en"
  | "de"
  | "it"
  | "ru"
  | "uk"
  | "sr"
  | "ar";

const WA_LANGS: readonly WaTemplateLang[] = [
  "tr",
  "en",
  "de",
  "it",
  "ru",
  "uk",
  "sr",
  "ar",
];

/**
 * Fired notification type → WhatsApp template base type (unlisted = identity).
 * `new_bid` reuses the `new_quote` template TEXT while its deep link still uses
 * the new_bid route (resolveExternalLink keys off the FIRED type). `message`
 * reuses `thread_message`, though `message` never reaches external dispatch in
 * practice (deferred-to-cron with no cron re-firing it) — kept as a safe
 * identity so an unexpected external `message` still resolves a template.
 */
export const TYPE_TO_TEMPLATE: Record<string, string> = {
  new_bid: "new_quote",
  message: "thread_message",
};

/**
 * Mapped template types whose body carries a content var ({{1}}=content,
 * {{2}}=link; LINK_POS=2). All other sendable types are link-only ({{1}}=link).
 */
const CONTENT_AND_LINK = new Set<string>([
  "new_quote",
  "new_request_match",
  "thread_message",
  "bid_accepted",
  "status_change",
]);

/** Resolve the WhatsApp template language for an app locale (`me` → `sr`). */
export function localeToTemplateLang(locale: LanguageCode): WaTemplateLang {
  if (locale === "me") return "sr";
  return (WA_LANGS as readonly string[]).includes(locale)
    ? (locale as WaTemplateLang)
    : "en";
}

/** Approved template name for a fired type + WA language. */
export function templateName(firedType: string, lang: WaTemplateLang): string {
  const mapped = TYPE_TO_TEMPLATE[firedType] ?? firedType;
  // The TR new_quote we send is the BUTTON-FREE v2 (body-only) — consistent
  // with the other-language new_quote templates.
  if (mapped === "new_quote" && lang === "tr") return "new_quote_tr_v2";
  return `${mapped}_${lang}`;
}

export type WaTemplateMessage = {
  templateName: string;
  language: WaTemplateLang;
  placeholders: string[];
  buttonParam?: WhatsAppButtonParam;
};

/** Non-empty trimmed string field from a notification `data` bag. */
function str(
  data: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const v = data?.[key];
  return typeof v === "string" && v.trim() ? v : undefined;
}

/** The {{1}} content value for content-bearing templates, keyed off FIRED type. */
function contentForType(
  firedType: string,
  data: Record<string, unknown> | undefined,
  title: string,
  statusDict: Record<string, string> | undefined,
): string | undefined {
  switch (firedType) {
    case "new_bid":
    case "new_quote":
      return str(data, "professionalName");
    case "bid_accepted":
    case "new_request_match":
      return str(data, "customerName");
    case "thread_message":
    case "message":
      // The cron sets title = sender display name (resolveThreadSenderName).
      return title.trim() || undefined;
    case "status_change": {
      const code = data?.statusCode;
      if (!isStatusChangeCode(code)) return undefined;
      return statusLabelFromDict(code, statusDict);
    }
    default:
      return undefined;
  }
}

/**
 * Build the WhatsApp template-send payload for a fired notification, or `null`
 * when the type/data can't produce a valid template (caller falls back to SMS).
 *
 * @param statusDict the localized `status` dictionary namespace — required only
 *   for status_change; pass `(await getDictionary(locale)).status`.
 */
export function buildWhatsAppTemplateMessage(args: {
  type: string;
  data?: Record<string, unknown>;
  title: string;
  locale: LanguageCode;
  statusDict?: Record<string, string>;
}): WaTemplateMessage | null {
  const { type, data, title, locale, statusDict } = args;
  const mapped = TYPE_TO_TEMPLATE[type] ?? type;
  const lang = localeToTemplateLang(locale);
  const name = templateName(type, lang);
  const link = resolveExternalLink(type, data ?? null, locale);

  // bid_accepted_tr is the ONLY button template. Body {{1}} = customer name; the
  // deep link rides a dynamic URL button whose registered base is
  // https://glatko.app/tr/inbox/{{1}}, so the button parameter is the
  // conversationId (the suffix), NOT the full URL. No conversation → SMS.
  if (mapped === "bid_accepted" && lang === "tr") {
    const content = str(data, "customerName");
    const conversationId = str(data, "conversationId");
    if (!content || !conversationId) return null;
    return {
      templateName: name,
      language: lang,
      placeholders: [content],
      buttonParam: { type: "URL", parameter: conversationId },
    };
  }

  if (CONTENT_AND_LINK.has(mapped)) {
    const content = contentForType(type, data, title, statusDict);
    if (!content) return null; // missing content var → SMS fallback
    return {
      templateName: name,
      language: lang,
      placeholders: [content, link],
    };
  }

  // Link-only templates (LINK_POS=1): {{1}} = link.
  return { templateName: name, language: lang, placeholders: [link] };
}
