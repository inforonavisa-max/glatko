import { glatkoCaptureException } from "@/lib/sentry/glatko-capture";

/**
 * Infobip WhatsApp template client — SERVER-ONLY. Single source of truth for
 * outbound WhatsApp template messages (Faz 3-B).
 *
 * Never import this from a Client Component: it reads INFOBIP_WA_SEND_API_KEY,
 * a non-public secret. (Next.js only inlines NEXT_PUBLIC_* env vars into client
 * bundles, so the key cannot leak even by accident, but keep imports on the
 * server — server actions, crons, and the dispatch cascade.)
 *
 * Mirrors lib/sms/infobip.ts on purpose: same getConfig/result-type/error-
 * extraction/Sentry/logging shape, swapped to the WhatsApp v1 template endpoint
 * and the template message body. The WhatsApp SEND key is deliberately separate
 * from INFOBIP_API_KEY (the SMS `sms:message:send` key powering live OTP):
 *   - INFOBIP_WA_SEND_API_KEY  → `whatsapp:message:send` scope (this file)
 *   - INFOBIP_WHATSAPP_SENDER  → approved WhatsApp sender number
 *   - INFOBIP_BASE_URL         → shared account host (same as SMS)
 *
 * Endpoint: POST https://{INFOBIP_BASE_URL}/whatsapp/1/message/template (v1).
 * Auth:     Authorization: App {INFOBIP_WA_SEND_API_KEY}
 * Body:     { messages: [{ from, to, content: { templateName, templateData, language } }] }
 *
 * Callers compose templateName / language / placeholders (and the optional
 * button override for the legacy `bid_accepted_tr` button template) in
 * lib/notifications/whatsapp-templates.ts; this file is transport only and has
 * no per-template knowledge.
 */

const WHATSAPP_TEMPLATE_PATH = "/whatsapp/1/message/template";

/** Infobip status group 5 == REJECTED — a hard send failure (same as SMS). */
const STATUS_GROUP_REJECTED = 5;

export type SendWhatsAppResult =
  | { ok: true; messageId: string; status?: string }
  | { ok: false; error: string };

/**
 * Optional dynamic button parameter. Only the manually-created `bid_accepted_tr`
 * template carries a button (the batch templates put the link in body {{2}}),
 * so this is set solely by that template's builder branch.
 */
export type WhatsAppButtonParam = {
  type: "URL" | "QUICK_REPLY";
  parameter: string;
};

type InfobipStatus = {
  groupId?: number;
  groupName?: string;
  id?: number;
  name?: string;
  description?: string;
};

type InfobipSendResponse = {
  bulkId?: string;
  messages?: Array<{ to?: string; messageId?: string; status?: InfobipStatus }>;
};

type InfobipConfig = { origin: string; apiKey: string; sender: string };

function getConfig(): InfobipConfig | null {
  const apiKey = process.env.INFOBIP_WA_SEND_API_KEY;
  const baseUrl = process.env.INFOBIP_BASE_URL;
  const sender = process.env.INFOBIP_WHATSAPP_SENDER;
  if (!apiKey || !baseUrl || !sender) return null;

  // Accept the base URL with or without a scheme / trailing slash; the portal
  // shows it bare (e.g. "z445v6.api.infobip.com").
  const host = baseUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return { origin: `https://${host}`, apiKey, sender };
}

/** Pull a human-readable message out of an Infobip error body. */
function extractInfobipError(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const svc = (
      body as {
        requestError?: { serviceException?: { text?: string; messageId?: string } };
      }
    ).requestError?.serviceException;
    if (svc?.text) return svc.text;
    if (svc?.messageId) return svc.messageId;
  }
  return `wa_http_${status}`;
}

/**
 * Sends a single WhatsApp template message. Never throws — returns a
 * discriminated result so callers can branch without try/catch. Failures are
 * logged with the `[GLATKO:wa]` prefix and reported to Sentry.
 *
 * `error` is either a stable machine code (wa_not_configured, wa_network_error,
 * wa_no_message_id, wa_http_<status>) or the raw Infobip rejection text —
 * useful for diagnosing sender / scope / template-approval / trial issues.
 *
 * @param to            E.164 destination (with leading +).
 * @param templateName  Approved template name, e.g. "new_quote_en".
 * @param language      Template language code, e.g. "en" / "tr".
 * @param placeholders  Body variables in order ({{1}}, {{2}}, …). May be empty.
 * @param buttonParam   Optional single dynamic button (only `bid_accepted_tr`).
 */
export async function sendWhatsAppTemplate({
  to,
  templateName,
  language,
  placeholders,
  buttonParam,
}: {
  to: string;
  templateName: string;
  language: string;
  placeholders: string[];
  buttonParam?: WhatsAppButtonParam;
}): Promise<SendWhatsAppResult> {
  const config = getConfig();
  if (!config) {
    console.error(
      "[GLATKO:wa] Infobip not configured (INFOBIP_WA_SEND_API_KEY / INFOBIP_BASE_URL / INFOBIP_WHATSAPP_SENDER)",
    );
    return { ok: false, error: "wa_not_configured" };
  }

  const endpoint = `${config.origin}${WHATSAPP_TEMPLATE_PATH}`;
  const payload = {
    messages: [
      {
        from: config.sender,
        to,
        content: {
          templateName,
          templateData: {
            body: { placeholders },
            ...(buttonParam ? { buttons: [buttonParam] } : {}),
          },
          language,
        },
      },
    ],
  };

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `App ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch (err) {
    console.error("[GLATKO:wa] network error calling Infobip", err);
    glatkoCaptureException(err, { module: "whatsapp-infobip", phase: "fetch" });
    return { ok: false, error: "wa_network_error" };
  }

  const rawText = await response.text();
  let body: unknown = null;
  try {
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    body = rawText;
  }

  if (!response.ok) {
    console.error(
      "[GLATKO:wa] Infobip returned non-2xx",
      response.status,
      typeof body === "string" ? body : JSON.stringify(body),
    );
    glatkoCaptureException(new Error(`Infobip WhatsApp HTTP ${response.status}`), {
      module: "whatsapp-infobip",
      status: String(response.status),
    });
    return { ok: false, error: extractInfobipError(body, response.status) };
  }

  const first = (body as InfobipSendResponse | null)?.messages?.[0];
  const statusName = first?.status?.name;

  if (first?.status?.groupId === STATUS_GROUP_REJECTED) {
    console.error(
      "[GLATKO:wa] Infobip rejected message",
      JSON.stringify(first.status),
    );
    glatkoCaptureException(
      new Error(`Infobip WhatsApp rejected: ${statusName ?? "unknown"}`),
      { module: "whatsapp-infobip", status: statusName ?? "rejected" },
    );
    return { ok: false, error: statusName ?? "wa_rejected" };
  }

  if (!first?.messageId) {
    console.error(
      "[GLATKO:wa] Infobip response missing messageId",
      JSON.stringify(body),
    );
    return { ok: false, error: "wa_no_message_id" };
  }

  return { ok: true, messageId: first.messageId, status: statusName };
}
