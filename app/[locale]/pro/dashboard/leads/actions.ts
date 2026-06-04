"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient, createAdminClient } from "@/supabase/server";
import { createNotification } from "@/lib/supabase/glatko.server";
import { locales, defaultLocale } from "@/i18n/routing";

type PricingModel = "hourly" | "fixed" | "per_unit" | "estimate";

interface SubmitQuoteInput {
  request_id: string;
  notification_id: string;
  price_amount: number;
  pricing_model: PricingModel;
  message: string;
}

interface ActionResult {
  success: boolean;
  error?: string;
  quote_id?: string;
}

function coerceLocale(value: string | null | undefined): string {
  return value && (locales as readonly string[]).includes(value)
    ? value
    : defaultLocale;
}

export async function submitQuote(
  input: SubmitQuoteInput,
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };

  if (input.price_amount <= 0) {
    return { success: false, error: "Price must be greater than zero." };
  }
  const trimmed = (input.message ?? "").trim();
  if (trimmed.length < 10) {
    return { success: false, error: "Message must be at least 10 characters." };
  }
  if (trimmed.length > 5000) {
    return { success: false, error: "Message must be at most 5000 characters." };
  }

  // Pull notified_at from the matching notification queue row so the
  // GENERATED response_time_seconds column gets a meaningful delta.
  const { data: notification, error: notifErr } = await supabase
    .from("glatko_request_notifications")
    .select("notified_at, request_id, professional_id")
    .eq("id", input.notification_id)
    .eq("professional_id", user.id)
    .maybeSingle();

  if (notifErr || !notification) {
    return { success: false, error: "Lead not found." };
  }
  if (!notification.notified_at) {
    return {
      success: false,
      error: "This lead is on the wait-list — quotes open once it's activated.",
    };
  }
  if (notification.request_id !== input.request_id) {
    return { success: false, error: "Request mismatch." };
  }

  const { data, error } = await supabase
    .from("glatko_request_quotes")
    .insert({
      request_id: input.request_id,
      professional_id: user.id,
      price_amount: input.price_amount,
      price_currency: "EUR",
      pricing_model: input.pricing_model,
      message: trimmed,
      notified_at: notification.notified_at,
      status: "submitted",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        error: "You have already sent a quote for this request.",
      };
    }
    return { success: false, error: error.message };
  }

  const quoteId = data.id as string;

  // Faz 0-B: notify the customer in-app that a new quote arrived. Best-effort —
  // never blocks/fails the submission. Anonymous requests (no customer_id) have
  // no in-app recipient, so they are skipped. Stored text uses the recipient's
  // locale; the bell/list also re-localize the title by type at render time.
  try {
    const admin = createAdminClient();
    const { data: req } = await admin
      .from("glatko_service_requests")
      .select("customer_id, title")
      .eq("id", input.request_id)
      .maybeSingle();
    const customerId = (req?.customer_id as string | null) ?? null;
    if (customerId) {
      const { data: prof } = await admin
        .from("profiles")
        .select("preferred_locale")
        .eq("id", customerId)
        .maybeSingle();
      const locale = coerceLocale(prof?.preferred_locale as string | null);
      const t = await getTranslations({ locale, namespace: "notifications" });
      await createNotification({
        user_id: customerId,
        type: "new_quote",
        title: t("newQuote.title"),
        body: t("newQuote.body"),
        data: {
          requestId: input.request_id,
          quoteId,
          requestTitle: (req?.title as string | null) ?? "",
        },
      });
    }
  } catch (err) {
    console.error("[GLATKO:quote] new_quote in-app notification failed", err);
  }

  revalidatePath(`/[locale]/pro/dashboard/leads`, "page");
  return { success: true, quote_id: quoteId };
}
