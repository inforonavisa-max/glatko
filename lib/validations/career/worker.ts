import { z } from "zod";
import type { ValidationTranslator } from "@/lib/validations/i18n-zod";

/**
 * Glatko Kariyer — Worker register + WorkerProfileWizard payload schemas (Spec 19).
 *
 * Mirrors the established `createXSchema(tr)` factory idiom (see
 * lib/validations/service-request.ts / pro-bid.ts / career/requisition.ts): a
 * translator-bound Zod object whose messages resolve through the shared
 * `validation.*` dictionary keys, so the same schema drives client-side inline
 * validation and (optionally) the route's defense-in-depth re-check.
 *
 * The parsed profile shape maps onto the supply-side write layer in
 * lib/kariyer/booking.ts:
 *   consent                     → createWorkerProfile.consent   (p_consent)
 *   role / trade / experience   → p_role / p_trade / p_experience
 *   region (PUBLIC) vs country  → p_region vs p_exact_country    (PART 4 redaction)
 *   age-band (PUBLIC) vs dob    → p_age   vs p_dob               (PART 4 redaction)
 *   languages[] / skills[]      → p_languages / p_skills
 *   documents[]                 → addDocument(category, storagePath, visibility, consent)
 * The richer wizard payload (work-history, certs/education, video) rides along as
 * structured JSON for the upsert RPC (migration `075`); fields the base RPC does
 * not yet persist are still validated here so the client surface stays honest.
 *
 * R1: the worker user id is NEVER in this payload — it is derived server-side from
 * the cookie session and passed to the RPC as `p_worker_user_id` (ownership
 * re-verified inside the RPC).
 *
 * R7 (ILO Employer Pays): the worker is NEVER charged. There is NO fee / price /
 * rate / payment / commission field anywhere in this file by design.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enumerations (single source of truth — re-used by the wizard + route).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-item visibility intent collected on StepPhotosDocs. Mirrors the
 * `visibility` union persisted by `addDocument()` in lib/kariyer/booking.ts:
 *   public_anonymized → face-blurred/watermarked showcase variant (R6)
 *   gated             → revealed only after employer unlock (PART 4)
 *   internal_only     → RoNa-Legal verification eyes only
 */
export const DOCUMENT_VISIBILITIES = [
  "public_anonymized",
  "gated",
  "internal_only",
] as const;
export type DocumentVisibility = (typeof DOCUMENT_VISIBILITIES)[number];

/**
 * Document/photo categories handed off to the Upload Center (Spec 18). The wizard
 * COLLECTS these references; full per-document consent management lives there.
 */
export const DOCUMENT_CATEGORIES = [
  "profile_photo",
  "work_photo",
  "id_passport",
  "diploma",
  "skill_cert",
  "insurance_medical",
  "reference",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Worker register (StepAccountConsent funnel — Spec 17 → 19). The account itself
// is created via global auth; this validates the lightweight register form
// (name/email/phone/password) that precedes the in-wizard consent gate.
// ─────────────────────────────────────────────────────────────────────────────
export function createWorkerRegisterSchema(tr: ValidationTranslator) {
  return z.object({
    fullName: z
      .string()
      .trim()
      .min(2, tr("minLength", { min: 2 }))
      .max(200, tr("maxLength", { max: 200 })),
    email: z
      .string()
      .trim()
      .min(1, tr("required"))
      .email(tr("email"))
      .max(254, tr("maxLength", { max: 254 })),
    phone: z
      .string()
      .trim()
      .min(6, tr("minLength", { min: 6 }))
      .max(20, tr("maxLength", { max: 20 })),
    password: z
      .string()
      .min(8, tr("minLength", { min: 8 }))
      .max(200, tr("maxLength", { max: 200 })),
    locale: z
      .string()
      .trim()
      .min(2, tr("required"))
      .max(8, tr("maxLength", { max: 8 })),
  });
}

export type WorkerRegisterInput = z.infer<
  ReturnType<typeof createWorkerRegisterSchema>
>;

// ─────────────────────────────────────────────────────────────────────────────
// StepSkills — repeatable redacted work-history builder. Each row is the public
// "Hospitality employer, UAE, 3 yrs" timeline (PART 2 §4): employer SECTOR (not
// name), region/country, duration, role. Work history is optional (feeds
// readiness) → the array defaults to empty and the whole step is advanceable, but
// each ENTERED row must be complete.
// ─────────────────────────────────────────────────────────────────────────────
function workHistorySchema(tr: ValidationTranslator) {
  return z
    .array(
      z.object({
        employerType: z
          .string()
          .trim()
          .min(1, tr("required"))
          .max(120, tr("maxLength", { max: 120 })),
        region: z
          .string()
          .trim()
          .min(1, tr("required"))
          .max(120, tr("maxLength", { max: 120 })),
        years: z
          .number()
          .min(0, tr("minNumber", { min: 0 }))
          .max(60, tr("maxNumber", { max: 60 })),
        role: z
          .string()
          .trim()
          .min(1, tr("required"))
          .max(120, tr("maxLength", { max: 120 })),
      }),
    )
    .max(40, tr("maxItems", { max: 40 }))
    .default([]);
}

// ─────────────────────────────────────────────────────────────────────────────
// StepCertsEducation — repeatable certifications/education builder. ALL optional
// (the whole step's `step4Ok` is always true) → array defaults to empty; each
// entered row needs a title + issuer (year optional). The FACT of a cert is public
// (badge); the file itself is gated and uploaded in step 5 (PART 4).
// ─────────────────────────────────────────────────────────────────────────────
function certificationsSchema(tr: ValidationTranslator) {
  return z
    .array(
      z.object({
        title: z
          .string()
          .trim()
          .min(1, tr("required"))
          .max(160, tr("maxLength", { max: 160 })),
        issuer: z
          .string()
          .trim()
          .min(1, tr("required"))
          .max(160, tr("maxLength", { max: 160 })),
        year: z
          .number()
          .int(tr("minNumber", { min: 1900 }))
          .min(1900, tr("minNumber", { min: 1900 }))
          .max(2100, tr("maxNumber", { max: 2100 }))
          .optional(),
      }),
    )
    .max(40, tr("maxItems", { max: 40 }))
    .default([]);
}

// ─────────────────────────────────────────────────────────────────────────────
// StepPhotosDocs — uploaded-document references + per-item visibility intent. The
// wizard persists storage PATHS (not raw files / not URLs — lib/kariyer/storage.ts
// `uploadWorkerDocumentPath` returns a path); the route fans these into
// `addDocument()`. Optional (profile photo is a readiness hint, not a hard gate).
// ─────────────────────────────────────────────────────────────────────────────
function documentsSchema(tr: ValidationTranslator) {
  return z
    .array(
      z.object({
        category: z.enum(DOCUMENT_CATEGORIES, {
          errorMap: () => ({ message: tr("required") }),
        }),
        storagePath: z
          .string()
          .trim()
          .min(1, tr("required"))
          .max(500, tr("maxLength", { max: 500 })),
        visibility: z.enum(DOCUMENT_VISIBILITIES, {
          errorMap: () => ({ message: tr("required") }),
        }),
      }),
    )
    .max(50, tr("maxItems", { max: 50 }))
    .default([]);
}

// ─────────────────────────────────────────────────────────────────────────────
// createWorkerProfileSchema(t) — the full WorkerProfileWizard payload (Spec 19,
// steps 1–6). The server-derived worker user id is NOT here (R1). NO money field
// anywhere (R7).
//
// Public/private split (PART 4): `exactCountry` + `dob` are PRIVATE; only `region`
// + age-band (derived server-side from `dob`) are shown publicly. The wizard sends
// both halves; the RPC redacts and encrypts.
// ─────────────────────────────────────────────────────────────────────────────
export function createWorkerProfileSchema(tr: ValidationTranslator) {
  return z.object({
    // Step 1 — StepAccountConsent: explicit, revocable consent gate. Required true.
    consent: z.literal(true, {
      errorMap: () => ({ message: tr("required") }),
    }),

    // Step 2 — StepBasics. role/trade + experience are the `step2Ok` hard gates.
    role: z
      .string()
      .trim()
      .min(1, tr("required"))
      .max(120, tr("maxLength", { max: 120 })),
    trade: z
      .string()
      .trim()
      .min(1, tr("required"))
      .max(120, tr("maxLength", { max: 120 })),
    experience: z
      .string()
      .trim()
      .min(1, tr("required"))
      .max(60, tr("maxLength", { max: 60 })),
    // Private — only the derived region is shown publicly (PART 4).
    exactCountry: z
      .string()
      .trim()
      .max(120, tr("maxLength", { max: 120 }))
      .optional(),
    region: z
      .string()
      .trim()
      .max(120, tr("maxLength", { max: 120 }))
      .optional(),
    languages: z
      .array(
        z
          .string()
          .trim()
          .min(1, tr("required"))
          .max(8, tr("maxLength", { max: 8 })),
      )
      .max(20, tr("maxItems", { max: 20 }))
      .default([]),
    // Private DOB → only an age band is shown publicly (PART 4). ISO date string.
    dob: z
      .string()
      .trim()
      .max(40, tr("maxLength", { max: 40 }))
      .optional(),

    // Step 3 — StepSkills: ≥ 1 structured per-trade skill is the `step3Ok` gate.
    skills: z
      .array(
        z
          .string()
          .trim()
          .min(1, tr("required"))
          .max(120, tr("maxLength", { max: 120 })),
      )
      .min(1, tr("required"))
      .max(60, tr("maxItems", { max: 60 })),
    workHistory: workHistorySchema(tr),

    // Step 4 — StepCertsEducation (all optional).
    certifications: certificationsSchema(tr),

    // Step 5 — StepPhotosDocs (references + visibility intent; all optional).
    documents: documentsSchema(tr),

    // Step 6 — StepVideo: OPTIONAL intro (URL or uploaded storage path).
    videoUrl: z
      .string()
      .trim()
      .url(tr("invalidUrl"))
      .max(2000, tr("maxLength", { max: 2000 }))
      .optional()
      .or(z.literal("")),

    // Submission language — persisted so the route knows the entry locale.
    locale: z
      .string()
      .trim()
      .min(2, tr("required"))
      .max(8, tr("maxLength", { max: 8 })),
  });
}

export type WorkerProfileInput = z.infer<
  ReturnType<typeof createWorkerProfileSchema>
>;
export type WorkerWorkHistoryEntry = WorkerProfileInput["workHistory"][number];
export type WorkerCertificationEntry =
  WorkerProfileInput["certifications"][number];
export type WorkerDocumentEntry = WorkerProfileInput["documents"][number];
