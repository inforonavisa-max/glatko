"use server";

import { revalidatePath } from "next/cache";

import { createClient, createAdminClient } from "@/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin/audit";

/**
 * Spec 25 — Talent curation server actions (owner-only, un-anonymized surface).
 *
 * Mirrors app/[locale]/admin/reviews/actions.ts + the sibling career-admin
 * actions: "use server" + a local requireAdmin() (auth.getUser() + isAdminEmail)
 * + createAdminClient().rpc(...) + revalidatePath + { success, error }.
 *
 * Two-layer gate (R1): the cookie-session admin is re-checked by requireAdmin()
 * here BEFORE the service-role RPC runs (so a non-admin POST straight to the
 * action is rejected even though the /admin layout already gates the render);
 * the RPC itself is SECURITY DEFINER + service_role-only EXECUTE (migration 076).
 * No auth.uid() inside any RPC.
 *
 * R7: this surface curates + verifies ONLY — it never shows or edits a worker
 * fee. R13: every verification/doc mutation is audit-logged best-effort via
 * logAdminAction (audit failure never blocks the action). The mutation is
 * server-authoritative; the client never fabricates the new state locally
 * (the island re-reads fresh, re-decrypted data via router.refresh()).
 */

interface ActionResult {
  success: boolean;
  error?: string;
}

async function requireAdmin(): Promise<
  { ok: true; email: string } | { ok: false; error: string }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Yetkisiz" };
  if (!isAdminEmail(user.email)) return { ok: false, error: "Erişim yok" };
  return { ok: true, email: user.email ?? "" };
}

/** Shape every career_admin_* mutation RPC returns: { ok, reason? }. */
type RpcGateResult = { ok: boolean; reason?: string } | null;

/**
 * Set a worker's verification status → career_admin_set_worker_verification.
 * The RPC re-validates p_status against the 6 valid statuses (the client only
 * offers valid buttons, but the action never trusts the client). An invalid
 * status raises (SECTOR_INVALID code-reuse) → surfaced as a generic failure;
 * a missing worker returns { ok:false, reason:'WORKER_NOT_FOUND' }.
 */
export async function setWorkerVerification(
  workerId: string,
  status: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("career_admin_set_worker_verification", {
    p_id: workerId,
    p_status: status,
  });
  if (error) return { success: false, error: error.message };

  const result = data as RpcGateResult;
  if (!result?.ok) {
    if (result?.reason === "WORKER_NOT_FOUND") {
      return { success: false, error: "İşçi bulunamadı" };
    }
    return { success: false, error: "İşlem başarısız" };
  }

  // R13: best-effort audit (logAdminAction never throws / never blocks).
  await logAdminAction({
    actionType: "career_worker_verify",
    targetTable: "career.worker_profiles",
    targetId: workerId,
    payload: { status },
  }).catch(() => {
    /* audit is defence-in-depth, not foreground */
  });

  revalidatePath("/[locale]/admin/career/curation", "page");
  return { success: true };
}

/**
 * Verify (approve) or reject a worker document → career_admin_verify_document.
 * Approve stamps consent_status='granted' (+ consent_at); reject stamps
 * 'revoked'. A deleted/re-uploaded doc returns { ok:false, reason:'NOT_FOUND' }
 * → "Belge bulunamadı" (the island refreshes the manifest on next read).
 */
export async function verifyWorkerDocument(
  documentId: string,
  approve: boolean,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("career_admin_verify_document", {
    p_id: documentId,
    p_approve: approve,
  });
  if (error) return { success: false, error: error.message };

  const result = data as RpcGateResult;
  if (!result?.ok) {
    if (result?.reason === "NOT_FOUND") {
      return { success: false, error: "Belge bulunamadı" };
    }
    return { success: false, error: "İşlem başarısız" };
  }

  await logAdminAction({
    actionType: "career_document_verify",
    targetTable: "career.worker_documents",
    targetId: documentId,
    payload: { approve },
  }).catch(() => {
    /* audit is defence-in-depth, not foreground */
  });

  revalidatePath("/[locale]/admin/career/curation", "page");
  return { success: true };
}
