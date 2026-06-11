import * as React from "react";

import { sendEmail } from "@/lib/email/send-email";
import { getSiteUrl } from "@/lib/email/resend";
import {
  coerceEmailLocale,
  getReviewReminderCopy,
} from "@/lib/email/templates/translations";
import SimpleActionEmail from "@/lib/email/templates/simple-action-email";

/**
 * G-REVIEW-R1 (K1): single 3-day review reminder.
 *
 * Direct transactional mailer (same family as request-emails.ts): no
 * quiet hours, no daily cap, no notification-pref lookup — exactly one
 * email per job, guarded structurally by review_reminder_sent_at.
 */
export async function sendReviewReminderEmail(args: {
  to: string;
  locale: string;
  recipientName: string;
  businessName: string;
  requestTitle: string;
  threadId: string | null;
}): Promise<void> {
  const locale = coerceEmailLocale(args.locale);
  const copy = getReviewReminderCopy(locale);

  const fill = (s: string) =>
    s
      .replaceAll("{businessName}", args.businessName)
      .replaceAll("{requestTitle}", args.requestTitle);

  const ctaUrl = args.threadId
    ? `${getSiteUrl()}/${locale}/messages/${args.threadId}`
    : `${getSiteUrl()}/${locale}/messages`;

  await sendEmail({
    to: args.to,
    subject: fill(copy.subject),
    react: React.createElement(SimpleActionEmail, {
      recipientName: args.recipientName,
      preview: fill(copy.preview),
      title: fill(copy.subject),
      body: fill(copy.body),
      ctaLabel: copy.cta,
      ctaUrl,
      locale,
    }),
  });
}
