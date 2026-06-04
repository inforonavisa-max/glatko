"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient, createAdminClient } from "@/supabase/server";
import { getSiteUrl } from "@/lib/email/resend";
import { createNotification } from "@/lib/supabase/glatko.server";
import { locales, defaultLocale } from "@/i18n/routing";

interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

function coerceLocale(value: string | null | undefined): string {
  return value && (locales as readonly string[]).includes(value)
    ? value
    : defaultLocale;
}

export async function openOrCreateThread(input: {
  request_id: string;
  professional_id: string;
  initial_quote_id?: string | null;
}): Promise<ActionResult<{ thread_id: string }>> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const { data, error } = await supabase.rpc("glatko_get_or_create_thread", {
    p_request_id: input.request_id,
    p_professional_id: input.professional_id,
    p_initial_quote_id: input.initial_quote_id ?? null,
  });

  if (error) {
    return { success: false, error: error.message };
  }
  if (!data) {
    return { success: false, error: "Thread creation returned no id" };
  }

  return { success: true, data: { thread_id: data as string } };
}

export async function sendMessage(input: {
  thread_id: string;
  body: string;
  body_locale: string;
}): Promise<ActionResult<{ message_id: string }>> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const trimmed = (input.body ?? "").trim();
  if (trimmed.length < 1) {
    return { success: false, error: "Message cannot be empty." };
  }
  if (trimmed.length > 5000) {
    return { success: false, error: "Message too long (max 5000)." };
  }

  const { data, error } = await supabase
    .from("glatko_thread_messages")
    .insert({
      thread_id: input.thread_id,
      sender_id: user.id,
      body: trimmed,
      body_locale: input.body_locale,
    })
    .select("id")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  const messageId = data.id as string;

  // G-MSG-2: fire-and-forget gpt-4o translation. The endpoint is
  // CRON_SECRET-gated so we authenticate by passing the same secret.
  // Awaiting would push send latency by 2-4s; the recipient sees the
  // raw body until Realtime delivers the translation a moment later.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const baseUrl = getSiteUrl();
    void fetch(`${baseUrl}/api/messages/translate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ message_id: messageId }),
      cache: "no-store",
    }).catch((err) => {
      console.error("[GLATKO:translate] background dispatch failed", err);
    });
  }

  // Faz 0-B: notify the other thread participant in-app. Best-effort; mirrors
  // the notifyNewMessages cron (type thread_message + data.threadId) so the
  // 5-min in-app dedup catches action + cron together. body = message preview.
  try {
    const admin = createAdminClient();
    const { data: th } = await admin
      .from("glatko_message_threads")
      .select("customer_id, professional_id")
      .eq("id", input.thread_id)
      .maybeSingle();
    const customerId = (th?.customer_id as string | null) ?? null;
    const professionalId = (th?.professional_id as string | null) ?? null;
    const recipientId = user.id === customerId ? professionalId : customerId;
    if (recipientId) {
      const { data: prof } = await admin
        .from("profiles")
        .select("preferred_locale")
        .eq("id", recipientId)
        .maybeSingle();
      const locale = coerceLocale(prof?.preferred_locale as string | null);
      const t = await getTranslations({ locale, namespace: "notifications" });
      await createNotification({
        user_id: recipientId,
        type: "thread_message",
        title: t("newMessage.title"),
        body: trimmed.slice(0, 140),
        data: { threadId: input.thread_id },
      });
    }
  } catch (err) {
    console.error("[GLATKO:thread] thread_message in-app notification failed", err);
  }

  revalidatePath(`/[locale]/messages/${input.thread_id}`, "page");
  revalidatePath(`/[locale]/messages`, "page");

  return { success: true, data: { message_id: messageId } };
}

export async function markThreadAsRead(thread_id: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const { error } = await supabase.rpc("glatko_mark_thread_read", {
    p_thread_id: thread_id,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/[locale]/messages`, "page");
  return { success: true };
}

/* ─── G-REV-1 — completion + review actions ────────────────────────────── */

export async function markQuoteComplete(
  quote_id: string,
): Promise<ActionResult<{ updated: boolean }>> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const { data, error } = await supabase.rpc("glatko_pro_mark_complete", {
    p_quote_id: quote_id,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath(`/[locale]/messages`, "page");
  return { success: true, data: { updated: Boolean(data) } };
}

export async function confirmQuoteCompletion(input: {
  quote_id: string;
  confirmed: boolean;
}): Promise<ActionResult<{ updated: boolean }>> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const { data, error } = await supabase.rpc(
    "glatko_customer_confirm_completion",
    {
      p_quote_id: input.quote_id,
      p_confirmed: input.confirmed,
    },
  );
  if (error) return { success: false, error: error.message };

  revalidatePath(`/[locale]/messages`, "page");
  return { success: true, data: { updated: Boolean(data) } };
}

function anonymizeName(fullName: string | null | undefined): string {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0).toUpperCase()}.`;
}

export async function submitReview(input: {
  quote_id: string;
  rating: number;
  comment?: string;
}): Promise<ActionResult<{ review_id: string }>> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };

  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { success: false, error: "Rating must be 1–5" };
  }
  const trimmedComment = (input.comment ?? "").trim();
  if (trimmedComment.length > 1000) {
    return { success: false, error: "Comment too long (max 1000)" };
  }

  const { data: quote, error: quoteErr } = await supabase
    .from("glatko_request_quotes")
    .select("id, professional_id, request_id, completion_state")
    .eq("id", input.quote_id)
    .maybeSingle();

  if (quoteErr || !quote) {
    return { success: false, error: "Quote not found" };
  }
  if (quote.completion_state !== "customer_confirmed") {
    return {
      success: false,
      error: "Cannot review until customer confirms completion",
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = anonymizeName(profile?.full_name as string | null);

  const { data, error } = await supabase
    .from("glatko_quote_reviews")
    .insert({
      quote_id: input.quote_id,
      request_id: quote.request_id as string,
      professional_id: quote.professional_id as string,
      customer_id: user.id,
      rating: input.rating,
      comment: trimmedComment || null,
      customer_display_name: displayName || null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        error: "You have already reviewed this job",
      };
    }
    return { success: false, error: error.message };
  }

  revalidatePath(`/[locale]/provider/${quote.professional_id}`, "page");
  revalidatePath(`/[locale]/messages`, "page");
  return { success: true, data: { review_id: data.id as string } };
}
