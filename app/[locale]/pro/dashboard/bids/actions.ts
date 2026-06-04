"use server";

import { createClient } from "@/supabase/server";
import { withdrawBid, startJob, completeJob, createNotification } from "@/lib/supabase/glatko.server";

export async function withdrawBidAction(bidId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  try {
    await withdrawBid(bidId, user.id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function startJobAction(
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  try {
    await startJob(requestId, user.id);

    const { data: request } = await supabase
      .from("glatko_service_requests")
      .select("customer_id, title")
      .eq("id", requestId)
      .single();

    if (request?.customer_id) {
      await createNotification({
        user_id: request.customer_id,
        type: "status_change",
        title: "Job started",
        body: `The professional has started working on "${request.title || "your request"}"`,
        data: {
          requestId,
          requestTitle: request.title ?? "",
          statusCode: "started",
        },
      }).catch(() => {});
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed",
    };
  }
}

export async function completeJobAction(
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  try {
    await completeJob(requestId, user.id);

    const { data: request } = await supabase
      .from("glatko_service_requests")
      .select("customer_id, title")
      .eq("id", requestId)
      .single();

    if (request?.customer_id) {
      await createNotification({
        user_id: request.customer_id,
        type: "status_change",
        title: "Job completed",
        body: `The job "${request.title || "your request"}" has been completed — leave a review!`,
        data: {
          requestId,
          requestTitle: request.title ?? "",
          statusCode: "completed",
        },
      }).catch(() => {});
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed",
    };
  }
}
