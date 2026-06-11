import { createAdminClient } from "@/supabase/server";
import { sendReviewReminderEmail } from "@/lib/email/review-emails";
import { glatkoCaptureException } from "@/lib/sentry/glatko-capture";

/**
 * G-REVIEW-R1 (K1): single 3-day review reminder.
 *
 * Daily cron enumerator. Eligibility: quote confirmed ≥3 days ago, no
 * review for the quote, reminder never sent. Exactly ONE email per job,
 * ever — idempotency is the atomic claim on review_reminder_sent_at
 * (UPDATE ... WHERE ... IS NULL RETURNING); a crash between claim and
 * send loses at most one reminder, never duplicates it.
 *
 * Sends via the DIRECT transactional path (sendEmail), not
 * dispatchNotificationEmail — the NOTIFICATION_EMAILS_ENABLED gate is
 * permanently off in prod, so the gated pipeline never delivers.
 */
export async function sendReviewReminders(): Promise<{
  scanned: number;
  alreadyReviewed: number;
  sent: number;
  failed: number;
}> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: candidates, error } = await admin
    .from("glatko_request_quotes")
    .select(
      `
      id,
      request_id,
      professional_id,
      customer_confirmed_at,
      glatko_service_requests ( id, title, customer_id ),
      glatko_professional_profiles ( business_name )
      `,
    )
    .eq("completion_state", "customer_confirmed")
    .lte("customer_confirmed_at", cutoff)
    .is("review_reminder_sent_at", null)
    .limit(50);

  if (error) {
    console.error("[GLATKO:review-reminders] candidate scan failed:", error);
    throw error;
  }

  const summary = { scanned: candidates?.length ?? 0, alreadyReviewed: 0, sent: 0, failed: 0 };

  for (const quote of candidates ?? []) {
    // Already reviewed → stamp so the row never re-enters the scan.
    const { count: reviewCount } = await admin
      .from("glatko_quote_reviews")
      .select("id", { count: "exact", head: true })
      .eq("quote_id", quote.id);
    if ((reviewCount ?? 0) > 0) {
      await admin
        .from("glatko_request_quotes")
        .update({ review_reminder_sent_at: new Date().toISOString() })
        .eq("id", quote.id)
        .is("review_reminder_sent_at", null);
      summary.alreadyReviewed++;
      continue;
    }

    // Atomic claim — only the claimer may send.
    const { data: claimed } = await admin
      .from("glatko_request_quotes")
      .update({ review_reminder_sent_at: new Date().toISOString() })
      .eq("id", quote.id)
      .is("review_reminder_sent_at", null)
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    try {
      const request = quote.glatko_service_requests as unknown as {
        id: string;
        title: string | null;
        customer_id: string | null;
      } | null;
      const customerId = request?.customer_id;
      if (!customerId) throw new Error("quote has no customer");

      const [{ data: authUser }, { data: profile }, { data: thread }] =
        await Promise.all([
          admin.auth.admin.getUserById(customerId),
          admin
            .from("profiles")
            .select("full_name, preferred_locale")
            .eq("id", customerId)
            .maybeSingle(),
          admin
            .from("glatko_message_threads")
            .select("id")
            .eq("request_id", quote.request_id)
            .eq("professional_id", quote.professional_id)
            .maybeSingle(),
        ]);

      const email = authUser?.user?.email;
      if (!email) throw new Error("customer has no email");

      const pro = quote.glatko_professional_profiles as unknown as {
        business_name: string | null;
      } | null;

      await sendReviewReminderEmail({
        to: email,
        locale: (profile?.preferred_locale as string | null) ?? "en",
        recipientName: profile?.full_name?.split(" ")[0] || "there",
        businessName: pro?.business_name || "the professional",
        requestTitle: request?.title || "",
        threadId: thread?.id ?? null,
      });
      summary.sent++;
    } catch (err) {
      // Release the claim so tomorrow's run retries this job.
      await admin
        .from("glatko_request_quotes")
        .update({ review_reminder_sent_at: null })
        .eq("id", quote.id);
      summary.failed++;
      console.error("[GLATKO:review-reminders] send failed:", quote.id, err);
      glatkoCaptureException(err, { module: "review-reminders" });
    }
  }

  return summary;
}
