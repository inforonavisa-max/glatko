/**
 * G-REQ-2 match dispatch orchestration.
 *
 * Sits between the admin approve action / wait-list cron and the
 * matching-algorithm RPCs. Two entry points:
 *
 *   dispatchRequestMatchNotifications(requestId)
 *     → calls glatko_dispatch_request_notifications (writes Top 3 + 7
 *       wait-list rows to glatko_request_notifications), then sends
 *       in-app + email to the Top 3.
 *
 *   activateRequestWaitlist(requestId)
 *     → called by the 5-min cron once a request has aged 30 min with
 *       <3 quotes; calls glatko_activate_waitlist (flips notified_at
 *       on the wait-list 7) and sends in-app + email to those pros.
 *
 * Both routes funnel through notificationDispatcher so adding Viber/SMS
 * later is a one-line provider flip, not a rewrite.
 */

import { createAdminClient } from "@/supabase/server";
import { notificationDispatcher } from "@/lib/notifications/dispatcher";
import { glatkoCaptureException } from "@/lib/sentry/glatko-capture";

interface DispatchSummary {
  requestId: string;
  notifiedCount: number;
  waitlistCount: number;
  totalMatches: number;
  emailsSent: number;
  emailsFailed: number;
}

interface RequestContext {
  id: string;
  title: string;
  municipality: string;
  categoryId: string;
  categoryNames: Record<string, string>;
  customerName: string;
  customerId: string | null;
}

async function loadRequestContext(
  requestId: string,
): Promise<RequestContext | null> {
  const admin = createAdminClient();

  const { data: req, error } = await admin
    .from("glatko_service_requests")
    .select("id, title, municipality, category_id, customer_id, anonymous_email")
    .eq("id", requestId)
    .maybeSingle();

  if (error || !req) {
    console.error(
      "[GLATKO:match-dispatch] request lookup failed",
      requestId,
      error,
    );
    return null;
  }

  const categoryId = req.category_id as string | null;
  if (!categoryId) {
    console.warn(
      "[GLATKO:match-dispatch] request has no category_id",
      requestId,
    );
    return null;
  }

  const { data: catRow } = await admin
    .from("glatko_service_categories")
    .select("name")
    .eq("id", categoryId)
    .maybeSingle();

  const categoryNames =
    (catRow?.name as Record<string, string> | null | undefined) ?? {};

  let customerName = "A customer";
  const customerId = (req.customer_id as string | null) ?? null;
  if (customerId) {
    const { data: cust } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", customerId)
      .maybeSingle();
    if (cust?.full_name) customerName = String(cust.full_name).trim();
  }

  return {
    id: req.id as string,
    title: (req.title as string | null)?.trim() || "—",
    municipality: (req.municipality as string | null) ?? "",
    categoryId,
    categoryNames,
    customerName,
    customerId,
  };
}

/**
 * Send the in-app + email for a single matched pro. Updates
 * email_sent_at on the queue row (best-effort — failures are logged
 * but do not block other recipients).
 */
async function sendMatchToPro(params: {
  notificationId: string;
  professionalId: string;
  request: RequestContext;
}): Promise<{ ok: boolean }> {
  const admin = createAdminClient();
  const { request } = params;

  try {
    const result = await notificationDispatcher.sendAll(
      {
        to: { userId: params.professionalId },
        type: "new_request_match",
        title: "New matching request",
        body: `A new request in your area matches your services: "${request.title}".`,
        data: {
          requestId: request.id,
          customer_id: request.customerId,
          is_direct: false,
          requestTitle: request.title,
          customerName: request.customerName,
          municipality: request.municipality,
          categoryNames: request.categoryNames,
        },
        // Cron (activate-waitlists) + admin-approve both run this. Await the
        // external SMS so the serverless function isn't frozen mid-fetch
        // (G-NOTIFICATION-RESILIENCE-01 — the SocketError root cause).
        waitForExternal: true,
      },
      ["email"],
    );

    const succeeded = result.delivered.length > 0;

    if (succeeded) {
      await admin
        .from("glatko_request_notifications")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("id", params.notificationId);
    }

    return { ok: succeeded };
  } catch (err) {
    glatkoCaptureException(err, {
      module: "match-dispatch",
      op: "sendMatchToPro",
      notificationId: params.notificationId,
      professionalId: params.professionalId,
    });
    return { ok: false };
  }
}

/**
 * Run the matching algorithm for an approved request, persist the queue,
 * and send notifications to the Top 3.
 */
export async function dispatchRequestMatchNotifications(
  requestId: string,
): Promise<DispatchSummary> {
  const admin = createAdminClient();

  const { data: rpcResult, error: rpcErr } = await admin.rpc(
    "glatko_dispatch_request_notifications",
    { p_request_id: requestId },
  );

  if (rpcErr) {
    glatkoCaptureException(rpcErr, {
      module: "match-dispatch",
      op: "dispatch_rpc",
      requestId,
    });
    return {
      requestId,
      notifiedCount: 0,
      waitlistCount: 0,
      totalMatches: 0,
      emailsSent: 0,
      emailsFailed: 0,
    };
  }

  const summary = rpcResult as {
    notified_count?: number;
    waitlist_count?: number;
    total_matches?: number;
  } | null;

  const notifiedCount = summary?.notified_count ?? 0;
  const waitlistCount = summary?.waitlist_count ?? 0;
  const totalMatches = summary?.total_matches ?? 0;

  if (notifiedCount === 0) {
    return {
      requestId,
      notifiedCount: 0,
      waitlistCount,
      totalMatches,
      emailsSent: 0,
      emailsFailed: 0,
    };
  }

  const ctx = await loadRequestContext(requestId);
  if (!ctx) {
    return {
      requestId,
      notifiedCount,
      waitlistCount,
      totalMatches,
      emailsSent: 0,
      emailsFailed: notifiedCount,
    };
  }

  const { data: primaryRows } = await admin
    .from("glatko_request_notifications")
    .select("id, professional_id, match_rank")
    .eq("request_id", requestId)
    .eq("is_primary", true)
    .order("match_rank", { ascending: true });

  let emailsSent = 0;
  let emailsFailed = 0;
  for (const row of primaryRows ?? []) {
    const r = await sendMatchToPro({
      notificationId: row.id as string,
      professionalId: row.professional_id as string,
      request: ctx,
    });
    if (r.ok) emailsSent += 1;
    else emailsFailed += 1;
  }

  return {
    requestId,
    notifiedCount,
    waitlistCount,
    totalMatches,
    emailsSent,
    emailsFailed,
  };
}

/**
 * Wait-list activation — called by the 5-min cron worker for a single
 * request whose primary dispatch is ≥30 min old and has <3 quotes.
 */
export async function activateRequestWaitlist(
  requestId: string,
): Promise<{
  activated: boolean;
  reason?: string;
  emailsSent: number;
  emailsFailed: number;
}> {
  const admin = createAdminClient();

  const { data: rpcResult, error: rpcErr } = await admin.rpc(
    "glatko_activate_waitlist",
    { p_request_id: requestId },
  );

  if (rpcErr) {
    glatkoCaptureException(rpcErr, {
      module: "match-dispatch",
      op: "activate_waitlist_rpc",
      requestId,
    });
    return { activated: false, emailsSent: 0, emailsFailed: 0 };
  }

  const summary = rpcResult as {
    activated?: boolean;
    reason?: string;
    waitlist_activated_count?: number;
  } | null;

  if (!summary?.activated) {
    return {
      activated: false,
      reason: summary?.reason ?? "rpc_returned_no_activation",
      emailsSent: 0,
      emailsFailed: 0,
    };
  }

  const ctx = await loadRequestContext(requestId);
  if (!ctx) {
    return {
      activated: true,
      emailsSent: 0,
      emailsFailed: summary.waitlist_activated_count ?? 0,
    };
  }

  // Fetch wait-list rows the RPC just flipped — they have notified_at
  // set but email_sent_at still null and is_primary=false.
  const { data: waitlistRows } = await admin
    .from("glatko_request_notifications")
    .select("id, professional_id, match_rank")
    .eq("request_id", requestId)
    .eq("is_primary", false)
    .not("notified_at", "is", null)
    .is("email_sent_at", null)
    .order("match_rank", { ascending: true });

  let emailsSent = 0;
  let emailsFailed = 0;
  for (const row of waitlistRows ?? []) {
    const r = await sendMatchToPro({
      notificationId: row.id as string,
      professionalId: row.professional_id as string,
      request: ctx,
    });
    if (r.ok) emailsSent += 1;
    else emailsFailed += 1;
  }

  return {
    activated: true,
    emailsSent,
    emailsFailed,
  };
}

/**
 * Cron worker: scans for requests pending wait-list activation and
 * processes each one. Returns a per-request summary for observability.
 */
export async function activateAllPendingWaitlists(): Promise<{
  scanned: number;
  activated: number;
  emailsSent: number;
}> {
  const admin = createAdminClient();

  const { data: pending, error } = await admin.rpc(
    "glatko_find_pending_waitlist_activations",
    { p_min_age_minutes: 30 },
  );

  if (error) {
    glatkoCaptureException(error, {
      module: "match-dispatch",
      op: "find_pending_waitlists",
    });
    return { scanned: 0, activated: 0, emailsSent: 0 };
  }

  const rows = (pending as Array<{ request_id: string }> | null) ?? [];
  let activated = 0;
  let emailsSent = 0;

  for (const row of rows) {
    const result = await activateRequestWaitlist(row.request_id);
    if (result.activated) activated += 1;
    emailsSent += result.emailsSent;
  }

  return { scanned: rows.length, activated, emailsSent };
}
