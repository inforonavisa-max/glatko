import { glatkoCaptureException } from "@/lib/sentry/glatko-capture";

/**
 * Infobip SMS client — SERVER-ONLY. Single source of truth for outbound SMS.
 *
 * Never import this from a Client Component: it reads INFOBIP_API_KEY, a
 * non-public secret. (Next.js only inlines NEXT_PUBLIC_* env vars into client
 * bundles, so the key cannot leak even by accident, but keep imports on the
 * server — route handlers, server actions, and the standalone test script.)
 *
 * Sprint A uses this from the Supabase Send SMS hook (app/api/auth/sms-hook)
 * to deliver phone-verification one-time codes. Sprint B will call the same
 * `sendSms` from the dispatcher's SMS provider (lib/notifications/dispatcher.ts)
 * so there is exactly one place that talks to Infobip.
 *
 * Endpoint: POST https://{INFOBIP_BASE_URL}/sms/3/messages (v3).
 * Auth:     Authorization: App {INFOBIP_API_KEY}
 * Body:     { messages: [{ sender, destinations: [{ to }], content: { text } }] }
 */

const SMS_PATH = "/sms/3/messages";

/** Infobip status group 5 == REJECTED — a hard send failure. */
const STATUS_GROUP_REJECTED = 5;

export type SendSmsResult =
  | { ok: true; messageId: string; status?: string }
  | { ok: false; error: string };

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
  const apiKey = process.env.INFOBIP_API_KEY;
  const baseUrl = process.env.INFOBIP_BASE_URL;
  const sender = process.env.INFOBIP_SMS_SENDER;
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
  return `sms_http_${status}`;
}

/**
 * Sends a single SMS. Never throws — returns a discriminated result so callers
 * can branch without try/catch. Failures are logged and reported to Sentry.
 *
 * `error` is either a stable machine code (sms_not_configured,
 * sms_network_error, sms_no_message_id, sms_http_<status>) or the raw Infobip
 * rejection text — useful for diagnosing sender/scope/trial issues.
 */
export async function sendSms({
  to,
  text,
}: {
  to: string;
  text: string;
}): Promise<SendSmsResult> {
  const config = getConfig();
  if (!config) {
    console.error(
      "[GLATKO:sms] Infobip not configured (INFOBIP_API_KEY / INFOBIP_BASE_URL / INFOBIP_SMS_SENDER)",
    );
    return { ok: false, error: "sms_not_configured" };
  }

  const endpoint = `${config.origin}${SMS_PATH}`;
  const payload = {
    messages: [
      {
        sender: config.sender,
        destinations: [{ to }],
        content: { text },
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
    console.error("[GLATKO:sms] network error calling Infobip", err);
    glatkoCaptureException(err, { module: "sms-infobip", phase: "fetch" });
    return { ok: false, error: "sms_network_error" };
  }

  const rawText = await response.text();
  let body: unknown = null;
  try {
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    body = rawText;
  }

  if (!response.ok) {
    // Log only the extracted error text + status — NEVER the raw body, which echoes the
    // destination phone (messages[].to) into Vercel logs in cleartext (PII).
    console.error(
      "[GLATKO:sms] Infobip returned non-2xx",
      response.status,
      extractInfobipError(body, response.status),
    );
    glatkoCaptureException(new Error(`Infobip SMS HTTP ${response.status}`), {
      module: "sms-infobip",
      status: String(response.status),
    });
    return { ok: false, error: extractInfobipError(body, response.status) };
  }

  const first = (body as InfobipSendResponse | null)?.messages?.[0];
  const statusName = first?.status?.name;

  if (first?.status?.groupId === STATUS_GROUP_REJECTED) {
    console.error(
      "[GLATKO:sms] Infobip rejected message",
      JSON.stringify(first.status),
    );
    glatkoCaptureException(new Error(`Infobip SMS rejected: ${statusName ?? "unknown"}`), {
      module: "sms-infobip",
      status: statusName ?? "rejected",
    });
    return { ok: false, error: statusName ?? "sms_rejected" };
  }

  if (!first?.messageId) {
    // Log only the status name — NOT the raw body, which echoes the destination phone
    // (messages[].to) into Vercel logs in cleartext (PII).
    console.error(
      "[GLATKO:sms] Infobip response missing messageId",
      statusName ?? "unknown",
    );
    return { ok: false, error: "sms_no_message_id" };
  }

  return { ok: true, messageId: first.messageId, status: statusName };
}
