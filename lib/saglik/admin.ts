import "server-only";

import { createAdminClient } from "@/supabase/server";
import type { Locale } from "@/i18n/routing";
import type { ProviderType, ServiceMode } from "@/lib/saglik/provider-validation";
import type { HealthProviderTier } from "@/lib/saglik/admin-metrics";

/**
 * Glatko Sağlık — H8 admin data-access (server-only).
 *
 * Symmetric with lib/saglik/provider.ts (H7a/H7b owner-checked RPCs): the health schema is
 * NOT exposed to PostgREST, so every admin read/write goes through the public SECURITY
 * DEFINER RPCs from migration 079, called with the service-role client.
 *
 * AUTHORIZATION (the #1 guard — enforced in the CALLING server action, NOT here): the
 * admin RPCs are NOT self-gated on profiles.role/is_admin() (proven dead under service-role:
 * auth.uid() is NULL, and all real admins have role='user'). The real gate is
 * isAdminEmail(user.email) checked in actions.ts BEFORE these wrappers run, plus EXECUTE
 * being granted ONLY to service_role. Each mutating wrapper forwards a server-VERIFIED
 * actor id (the cookie-authenticated admin user.id resolved by the action) as p_actor_id,
 * used as health.audit_log.actor_id — an audit trail, not an auth check.
 *
 * CONTRACT — args built FIELD-BY-FIELD (never spread a client payload) so no client key can
 * reach the RPC. RPC-raised business errors surface as PostgREST errors whose message IS the
 * raised code (e.g. "NOT_FOUND"); parseAdminError maps them to a stable union.
 *
 * PII — the appointment list returns ALREADY-masked phones (last-3) and NEVER email; the
 * provider detail returns licenseFilePath (admin-only) which is consumed ONLY to mint a
 * short-TTL signed download URL and is NEVER logged.
 */

export type AdminRpcError =
  | "NOT_FOUND"
  | "INVALID_DECISION"
  | "INVALID_TIER"
  | "INVALID_STATUS"
  | "ERROR";

const ADMIN_RPC_ERRORS: AdminRpcError[] = [
  "NOT_FOUND",
  "INVALID_DECISION",
  "INVALID_TIER",
  "INVALID_STATUS",
];

function parseAdminError(message: string): AdminRpcError {
  const hit = ADMIN_RPC_ERRORS.find((c) => message.includes(c));
  return hit ?? "ERROR";
}

export type AdminWriteResult<T> =
  | ({ ok: true } & T)
  | { ok: false; code: AdminRpcError };

// ─────────────────────────────────────────────────────────────────────────────
// Verification queue
// ─────────────────────────────────────────────────────────────────────────────

export type ProviderVerificationStatus = "pending" | "approved" | "rejected";
export type ProviderQueueFilter = ProviderVerificationStatus | "all";

export type AdminProviderListItem = {
  id: string;
  fullName: string;
  providerType: ProviderType;
  title: string | null;
  slug: string;
  licenseFileSet: boolean;
  verificationStatus: ProviderVerificationStatus;
  isPublished: boolean;
  subscriptionTier: string;
  createdAt: string;
  specialties: Array<{ slug: string; name: string | null }>;
  primaryCity: string | null;
};

/** Providers filtered by verification status (default 'pending'). A genuine RPC failure throws. */
export async function listProviders(
  status: ProviderQueueFilter,
  locale: Locale,
): Promise<AdminProviderListItem[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_admin_list_pending", {
    p_locale: locale,
    p_status: status,
  });
  if (error) {
    throw new Error(`health_admin_list_pending failed: ${error.message}`);
  }
  return (data as AdminProviderListItem[] | null) ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider detail (incl. license_file_path — admin-only)
// ─────────────────────────────────────────────────────────────────────────────

export type AdminProviderLocation = {
  id: string;
  label: string;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
};

export type AdminProviderService = {
  id: string;
  name: Record<string, string>;
  durationMin: number;
  priceEur: number | null;
  mode: ServiceMode;
  isActive: boolean;
};

export type AdminProviderScheduleRow = {
  id: string;
  locationId: string;
  weekday: number;
  startTime: string;
  endTime: string;
};

export type AdminProviderSettings = {
  bufferMin: number;
  minNoticeMin: number;
  horizonDays: number;
  dailyCap: number | null;
  slotGridMin: number;
};

export type AdminProviderDetail = {
  providerId: string;
  userId: string | null;
  slug: string;
  providerType: ProviderType;
  fullName: string;
  title: string | null;
  bio: Record<string, string>;
  photoUrl: string | null;
  languages: string[];
  licenseNumber: string | null;
  chamber: string | null;
  licenseFileSet: boolean;
  /** Admin-only secret bucket path ("<uid>/license.pdf"). NEVER logged; only fed to createSignedUrl. */
  licenseFilePath: string | null;
  verificationStatus: ProviderVerificationStatus;
  verifiedAt: string | null;
  isPublished: boolean;
  subscriptionTier: string;
  createdAt: string;
  rejectionReason: string | null;
  specialties: Array<{ slug: string; name: string | null }>;
  locations: AdminProviderLocation[];
  services: AdminProviderService[];
  schedules: AdminProviderScheduleRow[];
  settings: AdminProviderSettings | null;
};

/** Full provider detail, or null when no row matches. A genuine RPC failure throws. */
export async function getProviderDetail(
  providerId: string,
  locale: Locale,
): Promise<AdminProviderDetail | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_admin_get_provider_detail", {
    p_provider_id: providerId,
    p_locale: locale,
  });
  if (error) {
    throw new Error(`health_admin_get_provider_detail failed: ${error.message}`);
  }
  return (data as AdminProviderDetail | null) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Decisions + management (mutations — never throw on a business error)
// ─────────────────────────────────────────────────────────────────────────────

/** approve → approved + published + verified_at; reject → rejected + reason in audit. */
export async function decideProvider(
  actorId: string,
  providerId: string,
  decision: "approve" | "reject",
  reason: string | null,
): Promise<AdminWriteResult<{ userId: string | null; fullName: string; slug: string }>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_admin_decide_provider", {
    p_actor_id: actorId,
    p_provider_id: providerId,
    p_decision: decision,
    p_reason: reason,
  });
  if (error) return { ok: false, code: parseAdminError(error.message) };
  const d = data as { ok: boolean; userId: string | null; fullName: string; slug: string };
  return { ok: true, userId: d.userId ?? null, fullName: d.fullName, slug: d.slug };
}

/** Unpublish (false) / re-publish (true; only approved providers). */
export async function setProviderPublished(
  actorId: string,
  providerId: string,
  published: boolean,
): Promise<AdminWriteResult<{ isPublished: boolean; slug: string }>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_admin_set_published", {
    p_actor_id: actorId,
    p_provider_id: providerId,
    p_published: published,
  });
  if (error) return { ok: false, code: parseAdminError(error.message) };
  const d = data as { ok: boolean; isPublished: boolean; slug: string };
  return { ok: true, isPublished: d.isPublished, slug: d.slug };
}

/** Tier change (validated free/premium/business in-RPC). */
export async function setProviderTier(
  actorId: string,
  providerId: string,
  tier: HealthProviderTier,
): Promise<AdminWriteResult<{ tier: string }>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_admin_set_tier", {
    p_actor_id: actorId,
    p_provider_id: providerId,
    p_tier: tier,
  });
  if (error) return { ok: false, code: parseAdminError(error.message) };
  const d = data as { ok: boolean; tier: string };
  return { ok: true, tier: d.tier };
}

// ─────────────────────────────────────────────────────────────────────────────
// Appointment view (all providers; masked phone, never email)
// ─────────────────────────────────────────────────────────────────────────────

export type AdminAppointmentStatus = "confirmed" | "cancelled" | "completed" | "no_show";

export type AdminAppointment = {
  appointmentId: string;
  manageToken: string;
  status: AdminAppointmentStatus;
  slotStart: string;
  slotEnd: string;
  source: "web" | "admin" | "provider";
  providerId: string;
  providerName: string;
  serviceName: string;
  serviceDurationMin: number;
  locationLabel: string;
  locationCity: string;
  patientNote: string | null;
  patientName: string;
  /** Already masked in-RPC ('•••' + last 3). Never the full number. */
  patientPhoneMasked: string;
  createdAt: string;
};

/** All appointments with status/provider/date filters + pagination. A genuine RPC failure throws. */
export async function listAppointments(
  locale: Locale,
  filters: {
    status: AdminAppointmentStatus | null;
    providerId: string | null;
    fromIso: string | null;
    toIso: string | null;
    limit: number;
    offset: number;
  },
): Promise<AdminAppointment[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_admin_list_appointments", {
    p_locale: locale,
    p_status: filters.status,
    p_provider_id: filters.providerId,
    p_from: filters.fromIso,
    p_to: filters.toIso,
    p_limit: filters.limit,
    p_offset: filters.offset,
  });
  if (error) {
    throw new Error(`health_admin_list_appointments failed: ${error.message}`);
  }
  return (data as AdminAppointment[] | null) ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit log viewer
// ─────────────────────────────────────────────────────────────────────────────

export type AdminAuditEntry = {
  id: number;
  actorId: string | null;
  action: string;
  targetTable: string | null;
  targetId: string | null;
  payload: Record<string, unknown> | null;
  at: string;
};

/** health.audit_log rows (optionally action-filtered), paginated newest-first. A genuine RPC failure throws. */
export async function listAuditLog(filters: {
  limit: number;
  offset: number;
  action: string | null;
}): Promise<AdminAuditEntry[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_admin_audit_log", {
    p_limit: filters.limit,
    p_offset: filters.offset,
    p_action: filters.action,
  });
  if (error) {
    throw new Error(`health_admin_audit_log failed: ${error.message}`);
  }
  return (data as AdminAuditEntry[] | null) ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric-card raw inputs
// ─────────────────────────────────────────────────────────────────────────────

export type AdminMetricsRaw = {
  now: string;
  weeklyBookings: number;
  noShowCount: number;
  completedCount: number;
  confirmedNext7d: number;
  waitlistCount: number;
  pendingCount: number;
  approvedCount: number;
  publishedCount: number;
};

/** Metric-card raw counts (rate math done in admin-metrics.ts). Null on failure (page degrades). */
export async function getMetrics(nowIso: string): Promise<AdminMetricsRaw | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("health_admin_metrics", {
      p_now: nowIso,
    });
    if (error || !data) return null;
    return data as AdminMetricsRaw;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// License signed-download (regulated identity doc — short TTL, never logged)
// ─────────────────────────────────────────────────────────────────────────────

const HEALTH_LICENSE_BUCKET = "health-licenses";
/** Short TTL for the regulated identity doc — mint on demand, NOT the 7-day used elsewhere. */
export const LICENSE_SIGNED_URL_TTL_SECONDS = 120;

// ─────────────────────────────────────────────────────────────────────────────
// H10 — data-subject rights (consent records + delete/export request queue)
// ─────────────────────────────────────────────────────────────────────────────
// All four reads/writes go through migration 080's public SECURITY DEFINER RPCs
// (service-role; admin-gated in the calling action via isAdminEmail). PII posture
// matches the appointment list: phone is masked in-RPC (last-3), name is masked
// (first initial), email is NEVER returned. The export CONTENT is fulfilled
// manually out-of-band — the queue only tracks the request + the SLA clock.

export type AdminConsentRecord = {
  id: string;
  /** Already masked in-RPC ('•••' + last 3). Never the full number. */
  patientPhoneMasked: string;
  /** First initial + '•••'. Never the full name. */
  patientNameMasked: string;
  consentHealthAt: string;
  consentMarketingAt: string | null;
  createdAt: string;
};

/** Patient health-consent timestamps (masked phone/name, never email). A genuine RPC failure throws. */
export async function listConsents(
  limit: number,
  offset: number,
): Promise<AdminConsentRecord[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_admin_list_consents", {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    throw new Error(`health_admin_list_consents failed: ${error.message}`);
  }
  return (data as AdminConsentRecord[] | null) ?? [];
}

export type DataRequestType = "delete" | "export";
export type DataRequestStatus = "pending" | "fulfilled" | "rejected";
export type DataRequestFilter = DataRequestStatus | "all";

export type AdminDataRequest = {
  id: string;
  patientId: string;
  type: DataRequestType;
  status: DataRequestStatus;
  requestedAt: string;
  resolvedAt: string | null;
  /** Already masked in-RPC ('•••' + last 3). Never the full number. */
  patientPhoneMasked: string;
  /** First initial + '•••'. Never the full name. */
  patientNameMasked: string;
};

/** Data-rights request queue, filtered by status (default 'pending'). A genuine RPC failure throws. */
export async function listDataRequests(
  status: DataRequestFilter,
  limit: number,
  offset: number,
): Promise<AdminDataRequest[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_admin_list_data_requests", {
    p_status: status,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    throw new Error(`health_admin_list_data_requests failed: ${error.message}`);
  }
  return (data as AdminDataRequest[] | null) ?? [];
}

/** Mark a request fulfilled/rejected (manual fulfilment). Never throws on a business error. */
export async function resolveDataRequest(
  actorId: string,
  requestId: string,
  status: "fulfilled" | "rejected",
): Promise<AdminWriteResult<{ status: DataRequestStatus }>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_admin_resolve_data_request", {
    p_actor_id: actorId,
    p_request_id: requestId,
    p_status: status,
  });
  if (error) return { ok: false, code: parseAdminError(error.message) };
  const d = data as { ok: boolean; status: DataRequestStatus };
  return { ok: true, status: d.status };
}

/**
 * Mint a short-lived signed download URL for a provider license in the PRIVATE
 * health-licenses bucket. NEVER getPublicUrl; NEVER log the path/url. The path comes from
 * the admin-only detail RPC (license_file_path). Returns null on any failure (caller shows
 * an inline error) — never throws, never logs the path to Sentry/console.
 */
export async function mintLicenseSignedUrl(path: string): Promise<string | null> {
  const clean = path.trim();
  if (!clean) return null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(HEALTH_LICENSE_BUCKET)
      .createSignedUrl(clean, LICENSE_SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
