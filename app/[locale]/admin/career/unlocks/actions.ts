"use server";

import { revalidatePath } from "next/cache";

import { createClient, createAdminClient } from "@/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin/audit";

/**
 * Spec 27 — Owner Unlock Approval Gate server actions (THE monetization gate).
 *
 * Mirrors app/[locale]/admin/reviews/actions.ts:
 *   "use server" + requireAdmin() (auth.getUser() + isAdminEmail) +
 *   createAdminClient().rpc(...) + revalidatePath + { success, error }.
 *
 * Two-layer gate (R1): the cookie-session admin is re-checked by requireAdmin()
 * here BEFORE the service-role RPC runs; the RPC itself is SECURITY DEFINER +
 * service_role-only EXECUTE (migration 076). No auth.uid() inside any RPC.
 *
 * R7: every fee/invoice/payment string is EMPLOYER-direction only — the worker
 * is NEVER charged. R13: each approve/mark-paid is recorded via logAdminAction
 * (audit failure never blocks the action). The unlock flag flip is
 * server-authoritative + state-guarded (the RPC compare-and-sets); the client
 * never fabricates the unlock locally.
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

/** Shape every career_admin_* gate RPC returns: { ok, reason? }. */
type RpcGateResult = { ok: boolean; reason?: string } | null;

/**
 * Approve an unlock → career_admin_approve_unlock (approve + fee-invoice stub in
 * one atomic update). Maps STATE_MISMATCH to a human note; the RPC only flips
 * owner_approved=false rows, so a stale console view is a guarded no-op.
 */
export async function approveUnlock(unlockId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("career_admin_approve_unlock", {
    p_id: unlockId,
  });
  if (error) return { success: false, error: error.message };

  const result = data as RpcGateResult;
  if (!result?.ok) {
    if (result?.reason === "STATE_MISMATCH") {
      return {
        success: false,
        error: "Bu açılım zaten onaylanmış/durumu değişmiş.",
      };
    }
    return { success: false, error: "İşlem başarısız" };
  }

  // R13: audit (never blocks the action).
  await logAdminAction({
    actionType: "career_unlock_approve",
    targetTable: "career.reveal_unlocks",
    targetId: unlockId,
  }).catch(() => {
    /* audit is defence-in-depth, not foreground */
  });

  revalidatePath("/[locale]/admin/career/unlocks", "page");
  return { success: true };
}

/**
 * Mark an unlock paid → career_admin_mark_unlock_paid. PHASE-0 STUB: this is a
 * MANUAL action — no live PSP; off-platform settlement is confirmed by the owner
 * by hand. The single update sets payment_status='paid' AND unlocked_at=now(),
 * the byte that releases the employer's full dossier. Maps NOT_APPROVED →
 * "Önce onaylayın." (the RPC refuses rows that aren't owner_approved=true).
 *
 * TODO(payment): a real PSP webhook replaces this human call later — the SQL
 * stays identical; only the caller changes.
 */
export async function markUnlockPaid(unlockId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("career_admin_mark_unlock_paid", {
    p_id: unlockId,
  });
  if (error) return { success: false, error: error.message };

  const result = data as RpcGateResult;
  if (!result?.ok) {
    if (result?.reason === "NOT_APPROVED") {
      return { success: false, error: "Önce onaylayın." };
    }
    return { success: false, error: "İşlem başarısız" };
  }

  await logAdminAction({
    actionType: "career_unlock_paid",
    targetTable: "career.reveal_unlocks",
    targetId: unlockId,
  }).catch(() => {
    /* audit is defence-in-depth, not foreground */
  });

  revalidatePath("/[locale]/admin/career/unlocks", "page");
  return { success: true };
}

/**
 * GAP (Spec 27 §GAP): DENY has no RPC or enum value yet. Migration 076 ships
 * ONLY approve + mark-paid, and career.unlock_payment_status (unpaid|invoiced|
 * paid) has no terminal "denied" value. Until a migration lands (a deny RPC or
 * a denied enum value — R15, author/dry-run only, no prod apply without go), we
 * MUST NOT simulate deny client-side or delete the gate row (audit trail must
 * survive). The UI renders the deny control disabled/"yakında"; this server
 * action is a guarded no-op so the import contract exists without faking deny.
 */
export async function denyUnlock(
  _unlockId: string,
  _reason: string,
): Promise<ActionResult> {
  // Args intentionally unused until a deny RPC/enum lands (see GAP note above).
  void _unlockId;
  void _reason;
  return {
    success: false,
    error: "Reddetme henüz hazır değil (RPC bekleniyor).",
  };
}
