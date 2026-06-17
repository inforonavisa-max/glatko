import { z } from "zod";
import type { ValidationTranslator } from "@/lib/validations/i18n-zod";

/**
 * Glatko Kariyer — RequisitionWizard payload schema (Spec 14).
 *
 * Mirrors the established `createXSchema(tr)` factory idiom (see
 * lib/validations/service-request.ts / pro-bid.ts): a translator-bound Zod object
 * whose messages resolve through the shared `validation.*` dictionary keys, so the
 * same schema drives client-side inline validation and (optionally) the route's
 * defense-in-depth re-check.
 *
 * The parsed shape maps 1:1 onto `createRequisition()` in lib/kariyer/booking.ts:
 *   sector        → p_sector
 *   roles (map)   → p_roles_jsonb     (role/trade → headcount, ≥ 1 entry)
 *   requirements  → p_requirements    (ALL optional — an open requisition is valid)
 *   terms         → p_terms_jsonb     (wage range REQUIRED; MNE mediation disclosure)
 *   servicePath   → p_service_path    ('commission' | 'full_service')
 * The employer id is NEVER in this payload — it is derived server-side from the
 * cookie session (R1) and passed to the RPC as p_employer_user_id.
 *
 * R7 (ILO Employer Pays): the only money-adjacent field is the employer's
 * `servicePath` choice. There is NO worker-side fee/price/payment field here.
 */

/** Service path = the employer's curation/brokerage choice (R7: employer-side only). */
export const SERVICE_PATHS = ["commission", "full_service"] as const;
export type ServicePath = (typeof SERVICE_PATHS)[number];

/**
 * A single role/trade line with its requested headcount. Headcount is a positive
 * integer (sanitized client-side; re-checked here). ≥ 1 complete row is required to
 * submit — enforced via `.min(1)` on the roles array below.
 */
function rolesSchema(tr: ValidationTranslator) {
  return z
    .array(
      z.object({
        role: z.string().trim().min(1, tr("required")).max(120, tr("maxLength", { max: 120 })),
        headcount: z
          .number()
          .int(tr("minNumber", { min: 1 }))
          .min(1, tr("minNumber", { min: 1 }))
          .max(9999, tr("maxNumber", { max: 9999 })),
      }),
    )
    .min(1, tr("required"))
    .max(50, tr("maxItems", { max: 50 }));
}

/**
 * Requirements — owner-side curation hints. EVERY field is optional: an employer is
 * allowed to leave the requisition open (Spec 14 StepRequirements `canAdvance` is
 * always true), so this whole object is optional and each member is optional.
 */
function requirementsSchema(tr: ValidationTranslator) {
  return z
    .object({
      experienceBand: z
        .string()
        .max(60, tr("maxLength", { max: 60 }))
        .optional(),
      certifications: z
        .array(z.string().trim().min(1, tr("required")).max(120, tr("maxLength", { max: 120 })))
        .max(30, tr("maxItems", { max: 30 }))
        .default([]),
      languages: z
        .array(z.string().trim().min(1, tr("required")).max(8, tr("maxLength", { max: 8 })))
        .max(20, tr("maxItems", { max: 20 }))
        .default([]),
      minSkillTier: z
        .string()
        .max(60, tr("maxLength", { max: 60 }))
        .optional(),
    })
    .default({ certifications: [], languages: [] });
}

/**
 * Terms shown to candidates before placement (MNE Law on Employment Mediation,
 * Arts. 30–34). Wage range is REQUIRED and load-bearing — the worker-facing offer
 * MUST state pay. `wageMin ≤ wageMax` is enforced via `.superRefine` so the message
 * attaches to the `wageMax` path for inline display. Currency defaults to EUR.
 */
function termsSchema(tr: ValidationTranslator) {
  return z
    .object({
      wageMin: z
        .number()
        .positive(tr("minNumber", { min: 1 }))
        .max(1_000_000, tr("maxNumber", { max: 1_000_000 })),
      wageMax: z
        .number()
        .positive(tr("minNumber", { min: 1 }))
        .max(1_000_000, tr("maxNumber", { max: 1_000_000 })),
      currency: z.string().trim().min(1, tr("required")).max(8, tr("maxLength", { max: 8 })).default("EUR"),
      hours: z
        .string()
        .max(200, tr("maxLength", { max: 200 }))
        .optional(),
      accommodationProvided: z.boolean().default(false),
      accommodationNote: z
        .string()
        .max(500, tr("maxLength", { max: 500 }))
        .optional(),
      contractDuration: z
        .string()
        .max(120, tr("maxLength", { max: 120 }))
        .optional(),
      startDate: z.string().trim().min(1, tr("required")).max(40, tr("maxLength", { max: 40 })),
    })
    .superRefine((val, ctx) => {
      if (val.wageMin > val.wageMax) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["wageMax"],
          message: tr("minNumber", { min: val.wageMin }),
        });
      }
    });
}

/**
 * Full requisition payload (POST /api/career/requisitions body, minus the
 * server-derived employer id). `locale` rides along so the route can persist the
 * submission language; `note` is the optional free-text message to RoNa (StepReview).
 */
export function createRequisitionSchema(tr: ValidationTranslator) {
  return z.object({
    sector: z.string().trim().min(1, tr("required")).max(80, tr("maxLength", { max: 80 })),
    roles: rolesSchema(tr),
    requirements: requirementsSchema(tr),
    terms: termsSchema(tr),
    servicePath: z.enum(SERVICE_PATHS, {
      errorMap: () => ({ message: tr("required") }),
    }),
    note: z
      .string()
      .max(2000, tr("maxLength", { max: 2000 }))
      .optional(),
    locale: z.string().trim().min(2, tr("required")).max(8, tr("maxLength", { max: 8 })),
  });
}

export type RequisitionInput = z.infer<ReturnType<typeof createRequisitionSchema>>;
