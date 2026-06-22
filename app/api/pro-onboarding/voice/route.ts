import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/supabase/server";
import { isVoiceOnboardingEnabled } from "@/lib/pro-voice/flags";
import {
  uploadVoiceAudio,
  uploadVoicePhoto,
  deleteVoiceAudio,
} from "@/lib/pro-voice/storage";
import {
  transcribeAudio,
  summarizePhotos,
  extractProfile,
} from "@/lib/pro-voice/openai";
import { getRootCategorySlugs } from "@/lib/pro-voice/categories";
import { insertDraft } from "@/lib/pro-voice/drafts";
import type { VoiceDraftResult } from "@/lib/pro-voice/types";

// Service-role storage + OpenAI + DB write, reads the cookie session for the
// majstor identity — never statically cached. Whisper is the long pole, so we
// give the function room (vision+extract run after a parallel whisper).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AUDIO_MAX_BYTES = 20 * 1024 * 1024; // spec: < 20MB
const PHOTO_MAX_BYTES = 10 * 1024 * 1024; // pro-portfolio cap
const MAX_PHOTOS = 5;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function isAudio(file: File): boolean {
  return file.type.startsWith("audio/") && file.size > 0;
}

export async function POST(request: Request) {
  // Flag OFF → real 404 (mirrors career/health routes; the feature is dark).
  if (!isVoiceOnboardingEnabled()) return new NextResponse(null, { status: 404 });

  // Identity from the session, NEVER the body (R1). /become-a-pro is auth-gated,
  // so a real session must exist; no session → 401.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Already a pro? Nothing to onboard — surface it so the UI can redirect.
  const { data: existingPro } = await supabase
    .from("glatko_professional_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (existingPro) {
    return NextResponse.json({ error: "already_pro" }, { status: 409 });
  }

  // Multipart: one audio File + 0-5 photo Files.
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const audioField = form.get("audio");
  if (!(audioField instanceof File) || !isAudio(audioField)) {
    return NextResponse.json({ error: "no_audio" }, { status: 400 });
  }
  if (audioField.size > AUDIO_MAX_BYTES) {
    return NextResponse.json({ error: "audio_too_large" }, { status: 413 });
  }

  const photoFields = form
    .getAll("photos")
    .filter((p): p is File => p instanceof File && p.size > 0);
  if (photoFields.length > MAX_PHOTOS) {
    return NextResponse.json({ error: "too_many_photos" }, { status: 400 });
  }
  for (const p of photoFields) {
    if (!PHOTO_TYPES.has(p.type)) {
      return NextResponse.json({ error: "invalid_file_type" }, { status: 400 });
    }
    if (p.size > PHOTO_MAX_BYTES) {
      return NextResponse.json({ error: "photo_too_large" }, { status: 413 });
    }
  }

  const draftId = randomUUID();

  // ── Upload (audio temp + photos permanent). Storage failure → 503. ────────
  let audioPath: string;
  let photoUrls: string[];
  try {
    audioPath = await uploadVoiceAudio(user.id, draftId, audioField);
    photoUrls = await Promise.all(
      photoFields.map((p, i) => uploadVoicePhoto(user.id, draftId, p, i)),
    );
  } catch (e) {
    console.error(
      "[GLATKO:voice] upload failed:",
      e instanceof Error ? e.message : "unknown",
    );
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  // ── Pipeline: whisper ∥ vision, then strict extraction. Any null = graceful
  //    fallback to the manual form (R-INCIDENT-1: degrade, don't fake). ──────
  const [transcription, visionSummary] = await Promise.all([
    transcribeAudio(audioField),
    summarizePhotos(photoUrls),
  ]);

  if (!transcription || transcription.text.trim().length === 0) {
    await deleteVoiceAudio(audioPath);
    return NextResponse.json({ error: "pipeline_failed" }, { status: 503 });
  }

  const categorySlugs = await getRootCategorySlugs();
  const profile = await extractProfile(
    transcription.text,
    visionSummary,
    categorySlugs,
  );
  if (!profile) {
    await deleteVoiceAudio(audioPath);
    return NextResponse.json({ error: "pipeline_failed" }, { status: 503 });
  }

  // ── Persist draft. Audio is no longer needed once extraction succeeded. ───
  try {
    await insertDraft({
      id: draftId,
      userId: user.id,
      detectedLanguage: transcription.language,
      transcript: transcription.text,
      extracted: profile,
      photoUrls,
      audioPath: null, // dropped below; URL not retained
    });
  } catch (e) {
    console.error(
      "[GLATKO:voice] draft insert failed:",
      e instanceof Error ? e.message : "unknown",
    );
    await deleteVoiceAudio(audioPath);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  await deleteVoiceAudio(audioPath);

  const result: VoiceDraftResult = {
    draftId,
    profile,
    photoUrls,
    transcript: transcription.text,
    detectedLanguage: transcription.language,
  };
  return NextResponse.json(result, { status: 200 });
}
