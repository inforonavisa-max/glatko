import { z } from "zod";

/**
 * G-ADMIN-PROVIDER-CREATE-01 — Zod schema for the admin provider-create form.
 *
 * One discriminated union covers both flows:
 *   - mode="promote" — admin selects an existing user from the user list and
 *     fills out the pro profile fields. UID is supplied; email/password are not.
 *   - mode="create"  — admin creates a brand-new account first (email +
 *     admin-chosen password), then the same pro profile fields.
 *
 * The schema is shared between client validation (component-level) and the
 * server action (final gate). The server action also calls the
 * `glatko_admin_create_provider` RPC, which has its own pre-flight guards
 * for things only the database can authoritatively check (slug uniqueness,
 * founding number race, FK validity).
 */

const PHONE_E164 = /^\+?[1-9]\d{6,14}$/;
const SLUG_RE = /^[a-z0-9-]+$/;
const CITY_SLUG_RE = /^[a-z][a-z0-9-]*$/;

export const SUPPORTED_LOCALES = [
  "tr",
  "en",
  "me",
  "sr",
  "de",
  "it",
  "ru",
  "uk",
  "ar",
] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const sharedFieldsShape = {
  // ── Profile-side ────────────────────────────────────────────────
  full_name: z.string().min(2).max(120),
  phone: z
    .string()
    .regex(
      PHONE_E164,
      "International format e.g. +382 69 868 069",
    ),
  city_display: z.string().min(2).max(80),
  preferred_locale: z.enum(SUPPORTED_LOCALES).default("me"),

  // ── Pro profile-side ────────────────────────────────────────────
  business_name: z.string().min(2).max(120),
  slug: z.string().regex(SLUG_RE, "lowercase, hyphens, digits only").min(2).max(80),
  location_city: z
    .string()
    .regex(CITY_SLUG_RE, "lowercase kebab-case, e.g. herceg-novi")
    .min(2)
    .max(80),
  bio: z.string().max(2000).optional().or(z.literal("")),
  hourly_rate_min: z.coerce.number().min(0).max(10000).optional(),
  hourly_rate_max: z.coerce.number().min(0).max(10000).optional(),
  years_experience: z.coerce.number().int().min(0).max(60).optional(),
  service_radius_km: z.coerce.number().int().min(5).max(500).default(25),
  languages: z.array(z.enum(SUPPORTED_LOCALES)).min(1, "Pick at least one language"),

  is_verified: z.coerce.boolean().default(true),
  verification_status: z
    .enum(["pending", "approved", "rejected"])
    .default("approved"),
  verification_tier: z
    .enum(["basic", "business", "professional"])
    .default("basic"),
  is_active: z.coerce.boolean().default(true),
  is_founding_provider: z.coerce.boolean().default(false),

  services: z
    .array(
      z.object({
        category_id: z.string().uuid(),
        is_primary: z.coerce.boolean(),
      }),
    )
    .min(1, "Pick at least one service category")
    .refine(
      (arr) => arr.filter((s) => s.is_primary).length === 1,
      "Exactly one service must be marked as primary",
    ),

  avatar_url: z.string().url().optional().or(z.literal("")),
  portfolio_images: z.array(z.string().url()).max(10).default([]),
};

const promoteSchema = z.object({
  mode: z.literal("promote"),
  promote_user_id: z.string().uuid(),
  ...sharedFieldsShape,
});

const createSchema = z.object({
  mode: z.literal("create"),
  new_email: z.string().email(),
  new_password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(128),
  ...sharedFieldsShape,
});

export const adminProviderCreateSchema = z
  .discriminatedUnion("mode", [promoteSchema, createSchema])
  .refine(
    (v) =>
      v.hourly_rate_min == null ||
      v.hourly_rate_max == null ||
      v.hourly_rate_max >= v.hourly_rate_min,
    {
      message: "hourly_rate_max must be ≥ hourly_rate_min",
      path: ["hourly_rate_max"],
    },
  );

export type AdminProviderCreateInput = z.infer<typeof adminProviderCreateSchema>;

/**
 * Sprint B2 — admin provider EDIT schema.
 *
 * Standalone (NOT part of adminProviderCreateSchema's union) so the create
 * action keeps parsing exactly promote|create. Every field is optional:
 * the payload is sparse and `glatko_admin_update_provider` (migration 051)
 * merges by jsonb key-existence — an absent key leaves the column unchanged,
 * an explicit `null` clears it.
 *
 * Editable set mirrors the RPC whitelist. Intentionally absent (immutable or
 * own-flow): slug, is_verified, verification_status, is_founding_provider,
 * email, password.
 */
const editableFieldsShape = {
  // profiles-side
  full_name: z.string().min(2).max(120).optional(),
  phone: z.string().regex(PHONE_E164, "International format e.g. +382 69 868 069").optional(),
  city_display: z.string().min(2).max(80).optional(),
  preferred_locale: z.enum(SUPPORTED_LOCALES).optional(),
  avatar_url: z.string().url().nullable().optional().or(z.literal("")),

  // pro profile-side (existing)
  business_name: z.string().min(2).max(120).optional(),
  bio: z.string().max(2000).nullable().optional().or(z.literal("")),
  location_city: z
    .string()
    .regex(CITY_SLUG_RE, "lowercase kebab-case, e.g. herceg-novi")
    .min(2)
    .max(80)
    .optional(),
  hourly_rate_min: z.coerce.number().min(0).max(10000).nullable().optional(),
  hourly_rate_max: z.coerce.number().min(0).max(10000).nullable().optional(),
  years_experience: z.coerce.number().int().min(0).max(60).nullable().optional(),
  service_radius_km: z.coerce.number().int().min(5).max(500).optional(),
  languages: z.array(z.enum(SUPPORTED_LOCALES)).min(1, "Pick at least one language").optional(),
  verification_tier: z.enum(["basic", "business", "professional"]).optional(),
  is_active: z.boolean().optional(),
  portfolio_images: z.array(z.string().url()).max(10).optional(),
  services: z
    .array(
      z.object({
        category_id: z.string().uuid(),
        is_primary: z.coerce.boolean(),
      }),
    )
    .min(1, "Pick at least one service category")
    .refine(
      (arr) => arr.filter((s) => s.is_primary).length === 1,
      "Exactly one service must be marked as primary",
    )
    .optional(),

  // pro profile-side (NEW — Sprint B1 columns)
  admin_notes: z.string().max(2000).nullable().optional(),
  subscription_plan: z
    .enum(["trial", "monthly", "quarterly", "annual", "lifetime"])
    .nullable()
    .optional(),
  subscription_started_at: z.string().datetime().nullable().optional(),
  subscription_end_date: z.string().datetime().nullable().optional(),
} as const;

export const adminProviderEditSchema = z
  .object({
    mode: z.literal("edit"),
    provider_id: z.string().uuid(),
    ...editableFieldsShape,
  })
  .refine(
    (v) =>
      v.hourly_rate_min == null ||
      v.hourly_rate_max == null ||
      v.hourly_rate_max >= v.hourly_rate_min,
    {
      message: "hourly_rate_max must be ≥ hourly_rate_min",
      path: ["hourly_rate_max"],
    },
  );

export type AdminProviderEditPayload = z.infer<typeof adminProviderEditSchema>;

/**
 * Slug helper: business name → kebab-case slug. Mirrors the rule documented
 * in docs/operations/founding-majstor-onboarding.md. ASCII-folds Turkish
 * and Slavic diacritics, replaces non-[a-z0-9] with hyphens, collapses
 * runs, trims leading/trailing hyphens.
 */
export function businessNameToSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/đ/g, "d")
    .replace(/ž/g, "z")
    .replace(/š/g, "s")
    .replace(/č/g, "c")
    .replace(/ć/g, "c")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
