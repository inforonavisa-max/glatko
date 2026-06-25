import { expireOldRequests } from "@/lib/cron/expireRequests";
import { NextResponse } from "next/server";

// The worker now AWAITS each expired request's external SMS (so an in-flight
// Infobip fetch isn't torn down when the function returns). Give the route the
// same per-run ceiling as the other notifying crons so a batch of expiries
// can't be killed mid-loop. See G-NOTIFICATION-RESILIENCE-01.
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const count = await expireOldRequests();
    return NextResponse.json({ expired: count });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
