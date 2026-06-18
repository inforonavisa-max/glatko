"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin/audit";
import { resolveDataRequest, type AdminRpcError } from "@/lib/saglik/admin";

/**
 * Glatko Sağlık — H10 data-rights request queue server actions.
 *
 * Mirrors app/[locale]/admin/saglik/actions.ts: createClient().auth.getUser() →
 * isAdminEmail (the AUTHORITATIVE gate; the layout also gates the route) →
 * resolveDataRequest wrapper (service-role RPC) → logAdminAction (app trail; the RPC
 * also writes the canonical health.audit_log row in-tx) → revalidatePath.
 *
 * The 080 RPC is NOT self-gated; authorization IS this isAdminEmail check + EXECUTE-
 * to-service_role. The verified admin user.id is forwarded as p_actor_id. NO PII in
 * logs/Sentry — the request id + status are non-PII.
 */

export type AdminActionResult = { success: true } | { success: false; error: string };

function errorMessage(code: AdminRpcError): string {
  switch (code) {
    case "NOT_FOUND":
      return "Talep bulunamadı"; // TODO i18n
    case "INVALID_STATUS":
      return "Bu durumda işlem yapılamaz"; // TODO i18n
    default:
      return "İşlem başarısız"; // TODO i18n
  }
}

/** Mark a data-rights request fulfilled (manual fulfilment done out-of-band) or rejected. */
export async function resolveDataRequestAction(
  requestId: string,
  status: "fulfilled" | "rejected",
): Promise<AdminActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email) || !user) {
    return { success: false, error: "Unauthorized" };
  }

  const result = await resolveDataRequest(user.id, requestId, status);
  if (!result.ok) return { success: false, error: errorMessage(result.code) };

  await logAdminAction({
    actionType:
      status === "fulfilled" ? "health_data_request_fulfilled" : "health_data_request_rejected",
    targetTable: "health.data_requests",
    targetId: requestId,
    payload: { status },
    reason: `Admin marked health data request ${status}`,
  });

  revalidatePath(`/[locale]/admin/saglik/talepler`, "page");
  return { success: true };
}
