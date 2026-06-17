import "server-only";

import { createAdminClient } from "@/supabase/server";
import type { Locale } from "@/i18n/routing";
import type {
  ProviderType,
  ServiceMode,
  SlotGridMin,
} from "@/lib/saglik/provider-validation";

/**
 * Glatko Sağlık — H7a provider write/read data-access (server-only).
 *
 * Symmetric with lib/saglik/queries.ts (public reads) and lib/saglik/booking.ts
 * (booking writes): the health schema is NOT exposed to PostgREST, so every
 * provider read/write goes through the public SECURITY DEFINER owner-checked RPCs
 * from migration 077, called with the service-role client.
 *
 * OWNERSHIP (the #1 correctness guard — enforced HERE): every wrapper takes a
 * server-VERIFIED userId (the cookie-authenticated user.id resolved by the calling
 * Server Component / action — NEVER the client) and forwards it as p_user_id. The
 * RPC re-checks `providers.user_id = p_user_id` inside the definer, so a caller can
 * only ever touch their own rows. health.owns_provider() is deliberately NOT used
 * here — it reads auth.uid() which is NULL under service_role.
 *
 * CONTRACT — NEVER spread the client payload into the RPC args. Each wrapper builds
 * the arg object field-by-field (p_user_id: userId, p_full_name: input.fullName, …)
 * so no client-supplied key (user_id/provider_id/etc.) can ever reach the RPC. Do
 * NOT "simplify" a wrapper to `...input`: that would let a forged identity key slip
 * through. This field-by-field construction IS the ownership-injection guarantee.
 *
 * RPC-raised business errors surface as PostgREST errors whose message IS the raised
 * code (e.g. "NOT_OWNER"); parseProviderError maps them to a stable union.
 */

export type ProviderRpcError =
  | "NOT_A_PROVIDER"
  | "NOT_OWNER"
  | "INVALID_INPUT"
  | "INVALID_FILE_PATH"
  | "SCHEDULE_OVERLAP"
  | "LOCATION_IN_USE"
  | "SERVICE_IN_USE"
  | "ERROR";

const PROVIDER_RPC_ERRORS: ProviderRpcError[] = [
  "NOT_A_PROVIDER",
  "NOT_OWNER",
  "INVALID_FILE_PATH",
  "INVALID_INPUT",
  "SCHEDULE_OVERLAP",
  "LOCATION_IN_USE",
  "SERVICE_IN_USE",
];

function parseProviderError(message: string): ProviderRpcError {
  const hit = PROVIDER_RPC_ERRORS.find((c) => message.includes(c));
  return hit ?? "ERROR";
}

// ─────────────────────────────────────────────────────────────────────────────
// Own-draft shape (mirrors migration 077 health_provider_get_own jsonb).
// ─────────────────────────────────────────────────────────────────────────────

export type OwnProviderLocation = {
  id: string;
  label: string;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
};

export type OwnProviderService = {
  id: string;
  /** per-locale jsonb name (all locales, for editing). */
  name: Record<string, string>;
  durationMin: number;
  priceEur: number | null;
  mode: ServiceMode;
  isActive: boolean;
};

export type OwnProviderScheduleRow = {
  id: string;
  locationId: string;
  weekday: number;
  startTime: string; // "HH:MM"
  endTime: string;
};

export type OwnProviderSettings = {
  bufferMin: number;
  minNoticeMin: number;
  horizonDays: number;
  dailyCap: number | null;
  slotGridMin: number;
};

export type OwnProvider = {
  providerId: string;
  slug: string;
  providerType: ProviderType;
  fullName: string;
  title: string | null;
  /** per-locale jsonb bio (all locales, for editing). */
  bio: Record<string, string>;
  photoUrl: string | null;
  languages: string[];
  licenseNumber: string | null;
  chamber: string | null;
  /** whether a license file exists; the private path is never surfaced here. */
  licenseFileSet: boolean;
  verificationStatus: "pending" | "approved" | "rejected";
  isPublished: boolean;
  specialties: Array<{ slug: string; name: string }>;
  locations: OwnProviderLocation[];
  services: OwnProviderService[];
  schedules: OwnProviderScheduleRow[];
  settings: OwnProviderSettings | null;
};

/**
 * The caller's own provider draft (any status/publish), or null when they have no
 * provider row yet (first-time onboarding). A genuine RPC failure throws.
 */
export async function getOwnProvider(
  userId: string,
  locale: Locale,
): Promise<OwnProvider | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_provider_get_own", {
    p_user_id: userId,
    p_locale: locale,
  });
  if (error) {
    throw new Error(`health_provider_get_own failed: ${error.message}`);
  }
  return (data as OwnProvider | null) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes — each returns a discriminated result (never throws on a business error).
// ─────────────────────────────────────────────────────────────────────────────

export type WriteOk<T> = { ok: true } & T;
export type WriteResult<T> = WriteOk<T> | { ok: false; code: ProviderRpcError };

export async function upsertProfile(
  userId: string,
  input: {
    providerType: ProviderType;
    fullName: string;
    title: string | null;
    bio: Record<string, string>;
    photoUrl: string | null;
    languages: string[];
    specialtySlugs: string[];
  },
): Promise<WriteResult<{ providerId: string; slug: string }>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_provider_upsert_profile", {
    p_user_id: userId,
    p_provider_type: input.providerType,
    p_full_name: input.fullName,
    p_title: input.title,
    p_bio: input.bio,
    p_photo_url: input.photoUrl,
    p_languages: input.languages,
    p_specialty_slugs: input.specialtySlugs,
  });
  if (error) return { ok: false, code: parseProviderError(error.message) };
  const d = data as { providerId: string; slug: string };
  return { ok: true, providerId: d.providerId, slug: d.slug };
}

export async function setLicense(
  userId: string,
  input: { licenseNumber: string | null; chamber: string | null; filePath: string | null },
): Promise<WriteResult<Record<never, never>>> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("health_provider_set_license", {
    p_user_id: userId,
    p_license_number: input.licenseNumber,
    p_chamber: input.chamber,
    p_file_path: input.filePath,
  });
  if (error) return { ok: false, code: parseProviderError(error.message) };
  return { ok: true };
}

export async function upsertLocation(
  userId: string,
  input: {
    locationId: string | null;
    label: string;
    address: string;
    city: string;
    lat: number | null;
    lng: number | null;
  },
): Promise<WriteResult<{ locationId: string }>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_provider_upsert_location", {
    p_user_id: userId,
    p_location_id: input.locationId,
    p_label: input.label,
    p_address: input.address,
    p_city: input.city,
    p_lat: input.lat,
    p_lng: input.lng,
  });
  if (error) return { ok: false, code: parseProviderError(error.message) };
  const d = data as { locationId: string };
  return { ok: true, locationId: d.locationId };
}

export async function deleteLocation(
  userId: string,
  locationId: string,
): Promise<WriteResult<Record<never, never>>> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("health_provider_delete_location", {
    p_user_id: userId,
    p_location_id: locationId,
  });
  if (error) return { ok: false, code: parseProviderError(error.message) };
  return { ok: true };
}

export async function upsertService(
  userId: string,
  input: {
    serviceId: string | null;
    name: Record<string, string>;
    durationMin: number;
    priceEur: number | null;
    mode: ServiceMode;
    isActive: boolean;
  },
): Promise<WriteResult<{ serviceId: string }>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_provider_upsert_service", {
    p_user_id: userId,
    p_service_id: input.serviceId,
    p_name: input.name,
    p_duration_min: input.durationMin,
    p_price_eur: input.priceEur,
    p_mode: input.mode,
    p_is_active: input.isActive,
  });
  if (error) return { ok: false, code: parseProviderError(error.message) };
  const d = data as { serviceId: string };
  return { ok: true, serviceId: d.serviceId };
}

export async function deleteService(
  userId: string,
  serviceId: string,
): Promise<WriteResult<Record<never, never>>> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("health_provider_delete_service", {
    p_user_id: userId,
    p_service_id: serviceId,
  });
  if (error) return { ok: false, code: parseProviderError(error.message) };
  return { ok: true };
}

export async function setSchedules(
  userId: string,
  input: {
    locationId: string;
    rows: Array<{ weekday: number; startTime: string; endTime: string }>;
  },
): Promise<WriteResult<{ count: number }>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_provider_set_schedules", {
    p_user_id: userId,
    p_location_id: input.locationId,
    p_rows: input.rows.map((r) => ({
      weekday: r.weekday,
      start_time: r.startTime,
      end_time: r.endTime,
    })),
  });
  if (error) return { ok: false, code: parseProviderError(error.message) };
  const d = data as { count: number };
  return { ok: true, count: d.count };
}

export async function upsertSettings(
  userId: string,
  input: {
    bufferMin: number;
    minNoticeMin: number;
    horizonDays: number;
    dailyCap: number | null;
    slotGridMin: SlotGridMin;
  },
): Promise<WriteResult<Record<never, never>>> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("health_provider_upsert_settings", {
    p_user_id: userId,
    p_buffer_min: input.bufferMin,
    p_min_notice_min: input.minNoticeMin,
    p_horizon_days: input.horizonDays,
    p_daily_cap: input.dailyCap,
    p_slot_grid_min: input.slotGridMin,
  });
  if (error) return { ok: false, code: parseProviderError(error.message) };
  return { ok: true };
}

export type SubmitResult =
  | { ok: true; providerId: string; slug: string }
  | { ok: false; missing: string[] }
  | { ok: false; code: ProviderRpcError };

export async function submitForReview(userId: string): Promise<SubmitResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_provider_submit_for_review", {
    p_user_id: userId,
  });
  if (error) return { ok: false, code: parseProviderError(error.message) };
  const d = data as { ok: boolean; missing: string[]; providerId?: string; slug?: string };
  if (!d.ok) return { ok: false, missing: d.missing ?? [] };
  return { ok: true, providerId: d.providerId ?? "", slug: d.slug ?? "" };
}
