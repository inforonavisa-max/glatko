"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/supabase/server";

interface ActionResult {
  success: boolean;
  error?: string;
}

/**
 * G-REVIEW-R1 (K3): pro writes/edits the single public response to a
 * review on their profile. Authorization + column scoping live in the
 * SECURITY DEFINER RPC (migration 063) — caller must be the review's
 * professional and the review must be published.
 */
export async function respondToReview(input: {
  review_id: string;
  response: string;
}): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const trimmed = (input.response ?? "").trim();
  if (!trimmed || trimmed.length > 1000) {
    return { success: false, error: "Response must be 1-1000 characters" };
  }

  const { error } = await supabase.rpc("glatko_pro_respond_to_review", {
    p_review_id: input.review_id,
    p_response: trimmed,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath(`/[locale]/pros/[slug]`, "page");
  return { success: true };
}
