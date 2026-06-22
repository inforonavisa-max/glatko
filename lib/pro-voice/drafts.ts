import "server-only";

import { createAdminClient } from "@/supabase/server";
import type { ExtractedProfile } from "@/lib/pro-voice/types";

/**
 * G-VOICE-1 — pro_onboarding_drafts data-access. ALL via service_role; the
 * table is RLS deny-all so nothing else can touch it. Ownership is enforced in
 * code (draft.user_id === session user) since service_role bypasses RLS.
 */

export interface DraftRow {
  id: string;
  user_id: string | null;
  status: string;
  detected_language: string | null;
  transcript: string | null;
  extracted: ExtractedProfile | null;
  photo_urls: string[];
  audio_url: string | null;
  phone: string | null;
  expires_at: string;
}

export interface InsertDraftInput {
  id: string;
  userId: string;
  detectedLanguage: string | null;
  transcript: string;
  extracted: ExtractedProfile;
  photoUrls: string[];
  audioPath: string | null;
}

export async function insertDraft(input: InsertDraftInput): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("pro_onboarding_drafts").insert({
    id: input.id,
    user_id: input.userId,
    status: "draft",
    detected_language: input.detectedLanguage,
    transcript: input.transcript,
    extracted: input.extracted,
    photo_urls: input.photoUrls,
    audio_url: input.audioPath,
  });
  if (error) throw new Error(`draft insert failed: ${error.message}`);
}

/**
 * Fetch a draft only if it belongs to `userId`, is still in 'draft' status and
 * has not expired. Returns null otherwise (caller maps to a stable error code).
 */
export async function getOwnedDraft(
  draftId: string,
  userId: string,
): Promise<DraftRow | { error: "not_found" | "expired" }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("pro_onboarding_drafts")
    .select(
      "id, user_id, status, detected_language, transcript, extracted, photo_urls, audio_url, phone, expires_at",
    )
    .eq("id", draftId)
    .maybeSingle();

  if (error || !data) return { error: "not_found" };
  const row = data as DraftRow;
  if (row.user_id !== userId || row.status === "confirmed") {
    return { error: "not_found" };
  }
  if (new Date(row.expires_at).getTime() < Date.now() || row.status === "expired") {
    return { error: "expired" };
  }
  return row;
}

/** Mark a draft confirmed and record the verified phone used. */
export async function markDraftConfirmed(
  draftId: string,
  phone: string,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("pro_onboarding_drafts")
    .update({ status: "confirmed", phone })
    .eq("id", draftId);
  if (error) throw new Error(`draft confirm-update failed: ${error.message}`);
}
