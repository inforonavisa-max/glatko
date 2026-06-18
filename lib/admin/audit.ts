import { headers } from "next/headers";

import { createAdminClient, createClient } from "@/supabase/server";

/**
 * G-ADMIN-1: admin action audit logger.
 *
 * Every destructive admin action calls this once. Failure to write the log
 * row never blocks the main action — we log the failure to the server
 * console (Sentry hook can pick it up later) and let the action proceed.
 * Audit is a defence-in-depth, not a foreground concern.
 *
 * The UI for browsing this table ships in G-AUDIT-1 (post-launch); for now
 * the SQL editor is the read interface.
 */

export type AdminActionType =
  | "user_ban"
  | "user_unban"
  | "user_role_change"
  | "user_delete"
  | "pro_approve"
  | "pro_reject"
  | "pro_update_admin"
  | "pro_remove"
  | "request_approve"
  | "request_reject"
  | "request_delete"
  | "request_assign_pro"
  | "junction_add"
  | "junction_remove"
  | "category_faq_edit"
  | "category_status_change"
  | "pro_create_admin"
  // Career vertical (C0) admin console actions. target_table is a plain
  // TEXT column (migration 045 — no CHECK/enum), so schema-qualified
  // `career.*` strings below are accepted at runtime (R13 verified).
  | "career_requisition_status"
  | "career_unlock_approve"
  | "career_unlock_paid"
  | "career_worker_verify"
  | "career_document_verify"
  | "career_shortlist_publish"
  | "career_employer_verify"
  | "career_employer_tier"
  // H8 — health provider admin actions. The canonical health audit row is written
  // INSIDE the 079 RPC (health.audit_log, the H8 viewer source); this app-side
  // glatko_admin_audit_log row mirrors it with IP/UA for the unified admin trail.
  | "health_provider_approve"
  | "health_provider_reject"
  | "health_provider_unpublish"
  | "health_provider_publish"
  | "health_provider_set_tier"
  // H10 — health data-subject rights queue resolution (the canonical health.audit_log
  // row is written INSIDE the 080 RPC; this app-side row mirrors it with IP/UA).
  | "health_data_request_fulfilled"
  | "health_data_request_rejected";

export type AuditTargetTable =
  | "auth.users"
  | "public.profiles"
  | "glatko_professional_profiles"
  | "glatko_pro_services"
  | "glatko_service_requests"
  | "glatko_service_categories"
  // Career vertical (C0) — schema-qualified `career.*` tables. Accepted by
  // the plain-TEXT target_table column (no constraint; R13 verified).
  | "career.requisitions"
  | "career.reveal_unlocks"
  | "career.worker_profiles"
  | "career.worker_documents"
  | "career.shortlists"
  | "career.employer_accounts"
  | "health.providers"
  | "health.data_requests";

export interface LogAdminActionParams {
  actionType: AdminActionType;
  targetTable: AuditTargetTable;
  targetId: string | null;
  payload?: Record<string, unknown>;
  reason?: string;
}

export async function logAdminAction(params: LogAdminActionParams): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    console.error("[audit] No authenticated user; skipping log");
    return;
  }

  let ipAddress: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ipAddress =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      null;
    userAgent = h.get("user-agent");
  } catch {
    // headers() throws outside a request scope; non-fatal
  }

  // Write through the service-role client so the row lands even if RLS
  // would otherwise reject the authenticated user's INSERT.
  const admin = createAdminClient();
  const { error } = await admin.from("glatko_admin_audit_log").insert({
    admin_user_id: user.id,
    admin_email: user.email,
    action_type: params.actionType,
    target_table: params.targetTable,
    target_id: params.targetId,
    payload: params.payload ?? null,
    reason: params.reason ?? null,
    ip_address: ipAddress,
    user_agent: userAgent,
  });

  if (error) {
    console.error("[audit] Failed to log admin action:", error, params);
  }
}
