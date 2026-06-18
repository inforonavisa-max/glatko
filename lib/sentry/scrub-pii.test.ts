import { describe, it, expect } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { redactPii, scrubEvent } from "./scrub-pii";

/**
 * H10 #4 — executable proof that the Sentry beforeSend scrubber strips every PII
 * shape the health flow could conceivably leak (phone / email / OTP / 48-hex
 * manage_token) while leaving non-PII context (stable codes, status numbers,
 * op tags) intact. This is the defensive belt behind the already-disciplined
 * call sites.
 */

describe("redactPii — PII shapes are removed", () => {
  it("redacts E.164 / long phone numbers", () => {
    expect(redactPii("send to +38267123456 failed")).not.toMatch(/\+?\d{8,}/);
    expect(redactPii("dest 067 123 456")).toContain("[redacted]");
  });

  it("redacts email addresses", () => {
    const out = redactPii("notify patient@example.com about booking");
    expect(out).not.toContain("@example.com");
    expect(out).toContain("[redacted]");
  });

  it("redacts a 48-char hex manage_token", () => {
    const token = "a".repeat(48);
    expect(redactPii(`manage ${token} not found`)).not.toContain(token);
  });

  it("redacts a standalone 6-digit OTP code", () => {
    expect(redactPii("code 364323 wrong")).not.toContain("364323");
  });

  it("leaves stable codes / short numbers / op tags intact", () => {
    expect(redactPii("SLOT_TAKEN")).toBe("SLOT_TAKEN");
    expect(redactPii("NOT_FOUND")).toBe("NOT_FOUND");
    expect(redactPii("sms_http_502")).toBe("sms_http_502");
    expect(redactPii("decision_email_approved")).toBe("decision_email_approved");
    // A 3-digit status must survive (not a 6-digit OTP).
    expect(redactPii("status 409")).toBe("status 409");
  });
});

describe("scrubEvent — full event sweep", () => {
  it("scrubs message, exception value, breadcrumb and extra; never throws", () => {
    const event: ErrorEvent = {
      message: "failed for patient@example.com",
      exception: { values: [{ type: "Error", value: `token ${"f".repeat(48)} expired` }] },
      breadcrumbs: [{ message: "called +38267123456" }],
      extra: { note: "code 364323", op: "decision_email_rejected", count: 3 },
    } as unknown as ErrorEvent;

    const out = scrubEvent(event)!;
    expect(out.message).not.toContain("@example.com");
    expect(out.exception?.values?.[0]?.value).not.toContain("f".repeat(48));
    expect(out.breadcrumbs?.[0]?.message).not.toContain("38267123456");
    expect(String(out.extra?.note)).not.toContain("364323");
    // Non-PII context preserved.
    expect(out.extra?.op).toBe("decision_email_rejected");
    expect(out.extra?.count).toBe(3);
  });

  it("returns the event untouched when there is nothing to scrub", () => {
    const event = { message: "SLOT_TAKEN" } as ErrorEvent;
    expect(scrubEvent(event)?.message).toBe("SLOT_TAKEN");
  });
});
