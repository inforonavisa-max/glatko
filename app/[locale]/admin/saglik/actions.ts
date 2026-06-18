"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { isHealthVerticalEnabled } from "@/lib/saglik/flags";
import { logAdminAction } from "@/lib/admin/audit";
import {
  decideProvider,
  setProviderPublished,
  setProviderTier,
  getProviderDetail,
  mintLicenseSignedUrl,
  type AdminRpcError,
} from "@/lib/saglik/admin";
import type { HealthProviderTier } from "@/lib/saglik/admin-metrics";
import { isValidTier } from "@/lib/saglik/admin-metrics";
import { sendEmail } from "@/lib/email/send-email";
import {
  HealthProviderDecisionEmail,
  HEALTH_PROVIDER_DECISION_EMAIL_SUBJECT,
} from "@/lib/email/templates/health-provider-decision";
import { coerceEmailLocale } from "@/lib/email/templates/translations";
import { getSiteUrl } from "@/lib/email/resend";
import { glatkoCaptureException } from "@/lib/sentry/glatko-capture";
import type { Locale } from "@/i18n/routing";

/**
 * Glatko Sağlık — H8 admin server actions.
 *
 * Mirrors app/[locale]/admin/professionals/actions.ts 1:1:
 *   createClient().auth.getUser() → if !isAdminEmail return {success:false} (the
 *   AUTHORITATIVE gate; the layout also gates the route) → createAdminClient().rpc(...)
 *   via the lib/saglik/admin wrappers → logAdminAction (app-side glatko trail w/ IP/UA;
 *   the RPC ALSO writes the canonical health.audit_log row in-tx) → best-effort notify →
 *   revalidatePath.
 *
 * The new 079 RPCs are NOT self-gated on profiles.role/is_admin() (dead under service-role);
 * authorization IS this isAdminEmail check + EXECUTE-to-service_role. The verified admin
 * user.id is forwarded as p_actor_id (health.audit_log.actor_id).
 *
 * NO PII in logs/Sentry. Notify guards null user_id (seed providers) and degrades silently.
 */

export type AdminActionResult = { success: true } | { success: false; error: string };

function errorMessage(code: AdminRpcError): string {
  switch (code) {
    case "NOT_FOUND":
      return "Sağlayıcı bulunamadı"; // TODO i18n
    case "INVALID_DECISION":
      return "Bu durumda işlem yapılamaz"; // TODO i18n
    case "INVALID_TIER":
      return "Geçersiz paket"; // TODO i18n
    default:
      return "İşlem başarısız"; // TODO i18n
  }
}

/** Resolve provider contact (email + locale) from the provider's auth user. Guards null. */
async function lookupProviderEmailAndLocale(
  userId: string | null,
): Promise<{ email: string | null; locale: string }> {
  if (!userId) return { email: null, locale: "en" };
  const admin = createAdminClient();
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error) return { email: null, locale: "en" };
    const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const localeFromMeta = typeof meta.locale === "string" ? meta.locale : null;
    return { email: data.user?.email ?? null, locale: localeFromMeta ?? "en" };
  } catch {
    return { email: null, locale: "en" };
  }
}

/** Best-effort decision notify (never throws, never blocks, no PII logged). */
async function notifyDecision(args: {
  userId: string | null;
  providerName: string;
  slug: string;
  decision: "approved" | "rejected";
  reason: string | null;
}): Promise<void> {
  const { email, locale } = await lookupProviderEmailAndLocale(args.userId);
  if (!email) return; // seed providers have null user_id → skip silently.

  const emailLocale = coerceEmailLocale(locale);
  const base = getSiteUrl();
  // Approved → public provider profile (/health/uzman/[slug]); rejected → onboarding
  // (/saglik-pro/basvuru) to fix & resubmit. Built directly (no client-supplied URL).
  // Use emailLocale (coerced) for the path so body language and link path always agree.
  const ctaUrl =
    args.decision === "approved"
      ? `${base}/${emailLocale}/health/uzman/${args.slug}`
      : `${base}/${emailLocale}/saglik-pro/basvuru`;

  try {
    await sendEmail({
      to: email,
      // Locale-keyed subject (mirrors HEALTH_*_EMAIL_SUBJECT convention).
      subject: HEALTH_PROVIDER_DECISION_EMAIL_SUBJECT[args.decision][emailLocale],
      react: HealthProviderDecisionEmail({
        locale: emailLocale,
        providerName: args.providerName,
        decision: args.decision,
        reason: args.reason,
        ctaUrl,
      }),
    });
  } catch (err) {
    // Notify is best-effort; the decision already committed + is audit-logged.
    glatkoCaptureException(err, {
      module: "admin/saglik/actions",
      op: `decision_email_${args.decision}`,
      // NOTE: no email/phone/name — only the non-PII op tag.
    });
  }
}

function revalidateHealthAdmin(providerId?: string): void {
  revalidatePath(`/[locale]/admin/saglik`, "page");
  if (providerId) revalidatePath(`/[locale]/admin/saglik/${providerId}`, "page");
  revalidatePath(`/[locale]/admin/saglik/audit`, "page");
}

/**
 * Revalidate the PUBLIC health surfaces after a publish-state change so a newly
 * approved/(un)published provider does not wait out the 1h ISR window. Mirrors the
 * existing admin convention (lib/actions/admin/updateProvider.ts revalidates the public
 * /pros/[slug]). The literal `[locale]` segment revalidates every locale variant.
 */
function revalidateHealthPublic(slug: string): void {
  if (slug) revalidatePath(`/[locale]/health/uzman/${slug}`, "page");
  // Directory home + specialty/city listings read the same approved+published rows.
  revalidatePath(`/[locale]/health`, "page");
  revalidatePath(`/[locale]/health/[specialty]`, "page");
  revalidatePath(`/[locale]/health/[specialty]/[city]`, "page");
}

/** APPROVE a pending provider → live (is_published=true) + notify. */
export async function approveProvider(providerId: string): Promise<AdminActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isHealthVerticalEnabled() || !isAdminEmail(user?.email) || !user) {
    return { success: false, error: "Unauthorized" };
  }

  // The decide RPC confirms existence + returns userId/fullName/slug in one round-trip,
  // so we no longer fetch the secret-bearing detail RPC just to read the slug.
  const result = await decideProvider(user.id, providerId, "approve", null);
  if (!result.ok) return { success: false, error: errorMessage(result.code) };

  await logAdminAction({
    actionType: "health_provider_approve",
    targetTable: "health.providers",
    targetId: providerId,
    payload: { decision: "approved", isPublished: true },
    reason: "Admin approved health provider (published)",
  });

  await notifyDecision({
    userId: result.userId,
    providerName: result.fullName,
    slug: result.slug,
    decision: "approved",
    reason: null,
  });

  revalidateHealthAdmin(providerId);
  // Approve sets is_published=true → make the provider visible on the public surfaces now,
  // not after the 1h ISR window.
  revalidateHealthPublic(result.slug);
  return { success: true };
}

/** Reasoned REJECT of a pending provider → hidden + reason stored + notify. */
export async function rejectProvider(
  providerId: string,
  reason: string,
): Promise<AdminActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isHealthVerticalEnabled() || !isAdminEmail(user?.email) || !user) {
    return { success: false, error: "Unauthorized" };
  }

  const cleanReason = reason.trim() || null;
  const result = await decideProvider(user.id, providerId, "reject", cleanReason);
  if (!result.ok) return { success: false, error: errorMessage(result.code) };

  await logAdminAction({
    actionType: "health_provider_reject",
    targetTable: "health.providers",
    targetId: providerId,
    payload: { decision: "rejected" },
    reason: cleanReason ?? "Admin rejected health provider",
  });

  await notifyDecision({
    userId: result.userId,
    providerName: result.fullName,
    slug: result.slug,
    decision: "rejected",
    reason: cleanReason,
  });

  revalidateHealthAdmin(providerId);
  return { success: true };
}

/** Unpublish (false) / re-publish (true) a provider. */
export async function setProviderPublishedAction(
  providerId: string,
  published: boolean,
): Promise<AdminActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isHealthVerticalEnabled() || !isAdminEmail(user?.email) || !user) {
    return { success: false, error: "Unauthorized" };
  }

  const result = await setProviderPublished(user.id, providerId, published);
  if (!result.ok) return { success: false, error: errorMessage(result.code) };

  await logAdminAction({
    actionType: published ? "health_provider_publish" : "health_provider_unpublish",
    targetTable: "health.providers",
    targetId: providerId,
    payload: { isPublished: published },
    reason: published ? "Admin re-published health provider" : "Admin unpublished health provider",
  });

  revalidateHealthAdmin(providerId);
  // Publish/unpublish flips public visibility → refresh the public surfaces immediately.
  revalidateHealthPublic(result.slug);
  return { success: true };
}

/** Change a provider's subscription tier (free/premium/business). */
export async function setProviderTierAction(
  providerId: string,
  tier: string,
): Promise<AdminActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isHealthVerticalEnabled() || !isAdminEmail(user?.email) || !user) {
    return { success: false, error: "Unauthorized" };
  }
  if (!isValidTier(tier)) {
    return { success: false, error: errorMessage("INVALID_TIER") };
  }

  const result = await setProviderTier(user.id, providerId, tier as HealthProviderTier);
  if (!result.ok) return { success: false, error: errorMessage(result.code) };

  await logAdminAction({
    actionType: "health_provider_set_tier",
    targetTable: "health.providers",
    targetId: providerId,
    payload: { tier },
    reason: `Admin set health provider tier=${tier}`,
  });

  revalidateHealthAdmin(providerId);
  return { success: true };
}

/**
 * Mint a short-TTL signed download URL for a provider's license. Re-checks isAdminEmail,
 * reads the admin-only license_file_path via the detail RPC, mints createSignedUrl(~120s).
 * NEVER returns/logs the raw path. Returns { url } or { error }.
 */
export async function getLicenseDownloadUrl(
  providerId: string,
): Promise<{ url: string } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isHealthVerticalEnabled() || !isAdminEmail(user?.email)) {
    return { error: "Unauthorized" };
  }

  const detail = await getProviderDetail(providerId, "en" as Locale);
  if (!detail?.licenseFilePath) {
    return { error: "Lisans dosyası bulunamadı" }; // TODO i18n
  }
  const url = await mintLicenseSignedUrl(detail.licenseFilePath);
  if (!url) return { error: "Bağlantı oluşturulamadı" }; // TODO i18n
  return { url };
}
