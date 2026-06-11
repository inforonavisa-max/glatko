"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/supabase/server";
import { isAdminEmail } from "@/lib/admin";

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
  if (!user) return { ok: false, error: "Unauthorized" };
  if (!isAdminEmail(user.email)) return { ok: false, error: "Forbidden" };
  return { ok: true, email: user.email ?? "" };
}

/**
 * G-REVIEW-R1 (K2): admin hide/restore for instantly-published reviews.
 *
 * status → 'removed' hides the review everywhere at once: the public-read
 * RLS policy filters status='published', and the 061 rating trigger
 * recalculates avg_rating/total_reviews on UPDATE — so profile rating and
 * the conditional JSON-LD markup correct themselves with no extra code.
 */
export async function setReviewStatus(
  reviewId: string,
  status: "published" | "removed",
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("glatko_quote_reviews")
    .update({ status })
    .eq("id", reviewId);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/[locale]/admin/reviews`, "page");
  return { success: true };
}
