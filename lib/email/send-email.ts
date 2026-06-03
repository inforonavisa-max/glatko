import type { ReactElement } from "react";
import { render } from "@react-email/render";
import { Redis } from "@upstash/redis/cloudflare";
import { Ratelimit } from "@upstash/ratelimit";
import { getResendClient, EMAIL_FROM } from "@/lib/email/resend";
import { createAdminClient } from "@/supabase/server";

const EMAIL_RATE_PREFIX = "glatko:email-outbound";
const EMAIL_PER_RECIPIENT_PER_HOUR = 10;

/**
 * Hard-bounce / complaint short-circuit. Resend webhooks land in
 * public.email_events; sending to a recipient that previously hard-bounced
 * or filed a spam complaint hurts domain reputation, so we drop the send
 * without ever calling Resend.
 *
 * Soft bounces (mailbox full, transient) are NOT in this check — they self-
 * resolve and we want to keep retrying.
 *
 * Fail-open on lookup error: a missing Supabase or table is bad infra, but
 * blocking auth emails because of it is worse than the deliverability hit.
 */
async function isRecipientBlocked(recipient: string): Promise<{
  blocked: boolean;
  reason?: string;
}> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("email_events")
      .select("event_type, bounce_type")
      .eq("recipient", recipient.toLowerCase().trim())
      .in("event_type", ["bounced", "complained"])
      .limit(20);

    if (error) {
      // Migration may not be applied yet in some environments; fail open.
      return { blocked: false };
    }
    if (!data || data.length === 0) return { blocked: false };

    for (const row of data) {
      if (row.event_type === "complained") {
        return { blocked: true, reason: "previous spam complaint" };
      }
      if (row.event_type === "bounced" && row.bounce_type === "hard") {
        return { blocked: true, reason: "previous hard bounce" };
      }
    }
    return { blocked: false };
  } catch {
    return { blocked: false };
  }
}

let emailOutboundLimiter: Ratelimit | null | undefined;

function getEmailOutboundLimiter(): Ratelimit | null {
  if (emailOutboundLimiter !== undefined) return emailOutboundLimiter;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    emailOutboundLimiter = null;
    return null;
  }

  const redis = new Redis({ url, token });
  emailOutboundLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(
      EMAIL_PER_RECIPIENT_PER_HOUR,
      "1 h",
    ),
    analytics: false,
    prefix: EMAIL_RATE_PREFIX,
  });

  return emailOutboundLimiter;
}

export type SendEmailResult =
  | { success: true; messageId?: string }
  | { success: false; error: string; skipped?: boolean };

export type SendEmailOptions = {
  to: string;
  subject: string;
  react: ReactElement;
  /** Optional plain-text fallback (improves deliverability + accessibility). */
  text?: string;
  /** Optional Resend tags for analytics filtering (e.g. category=auth, type=recovery). */
  tags?: { name: string; value: string }[];
  /**
   * Optional custom SMTP headers passed through to Resend. Used for
   * List-Unsubscribe + List-Unsubscribe-Post (RFC 8058 one-click) and
   * X-Entity-Ref-ID (per-recipient grouping in Gmail).
   */
  headers?: Record<string, string>;
  /**
   * Skip the Upstash 10/recipient/hour rate limiter. Use for system-critical
   * flows (auth password reset, signup confirmation) where dropping a mail
   * is worse than letting an attacker burn the bucket — Supabase's own
   * minimum-interval setting acts as the upstream limiter for those.
   */
  skipRateLimit?: boolean;
};

/**
 * Renders a React Email template and sends via Resend.
 * Optional Upstash limit: max 10 emails per recipient per hour (fail-open if Redis errors / missing).
 */
export async function sendEmail(
  options: SendEmailOptions,
): Promise<SendEmailResult> {
  // Phone-only accounts have no email (profiles.email / auth email is NULL).
  // Bail before Resend so we never send to a blank/whitespace recipient or a
  // synthetic placeholder address. Central guard: callers already check, this
  // protects every future caller (e.g. the phone-OTP signup path) too.
  const recipient = options.to?.trim();
  if (!recipient) {
    return { success: false, error: "No recipient email", skipped: true };
  }

  const client = getResendClient();
  if (!client) {
    console.warn("[GLATKO:email] skip send: Resend client unavailable");
    return {
      success: false,
      error: "Resend not configured",
      skipped: true,
    };
  }

  // Hard-bounce / complaint check (G-DELIVERABILITY-1). Runs even for
  // skipRateLimit auth flows — sending to a known-dead address is a
  // reputation hit even when the user "needs" the email.
  const blocked = await isRecipientBlocked(options.to);
  if (blocked.blocked) {
    console.warn(
      "[GLATKO:email] skip send: recipient flagged",
      options.to,
      blocked.reason,
    );
    return {
      success: false,
      error: `Recipient blocked: ${blocked.reason}`,
      skipped: true,
    };
  }

  const limiter = options.skipRateLimit ? null : getEmailOutboundLimiter();
  if (limiter) {
    try {
      const recipientKey = options.to.toLowerCase().trim();
      const { success } = await limiter.limit(recipientKey);
      if (!success) {
        console.warn(
          "[GLATKO:email] rate limit exceeded for recipient",
          recipientKey,
        );
        return {
          success: false,
          error: "Email rate limit exceeded for this recipient",
          skipped: true,
        };
      }
    } catch (err) {
      console.warn(
        "[GLATKO:email] rate limit check failed; continuing (fail-open)",
        err instanceof Error ? err.message : err,
      );
    }
  }

  let html: string;
  try {
    html = await render(options.react);
  } catch (err) {
    console.error("[GLATKO-EMAIL] render failed", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Email render failed",
    };
  }

  try {
    const { data, error } = await client.emails.send({
      from: EMAIL_FROM,
      to: options.to,
      subject: options.subject,
      html,
      ...(options.text ? { text: options.text } : {}),
      ...(options.tags && options.tags.length > 0 ? { tags: options.tags } : {}),
      ...(options.headers && Object.keys(options.headers).length > 0
        ? { headers: options.headers }
        : {}),
    });

    if (error) {
      console.error("[GLATKO:email] Resend API error", error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    console.error("[GLATKO:email] send failed", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Email send failed",
    };
  }
}
