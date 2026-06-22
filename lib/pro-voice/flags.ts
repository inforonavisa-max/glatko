/**
 * G-VOICE-1 (Sesli AI Pro Onboarding, Faz 1): the voice onboarding path ships
 * dark, mirroring the career/health vertical convention. Vercel env matrix —
 * Production=false, Preview=true, Development=true. The flag only flips in
 * Production with the owner's written launch approval (it calls paid OpenAI
 * APIs — Whisper + vision + extraction — so it must not go hot unapproved).
 *
 * Read at request time in server components/route handlers, so no NEXT_PUBLIC_
 * prefix. When OFF, the /become-a-pro tab wrapper renders ONLY the existing
 * manual wizard, byte-identical to today — the manual flow has zero regression
 * surface by construction.
 */
export function isVoiceOnboardingEnabled(): boolean {
  return process.env.VOICE_ONBOARDING_ENABLED === "true";
}
