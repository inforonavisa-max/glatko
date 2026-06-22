import "server-only";

import { createAdminClient } from "@/supabase/server";

/**
 * G-VOICE-1 — storage for the voice pipeline, all via service_role (admin
 * client) so it works in route handlers and bypasses RLS deliberately:
 *   • audio  → pro-voice-audio (PRIVATE, short-lived PII) — returns path only
 *   • photos → pro-portfolio   (PUBLIC, permanent portfolio) — returns URL
 * Paths are namespaced under the authenticated user id (R1: server derives the
 * path; the client never names it).
 */

const AUDIO_BUCKET = "pro-voice-audio";
const PORTFOLIO_BUCKET = "pro-portfolio";

function audioExt(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "m4a";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  return "bin";
}

function photoExt(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/** Upload the raw voice note. Returns the storage PATH (never a URL). */
export async function uploadVoiceAudio(
  userId: string,
  draftId: string,
  file: File,
): Promise<string> {
  const supabase = createAdminClient();
  const path = `${userId}/${draftId}/audio.${audioExt(file.type)}`;
  const { data, error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(path, file, {
      cacheControl: "0",
      upsert: true,
      contentType: file.type || "application/octet-stream",
    });
  if (error || !data) {
    throw new Error(`voice audio upload failed: ${error?.message ?? "unknown"}`);
  }
  return data.path;
}

/** Upload one portfolio photo. Returns the permanent public URL. */
export async function uploadVoicePhoto(
  userId: string,
  draftId: string,
  file: File,
  index: number,
): Promise<string> {
  const supabase = createAdminClient();
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${userId}/voice-${draftId}-${index}-${rand}.${photoExt(file.type)}`;
  const { data, error } = await supabase.storage
    .from(PORTFOLIO_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });
  if (error || !data) {
    throw new Error(`voice photo upload failed: ${error?.message ?? "unknown"}`);
  }
  const { data: urlData } = supabase.storage
    .from(PORTFOLIO_BUCKET)
    .getPublicUrl(data.path);
  return urlData.publicUrl;
}

/** Best-effort delete of the temp audio once extraction has succeeded. */
export async function deleteVoiceAudio(path: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(AUDIO_BUCKET).remove([path]);
  if (error) {
    // Non-fatal: a leftover temp object is cleaned by the expiry sweep later.
    console.warn("[GLATKO:voice] temp audio delete failed:", error.message);
  }
}
