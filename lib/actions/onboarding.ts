"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/supabase/server";
import { glatkoCaptureException } from "@/lib/sentry/glatko-capture";

/**
 * Post-signup onboarding write for fresh accounts (currently reached via the
 * phone-OTP login flow, since email/Google users already have a name). Collects
 * display name + role + city + language, writes them to profiles, and flips
 * onboarding_completed so the step is shown only once.
 *
 * Role handling: "customer" stays on profiles (the default role 'user'); "pro"
 * is redirected into the existing become-a-pro wizard, which creates the
 * glatko_professional_profiles row — we do NOT duplicate that here.
 */

const VALID_LOCALES = ["tr", "en", "de", "it", "ru", "uk", "sr", "me", "ar"] as const;
const LOCALE_COOKIE = "NEXT_LOCALE";

export type OnboardingError = "unauthorized" | "invalid_input" | "generic";

export type CompleteOnboardingResult =
  | { ok: true; redirectTo: "/" | "/become-a-pro"; locale: string }
  | { ok: false; error: OnboardingError };

const schema = z.object({
  full_name: z.string().trim().min(1).max(60),
  role: z.enum(["customer", "pro"]),
  // Free text (1–80): a known municipality name OR a custom "other" settlement.
  // The city column is free text, so we don't restrict to the known list.
  city: z.string().trim().min(1).max(80),
  locale: z
    .string()
    .refine((c) => (VALID_LOCALES as readonly string[]).includes(c)),
  // Faz 1-B: optional notification channel (CHECK whatsapp|viber on the column).
  // Omitted → column stays NULL (Faz 2 failover).
  notification_channel: z.enum(["whatsapp", "viber"]).optional(),
  // Messaging opt-in consent (covers WhatsApp+Viber). Only honored alongside a
  // selected channel; the UI enforces the tick before allowing submit.
  messaging_opt_in: z.boolean().optional(),
});

export async function completeOnboarding(input: {
  full_name: string;
  role: string;
  city: string;
  locale: string;
  notification_channel?: "whatsapp" | "viber";
  messaging_opt_in?: boolean;
}): Promise<CompleteOnboardingResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { full_name, role, city, locale, notification_channel, messaging_opt_in } =
    parsed.data;

  // Opt-in is only valid alongside a selected messaging channel (the UI enforces
  // the tick). When opted in, stamp the consent time + source atomically.
  const optedIn = messaging_opt_in === true && Boolean(notification_channel);
  const nowIso = new Date().toISOString();

  // Partial UPDATE only — never upsert (the row already exists via the signup
  // trigger, and upsert would risk omitting other columns). notification_channel
  // is written only when chosen; otherwise the column stays NULL (Faz 2 failover).
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name,
      city,
      preferred_locale: locale,
      onboarding_completed: true,
      updated_at: nowIso,
      ...(notification_channel ? { notification_channel } : {}),
      ...(optedIn
        ? {
            messaging_opt_in: true,
            messaging_opt_in_at: nowIso,
            opt_in_source: "signup",
          }
        : {}),
    })
    .eq("id", user.id);

  if (error) {
    console.error("[GLATKO:onboarding] profile update failed", error.message);
    glatkoCaptureException(error, { module: "onboarding-complete" });
    return { ok: false, error: "generic" };
  }

  // Mirror updateLanguagePreference: persist the chosen UI language.
  try {
    cookies().set(LOCALE_COOKIE, locale, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  } catch {
    /* ignore cookie set outside a mutable request context */
  }

  revalidatePath("/", "layout");

  const redirectTo = role === "pro" ? "/become-a-pro" : "/";
  return { ok: true, redirectTo, locale };
}
