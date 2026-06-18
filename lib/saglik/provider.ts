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
  // H7b — provider day-ops (status / manual-book / override) codes.
  | "NOT_FOUND"
  | "APPOINTMENT_NOT_OWNED"
  | "INVALID_STATUS"
  | "SLOT_TAKEN"
  | "SLOT_INVALID"
  | "SLOT_PAST"
  | "SERVICE_INVALID"
  | "LOCATION_INVALID"
  | "OVERRIDE_INVALID"
  | "PATIENT_INPUT_INVALID"
  | "ERROR";

const PROVIDER_RPC_ERRORS: ProviderRpcError[] = [
  // Order matters: parseProviderError uses .includes(), so longer/more-specific codes
  // come BEFORE their substrings (APPOINTMENT_NOT_OWNED before NOT_OWNER, SLOT_INVALID
  // before the looser ones) to avoid a shorter code shadowing a longer raised message.
  "APPOINTMENT_NOT_OWNED",
  "NOT_A_PROVIDER",
  "NOT_OWNER",
  "NOT_FOUND",
  "INVALID_FILE_PATH",
  "INVALID_STATUS",
  "INVALID_INPUT",
  "SCHEDULE_OVERLAP",
  "LOCATION_IN_USE",
  "LOCATION_INVALID",
  "SERVICE_IN_USE",
  "SERVICE_INVALID",
  "SLOT_TAKEN",
  "SLOT_INVALID",
  "SLOT_PAST",
  "OVERRIDE_INVALID",
  "PATIENT_INPUT_INVALID",
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

// ═════════════════════════════════════════════════════════════════════════════
// H7b — provider day-ops data-access (migration 078). Same contract as H7a:
// createAdminClient().rpc(name, {p_user_id: userId, ...}) built FIELD-BY-FIELD
// (never ...input); the owner-checked RPC re-verifies providers.user_id=p_user_id
// (v_pid) + child ownership. PII NEVER leaves the definer un-masked: the list/
// dashboard RPCs return patientPhoneMasked (last-3) only; email is never returned.
// ═════════════════════════════════════════════════════════════════════════════

export type AppointmentScope = "upcoming" | "past" | "all";

/** One row of the provider appointment list (PII-safe: masked phone, no email). */
export type ProviderAppointment = {
  appointmentId: string;
  manageToken: string;
  status: "confirmed" | "cancelled" | "completed" | "no_show";
  slotStart: string;
  slotEnd: string;
  source: "web" | "admin" | "provider";
  serviceName: string;
  serviceDurationMin: number;
  locationLabel: string;
  locationCity: string;
  patientNote: string | null;
  patientName: string;
  /** Already masked in-RPC ('•••' + last 3 digits). Never the full number. */
  patientPhoneMasked: string;
};

/**
 * The caller's OWN appointments (v_pid filter), masked patient phone only. scope filters
 * upcoming/past/all; status optionally narrows (confirmed/completed/cancelled/no_show).
 * A genuine RPC failure throws. (The list itself is read-only; mutations go through the
 * action wrappers below.)
 */
export async function listProviderAppointments(
  userId: string,
  locale: Locale,
  scope: AppointmentScope,
  status: ProviderAppointment["status"] | null,
): Promise<ProviderAppointment[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_provider_list_appointments", {
    p_user_id: userId,
    p_locale: locale,
    p_scope: scope,
    p_status: status,
  });
  if (error) {
    // No provider row yet → empty list (not a crash). Same NOT_A_PROVIDER contract as
    // getProviderDashboard: this wrapper is awaited in the randevular Promise.all, so a
    // throw here would reject it before the page's no-provider guard. Real failures throw.
    if (parseProviderError(error.message) === "NOT_A_PROVIDER") return [];
    throw new Error(`health_provider_list_appointments failed: ${error.message}`);
  }
  return (data as ProviderAppointment[] | null) ?? [];
}

/** The availability inputs bundle (069 shape) the dashboard runs the pure engine over. */
export type DashboardAvailabilityInputs = {
  serviceDurationMin: number;
  settings: {
    bufferMin: number;
    minNoticeMin: number;
    horizonDays: number;
    dailyCap: number | null;
    slotGridMin: number;
  };
  schedules: Array<{
    weekday: number;
    startTime: string;
    endTime: string;
    validFrom: string | null;
    validUntil: string | null;
  }>;
  overrides: Array<{
    date: string;
    startTime: string | null;
    endTime: string | null;
    kind: "holiday" | "break" | "extra";
  }>;
  busy: Array<{ start: string; end: string }>;
  holds: Array<{ start: string; end: string }>;
};

export type ProviderDashboard = {
  appointments: ProviderAppointment[];
  availabilityInputs: DashboardAvailabilityInputs;
};

/**
 * Single-call dashboard: confirmed appointments in [from,to] (masked phone) + the
 * availability-inputs bundle (settings + ALL own-location schedules + overrides + busy +
 * holds) shaped exactly like 069, so the page runs the pure generateAvailability() twice
 * (real-busy vs empty-busy) for occupancy without any N+1. Returns null when the caller
 * has no provider row yet (the RPC RAISEs NOT_A_PROVIDER) — the dashboard pages treat a
 * null result as the onboarding-nudge state. A genuine RPC failure still throws.
 */
export async function getProviderDashboard(
  userId: string,
  fromIso: string,
  toIso: string,
  locale: Locale,
): Promise<ProviderDashboard | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_provider_dashboard", {
    p_user_id: userId,
    p_from: fromIso,
    p_to: toIso,
    p_locale: locale,
  });
  if (error) {
    // No provider row yet → the RPC RAISEs NOT_A_PROVIDER (SQLSTATE P0001). Map ONLY
    // that sentinel to null so the page's graceful `if (!dashboard)` branch can render
    // the onboarding nudge — otherwise this throw rejects the page's Promise.all and
    // trips the global error boundary before the guard runs. Real failures still throw.
    if (parseProviderError(error.message) === "NOT_A_PROVIDER") return null;
    throw new Error(`health_provider_dashboard failed: ${error.message}`);
  }
  return (data as ProviderDashboard | null) ?? null;
}

/**
 * Status change (completed/no_show/cancelled), owner-checked. Returns the new status +
 * manage_token (the cancel path needs the token to enqueue the H6 patient 'cancelled'
 * notice). The RPC validates the confirmed→target transition + is idempotent.
 */
export async function setAppointmentStatus(
  userId: string,
  appointmentId: string,
  status: "completed" | "no_show" | "cancelled",
  reason: string | null,
): Promise<WriteResult<{ status: string; manageToken: string }>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_provider_set_appointment_status", {
    p_user_id: userId,
    p_appointment_id: appointmentId,
    p_status: status,
    p_reason: reason,
  });
  if (error) return { ok: false, code: parseProviderError(error.message) };
  const d = data as { status: string; manageToken: string };
  return { ok: true, status: d.status, manageToken: d.manageToken };
}

export type ManualBookDispatch = {
  phoneE164: string;
  email: string | null;
  patientName: string;
  confirmSmsReminderId: string;
  confirmEmailReminderId: string | null;
};
export type ManualBookSummary = {
  providerName: string;
  providerTitle: string | null;
  providerSlug: string;
  serviceName: string;
  serviceDurationMin: number;
  servicePriceEur: number | null;
  locationLabel: string;
  locationAddress: string;
  locationCity: string;
};

export type ManualBookOk = {
  appointmentId: string;
  manageToken: string;
  slotStart: string;
  slotEnd: string;
  dispatch: ManualBookDispatch;
  summary: ManualBookSummary;
};

/**
 * Provider-vouched manual booking (no OTP), owner-checked + atomic. Creates the encrypted
 * patient (Vault key) + the source='provider' appointment guarded by the no_overlap
 * EXCLUDE (→ SLOT_TAKEN on a double-book) + seeds confirm/t24/t2 reminders, all in one tx.
 * Returns the dispatch payload (PII the provider TYPED) so the action sends the confirm SMS
 * immediately. The phone is normalized + hashed BY THE CALLER (lib/saglik/phone); we forward
 * both p_phone_e164 (RPC encrypts) and p_phone_hash field-by-field.
 */
export async function manualBook(
  userId: string,
  input: {
    serviceId: string;
    locationId: string;
    slotStart: string;
    slotEnd: string;
    patientName: string;
    phoneE164: string;
    phoneHash: string;
    email: string | null;
    note: string | null;
  },
): Promise<WriteResult<ManualBookOk>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_provider_manual_book", {
    p_user_id: userId,
    p_service_id: input.serviceId,
    p_location_id: input.locationId,
    p_slot_start: input.slotStart,
    p_slot_end: input.slotEnd,
    p_patient_name: input.patientName,
    p_phone_e164: input.phoneE164,
    p_phone_hash: input.phoneHash,
    p_email: input.email,
    p_note: input.note,
  });
  if (error) return { ok: false, code: parseProviderError(error.message) };
  const d = data as ManualBookOk;
  return { ok: true, ...d };
}

export type ProviderOverride = {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  kind: "holiday" | "break" | "extra";
};

/**
 * The caller's own schedule overrides, or [] when they have no provider row yet (the RPC
 * RAISEs NOT_A_PROVIDER) — the override page guards `{draft ? editor : nudge}` on the
 * null draft, so [] is harmless there. A genuine RPC failure throws.
 */
export async function listOverrides(userId: string): Promise<ProviderOverride[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_provider_list_overrides", {
    p_user_id: userId,
  });
  if (error) {
    // No provider row yet → empty list. listOverrides is awaited in the override page's
    // Promise.all, so a throw here would reject it before the {draft ? …} guard runs.
    if (parseProviderError(error.message) === "NOT_A_PROVIDER") return [];
    throw new Error(`health_provider_list_overrides failed: ${error.message}`);
  }
  return (data as ProviderOverride[] | null) ?? [];
}

/** Create/update one override (owner-checked). overrideId null → insert; else update. */
export async function upsertOverride(
  userId: string,
  input: {
    overrideId: string | null;
    date: string;
    kind: "holiday" | "break" | "extra";
    startTime: string | null;
    endTime: string | null;
  },
): Promise<WriteResult<{ overrideId: string }>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_provider_upsert_override", {
    p_user_id: userId,
    p_override_id: input.overrideId,
    p_date: input.date,
    p_kind: input.kind,
    p_start_time: input.startTime,
    p_end_time: input.endTime,
  });
  if (error) return { ok: false, code: parseProviderError(error.message) };
  const d = data as { overrideId: string };
  return { ok: true, overrideId: d.overrideId };
}

/** Delete one override (owner-checked). */
export async function deleteOverride(
  userId: string,
  overrideId: string,
): Promise<WriteResult<Record<never, never>>> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("health_provider_delete_override", {
    p_user_id: userId,
    p_override_id: overrideId,
  });
  if (error) return { ok: false, code: parseProviderError(error.message) };
  return { ok: true };
}
