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

/** Per-attempt fetch timeout. A hung socket otherwise blocks until the route's
 *  maxDuration, at which point the frozen function tears the socket down
 *  ("other side closed"). Bounding it turns a hang into a clean {ok:false}. */
const SMS_TIMEOUT_MS = 10_000;
/** Backoff before each retry (ms). Length also caps the retry count. */
const SMS_RETRY_BACKOFF_MS = [300, 800] as const;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One attempt + whether the failure is worth retrying (transient). */
type SmsAttempt = { result: SendSmsResult; retryable: boolean };

async function attemptSendSms(
  config: InfobipConfig,
  to: string,
  text: string,
  timeoutMs: number,
): Promise<SmsAttempt> {
  const endpoint = `${config.origin}${SMS_PATH}`;
  const payload = {
    messages: [
      { sender: config.sender, destinations: [{ to }], content: { text } },
    ],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
      signal: controller.signal,
    });
  } catch (err) {
    // Timeout (our abort): the request may have been received, so do NOT retry
    // — a retry could duplicate the SMS. Genuine network failure: retry.
    if ((err as { name?: string })?.name === "AbortError") {
      console.error("[GLATKO:sms] Infobip request timed out", timeoutMs);
      glatkoCaptureException(err, { module: "sms-infobip", phase: "timeout" });
      return { result: { ok: false, error: "sms_timeout" }, retryable: false };
    }
    console.error("[GLATKO:sms] network error calling Infobip", err);
    glatkoCaptureException(err, { module: "sms-infobip", phase: "fetch" });
    return { result: { ok: false, error: "sms_network_error" }, retryable: true };
  } finally {
    clearTimeout(timer);
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
    return {
      result: { ok: false, error: extractInfobipError(body, response.status) },
      // 5xx = server-side, safe to retry; 4xx = our request is wrong, do not.
      retryable: response.status >= 500,
    };
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
    return { result: { ok: false, error: statusName ?? "sms_rejected" }, retryable: false };
  }

  if (!first?.messageId) {
    // Log only the status name — NOT the raw body, which echoes the destination phone
    // (messages[].to) into Vercel logs in cleartext (PII).
    console.error(
      "[GLATKO:sms] Infobip response missing messageId",
      statusName ?? "unknown",
    );
    return { result: { ok: false, error: "sms_no_message_id" }, retryable: false };
  }

  return {
    result: { ok: true, messageId: first.messageId, status: statusName },
    retryable: false,
  };
}

/**
 * Sends a single SMS. Never throws — returns a discriminated result so callers
 * can branch without try/catch. Failures are logged and reported to Sentry.
 *
 * Resilience (G-NOTIFICATION-RESILIENCE-01):
 *  • `timeoutMs` bounds each attempt with an AbortController so a hung socket
 *    returns {ok:false, error:"sms_timeout"} instead of blocking to maxDuration.
 *  • `retries` re-sends ONLY on transient failures (genuine network error / 5xx)
 *    with backoff. Timeouts and permanent failures (4xx, rejected, missing id)
 *    are never retried. OTP callers pass `retries: 0` to avoid duplicate codes.
 *
 * `error` is either a stable machine code (sms_not_configured, sms_timeout,
 * sms_network_error, sms_no_message_id, sms_http_<status>) or the raw Infobip
 * rejection text — useful for diagnosing sender/scope/trial issues.
 */
export async function sendSms({
  to,
  text,
  timeoutMs = SMS_TIMEOUT_MS,
  retries = 1,
}: {
  to: string;
  text: string;
  timeoutMs?: number;
  retries?: number;
}): Promise<SendSmsResult> {
  const config = getConfig();
  if (!config) {
    console.error(
      "[GLATKO:sms] Infobip not configured (INFOBIP_API_KEY / INFOBIP_BASE_URL / INFOBIP_SMS_SENDER)",
    );
    return { ok: false, error: "sms_not_configured" };
  }

  const maxAttempts = Math.max(0, retries) + 1;
  let last: SendSmsResult = { ok: false, error: "sms_not_attempted" };
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { result, retryable } = await attemptSendSms(config, to, text, timeoutMs);
    if (result.ok) return result;
    last = result;
    if (!retryable || attempt === maxAttempts - 1) return result;
    await sleep(SMS_RETRY_BACKOFF_MS[attempt] ?? 800);
  }
  return last;
}
