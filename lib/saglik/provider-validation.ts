import { z } from "zod";

import { locales } from "@/i18n/routing";
import { getCityByKey, getCityByName, GLATKO_CITIES } from "@/lib/glatko/cities";

/**
 * Glatko Sağlık — H7a provider onboarding/editor validation (PURE; no I/O).
 *
 * Every provider mutation is server-action → zod-validated here → migration 077
 * owner-checked write-RPC. These schemas are the TS-side guard (the DB RPC is the
 * final authority); they also drive the client wizard's inline validation. No
 * network/DB access lives here, so the whole module is unit-testable (see
 * provider-validation.test.ts).
 *
 * Field shapes MIRROR lib/saglik/queries.ts (HealthProviderProfile/Service/Location)
 * so the editor round-trips with the read layer.
 */

export const PROVIDER_TYPES = ["doctor", "dentist", "psychologist", "physio", "other"] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const SERVICE_MODES = ["in_person", "video", "home_visit"] as const;
export type ServiceMode = (typeof SERVICE_MODES)[number];

/** Montenegro rough bounding box (lat/lng sanity, not GPS precision). */
const MNE_LAT_MIN = 41.7;
const MNE_LAT_MAX = 43.6;
const MNE_LNG_MIN = 18.4;
const MNE_LNG_MAX = 20.4;

export const SLOT_GRID_VALUES = [5, 10, 15, 20, 30, 60] as const;
export type SlotGridMin = (typeof SLOT_GRID_VALUES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * URL-safe, accent-stripped, lowercased slug stem. MIRRORS the SQL
 * public.health_slugify (the DB collision loop is the authority); kept here so
 * the wizard can preview the slug and the unit test pins the contract.
 */
const DIACRITIC_FROM = "çćčđšžğışàáâãäåèéêëìíîïòóôõöùúûüýñ";
const DIACRITIC_TO = "cccdszgisaaaaaaeeeeiiiiooooouuuuyn";

export function slugify(input: string): string {
  // Strip combining diacritical marks first (e.g. Turkish İ → "i̇" after
  // toLowerCase leaves a combining dot) so the char map below sees plain letters.
  const lowered = (input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  let folded = "";
  for (const ch of lowered) {
    const idx = DIACRITIC_FROM.indexOf(ch);
    folded += idx >= 0 ? DIACRITIC_TO[idx] : ch;
  }
  const slug = folded
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "provider";
}

/** Deterministic collision suffixing (the SQL loop mirrors this). */
export function slugWithSuffix(base: string, n: number): string {
  return n <= 0 ? base : `${base}-${n}`;
}

/** Lowercase + dedupe a languages[] (mirrors migration 057 + the upsert RPC). */
export function normalizeLanguages(input: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input ?? []) {
    const v = (raw ?? "").trim().toLowerCase();
    if (v.length > 0 && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/**
 * Resolve a city input (GLATKO_CITIES key OR official name) to its canonical
 * Latin name + seat coordinates. Returns null when the input matches no city —
 * the location schema then rejects it.
 */
export function resolveCity(
  input: string,
): { name: string; lat: number; lng: number } | null {
  const v = (input ?? "").trim();
  if (!v) return null;
  const byKey = getCityByKey(v);
  if (byKey) return { name: byKey.name, lat: byKey.lat, lng: byKey.lng };
  const byName = getCityByName(v);
  if (byName) return { name: byName.name, lat: byName.lat, lng: byName.lng };
  return null;
}

const CITY_KEYS_OR_NAMES = new Set<string>([
  ...GLATKO_CITIES.map((c) => c.key),
  ...GLATKO_CITIES.map((c) => c.name),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

/** Per-locale jsonb (bio/service name): only the 9 app locales as keys, strings. */
const localeKeys = new Set<string>(locales);
export const perLocaleTextSchema = z
  .record(z.string(), z.string())
  .refine((obj) => Object.keys(obj).every((k) => localeKeys.has(k)), {
    message: "bio keys must be app locales",
  });
export type PerLocaleText = z.infer<typeof perLocaleTextSchema>;

export const profileSchema = z.object({
  providerType: z.enum(PROVIDER_TYPES),
  fullName: z.string().trim().min(2, "fullName required").max(120),
  title: z.string().trim().max(120).optional().nullable(),
  bio: perLocaleTextSchema.default({}),
  photoUrl: z.string().trim().max(2048).optional().nullable(),
  languages: z.array(z.string()).default([]).transform(normalizeLanguages),
  specialtySlugs: z.array(z.string().trim().min(1)).default([]),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const licenseSchema = z.object({
  licenseNumber: z.string().trim().max(120).optional().nullable(),
  chamber: z.string().trim().max(160).optional().nullable(),
  /** Bucket object path "<uid>/<file>"; the route forces the uid prefix. */
  filePath: z.string().trim().max(1024).optional().nullable(),
});
export type LicenseInput = z.infer<typeof licenseSchema>;

export const locationSchema = z
  .object({
    locationId: z.string().uuid().optional().nullable(),
    label: z.string().trim().min(1, "label required").max(160),
    address: z.string().trim().min(1, "address required").max(320),
    /** GLATKO_CITIES key or official name. */
    city: z.string().trim().min(1).refine((c) => CITY_KEYS_OR_NAMES.has(c), {
      message: "city must be a Montenegro municipality",
    }),
    lat: z
      .number()
      .refine((v) => v >= MNE_LAT_MIN && v <= MNE_LAT_MAX, "lat out of bounds")
      .optional()
      .nullable(),
    lng: z
      .number()
      .refine((v) => v >= MNE_LNG_MIN && v <= MNE_LNG_MAX, "lng out of bounds")
      .optional()
      .nullable(),
  })
  // When lat/lng omitted, derive from the city seat (so geo always populated).
  .transform((loc) => {
    if (loc.lat != null && loc.lng != null) return loc;
    const resolved = resolveCity(loc.city);
    return {
      ...loc,
      city: resolved?.name ?? loc.city,
      lat: loc.lat ?? resolved?.lat ?? null,
      lng: loc.lng ?? resolved?.lng ?? null,
    };
  });
export type LocationInput = z.infer<typeof locationSchema>;

export const serviceSchema = z.object({
  serviceId: z.string().uuid().optional().nullable(),
  name: perLocaleTextSchema.refine((o) => Object.keys(o).length > 0, "name required"),
  durationMin: z.number().int().min(5, "min 5").max(240, "max 240"),
  priceEur: z.number().min(0, "price must be non-negative").optional().nullable(),
  mode: z.enum(SERVICE_MODES),
  isActive: z.boolean().default(true),
});
export type ServiceInput = z.infer<typeof serviceSchema>;

export const scheduleRowSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM"),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM"),
  })
  .refine((r) => r.startTime < r.endTime, { message: "start must be before end" });
export type ScheduleRowInput = z.infer<typeof scheduleRowSchema>;

/**
 * One location's weekly rows. Rejects two rows on the same weekday whose
 * intervals overlap (adjacent end==next start is OK). The DB has NO
 * (provider,location,weekday) unique constraint, so this is the only guard
 * before the set_schedules RPC (which re-checks server-side).
 */
export const scheduleSetSchema = z
  .object({
    locationId: z.string().uuid(),
    rows: z.array(scheduleRowSchema).default([]),
  })
  .refine((s) => !hasWeekdayOverlap(s.rows), { message: "overlapping schedule rows" });
export type ScheduleSetInput = z.infer<typeof scheduleSetSchema>;

/** Pure overlap check (exported for the wizard + the unit test). */
export function hasWeekdayOverlap(rows: readonly ScheduleRowInput[]): boolean {
  const byDay = new Map<number, ScheduleRowInput[]>();
  for (const r of rows) {
    const arr = byDay.get(r.weekday);
    if (arr) arr.push(r);
    else byDay.set(r.weekday, [r]);
  }
  for (const arr of Array.from(byDay.values())) {
    const sorted = [...arr].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      // overlap iff current start < previous end (adjacent is allowed).
      if (sorted[i].startTime < sorted[i - 1].endTime) return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// H7b — schedule override + manual booking schemas (provider day-ops).
// ─────────────────────────────────────────────────────────────────────────────

export const OVERRIDE_KINDS = ["holiday", "break", "extra"] as const;
export type OverrideKind = (typeof OVERRIDE_KINDS)[number];

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One schedule_override (holiday/break/extra) for a local calendar date. holiday
 * needs NO times (the whole day is off); break/extra REQUIRE start<end (the window
 * to carve out / add). Mirrors the 078 health_provider_upsert_override RPC, which is
 * the final authority. `id` present = update an existing row, absent = insert.
 */
export const overrideSchema = z
  .object({
    id: z.string().uuid().optional().nullable(),
    date: z.string().regex(DATE_RE, "YYYY-MM-DD"),
    kind: z.enum(OVERRIDE_KINDS),
    startTime: z.string().regex(HHMM_RE, "HH:MM").optional().nullable(),
    endTime: z.string().regex(HHMM_RE, "HH:MM").optional().nullable(),
  })
  .refine(
    (o) =>
      o.kind === "holiday" ||
      (!!o.startTime && !!o.endTime && o.startTime < o.endTime),
    { message: "break/extra require start < end" },
  );
export type OverrideInput = z.infer<typeof overrideSchema>;

/**
 * Provider-vouched manual booking (phone-in patient; NO OTP — the provider is the
 * trusted actor). The phone is validated/normalized server-side via lib/saglik/phone
 * (normalizePhone) before the RPC; here we only sanity-check it's a non-empty string,
 * length-cap the note, and require name + service/location/slot. Mirrors the 078
 * health_provider_manual_book RPC, which re-checks ownership + the slot atomically.
 */
export const manualBookSchema = z
  .object({
    serviceId: z.string().uuid(),
    locationId: z.string().uuid(),
    /** ISO UTC instants (from the slot picker). */
    slotStart: z.string().datetime({ offset: true }),
    slotEnd: z.string().datetime({ offset: true }),
    patientName: z.string().trim().min(2, "name required").max(120),
    /** Raw user input; normalized to E.164 in the action (normalizePhone). */
    phone: z.string().trim().min(4, "phone required").max(32),
    email: z.string().trim().email("invalid email").max(320).optional().nullable(),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .refine((m) => Date.parse(m.slotStart) < Date.parse(m.slotEnd), {
    message: "slotStart must be before slotEnd",
  });
export type ManualBookInput = z.infer<typeof manualBookSchema>;

export const settingsSchema = z.object({
  bufferMin: z.number().int().min(0).max(240),
  minNoticeMin: z.number().int().min(0).max(20160), // <= 2 weeks
  horizonDays: z.number().int().min(1).max(180),
  dailyCap: z.number().int().min(1).max(200).optional().nullable(),
  slotGridMin: z.union([
    z.literal(5),
    z.literal(10),
    z.literal(15),
    z.literal(20),
    z.literal(30),
    z.literal(60),
  ]),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// License upload path/ext helper (pure) — mirrors the route's logic so it's
// unit-testable independently of the request handler.
// ─────────────────────────────────────────────────────────────────────────────

export const LICENSE_ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png"]);

export type LicensePathResult =
  | { ok: true; path: string }
  | { ok: false; reason: "bad_ext" | "empty" };

/**
 * Build the storage object path for a license upload, FORCING the `${userId}/`
 * folder prefix (so the bucket owner-RLS permits the write) + sanitizing the
 * stem (no traversal, no weird chars) + validating the extension allowlist.
 */
export function buildLicensePath(userId: string, filename: string): LicensePathResult {
  const name = (filename ?? "").trim();
  if (!name) return { ok: false, reason: "empty" };
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (!LICENSE_ALLOWED_EXTENSIONS.has(ext)) return { ok: false, reason: "bad_ext" };
  const dot = name.lastIndexOf(".");
  const rawStem = dot > 0 ? name.slice(0, dot) : name;
  const stem =
    rawStem
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/\.\.+/g, "_")
      .slice(0, 80) || "license";
  return { ok: true, path: `${userId}/${stem}.${ext}` };
}
