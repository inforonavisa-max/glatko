import { NextResponse } from "next/server";
import { notifyNewMessages } from "@/lib/cron/notifyNewMessages";

// Per-run ceiling (mirrors health-reminders). The worker does sequential
// per-recipient SMS/email sends; without this the route inherits Vercel's low
// default timeout and can be killed mid-loop, silently dropping recipients.
export const maxDuration = 60;

/**
 * G-MSG-1 new-message cron — runs every 5 min (vercel.json).
 *
 * Scans glatko_message_threads for activity in the last 10 min with
 * non-zero unread counters, then queues a `thread_message` notification
 * for each recipient. The shared dispatchNotificationEmail pipeline
 * applies prefs, quiet hours, the daily cap, and 5-min same-thread
 * dedupe — so this cron stays a thin enumerator.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await notifyNewMessages(10);
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
