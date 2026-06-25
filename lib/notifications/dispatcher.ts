/**
 * Hot-swappable notification dispatcher.
 *
 * G-REQ-2 ships with email-only delivery via Resend (the existing pipeline
 * in lib/email/dispatch.ts). The interface below is the forward-compat
 * seam: when the legal entity is set up and Infobip Viber Business / SMS
 * are provisioned, flipping a provider's isEnabled() to true and filling
 * in send() turns on additional channels with no changes to callers.
 *
 * Cascade semantics: try a high-signal channel first (Viber → SMS),
 * stop on the first delivery, fall back to email. Multi-channel sends
 * (email + push) use sendAll() which fires every enabled provider.
 */
import { createNotification } from "@/lib/supabase/glatko.server";
import { glatkoCaptureException } from "@/lib/sentry/glatko-capture";

export type NotificationChannel =
  | "email"
  | "viber"
  | "sms"
  | "whatsapp"
  | "push";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export interface NotificationRecipient {
  userId: string;
  email?: string | null;
  phone?: string | null;
  viberId?: string | null;
  locale?: string | null;
}

export interface NotificationPayload {
  to: NotificationRecipient;
  /** Notification type — maps to template router in lib/email/dispatch.ts. */
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  priority?: NotificationPriority;
  /**
   * Background/cron callers set this so the underlying createNotification AWAITS
   * the external (SMS/WhatsApp) dispatch instead of fire-and-forget — preventing
   * the serverless function from freezing mid-fetch. See
   * G-NOTIFICATION-RESILIENCE-01. Interactive callers omit it.
   */
  waitForExternal?: boolean;
}

export interface ProviderResult {
  success: boolean;
  channel: NotificationChannel;
  messageId?: string;
  error?: string;
}

export interface NotificationProvider {
  readonly channel: NotificationChannel;
  isEnabled(): boolean;
  send(payload: NotificationPayload): Promise<ProviderResult>;
}

/* ─── Resend email (active) ──────────────────────────────────────────── */

/**
 * Delegates to the existing in-app + email pipeline (createNotification).
 * That helper inserts into glatko_notifications and triggers
 * dispatchNotificationEmail, which respects user prefs, quiet hours,
 * and the daily cap. The dispatcher keeps the same guarantees — adding
 * Viber later won't bypass them.
 */
class ResendEmailProvider implements NotificationProvider {
  readonly channel: NotificationChannel = "email";

  isEnabled(): boolean {
    return Boolean(process.env.RESEND_API_KEY);
  }

  async send(payload: NotificationPayload): Promise<ProviderResult> {
    if (!this.isEnabled()) {
      return {
        success: false,
        channel: this.channel,
        error: "Resend not configured",
      };
    }
    try {
      await createNotification(
        {
          user_id: payload.to.userId,
          type: payload.type,
          title: payload.title,
          body: payload.body,
          data: payload.data,
        },
        { waitForExternal: payload.waitForExternal },
      );
      return { success: true, channel: this.channel };
    } catch (err) {
      glatkoCaptureException(err, {
        module: "notifications-dispatcher",
        provider: "resend",
        type: payload.type,
      });
      return {
        success: false,
        channel: this.channel,
        error: err instanceof Error ? err.message : "Resend send failed",
      };
    }
  }
}

/* ─── Infobip stubs (forward-compat) ─────────────────────────────────── */

/**
 * Infobip Viber Business Messages.
 * Activated when:
 *   1. INFOBIP_API_KEY + INFOBIP_VIBER_SENDER are set
 *   2. The Glatko legal entity has Viber Business onboarded
 * Until then send() returns success=false so the cascade falls through
 * to email.
 */
class InfobipViberProvider implements NotificationProvider {
  readonly channel: NotificationChannel = "viber";

  isEnabled(): boolean {
    return Boolean(
      process.env.INFOBIP_API_KEY && process.env.INFOBIP_VIBER_SENDER,
    );
  }

  async send(payload: NotificationPayload): Promise<ProviderResult> {
    if (!this.isEnabled()) {
      return {
        success: false,
        channel: this.channel,
        error: "Infobip Viber not configured",
      };
    }
    void payload;
    // POST {base}.infobip.com/viber/2/messages — wire here once provisioned.
    return {
      success: false,
      channel: this.channel,
      error: "Infobip Viber send() not implemented yet",
    };
  }
}

class InfobipSMSProvider implements NotificationProvider {
  readonly channel: NotificationChannel = "sms";

  isEnabled(): boolean {
    return Boolean(process.env.INFOBIP_API_KEY);
  }

  async send(payload: NotificationPayload): Promise<ProviderResult> {
    if (!this.isEnabled()) {
      return {
        success: false,
        channel: this.channel,
        error: "Infobip SMS not configured",
      };
    }
    void payload;
    // POST {base}.infobip.com/sms/2/text/advanced
    return {
      success: false,
      channel: this.channel,
      error: "Infobip SMS send() not implemented yet",
    };
  }
}

/* ─── Dispatcher ─────────────────────────────────────────────────────── */

export class NotificationDispatcher {
  private readonly providers: NotificationProvider[];

  constructor(providers?: NotificationProvider[]) {
    this.providers = providers ?? [
      new ResendEmailProvider(),
      new InfobipViberProvider(),
      new InfobipSMSProvider(),
    ];
  }

  enabledChannels(): NotificationChannel[] {
    return this.providers.filter((p) => p.isEnabled()).map((p) => p.channel);
  }

  /**
   * Fire-and-forget: send to every requested channel that's enabled. Used
   * when the caller wants belt-and-suspenders coverage (e.g. critical
   * verification rejections — email AND Viber AND SMS).
   */
  async sendAll(
    payload: NotificationPayload,
    channels: NotificationChannel[] = ["email"],
  ): Promise<{ delivered: ProviderResult[]; failed: ProviderResult[] }> {
    const delivered: ProviderResult[] = [];
    const failed: ProviderResult[] = [];

    const targets = channels
      .map((ch) => this.providers.find((p) => p.channel === ch && p.isEnabled()))
      .filter((p): p is NotificationProvider => Boolean(p));

    const results = await Promise.all(
      targets.map((provider) => provider.send(payload)),
    );

    for (const r of results) {
      if (r.success) delivered.push(r);
      else failed.push(r);
    }
    return { delivered, failed };
  }

  /**
   * Cascade: try channels in priority order, stop on first delivery.
   * Falls back to email if higher-signal channels fail. Returns the
   * delivering channel or null if nothing made it through.
   */
  async sendCascade(
    payload: NotificationPayload,
    cascade: NotificationChannel[] = ["viber", "sms", "email"],
  ): Promise<{
    delivered: NotificationChannel | null;
    attempted: ProviderResult[];
  }> {
    const attempted: ProviderResult[] = [];
    for (const channel of cascade) {
      const provider = this.providers.find(
        (p) => p.channel === channel && p.isEnabled(),
      );
      if (!provider) continue;
      const result = await provider.send(payload);
      attempted.push(result);
      if (result.success) {
        return { delivered: channel, attempted };
      }
    }
    return { delivered: null, attempted };
  }
}

export const notificationDispatcher = new NotificationDispatcher();
