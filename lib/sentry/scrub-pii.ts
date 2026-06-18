import type { ErrorEvent, EventHint } from "@sentry/nextjs";

/**
 * H10 — Sentry PII scrubber (belt-and-suspenders).
 *
 * The health code is already disciplined: every console.* / glatkoCaptureException
 * call site logs only stable RPC error CODES or static prefixes, never patient
 * phone/email/name/manage_token/OTP. This global beforeSend is a defensive second
 * layer for the one thing call-site discipline cannot cover: an UNCAUGHT exception
 * whose message or stack happens to interpolate a sensitive value. It denylist-
 * redacts phone/email/OTP/manage_token shapes from the event's free-text fields
 * (message, exception values, breadcrumb messages) before the event leaves the
 * process. Non-PII context (tags, op codes, status numbers) is untouched.
 *
 * Pure + exported (redactPii) so it can be unit-tested without a live Sentry SDK.
 */

const REDACTED = "[redacted]";

// Order matters: emails before bare digit-runs so the local-part isn't half-eaten.
const PII_PATTERNS: readonly RegExp[] = [
  // Email addresses.
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // 48-char lowercase hex manage_token (encode(gen_random_bytes(24),'hex')).
  /\b[0-9a-f]{48}\b/g,
  // E.164-ish / long phone numbers (optional +, 8+ digits, allowing spaces/dashes).
  /\+?\d[\d\s().-]{7,}\d/g,
  // Standalone 6-digit OTP codes.
  /\b\d{6}\b/g,
];

/** Redact phone/email/OTP/manage_token shapes from a free-text string. */
export function redactPii(input: string): string {
  let out = input;
  for (const re of PII_PATTERNS) {
    out = out.replace(re, REDACTED);
  }
  return out;
}

function scrubMaybe(value: unknown): unknown {
  return typeof value === "string" ? redactPii(value) : value;
}

/**
 * Sentry `beforeSend` — scrubs the event's free-text fields in place and returns it.
 * Defensive only; never throws (a scrubber failure must not drop the error).
 */
export function scrubEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  try {
    if (typeof event.message === "string") {
      event.message = redactPii(event.message);
    }

    const values = event.exception?.values;
    if (Array.isArray(values)) {
      for (const v of values) {
        if (typeof v.value === "string") v.value = redactPii(v.value);
      }
    }

    if (Array.isArray(event.breadcrumbs)) {
      for (const b of event.breadcrumbs) {
        if (typeof b.message === "string") b.message = redactPii(b.message);
      }
    }

    // Free-text "extra" string values (tags are non-PII by construction).
    if (event.extra && typeof event.extra === "object") {
      for (const k of Object.keys(event.extra)) {
        event.extra[k] = scrubMaybe(event.extra[k]);
      }
    }
  } catch {
    // Never let the scrubber drop or break the event.
  }
  return event;
}
