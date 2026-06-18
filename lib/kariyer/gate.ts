import "server-only";

import { createAdminClient } from "@/supabase/server";

/**
 * Glatko Kariyer — the document-access GATE (server-only). Thin wrapper over the
 * `career_can_access_document` SECURITY DEFINER RPC (migration 075 §7), which is
 * the single signing-time predicate (RULE R6 + R8 #4):
 *
 *   access iff  (a) the document is the requesting user's OWN doc
 *           OR  (b) it is a 'gated' doc AND a reveal_unlocks row for that worker is
 *               owner_approved = true AND payment_status = 'paid' AND the unlock's
 *               employer account belongs to the caller.
 *
 * This predicate MUST stay byte-for-byte equivalent to the
 * worker_documents_gated_unlock_read RLS policy in 073 (the gate-equivalence test
 * asserts no drift). RLS is defense-in-depth only; THIS RPC is on the prod signing
 * path. lib/kariyer/storage.ts's gated-original signer calls assertRevealUnlocked
 * before minting any signed URL for a gated original.
 *
 * RULE R1: identity comes from the route/action (auth.getUser()) and is PASSED as
 * p_user_id; the RPC runs as service_role (auth.uid() is NULL).
 */

/**
 * Returns true iff `userId` may access `documentId` per the gate predicate above.
 * Fails CLOSED: any RPC error → false (never mint a URL on an ambiguous result).
 */
export async function canAccessDocument(
  userId: string,
  documentId: string,
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("career_can_access_document", {
    p_user_id: userId,
    p_document_id: documentId,
  });
  if (error) {
    // Fail-closed: an unverifiable gate is a denied gate.
    console.error("[career-gate] career_can_access_document failed:", error.message);
    return false;
  }
  return data === true;
}

/**
 * Gate assertion for the gated-original signer (RULE R6): throws GATE_LOCKED unless
 * the caller passes `career_can_access_document`. Use this immediately before
 * createSignedUrl on a `career-worker` original; the throw aborts the signing path
 * (the route maps it to 403). Callers must additionally write a
 * career_document_access_log row on every successful issuance (R6).
 */
export async function assertRevealUnlocked(
  userId: string,
  documentId: string,
): Promise<void> {
  const allowed = await canAccessDocument(userId, documentId);
  if (!allowed) {
    throw new Error("GATE_LOCKED");
  }
}
