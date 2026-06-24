"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/supabase/server";
import { safeFetchImage } from "@/lib/utils/safe-image-fetch";
import {
  createProfileFieldsSchema,
  createPasswordSchema,
  normalizeProfilePayload,
} from "@/lib/validations/profile";
import { getLocale, getTranslations } from "next-intl/server";
import {
  type NotificationEmailPrefKey,
  type NotificationPrefsRow,
  mergeNotificationPrefs,
  normalizeNotificationPrefs,
  NOTIFICATION_EMAIL_PREF_KEYS,
} from "@/lib/notifications/prefs";

export type { NotificationPrefsRow } from "@/lib/notifications/prefs";

const VALID_LOCALES = ["tr", "en", "de", "it", "ru", "uk", "sr", "me", "ar"] as const;

/** next-intl middleware locale cookie (default name in v4) */
const LOCALE_COOKIE = "NEXT_LOCALE";

export type UserProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  city: string | null;
  bio: string | null;
  preferred_locale: string | null;
  is_active: boolean | null;
  notification_prefs: ReturnType<typeof normalizeNotificationPrefs>;
  notification_channel: "whatsapp" | "viber" | null;
  messaging_opt_in: boolean;
  is_deleted: boolean | null;
};

export async function getProfileSettings(): Promise<
  | { ok: true; profile: UserProfileRow; email: string; hasPhone: boolean }
  | { ok: false; error: string }
> {
  const supabase = createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return { ok: false, error: "Unauthorized" };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, avatar_url, phone, city, bio, preferred_locale, is_active, notification_prefs, notification_channel, messaging_opt_in, is_deleted"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  const row: UserProfileRow = {
    id: user.id,
    full_name: profile?.full_name ?? null,
    avatar_url: profile?.avatar_url ?? null,
    phone: profile?.phone ?? null,
    city: profile?.city ?? null,
    bio: profile?.bio ?? null,
    preferred_locale: profile?.preferred_locale ?? "tr",
    is_active: profile?.is_active ?? true,
    notification_prefs: normalizeNotificationPrefs(profile?.notification_prefs),
    notification_channel:
      (profile?.notification_channel as "whatsapp" | "viber" | null) ?? null,
    messaging_opt_in: profile?.messaging_opt_in ?? false,
    is_deleted: profile?.is_deleted ?? false,
  };

  if (row.is_deleted) {
    return { ok: false, error: "Account deleted" };
  }

  return {
    ok: true,
    profile: row,
    email: user.email ?? "",
    hasPhone: Boolean(user.phone),
  };
}

function revalidateProfile() {
  revalidatePath("/", "layout");
}

export async function updateProfile(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "unauthorized" as const };
  }

  const rawData = {
    full_name: String(formData.get("full_name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    city: String(formData.get("city") ?? ""),
    bio: String(formData.get("bio") ?? ""),
  };

  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "validation" });
  const profileFieldsSchema = createProfileFieldsSchema((key, values) =>
    t(key, values),
  );
  const validated = profileFieldsSchema.safeParse(rawData);
  if (!validated.success) {
    return { error: validated.error.flatten().fieldErrors };
  }

  const normalized = normalizeProfilePayload(validated.data);

  // Partial UPDATE only — never upsert (insert would omit NOT NULL columns like email).
  const { error } = await supabase
    .from("profiles")
    .update({
      ...normalized,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    console.error("[GLATKO:profile] Profile update error:", error);
    return { error: error.message };
  }

  revalidateProfile();
  return { success: true as const };
}

export async function updateAvatar(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "unauthorized" as const };
  }

  const file = formData.get("avatar") as File | null;
  if (!file || file.size === 0) {
    return { error: "no_file" as const };
  }

  if (file.size > 5 * 1024 * 1024) {
    return { error: "file_too_large" as const };
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return { error: "invalid_type" as const };
  }

  // Path must be `{user_id}/avatar.{ext}` for storage RLS (foldername[1] = uid).
  const fileExt = file.type.split("/")[1] ?? "jpeg";
  const fileName = `avatar.${fileExt}`;
  const filePath = `${user.id}/${fileName}`;

  const { data: existingFiles } = await supabase.storage.from("avatars").list(user.id);
  if (existingFiles && existingFiles.length > 0) {
    const filesToDelete = existingFiles.map((f) => `${user.id}/${f.name}`);
    await supabase.storage.from("avatars").remove(filesToDelete);
  }

  const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, {
    upsert: true,
    contentType: file.type,
  });

  if (uploadError) {
    console.error("[GLATKO:profile] Avatar upload error:", uploadError);
    return { error: uploadError.message };
  }

  const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
  const publicUrl = urlData.publicUrl;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      avatar_url: publicUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (updateError) {
    console.error("[GLATKO:profile] Profile avatar_url update error:", updateError);
    return { error: updateError.message };
  }

  revalidateProfile();
  return { success: true as const, url: publicUrl };
}

export async function deleteAvatar() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "unauthorized" as const };
  }

  await supabase.storage.from("avatars").remove([
    `${user.id}/avatar.jpg`,
    `${user.id}/avatar.png`,
    `${user.id}/avatar.webp`,
  ]);

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidateProfile();
  return { success: true as const };
}

/**
 * G-FUNNEL: adopt an OAuth provider's profile picture as the user's avatar.
 *
 * Called once on the become-a-pro wizard mount for users who have no avatar
 * yet. handle_new_user does NOT copy the OAuth `picture` into profiles, so
 * Google/etc. users arrive with a null avatar and previously hit the hard
 * "Avatar required" wall. This re-hosts the provider picture in our own
 * `avatars` bucket (so it renders through the same supabase-storage path as
 * uploaded avatars — no remote-image allowlist needed) and persists it.
 *
 * Idempotent + best-effort: skips when an avatar already exists or no
 * provider picture is present, and never throws into the caller.
 */
export async function adoptOAuthAvatar(): Promise<
  | { success: true; url: string | null; skipped?: boolean }
  | { error: string }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "unauthorized" as const };
  }

  // Already has an avatar? leave it alone.
  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.avatar_url && profile.avatar_url.trim().length > 0) {
    return { success: true as const, url: profile.avatar_url, skipped: true };
  }

  // Read the provider picture from the OAuth IDENTITY, NOT user_metadata.
  // user_metadata is writable by the user (updateUser({ data: { picture }})),
  // so trusting it would let a user point this server-side fetch at an
  // internal / cloud-metadata endpoint (SSRF) and land the response in the
  // public avatars bucket. identity_data is written by the provider and is not
  // user-modifiable. (DB-verified: Google identity_data carries `picture`.)
  const googleIdentity = (user.identities ?? []).find(
    (i) => i.provider === "google",
  );
  const idData = (googleIdentity?.identity_data ?? {}) as Record<
    string,
    unknown
  >;
  const picture =
    (typeof idData.picture === "string" && idData.picture) ||
    (typeof idData.avatar_url === "string" && idData.avatar_url) ||
    "";
  if (!picture) {
    return { success: true as const, url: null, skipped: true };
  }

  // Defense-in-depth: https-only + host allowlist + manual redirect validation
  // + content-type / size / timeout guards. Never requests a non-allowlisted
  // host, even via a redirect. Returns null (→ skip) on any violation.
  const image = await safeFetchImage(picture);
  if (!image) {
    return { success: true as const, url: null, skipped: true };
  }
  const { bytes, contentType } = image;

  const ext = contentType.split("/")[1] ?? "jpeg";
  const filePath = `${user.id}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(filePath, bytes, { upsert: true, contentType });
  if (uploadError) {
    return { success: true as const, url: null, skipped: true };
  }

  const { data: urlData } = supabase.storage
    .from("avatars")
    .getPublicUrl(filePath);
  const publicUrl = urlData.publicUrl;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (updateError) {
    return { success: true as const, url: null, skipped: true };
  }

  revalidateProfile();
  return { success: true as const, url: publicUrl };
}

export async function updateLanguagePreference(locale: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "unauthorized" as const };
  }

  if (!VALID_LOCALES.includes(locale as (typeof VALID_LOCALES)[number])) {
    return { error: "invalid_locale" as const };
  }

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      preferred_locale: locale,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) {
    return { error: error.message };
  }

  try {
    cookies().set(LOCALE_COOKIE, locale, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  } catch {
    /* ignore cookie set failures outside mutable request */
  }

  revalidateProfile();
  return { success: true as const };
}

export async function updateNotificationPrefs(prefs: Partial<NotificationPrefsRow>) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "unauthorized" as const };
  }

  const { data: row, error: readErr } = await supabase
    .from("profiles")
    .select("notification_prefs")
    .eq("id", user.id)
    .maybeSingle();

  if (readErr) {
    return { error: readErr.message };
  }

  const merged = mergeNotificationPrefs(row?.notification_prefs, prefs);

  const { error } = await supabase
    .from("profiles")
    .update({
      notification_prefs: merged,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidateProfile();
  return { success: true as const };
}

/** Toggle one email pref (push channel is reserved — no-op until Infobip). */
export async function updateNotificationPreference(
  channel: "email" | "push",
  prefKey: string,
  enabled: boolean,
): Promise<{ success: true } | { error: string }> {
  if (channel === "push") {
    return { success: true };
  }

  if (!NOTIFICATION_EMAIL_PREF_KEYS.includes(prefKey as NotificationEmailPrefKey)) {
    return { error: "invalid_key" };
  }

  const result = await updateNotificationPrefs({
    [prefKey]: enabled,
  } as Partial<NotificationPrefsRow>);
  if ("error" in result && result.error) {
    return { error: result.error };
  }
  return { success: true };
}

/**
 * Set / revoke the user's preferred messaging channel + opt-in consent.
 * Faz 2's dispatcher reads profiles.notification_channel to pick the primary
 * channel; NULL means "not chosen / opted out" → Viber→WhatsApp→SMS failover.
 *
 * - channel = "whatsapp" | "viber": ENABLE messaging. Requires a phone (gate) AND
 *   explicit consent (consent === true) per WhatsApp policy. Stamps
 *   messaging_opt_in=true + messaging_opt_in_at + opt_in_source='settings'.
 * - channel = null: REVOKE (opt-out). Always allowed, no phone/consent gate.
 *   Clears notification_channel and sets messaging_opt_in=false. Email
 *   notifications are a separate system (NOTIFICATION_EMAILS_ENABLED) and stay on.
 *
 * Phone gate: WhatsApp/Viber/SMS all deliver to the phone on auth.users.phone —
 * NOT profiles.phone (phone-OTP signups never populate the profiles column).
 */
export async function updateNotificationChannel(
  channel: "whatsapp" | "viber" | null,
  consent?: boolean,
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "unauthorized" };
  }

  const nowIso = new Date().toISOString();

  // Revoke / "email only": clear the channel and the opt-in. No phone/consent gate.
  if (channel === null) {
    const { error } = await supabase
      .from("profiles")
      .update({
        notification_channel: null,
        messaging_opt_in: false,
        messaging_opt_in_at: nowIso,
        opt_in_source: "settings",
        updated_at: nowIso,
      })
      .eq("id", user.id);
    if (error) {
      return { error: error.message };
    }
    revalidateProfile();
    return { success: true };
  }

  const validChannels: readonly string[] = ["whatsapp", "viber"];
  if (!validChannels.includes(channel)) {
    return { error: "invalid_channel" };
  }

  // Phone gate — auth.users.phone is the authoritative destination number
  // (profiles.phone is NULL for phone-OTP signups). No phone → nothing to message.
  if (!user.phone) {
    return { error: "no_phone" };
  }

  // Enabling a messaging channel requires explicit opt-in consent (WhatsApp policy).
  if (consent !== true) {
    return { error: "consent_required" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      notification_channel: channel,
      messaging_opt_in: true,
      messaging_opt_in_at: nowIso,
      opt_in_source: "settings",
      updated_at: nowIso,
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidateProfile();
  return { success: true };
}

export async function changePassword(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: "unauthorized" as const };
  }

  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "validation" });
  const passwordSchema = createPasswordSchema((key, values) => t(key, values));
  const parsed = passwordSchema.safeParse({
    current_password: formData.get("current_password"),
    new_password: formData.get("new_password"),
    confirm_password: formData.get("confirm_password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { error: signErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.current_password,
  });

  if (signErr) {
    return { error: "invalid_current_password" as const };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.new_password,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true as const };
}

/**
 * G-AUTH-2: Set a password for an OAuth-only user (no current password).
 * Refuses if the user already has a password — that flow must use changePassword.
 */
export async function setPassword(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: "unauthorized" as const };
  }

  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (newPassword.length < 8) {
    return { error: "password_too_short" as const };
  }
  if (newPassword !== confirmPassword) {
    return { error: "password_mismatch" as const };
  }

  const { data: methods } = await supabase
    .rpc("get_auth_methods", { p_email: user.email })
    .maybeSingle<{ has_password: boolean; oauth_providers: string[] | null }>();

  if (methods?.has_password) {
    return { error: "already_has_password" as const };
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true as const };
}

/**
 * G-AUTH-2: Revoke ALL refresh tokens for the current user across every device,
 * then clear the local session. Used by /settings/security "Sign out everywhere".
 */
export async function signOutEverywhere() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "unauthorized" as const };
  }

  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) {
    return { error: error.message };
  }

  return { success: true as const };
}

export async function dismissOnboardingWelcome() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "unauthorized" as const };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidateProfile();
  return { success: true as const };
}

export async function deactivateAccount() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "unauthorized" as const };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  await supabase.auth.signOut();
  revalidateProfile();
  return { success: true as const };
}

export async function deleteAccount(confirmation: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "unauthorized" as const };
  }

  const ok =
    confirmation === "SİL" ||
    confirmation === "SIL" ||
    confirmation === "DELETE";
  if (!ok) {
    return { error: "invalid_confirmation" as const };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  await supabase.auth.signOut();
  revalidateProfile();
  return { success: true as const };
}
