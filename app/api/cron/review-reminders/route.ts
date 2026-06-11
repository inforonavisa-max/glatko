import { NextResponse } from "next/server";
import { sendReviewReminders } from "@/lib/cron/reviewReminders";

/**
 * G-REVIEW-R1 review-reminder cron — runs daily at 08:00 UTC
 * (vercel.json), ~09-10:00 Podgorica morning.
 *
 * Enumerates confirmed-but-unreviewed jobs older than 3 days and sends
 * each customer a single reminder email. Idempotency lives in the
 * atomic claim on glatko_request_quotes.review_reminder_sent_at — a
 * second reminder for the same job is structurally impossible.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await sendReviewReminders();
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
