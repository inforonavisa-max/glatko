import "server-only";

import OpenAI from "openai";
import { glatkoCaptureException } from "@/lib/sentry/glatko-capture";
import type { ExtractedProfile } from "@/lib/pro-voice/types";

/**
 * G-VOICE-1 — the OpenAI pipeline for voice pro-onboarding. Three isolated,
 * individually-fallible steps (spec §2): Whisper STT → vision summary → strict
 * structured extraction. EVERY call is wrapped in try/catch + a timeout and
 * returns null on failure; the route turns any null into a graceful "fill the
 * form together" fallback (R-INCIDENT-1: never swallow, never fake — degrade).
 *
 * Reuses the existing server-side OpenAI conventions (lib/ai/translate-message,
 * lib/translation/openai-translator): `new OpenAI({ apiKey })` from
 * process.env.OPENAI_API_KEY — no new env. Server-only by import.
 */

const WHISPER_TIMEOUT_MS = 60_000;
const VISION_TIMEOUT_MS = 40_000;
const EXTRACT_TIMEOUT_MS = 40_000;

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[GLATKO:voice] OPENAI_API_KEY not set — pipeline disabled");
    return null;
  }
  return new OpenAI({ apiKey });
}

async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string,
): Promise<T | null> {
  try {
    return await Promise.race([
      p,
      new Promise<null>((resolve) =>
        setTimeout(() => {
          console.warn(`[GLATKO:voice] ${label} timed out after ${ms}ms`);
          resolve(null);
        }, ms),
      ),
    ]);
  } catch (err) {
    console.error(
      `[GLATKO:voice] ${label} failed:`,
      err instanceof Error ? err.message : "unknown",
    );
    glatkoCaptureException(err, { module: `voice-${label}` });
    return null;
  }
}

export interface TranscriptionResult {
  text: string;
  language: string | null;
}

/**
 * Whisper STT. Language is NOT forced → auto-detect (me/sr/ru/hr/bs blend the
 * spec calls out). Returns null on any failure.
 */
export async function transcribeAudio(
  audio: File,
): Promise<TranscriptionResult | null> {
  const client = getClient();
  if (!client) return null;

  const run = (async (): Promise<TranscriptionResult> => {
    const res = await client.audio.transcriptions.create({
      file: audio,
      model: "whisper-1",
      response_format: "json",
    });
    // verbose_json would carry `language`; plain json gives text only. We keep
    // json (cheaper) and let the extraction step infer language separately.
    const maybeLang =
      typeof (res as { language?: unknown }).language === "string"
        ? (res as { language?: string }).language ?? null
        : null;
    return { text: res.text ?? "", language: maybeLang };
  })();

  return withTimeout(run, WHISPER_TIMEOUT_MS, "whisper");
}

/**
 * Vision summary over up to 5 work photos (parallel inside one chat call via
 * multiple image_url parts). Returns a short plain-text hint that feeds the
 * extraction step, or null on failure (extraction still runs on transcript).
 */
export async function summarizePhotos(
  photoUrls: string[],
): Promise<string | null> {
  if (photoUrls.length === 0) return null;
  const client = getClient();
  if (!client) return null;

  const run = (async (): Promise<string> => {
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Bu fotoğraflar bir hizmet sağlayıcının (majstor) yaptığı işleri gösteriyor. Hangi meslek/hizmet kategorisine işaret ediyorlar? Kısaca (1-3 cümle) özetle: ne tür işler, hangi malzemeler/araçlar görünüyor. Sadece gözlemi yaz, profil uydurma.",
            },
            ...photoUrls.map(
              (url) =>
                ({
                  type: "image_url" as const,
                  image_url: { url, detail: "low" as const },
                }),
            ),
          ],
        },
      ],
    });
    return res.choices[0]?.message?.content?.trim() ?? "";
  })();

  return withTimeout(run, VISION_TIMEOUT_MS, "vision");
}

/**
 * Structured extraction with strict json_schema. `categorySlugs` is the LIVE
 * root-slug list injected as an enum, so category_slug can NEVER be outside the
 * real taxonomy. Returns null on failure or if the model somehow violates the
 * enum (defense-in-depth re-check).
 */
export async function extractProfile(
  transcript: string,
  visionSummary: string | null,
  categorySlugs: string[],
): Promise<ExtractedProfile | null> {
  const client = getClient();
  if (!client) return null;
  if (categorySlugs.length === 0) return null;

  const schema = {
    type: "object",
    additionalProperties: false,
    required: [
      "display_name",
      "category_slug",
      "sub_services",
      "bio",
      "service_areas",
      "experience_years",
    ],
    properties: {
      display_name: { type: "string" },
      category_slug: { type: "string", enum: categorySlugs },
      sub_services: {
        type: "array",
        items: { type: "string" },
        maxItems: 8,
      },
      bio: { type: "string" },
      service_areas: { type: "array", items: { type: "string" } },
      experience_years: { type: ["integer", "null"] },
    },
  } as const;

  const userParts = [
    `MAJSTORUN SESLİ NOTU (transcript):\n${transcript || "(boş)"}`,
    visionSummary ? `\n\nFOTOĞRAF ANALİZİ:\n${visionSummary}` : "",
  ].join("");

  const run = (async (): Promise<ExtractedProfile | null> => {
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 600,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "pro_profile",
          strict: true,
          schema,
        },
      },
      messages: [
        {
          role: "system",
          content:
            "Sen bir hizmet pazaryeri için profil çıkarımı yapan bir asistansın. Majstorun sesli notundan ve fotoğraf analizinden bir hizmet sağlayıcı profili çıkar. bio'yu MAJSTORUN KENDİ DİLİNDE, 2-4 cümlelik, birinci tekil şahıs ('...yapıyorum') olarak yaz. ÖNEMLİ: bio SADECE majstorun gerçekten söylediği bilgileri yeniden ifade etsin; girişte geçmeyen öznel ya da pazarlama ifadeleri EKLEME (örn. 'kaliteli hizmet', 'her müşteriyi memnun ederim', 'uzmanım', 'işimi çok severim', 'profesyonelim', 'uživam u poslu' gibi). Majstorun kendi sade sesini koru. Bilgi yoksa uydurma: experience_years bilinmiyorsa null, sub_services/service_areas boş bırakılabilir. category_slug SADECE verilen enum'dan seçilebilir.",
        },
        { role: "user", content: userParts },
      ],
    });

    const raw = res.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ExtractedProfile;
    // Defense-in-depth: strict mode should guarantee this, but never trust.
    if (!categorySlugs.includes(parsed.category_slug)) {
      console.warn(
        "[GLATKO:voice] extraction returned out-of-enum category — rejecting",
      );
      return null;
    }
    return parsed;
  })();

  return withTimeout(run, EXTRACT_TIMEOUT_MS, "extract");
}
