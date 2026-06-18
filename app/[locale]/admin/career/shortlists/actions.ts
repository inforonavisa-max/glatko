"use server";

import { revalidatePath } from "next/cache";

import { createClient, createAdminClient } from "@/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin/audit";

/**
 * Spec 26 — AdminShortlistBuilder server actions (owner-only curation surface).
 *
 * Mirrors app/[locale]/admin/reviews/actions.ts + the sibling career-admin
 * actions (requisitions / curation / unlocks): "use server" + a local
 * requireAdmin() (auth.getUser() + isAdminEmail) + createAdminClient().rpc(...)
 * + revalidatePath + { success, error }.
 *
 * Two-layer gate (R1): the cookie-session admin is re-checked by requireAdmin()
 * here BEFORE the service-role RPC runs (so a non-admin POST straight to the
 * action is rejected even though the /admin layout already gates the render);
 * the RPC itself is SECURITY DEFINER + service_role-only EXECUTE (migration 076).
 * No auth.uid() inside any RPC — `addedBy` is passed explicitly (the admin's
 * user id captured here, never from the client body).
 *
 * No PII here (R-gate discipline): these actions only move shortlist items by
 * worker_code / item id and flip presented_to_employer — they never read or
 * write a name/phone/email/passport. R7: no worker-side fee is touched.
 * R13: every mutation is audit-logged best-effort via logAdminAction (audit
 * failure never blocks the action). The mutation is server-authoritative; the
 * client never fabricates the new state locally (the page re-reads fresh data
 * after revalidatePath).
 */

interface ActionResult {
  success: boolean;
  error?: string;
}

async function requireAdmin(): Promise<
  { ok: true; email: string; userId: string } | { ok: false; error: string }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Yetkisiz" };
  if (!isAdminEmail(user.email)) return { ok: false, error: "Erişim yok" };
  return { ok: true, email: user.email ?? "", userId: user.id };
}

/** Shape every career_admin_* mutation RPC returns: { ok, reason? }. */
type RpcGateResult = { ok: boolean; reason?: string } | null;

/**
 * Add a worker to a requisition's shortlist → career_admin_add_shortlist_item.
 * The RPC lazily creates the shortlist row on the FIRST add (kept private until
 * published), resolves the worker by p_worker_code, and stamps p_added_by with
 * the admin's user id. A missing worker raises WORKER_NOT_FOUND (surfaced via
 * the postgres error path → generic failure). Duplicate adds are prevented in
 * the UI (Add disabled when present) + by any DB unique constraint; a slipped
 * duplicate surfaces as a benign error here. Default stage = 'sourced' when the
 * caller passes none (the RPC coalesces).
 */
export async function addShortlistItem(
  requisitionId: string,
  workerCode: string,
  stage: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("career_admin_add_shortlist_item", {
    p_requisition_id: requisitionId,
    p_worker_code: workerCode,
    p_stage: stage,
    p_added_by: auth.userId,
  });
  if (error) return { success: false, error: error.message };

  const result = data as
    | { ok: boolean; shortlistId?: string; itemId?: string }
    | null;
  if (!result?.ok) {
    return { success: false, error: "İşlem başarısız" };
  }

  // R13: best-effort audit (logAdminAction never throws / never blocks).
  await logAdminAction({
    actionType: "career_shortlist_publish",
    targetTable: "career.shortlists",
    targetId: result.shortlistId ?? null,
    payload: { op: "add", workerCode, stage, itemId: result.itemId },
  }).catch(() => {
    /* audit is defence-in-depth, not foreground */
  });

  revalidatePath("/[locale]/admin/career/requisitions/[id]", "page");
  return { success: true };
}

/**
 * Remove a shortlist item → career_admin_remove_shortlist_item. The RPC deletes
 * by item id and returns { ok: <row existed> }; a missing/already-removed item
 * is a benign no-op (ok:false) surfaced as a generic failure (the page re-reads
 * the fresh shortlist on the next render).
 */
export async function removeShortlistItem(
  itemId: string,
  requisitionId: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("career_admin_remove_shortlist_item", {
    p_item_id: itemId,
  });
  if (error) return { success: false, error: error.message };

  const result = data as RpcGateResult;
  if (!result?.ok) {
    return { success: false, error: "İşlem başarısız" };
  }

  // R13: best-effort audit (logAdminAction never throws / never blocks).
  await logAdminAction({
    actionType: "career_shortlist_publish",
    targetTable: "career.shortlists",
    targetId: itemId,
    payload: { op: "remove", requisitionId },
  }).catch(() => {
    /* audit is defence-in-depth, not foreground */
  });

  revalidatePath("/[locale]/admin/career/requisitions/[id]", "page");
  return { success: true };
}

/**
 * Publish a shortlist → career_admin_publish_shortlist (the byte that lets the
 * employer see the anonymized cards). Flips presented_to_employer=true AND
 * best-effort advances the requisition submitted|under_curation → shortlist_ready
 * (the RPC only advances from those two states, never regresses). Treat the
 * RPC's ok/reason as the source of truth — don't optimistically assume the
 * status transition. NOT_FOUND maps to a human note; an empty shortlist is
 * blocked client-side (disabled button) and the server stays tolerant.
 * Re-publish is idempotent (safe to call again after add/remove edits).
 */
export async function publishShortlist(
  shortlistId: string,
  requisitionId: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("career_admin_publish_shortlist", {
    p_shortlist_id: shortlistId,
  });
  if (error) return { success: false, error: error.message };

  const result = data as RpcGateResult;
  if (!result?.ok) {
    if (result?.reason === "NOT_FOUND") {
      return { success: false, error: "Kısa liste bulunamadı" };
    }
    return { success: false, error: "İşlem başarısız" };
  }

  // R13: best-effort audit (logAdminAction never throws / never blocks).
  await logAdminAction({
    actionType: "career_shortlist_publish",
    targetTable: "career.shortlists",
    targetId: shortlistId,
    payload: { op: "publish", requisitionId },
  }).catch(() => {
    /* audit is defence-in-depth, not foreground */
  });

  revalidatePath("/[locale]/admin/career/requisitions/[id]", "page");
  return { success: true };
}
