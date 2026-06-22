/**
 * G-VOICE-1 — shared contracts for the voice pro-onboarding path. Kept in one
 * server-and-client-safe module (pure types) so the API routes, the data-access
 * layer and the review UI agree on one shape. NO logic here — types only.
 */

/** The structured profile the LLM extracts from transcript + vision summary. */
export interface ExtractedProfile {
  display_name: string;
  /** MUST be one of the live root category slugs (enum-constrained at request time). */
  category_slug: string;
  sub_services: string[];
  /** Free-text bio in the majstor's own language, 2-4 sentences. */
  bio: string;
  service_areas: string[];
  experience_years: number | null;
}

/** What POST /api/pro-onboarding/voice returns to the capture UI. */
export interface VoiceDraftResult {
  draftId: string;
  profile: ExtractedProfile;
  photoUrls: string[];
  transcript: string;
  detectedLanguage: string | null;
}

/** The (possibly edited) profile the review UI sends back on confirm. */
export interface ConfirmEdits {
  display_name: string;
  category_slug: string;
  sub_services: string[];
  bio: string;
  service_areas: string[];
  experience_years: number | null;
}

/** Stable error codes surfaced by the voice + confirm routes (no PII). */
export type VoiceErrorCode =
  | "flag_off"
  | "unauthorized"
  | "invalid_payload"
  | "no_audio"
  | "audio_too_large"
  | "audio_too_long"
  | "too_many_photos"
  | "photo_too_large"
  | "invalid_file_type"
  | "pipeline_failed"
  | "draft_not_found"
  | "draft_expired"
  | "phone_not_verified"
  | "category_unresolved"
  | "already_pro"
  | "create_failed"
  | "unavailable";
