import { NextResponse } from "next/server";
import { isHealthVerticalEnabled } from "@/lib/saglik/flags";
import { dispatchDueReminders } from "@/lib/saglik/reminders-dispatch";

// pgcrypto/Vault decryption + the service-role client need Node, not edge
// (mirror app/api/health/bookings/route.ts).
export const runtime = "nodejs";

// LOAD-BEARING (migration 083): a hung run MUST be killed long before the claim's
// 15-minute stuck-recovery would re-admit its in-flight rows, otherwise an overlapping
// run could double-send. This 60s ceiling keeps the invariant intact:
//   per-send timeout  <  maxDuration (60s)  <  recovery interval (15 min).
// Do not raise this toward 15 min without revisiting health_claim_due_reminders (083).
export const maxDuration = 60;

/**
 * H6 — health reminder dispatch cron. Runs every 5 min (vercel.json), draining
 * health.reminders_outbox: t24/t2 reminders that have come due, any confirm whose
 * immediate route send failed, plus the cancelled / provider_new_booking / followup
 * rows enqueued additively by migration 073. All logic lives in
 * lib/saglik/reminders-dispatch (thin-enumerator pattern, like review-reminders).
 *
 * Flag guard FIRST: while HEALTH_VERTICAL_ENABLED is false in production the cron is
 * a clean no-op 200, so it can ship dark with the rest of the vertical.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isHealthVerticalEnabled()) {
    return NextResponse.json({ skipped: "flag_off" });
  }

  try {
    const summary = await dispatchDueReminders();
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
