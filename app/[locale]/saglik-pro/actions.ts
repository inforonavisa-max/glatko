"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/supabase/server";
import { isHealthVerticalEnabled } from "@/lib/saglik/flags";
import type { Locale } from "@/i18n/routing";
import {
  profileSchema,
  licenseSchema,
  locationSchema,
  serviceSchema,
  scheduleSetSchema,
  settingsSchema,
  overrideSchema,
  manualBookSchema,
} from "@/lib/saglik/provider-validation";
import {
  upsertProfile,
  setLicense,
  upsertLocation,
  deleteLocation,
  upsertService,
  deleteService,
  setSchedules,
  upsertSettings,
  submitForReview,
  getOwnProvider,
  setAppointmentStatus,
  manualBook,
  upsertOverride,
  deleteOverride,
  listProviderAppointments,
  type OwnProvider,
  type ProviderRpcError,
  type ManualBookOk,
  type ProviderAppointment,
} from "@/lib/saglik/provider";
import { normalizePhone, phoneHash } from "@/lib/saglik/phone";
import {
  enqueueCancelledNotice,
  enqueueBookingFollowups,
  dispatchManualConfirm,
} from "@/lib/saglik/booking";

/**
 * Glatko Sağlık — H7a provider mutation server actions.
 *
 * THE single write path for provider data. Every action:
 *   1. flag-guards (no-op surface when the vertical is off),
 *   2. reads the REAL identity from the auth cookie (createClient().auth.getUser()) —
 *      the client NEVER supplies user_id/provider_id; we inject user.id ourselves,
 *   3. zod-validates the payload (the migration-077 RPC re-checks ownership + ranges),
 *   4. calls the owner-checked service-role RPC via lib/saglik/provider.ts,
 *   5. revalidates the affected pages.
 *
 * Results are discriminated unions ({ok:true} | {ok:false, error}) so the client
 * renders inline errors without throwing.
 */

export type ActionResult<T = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: ProviderRpcError | "UNAUTHORIZED" | "VALIDATION" };

async function requireUserId(): Promise<string | null> {
  if (!isHealthVerticalEnabled()) return null;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function revalidateProviderTree() {
  // Locale-prefixed routes share these path prefixes; "layout" scope covers all 9.
  revalidatePath("/[locale]/saglik-pro", "layout");
}

// ─────────────────────────────────────────────────────────────────────────────
// Read (own draft) — used by page Server Components AND for action refresh.
// ─────────────────────────────────────────────────────────────────────────────

export async function loadOwnProvider(
  locale: Locale,
): Promise<{ ok: true; provider: OwnProvider | null } | { ok: false }> {
  const userId = await requireUserId();
  if (!userId) return { ok: false };
  const provider = await getOwnProvider(userId, locale);
  return { ok: true, provider };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — profile
// ─────────────────────────────────────────────────────────────────────────────

export async function saveProfile(
  raw: unknown,
): Promise<ActionResult<{ providerId: string; slug: string }>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "UNAUTHORIZED" };
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "VALIDATION" };
  const r = await upsertProfile(userId, {
    providerType: parsed.data.providerType,
    fullName: parsed.data.fullName,
    title: parsed.data.title ?? null,
    bio: parsed.data.bio,
    photoUrl: parsed.data.photoUrl ?? null,
    languages: parsed.data.languages,
    specialtySlugs: parsed.data.specialtySlugs,
  });
  if (!r.ok) return { ok: false, error: r.code };
  revalidateProviderTree();
  return { ok: true, providerId: r.providerId, slug: r.slug };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — license
// ─────────────────────────────────────────────────────────────────────────────

export async function saveLicense(raw: unknown): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "UNAUTHORIZED" };
  const parsed = licenseSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "VALIDATION" };
  // Defense-in-depth: the file path (if any) must live under the caller's folder.
  if (parsed.data.filePath && !parsed.data.filePath.startsWith(`${userId}/`)) {
    return { ok: false, error: "INVALID_FILE_PATH" };
  }
  const r = await setLicense(userId, {
    licenseNumber: parsed.data.licenseNumber ?? null,
    chamber: parsed.data.chamber ?? null,
    filePath: parsed.data.filePath ?? null,
  });
  if (!r.ok) return { ok: false, error: r.code };
  revalidateProviderTree();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — locations
// ─────────────────────────────────────────────────────────────────────────────

export async function saveLocation(
  raw: unknown,
): Promise<ActionResult<{ locationId: string }>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "UNAUTHORIZED" };
  const parsed = locationSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "VALIDATION" };
  const r = await upsertLocation(userId, {
    locationId: parsed.data.locationId ?? null,
    label: parsed.data.label,
    address: parsed.data.address,
    city: parsed.data.city,
    lat: parsed.data.lat ?? null,
    lng: parsed.data.lng ?? null,
  });
  if (!r.ok) return { ok: false, error: r.code };
  revalidateProviderTree();
  return { ok: true, locationId: r.locationId };
}

export async function removeLocation(locationId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "UNAUTHORIZED" };
  if (!/^[0-9a-f-]{36}$/i.test(locationId)) return { ok: false, error: "VALIDATION" };
  const r = await deleteLocation(userId, locationId);
  if (!r.ok) return { ok: false, error: r.code };
  revalidateProviderTree();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — services
// ─────────────────────────────────────────────────────────────────────────────

export async function saveService(
  raw: unknown,
): Promise<ActionResult<{ serviceId: string }>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "UNAUTHORIZED" };
  const parsed = serviceSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "VALIDATION" };
  const r = await upsertService(userId, {
    serviceId: parsed.data.serviceId ?? null,
    name: parsed.data.name,
    durationMin: parsed.data.durationMin,
    priceEur: parsed.data.priceEur ?? null,
    mode: parsed.data.mode,
    isActive: parsed.data.isActive,
  });
  if (!r.ok) return { ok: false, error: r.code };
  revalidateProviderTree();
  return { ok: true, serviceId: r.serviceId };
}

export async function removeService(serviceId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "UNAUTHORIZED" };
  if (!/^[0-9a-f-]{36}$/i.test(serviceId)) return { ok: false, error: "VALIDATION" };
  const r = await deleteService(userId, serviceId);
  if (!r.ok) return { ok: false, error: r.code };
  revalidateProviderTree();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 / takvim — weekly schedule rows for one location
// ─────────────────────────────────────────────────────────────────────────────

export async function saveSchedules(
  raw: unknown,
): Promise<ActionResult<{ count: number }>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "UNAUTHORIZED" };
  const parsed = scheduleSetSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "VALIDATION" };
  const r = await setSchedules(userId, {
    locationId: parsed.data.locationId,
    rows: parsed.data.rows,
  });
  if (!r.ok) return { ok: false, error: r.code };
  revalidateProviderTree();
  return { ok: true, count: r.count };
}

// ─────────────────────────────────────────────────────────────────────────────
// ayarlar — provider_settings
// ─────────────────────────────────────────────────────────────────────────────

export async function saveSettings(raw: unknown): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "UNAUTHORIZED" };
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "VALIDATION" };
  const r = await upsertSettings(userId, {
    bufferMin: parsed.data.bufferMin,
    minNoticeMin: parsed.data.minNoticeMin,
    horizonDays: parsed.data.horizonDays,
    dailyCap: parsed.data.dailyCap ?? null,
    slotGridMin: parsed.data.slotGridMin,
  });
  if (!r.ok) return { ok: false, error: r.code };
  revalidateProviderTree();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Wizard finalize
// ─────────────────────────────────────────────────────────────────────────────

export async function finalizeOnboarding(): Promise<
  | { ok: true; providerId: string; slug: string }
  | { ok: false; missing: string[] }
  | { ok: false; error: ProviderRpcError | "UNAUTHORIZED" }
> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "UNAUTHORIZED" };
  const r = await submitForReview(userId);
  if (r.ok) {
    revalidateProviderTree();
    return { ok: true, providerId: r.providerId, slug: r.slug };
  }
  if ("missing" in r) return { ok: false, missing: r.missing };
  return { ok: false, error: r.code };
}

// ═════════════════════════════════════════════════════════════════════════════
// H7b — provider day-ops actions (status change / manual-book / overrides).
//
// Same path as H7a: requireUserId() → zod-validate → owner-checked 078 RPC →
// revalidateProviderTree(). The cancel + manual-book actions additionally fire the
// best-effort H6 enqueue + immediate dispatch AFTER the RPC commits, two-layer /
// never-throw (a notification hiccup must NOT roll back the DB change). No PII logged.
// ═════════════════════════════════════════════════════════════════════════════

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Reload the caller's OWN appointments for a scope/status (the list filter re-fetch).
 * Owner-checked inside the RPC; masked phone only. Returns [] when unauthenticated so the
 * client just renders empty rather than throwing.
 */
export async function loadProviderAppointments(
  locale: Locale,
  scope: "upcoming" | "past" | "all",
  status: "confirmed" | "completed" | "cancelled" | "no_show" | null,
): Promise<{ ok: true; appointments: ProviderAppointment[] } | { ok: false }> {
  const userId = await requireUserId();
  if (!userId) return { ok: false };
  const appointments = await listProviderAppointments(userId, locale, scope, status);
  return { ok: true, appointments };
}

/**
 * Mark an appointment completed / no_show / cancelled. On a successful CANCEL, queue the
 * patient's H6 'cancelled' notice (idempotent, only-cancelled) BEST-EFFORT — exactly like
 * the patient cancel path. completed/no_show enqueue nothing.
 */
export async function changeAppointmentStatus(
  appointmentId: string,
  status: "completed" | "no_show" | "cancelled",
  reason?: string,
): Promise<ActionResult<{ status: string }>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "UNAUTHORIZED" };
  if (!UUID_RE.test(appointmentId)) return { ok: false, error: "VALIDATION" };
  if (status !== "completed" && status !== "no_show" && status !== "cancelled") {
    return { ok: false, error: "VALIDATION" };
  }
  const r = await setAppointmentStatus(userId, appointmentId, status, reason ?? null);
  if (!r.ok) return { ok: false, error: r.code };

  // Two-layer: enqueue the patient cancelled notice AFTER the RPC committed. The H6 cron
  // delivers the SMS/email in the patient's locale (reminder_locale sidecar). Never-throw.
  if (status === "cancelled") {
    await enqueueCancelledNotice(r.manageToken);
  }
  revalidateProviderTree();
  return { ok: true, status: r.status };
}

/**
 * Provider-vouched manual booking (phone-in patient). Normalizes + hashes the phone here
 * (the RPC encrypts + computes nothing), books atomically via the owner-checked 078 RPC,
 * then dispatches the confirm SMS/email immediately + sets the reminder locale, both
 * best-effort. Takes the locale so the confirm copy + date render correctly.
 */
export async function createManualBooking(
  locale: Locale,
  raw: unknown,
): Promise<ActionResult<{ appointmentId: string; manageToken: string }>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "UNAUTHORIZED" };
  const parsed = manualBookSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "VALIDATION" };

  // Normalize the provider-typed phone to E.164 (ME default) + compute the patients
  // lookup hash EXACTLY like the OTP path, so the RPC just encrypts + stores.
  const e164 = normalizePhone(parsed.data.phone);
  if (!e164) return { ok: false, error: "PATIENT_INPUT_INVALID" };
  const hash = phoneHash(e164);

  const r = await manualBook(userId, {
    serviceId: parsed.data.serviceId,
    locationId: parsed.data.locationId,
    slotStart: parsed.data.slotStart,
    slotEnd: parsed.data.slotEnd,
    patientName: parsed.data.patientName,
    phoneE164: e164,
    phoneHash: hash,
    email: parsed.data.email ?? null,
    note: parsed.data.note ?? null,
  });
  if (!r.ok) return { ok: false, error: r.code };

  // Two-layer best-effort, AFTER the booking committed: send the confirm SMS/email now +
  // persist the patient's locale so the H6 cron renders t24/t2 in the right language.
  const ok: ManualBookOk = r;
  await dispatchManualConfirm(ok, locale);
  await enqueueBookingFollowups(ok.appointmentId, locale);

  revalidateProviderTree();
  return { ok: true, appointmentId: ok.appointmentId, manageToken: ok.manageToken };
}

/** Create/update one schedule override (holiday/break/extra), owner-checked. */
export async function saveOverride(
  raw: unknown,
): Promise<ActionResult<{ overrideId: string }>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "UNAUTHORIZED" };
  const parsed = overrideSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "VALIDATION" };
  const r = await upsertOverride(userId, {
    overrideId: parsed.data.id ?? null,
    date: parsed.data.date,
    kind: parsed.data.kind,
    startTime: parsed.data.kind === "holiday" ? null : parsed.data.startTime ?? null,
    endTime: parsed.data.kind === "holiday" ? null : parsed.data.endTime ?? null,
  });
  if (!r.ok) return { ok: false, error: r.code };
  revalidateProviderTree();
  return { ok: true, overrideId: r.overrideId };
}

/** Delete one schedule override, owner-checked. */
export async function removeOverride(overrideId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "UNAUTHORIZED" };
  if (!UUID_RE.test(overrideId)) return { ok: false, error: "VALIDATION" };
  const r = await deleteOverride(userId, overrideId);
  if (!r.ok) return { ok: false, error: r.code };
  revalidateProviderTree();
  return { ok: true };
}
