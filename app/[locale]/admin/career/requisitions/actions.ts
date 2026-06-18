"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin/audit";

interface ActionResult {
  success: boolean;
  error?: string;
}

/**
 * Career C0 — admin requisition lifecycle driver (mirror of
 * app/[locale]/admin/reviews/actions.ts). Two-layer defense (spec 24, R1/R8 #2):
 * (1) the admin layout email-allowlist gates the human, (2) the
 * career_admin_* RPCs are service_role-only EXECUTE. requireAdmin() re-checks
 * here so a non-admin POST straight to the server action is rejected even though
 * the layout already gates the page render.
 */
async function requireAdmin(): Promise<
  { ok: true; email: string } | { ok: false; error: string }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };
  if (!isAdminEmail(user.email)) return { ok: false, error: "Forbidden" };
  return { ok: true, email: user.email ?? "" };
}

/**
 * State-guarded compare-and-set on the requisition lifecycle. Unlike reviews'
 * binary toggle, requisitions advance through a LINEAR pipeline, so the card
 * passes the status it currently displays as `expected` — the RPC updates only
 * `where id=p_id and status=p_expected`, returning ok:false reason:STATE_MISMATCH
 * when a stale console view tried to skip/double-apply a stage (the headline edge
 * case: two admins both click the same forward button). R13: the transition is
 * audit-logged best-effort (never blocks the action).
 */
export async function setRequisitionStatus(
  id: string,
  expected: string,
  next: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("career_admin_set_requisition_status", {
    p_id: id,
    p_expected: expected,
    p_next: next,
  });
  if (error) return { success: false, error: error.message };

  const result = data as { ok: boolean; reason?: string } | null;
  if (!result?.ok) {
    if (result?.reason === "STATE_MISMATCH") {
      return { success: false, error: "Durum değişmiş, sayfayı yenileyin" };
    }
    return { success: false, error: "İşlem başarısız" };
  }

  // R13: best-effort audit (logAdminAction never throws / never blocks).
  await logAdminAction({
    actionType: "career_requisition_status",
    targetTable: "career.requisitions",
    targetId: id,
    payload: { from: expected, to: next },
  });

  revalidatePath(`/[locale]/admin/career/requisitions`, "page");
  return { success: true };
}
