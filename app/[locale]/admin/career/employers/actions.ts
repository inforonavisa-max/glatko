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
 * Career C0 — admin employer console driver (mirror of
 * app/[locale]/admin/reviews/actions.ts and the sibling requisitions action).
 * Two-layer defense (spec 30, R1/R8 #2): (1) the admin layout email-allowlist
 * gates the human, (2) the career_admin_* RPCs are service_role-only EXECUTE.
 * requireAdmin() re-checks here so a non-admin POST straight to the server
 * action is rejected even though the layout already gates the page render.
 *
 * tier (`free`/`verified`/`premium`) and the `verified` boolean are two SEPARATE
 * DB columns; each action calls only its own RPC and must not touch the other.
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
 * Set the employer tier (Free / Verified / Premium) — migration 076 §13
 * (`career_admin_set_employer_tier`). A plain idempotent update (no
 * compare-and-set guard, unlike requisitions): a double-click harmlessly
 * re-applies the same value. Maps reason:'NOT_FOUND' (row deleted between read
 * and click) to a red error; the next revalidatePath drops the stale row. R13:
 * best-effort audit (logAdminAction never throws / never blocks).
 */
export async function setEmployerTier(
  id: string,
  tier: "free" | "verified" | "premium",
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("career_admin_set_employer_tier", {
    p_id: id,
    p_tier: tier,
  });
  if (error) return { success: false, error: error.message };

  const result = data as { ok: boolean; reason?: string } | null;
  if (!result?.ok) {
    if (result?.reason === "NOT_FOUND") {
      return { success: false, error: "İşveren bulunamadı, sayfayı yenileyin" };
    }
    return { success: false, error: "İşlem başarısız" };
  }

  await logAdminAction({
    actionType: "career_employer_tier",
    targetTable: "career.employer_accounts",
    targetId: id,
    payload: { tier },
  });

  revalidatePath(`/[locale]/admin/career/employers`, "page");
  return { success: true };
}

/**
 * Toggle the employer `verified` flag — migration 076 §12
 * (`career_admin_set_employer_verified`). The RPC returns `{ok}` (true when a
 * row was updated, false when the id is gone); a false `ok` maps to the same
 * NOT_FOUND red error. Kept conceptually distinct from tier (separate column).
 */
export async function setEmployerVerified(
  id: string,
  verified: boolean,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("career_admin_set_employer_verified", {
    p_id: id,
    p_verified: verified,
  });
  if (error) return { success: false, error: error.message };

  const result = data as { ok: boolean; reason?: string } | null;
  if (!result?.ok) {
    return { success: false, error: "İşveren bulunamadı, sayfayı yenileyin" };
  }

  await logAdminAction({
    actionType: "career_employer_verify",
    targetTable: "career.employer_accounts",
    targetId: id,
    payload: { verified },
  });

  revalidatePath(`/[locale]/admin/career/employers`, "page");
  return { success: true };
}
