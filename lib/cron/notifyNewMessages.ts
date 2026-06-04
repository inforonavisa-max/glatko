import { createAdminClient } from "@/supabase/server";
import { createNotification } from "@/lib/supabase/glatko.server";
import { dispatchExternalNotification } from "@/lib/notifications/external-dispatch";

/** Faz 2-C: per-thread external (SMS) cooldown so an active unread thread can't
 *  trigger a send on every 5-min cron run. Default 60 min (env-configurable). */
const DEFAULT_EXTERNAL_MESSAGE_COOLDOWN_MIN = 60;
function externalCooldownMs(): number {
  const n = Number(process.env.EXTERNAL_MESSAGE_COOLDOWN_MINUTES);
  const min =
    Number.isInteger(n) && n > 0 ? n : DEFAULT_EXTERNAL_MESSAGE_COOLDOWN_MIN;
  return min * 60 * 1000;
}

/** Spam-cooldown decision (exported for tests): true if this thread has never
 *  had an external send, or the last one is older than the cooldown window. */
export function externalCooldownElapsed(
  externalNotifiedAt: string | null,
): boolean {
  if (!externalNotifiedAt) return true;
  return (
    Date.now() - new Date(externalNotifiedAt).getTime() >= externalCooldownMs()
  );
}

/**
 * Faz 3-A — sender display name by direction (exported for tests). When the pro
 * sent the last message (recipient = customer) the label is the thread's pro
 * business_name; when the customer sent it (recipient = pro) the label is the
 * customer's full_name. "Someone" when the relevant name is missing.
 */
export function resolveThreadSenderName(args: {
  lastMessageSenderId: string | null;
  customerId: string | null;
  proBusinessName: string | null | undefined;
  customerFullName: string | null | undefined;
}): string {
  const senderIsCustomer =
    args.customerId != null && args.lastMessageSenderId === args.customerId;
  return senderIsCustomer
    ? args.customerFullName?.trim() || "Someone"
    : args.proBusinessName?.trim() || "Someone";
}

interface ThreadRow {
  id: string;
  customer_id: string | null;
  professional_id: string;
  customer_unread_count: number | null;
  pro_unread_count: number | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_id: string | null;
  external_notified_at: string | null;
  glatko_service_requests: { title: string | null } | null;
  glatko_professional_profiles: { business_name: string | null } | null;
}

/**
 * Find threads with new messages in the last `windowMinutes` and queue an
 * in-app + email notification for the recipient. The createNotification
 * pipeline owns dedupe (5-min same-thread suppression in dispatch.ts) and
 * user prefs / quiet hours, so this worker just enumerates candidates.
 */
export async function notifyNewMessages(
  windowMinutes = 10,
): Promise<{ scanned: number; notified: number }> {
  const admin = createAdminClient();
  const since = new Date(
    Date.now() - windowMinutes * 60 * 1000,
  ).toISOString();

  const { data: threads, error } = await admin
    .from("glatko_message_threads")
    .select(
      `
      id,
      customer_id,
      professional_id,
      customer_unread_count,
      pro_unread_count,
      last_message_at,
      last_message_preview,
      last_message_sender_id,
      external_notified_at,
      glatko_service_requests ( title ),
      glatko_professional_profiles ( business_name )
      `,
    )
    .gte("last_message_at", since)
    .eq("status", "active")
    .or("customer_unread_count.gt.0,pro_unread_count.gt.0");

  if (error) {
    console.error("[GLATKO:cron-msgs] thread scan failed:", error.message);
    return { scanned: 0, notified: 0 };
  }

  const rows = (threads as unknown as ThreadRow[]) ?? [];
  let notified = 0;

  // Faz 3-A: thread_message sender-name direction fix. The thread's pro
  // business_name is the correct sender label ONLY when the pro sent the last
  // message. When the CUSTOMER sent it (recipient = pro), the sender is the
  // customer, so the label must be the customer's profiles.full_name — not the
  // thread's pro name. Batch-fetch full_name for customers who are the last
  // sender (mirrors the messages/page.tsx counterpart-name pattern).
  const customerSenderIds = Array.from(
    new Set(
      rows
        .filter(
          (t) =>
            t.customer_id != null &&
            t.last_message_sender_id === t.customer_id,
        )
        .map((t) => t.customer_id as string),
    ),
  );
  const customerNameById: Record<string, string> = {};
  if (customerSenderIds.length > 0) {
    const { data: custProfiles } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", customerSenderIds);
    for (const p of custProfiles ?? []) {
      const name = (p.full_name as string | null)?.trim();
      if (name) customerNameById[p.id as string] = name;
    }
  }

  for (const t of rows) {
    if (!t.last_message_sender_id || !t.last_message_at) continue;

    const recipientId =
      t.last_message_sender_id === t.customer_id
        ? t.professional_id
        : t.customer_id;
    if (!recipientId) continue;

    // Sanity: only fire if recipient actually has unread messages on
    // their side (sender's own messages don't bump their counter).
    const recipientHasUnread =
      recipientId === t.customer_id
        ? (t.customer_unread_count ?? 0) > 0
        : (t.pro_unread_count ?? 0) > 0;
    if (!recipientHasUnread) continue;

    // Faz 3-A: pick the ACTUAL sender's name by direction (batch above + helper).
    const senderName = resolveThreadSenderName({
      lastMessageSenderId: t.last_message_sender_id,
      customerId: t.customer_id,
      proBusinessName: t.glatko_professional_profiles?.business_name,
      customerFullName: t.customer_id
        ? customerNameById[t.customer_id]
        : undefined,
    });
    const preview = t.last_message_preview ?? "";
    const requestTitle = t.glatko_service_requests?.title ?? "";

    try {
      await createNotification({
        user_id: recipientId,
        type: "thread_message",
        title: senderName,
        body: preview,
        data: {
          threadId: t.id,
          requestTitle,
        },
      });
      notified += 1;
    } catch (err) {
      console.error("[GLATKO:cron-msgs] notify failed:", err);
    }

    // Faz 2-C: external SMS for this still-unread thread — delayed (cron) +
    // unread-gated (we only reach here while unread) + per-thread cooldown
    // (default 60 min) so an active unread thread isn't SMS'd every 5-min run.
    // Marker is set ONLY on a real send, so flag-off / cap / quiet-hours /
    // no-phone leave external_notified_at NULL and the next run can retry.
    // thread_message is non-critical → cap + quiet hours apply (no bypass). The
    // in-app createNotification above also calls dispatchExternalNotification
    // (without fromCron) but that defers, so this fromCron call is the only
    // external attempt (no double-send).
    try {
      if (externalCooldownElapsed(t.external_notified_at)) {
        const ext = await dispatchExternalNotification({
          user_id: recipientId,
          type: "thread_message",
          fromCron: true,
          title: senderName,
          body: preview,
          data: { threadId: t.id, requestTitle },
        });
        if (ext.sent) {
          await admin
            .from("glatko_message_threads")
            .update({ external_notified_at: new Date().toISOString() })
            .eq("id", t.id);
        }
      }
    } catch (err) {
      console.error("[GLATKO:cron-msgs] external send failed:", err);
    }
  }

  return { scanned: rows.length, notified };
}
