import { createElement, type ReactElement } from "react";
import { sendEmail } from "@/lib/email/send-email";
import { getSiteUrl } from "@/lib/email/resend";
import { pickLocalizedLabel } from "@/lib/i18n/pick-localized-label";
import {
  coerceEmailLocale,
  getBidAcceptedCopy,
  getBidNotSelectedCopy,
  getNewBidReceivedCopy,
  getNewMessageEmailCopy,
  getNewRequestMatchCopy,
  getProWelcomeEmailCopy,
  getReviewReceivedEmailCopy,
  getStatusChangeEmailCopy,
  getVerificationRejectedEmailCopy,
  type EmailLocale,
} from "@/lib/email/templates/translations";
import BidAcceptedEmail from "@/lib/email/templates/bid-accepted";
import BidRejectedEmail from "@/lib/email/templates/bid-rejected";
import NewBidReceivedEmail from "@/lib/email/templates/new-bid-received";
import NewRequestMatchEmail from "@/lib/email/templates/new-request-match";
import ReviewReceivedEmail from "@/lib/email/templates/review-received";
import ProWelcomeEmail from "@/lib/email/templates/pro-welcome";
import SimpleActionEmail from "@/lib/email/templates/simple-action-email";
import StatusChangeEmail from "@/lib/email/templates/status-change";
import { glatkoCaptureException } from "@/lib/sentry/glatko-capture";
import { createAdminClient } from "@/supabase/server";
import {
  normalizeNotificationPrefs,
  type NotificationPrefsRow,
} from "@/lib/notifications/prefs";

export type DispatchNotificationType =
  | "new_request_match"
  | "new_bid"
  | "bid_accepted"
  | "bid_rejected"
  | "message"
  | "thread_message"
  | "status_change"
  | "review"
  | "verification_approved"
  | "verification_rejected";

const CRITICAL_EMAIL_TYPES = new Set<string>([
  "bid_accepted",
  "verification_approved",
  "verification_rejected",
]);

const DEFAULT_USER_TIMEZONE = "Europe/Podgorica";
const DAILY_EMAIL_NOTIFICATION_CAP = 15;

function isCriticalEmailType(type: string): boolean {
  return CRITICAL_EMAIL_TYPES.has(type);
}

function isQuietHours(timezone: string = DEFAULT_USER_TIMEZONE): boolean {
  const now = new Date();
  const hourStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  }).format(now);
  const hour = parseInt(hourStr, 10);
  if (Number.isNaN(hour)) return false;
  return hour >= 22 || hour < 8;
}

function shouldSendEmailForType(
  type: DispatchNotificationType,
  rawPrefs: NotificationPrefsRow | null | undefined,
): boolean {
  const prefs = normalizeNotificationPrefs(rawPrefs ?? {});

  switch (type) {
    case "new_bid":
      return prefs.email_new_bid;
    case "new_request_match":
      return prefs.email_new_request_match;
    case "bid_accepted":
    case "bid_rejected":
      return prefs.email_pro_bid_outcome;
    case "message":
    case "thread_message":
      return prefs.email_new_message;
    case "review":
      return prefs.email_new_review;
    case "status_change":
      return prefs.email_status_change;
    case "verification_approved":
    case "verification_rejected":
      return prefs.email_verification;
    default:
      return true;
  }
}

function buildLocalizedPath(locale: EmailLocale, path: string): string {
  const base = getSiteUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}/${locale}${p}`;
}

async function buildEmailForType(params: {
  type: DispatchNotificationType;
  data: Record<string, unknown>;
  recipientName: string;
  locale: EmailLocale;
}): Promise<{ subject: string; react: ReactElement } | null> {
  const { type, data, recipientName, locale } = params;

  switch (type) {
    case "new_request_match": {
      const requestId = String(data.requestId ?? data.request_id ?? "");
      if (!requestId) return null;
      const categoryNames =
        (data.categoryNames as Record<string, string> | undefined) ?? {};
      const categoryName = pickLocalizedLabel(categoryNames, locale);
      const copy = getNewRequestMatchCopy(locale);
      return {
        subject: copy.subject,
        react: createElement(NewRequestMatchEmail, {
          recipientName,
          requestTitle: String(data.requestTitle ?? ""),
          customerName: String(data.customerName ?? ""),
          municipality: String(data.municipality ?? ""),
          categoryName,
          isDirect: Boolean(data.is_direct),
          requestUrl: buildLocalizedPath(
            locale,
            `/pro/dashboard/requests/${requestId}`,
          ),
          locale,
        }),
      };
    }
    case "new_bid": {
      const requestId = String(data.requestId ?? data.request_id ?? "");
      if (!requestId) return null;
      const copy = getNewBidReceivedCopy(locale);
      return {
        subject: copy.subject,
        react: createElement(NewBidReceivedEmail, {
          recipientName,
          professionalName: String(data.professionalName ?? ""),
          requestTitle: String(data.requestTitle ?? ""),
          price: String(data.price ?? ""),
          message: String(data.message ?? ""),
          bidUrl: buildLocalizedPath(
            locale,
            `/dashboard/requests/${requestId}`,
          ),
          locale,
        }),
      };
    }
    case "bid_accepted": {
      const conversationId = String(
        data.conversationId ?? data.conversation_id ?? "",
      );
      if (!conversationId) return null;
      const copy = getBidAcceptedCopy(locale);
      return {
        subject: copy.subject,
        react: createElement(BidAcceptedEmail, {
          recipientName,
          customerName: String(data.customerName ?? ""),
          requestTitle: String(data.requestTitle ?? ""),
          price: String(data.price ?? ""),
          conversationUrl: buildLocalizedPath(
            locale,
            `/inbox/${conversationId}`,
          ),
          locale,
        }),
      };
    }
    case "bid_rejected": {
      const categoryNames =
        (data.categoryNames as Record<string, string> | undefined) ?? {};
      const categoryName = pickLocalizedLabel(categoryNames, locale);
      const copy = getBidNotSelectedCopy(locale);
      return {
        subject: copy.subject,
        react: createElement(BidRejectedEmail, {
          recipientName,
          requestTitle: String(data.requestTitle ?? ""),
          categoryName,
          municipality: String(data.municipality ?? ""),
          matchingUrl: buildLocalizedPath(locale, "/pro/dashboard/requests"),
          locale,
        }),
      };
    }
    case "status_change": {
      const detailText = String(data.notificationBody ?? "").trim();
      if (!detailText) return null;
      const requestId = String(data.requestId ?? data.request_id ?? "");
      const requestTitle = String(data.requestTitle ?? "");
      const copy = getStatusChangeEmailCopy(locale);
      const requestUrl = requestId
        ? buildLocalizedPath(locale, `/dashboard/requests/${requestId}`)
        : buildLocalizedPath(locale, "/dashboard");
      return {
        subject: copy.subject,
        react: createElement(StatusChangeEmail, {
          recipientName,
          requestTitle,
          detailText,
          requestUrl,
          locale,
        }),
      };
    }
    case "review": {
      const rating = Number(data.overallRating ?? data.rating ?? 5);
      const copy = getReviewReceivedEmailCopy(locale);
      return {
        subject: copy.subject,
        react: createElement(ReviewReceivedEmail, {
          recipientName,
          rating: Number.isFinite(rating) ? rating : 5,
          proDashboardUrl: buildLocalizedPath(locale, "/pro/dashboard"),
          locale,
        }),
      };
    }
    case "message": {
      const conversationId = String(
        data.conversationId ?? data.conversation_id ?? "",
      );
      const m = getNewMessageEmailCopy(locale);
      const body = String(data.notificationBody ?? "").trim() || "—";
      const ctaUrl = conversationId
        ? buildLocalizedPath(locale, `/inbox/${conversationId}`)
        : buildLocalizedPath(locale, "/inbox");
      return {
        subject: m.subject,
        react: createElement(SimpleActionEmail, {
          recipientName,
          preview: body.slice(0, 100),
          title: m.title,
          body,
          ctaLabel: m.cta,
          ctaUrl,
          locale,
        }),
      };
    }
    case "thread_message": {
      const threadId = String(data.threadId ?? data.thread_id ?? "");
      const m = getNewMessageEmailCopy(locale);
      const body = String(data.notificationBody ?? "").trim() || "—";
      const ctaUrl = threadId
        ? buildLocalizedPath(locale, `/messages/${threadId}`)
        : buildLocalizedPath(locale, "/messages");
      return {
        subject: m.subject,
        react: createElement(SimpleActionEmail, {
          recipientName,
          preview: body.slice(0, 100),
          title: m.title,
          body,
          ctaLabel: m.cta,
          ctaUrl,
          locale,
        }),
      };
    }
    case "verification_approved": {
      const c = getProWelcomeEmailCopy(locale);
      const adminNote = String(data.notificationBody ?? "").trim();
      return {
        subject: c.subject,
        react: createElement(ProWelcomeEmail, {
          recipientName,
          profileUrl: buildLocalizedPath(locale, "/pro/dashboard/profile"),
          dashboardUrl: buildLocalizedPath(locale, "/pro/dashboard"),
          adminNote: adminNote || undefined,
          locale,
        }),
      };
    }
    case "verification_rejected": {
      const c = getVerificationRejectedEmailCopy(locale);
      const extra = String(data.notificationBody ?? "").trim();
      const body = extra ? `${c.body}\n\n${extra}` : c.body;
      return {
        subject: c.subject,
        react: createElement(SimpleActionEmail, {
          recipientName,
          preview: c.subject,
          title: c.title,
          body,
          ctaLabel: c.cta,
          ctaUrl: buildLocalizedPath(locale, "/pro/dashboard/profile"),
          locale,
        }),
      };
    }
    default:
      return null;
  }
}

/**
 * Sends transactional email when in-app notification is created (best-effort).
 * Never throws; failures are logged only.
 */
export async function dispatchNotificationEmail(params: {
  userId: string;
  type: string;
  data?: Record<string, unknown>;
  title?: string;
  body?: string;
}): Promise<void> {
  try {
    // Faz 0-B kill-switch: notification emails are OFF unless explicitly enabled.
    // In-app notifications are unaffected (createNotification inserts the row
    // BEFORE this runs). Auth emails (email-hook) and transactional emails
    // (request/pro/founding/profile wrappers) call sendEmail directly and never
    // pass through here, so they keep sending. Faz 2 keeps this off permanently
    // (WhatsApp/Viber replace notification email).
    if (process.env.NOTIFICATION_EMAILS_ENABLED !== "true") {
      return;
    }
    const type = params.type as DispatchNotificationType;
    const allowed: readonly string[] = [
      "new_request_match",
      "new_bid",
      "bid_accepted",
      "bid_rejected",
      "message",
      "thread_message",
      "status_change",
      "review",
      "verification_approved",
      "verification_rejected",
    ];
    if (!allowed.includes(type)) {
      return;
    }

    const admin = createAdminClient();

    const { data: authData, error: authErr } =
      await admin.auth.admin.getUserById(params.userId);
    if (authErr || !authData?.user?.email) {
      console.error("[GLATKO:dispatch] getUserById failed:", authErr);
      return;
    }
    const to = authData.user.email.trim();
    if (!to) {
      return;
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, preferred_locale, notification_prefs")
      .eq("id", params.userId)
      .maybeSingle();

    const row = profile as {
      full_name?: string | null;
      preferred_locale?: string | null;
      notification_prefs?: unknown;
    } | null;

    const prefs = row?.notification_prefs as NotificationPrefsRow | null;
    if (!shouldSendEmailForType(type, prefs)) {
      return;
    }

    /** When `profiles.timezone` is added, select it above and pass here. */
    const userTimezone = DEFAULT_USER_TIMEZONE;

    if (isQuietHours(userTimezone) && !isCriticalEmailType(type)) {
      console.warn(
        `[GLATKO:dispatch] Quiet hours (${userTimezone}), skipping email for type ${type}`,
      );
      return;
    }

    if (!isCriticalEmailType(type)) {
      const since = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString();
      const { count, error: countErr } = await admin
        .from("glatko_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", params.userId)
        .gte("created_at", since)
        .neq("type", "message");

      if (
        !countErr &&
        count != null &&
        count > DAILY_EMAIL_NOTIFICATION_CAP
      ) {
        console.warn(
          `[GLATKO:dispatch] Daily email-related notification cap (${DAILY_EMAIL_NOTIFICATION_CAP}) exceeded for user ${params.userId}`,
        );
        return;
      }
    }

    const locale = coerceEmailLocale(row?.preferred_locale ?? undefined);
    const recipientName = row?.full_name?.trim() || "";

    const mergedData: Record<string, unknown> = {
      ...(params.data ?? {}),
    };
    if (params.title != null) mergedData.notificationTitle = params.title;
    if (params.body != null) mergedData.notificationBody = params.body;

    if (type === "message") {
      const convId = String(
        mergedData.conversationId ?? mergedData.conversation_id ?? "",
      ).trim();
      if (convId) {
        const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: recentRows } = await admin
          .from("glatko_notifications")
          .select("id, data")
          .eq("user_id", params.userId)
          .eq("type", "message")
          .gte("created_at", since);
        const sameConvCount = (recentRows ?? []).filter((row) => {
          const d = row.data as Record<string, unknown> | null;
          const c = String(
            d?.conversationId ?? d?.conversation_id ?? "",
          ).trim();
          return c === convId;
        }).length;
        if (sameConvCount > 1) {
          return;
        }
      }
    }

    if (type === "thread_message") {
      const threadId = String(
        mergedData.threadId ?? mergedData.thread_id ?? "",
      ).trim();
      if (threadId) {
        const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: recentRows } = await admin
          .from("glatko_notifications")
          .select("id, data")
          .eq("user_id", params.userId)
          .eq("type", "thread_message")
          .gte("created_at", since);
        const sameThreadCount = (recentRows ?? []).filter((row) => {
          const d = row.data as Record<string, unknown> | null;
          const tid = String(d?.threadId ?? d?.thread_id ?? "").trim();
          return tid === threadId;
        }).length;
        if (sameThreadCount > 1) {
          return;
        }
      }
    }

    const emailContent = await buildEmailForType({
      type,
      data: mergedData,
      recipientName,
      locale,
    });

    if (!emailContent) {
      return;
    }

    const result = await sendEmail({
      to,
      subject: emailContent.subject,
      react: emailContent.react,
    });

    if (!result.success) {
      console.error("[GLATKO:dispatch] sendEmail failed:", result.error);
    }
  } catch (error) {
    console.error("[GLATKO:dispatch] dispatchNotificationEmail failed:", error);
    glatkoCaptureException(error, { module: "dispatch-email" });
  }
}
