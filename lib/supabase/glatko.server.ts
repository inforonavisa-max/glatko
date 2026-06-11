import { dispatchNotificationEmail } from "@/lib/email/dispatch";
import { dispatchExternalNotification } from "@/lib/notifications/external-dispatch";
import { glatkoCaptureException } from "@/lib/sentry/glatko-capture";
import { checkMessageSendRateLimit } from "@/lib/ratelimit/message-rate-limit";
import { createClient, createAdminClient } from "@/supabase/server";

const MAX_CHAT_MESSAGE_LENGTH = 8000;
import type {
  ServiceCategory,
  ProfessionalProfile,
  VerificationStatus,
  VerificationDocument,
  ProService,
  SearchResult,
  SearchResponse,
  TrendingCategory,
  RecentSearch,
  RecentSearchClickType,
} from "@/types/glatko";
export async function getServiceCategories(): Promise<ServiceCategory[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("glatko_service_categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  if (error || !data) return [];

  const rows = data as ServiceCategory[];
  const roots: ServiceCategory[] = [];
  const childMap = new Map<string, ServiceCategory[]>();

  for (const row of rows) {
    if (row.parent_id) {
      const arr = childMap.get(row.parent_id) ?? [];
      arr.push(row);
      childMap.set(row.parent_id, arr);
    } else {
      roots.push(row);
    }
  }

  for (const root of roots) {
    root.children = childMap.get(root.id) ?? [];
  }

  return roots;
}

export async function getProfessionalProfile(
  id: string
): Promise<ProfessionalProfile | null> {
  const supabase = createClient();

  const { data: pro, error } = await supabase
    .from("glatko_professional_profiles")
    .select("*, profiles!glatko_professional_profiles_id_fkey(full_name, avatar_url)")
    .eq("id", id)
    .single();

  if (error || !pro) return null;

  const { data: services } = await supabase
    .from("glatko_pro_services")
    .select("*, category:category_id(id, slug, name, icon)")
    .eq("professional_id", id);

  return {
    ...pro,
    profile: pro.profiles ?? undefined,
    services: (services as ProService[]) ?? [],
  } as ProfessionalProfile;
}

/**
 * G-SEO-FOUNDATION: slug-based lookup for /[locale]/pros/[slug]. Mirrors
 * getProfessionalProfile but resolves by the unique slug column added in
 * migration 041. Slugs are stable (BEFORE INSERT trigger guarantees one),
 * so this is the canonical SEO URL surface for provider pages.
 */
export async function getProfessionalProfileBySlug(
  slug: string
): Promise<ProfessionalProfile | null> {
  const supabase = createClient();

  const { data: pro, error } = await supabase
    .from("glatko_professional_profiles")
    .select("*, profiles!glatko_professional_profiles_id_fkey(full_name, avatar_url)")
    .eq("slug", slug)
    .single();

  if (error || !pro) return null;

  const { data: services } = await supabase
    .from("glatko_pro_services")
    .select("*, category:category_id(id, slug, name, icon)")
    .eq("professional_id", pro.id);

  return {
    ...pro,
    profile: pro.profiles ?? undefined,
    services: (services as ProService[]) ?? [],
  } as ProfessionalProfile;
}

/**
 * Sitemap-only projection: the minimal columns needed to emit
 * /{locale}/pros/{slug} URLs. Filtered to active + approved pros so
 * we never advertise pending/rejected profiles to crawlers.
 */
export async function getProfessionalsForSitemap(): Promise<
  { slug: string; updated_at: string }[]
> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("glatko_professional_profiles")
    .select("slug, updated_at")
    .eq("is_active", true)
    .eq("verification_status", "approved");

  if (error || !data) return [];
  return data as { slug: string; updated_at: string }[];
}

/** Admin UI only — service role bypasses RLS so pending / inactive rows are visible. */
export async function getProfessionalsByStatus(
  status?: VerificationStatus
): Promise<ProfessionalProfile[]> {
  const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!hasUrl || !hasServiceRole) {
    console.warn(
      "[GLATKO:admin] Missing Supabase URL or service role — professionals list may be empty",
    );
  }

  const supabase = createAdminClient();

  let query = supabase
    .from("glatko_professional_profiles")
    .select("*, profiles!glatko_professional_profiles_id_fkey(full_name, avatar_url)")
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("verification_status", status);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[GLATKO:admin] getProfessionalsByStatus query failed:", error);
    return [];
  }

  if (!data) {
    return [];
  }

  return data.map((row) => ({
    ...row,
    profile: row.profiles ?? undefined,
  })) as ProfessionalProfile[];
}

/** Admin professional detail — bypasses RLS (pending pros, other users’ profiles embed). */
export async function getProfessionalProfileAsAdmin(
  id: string
): Promise<ProfessionalProfile | null> {
  const supabase = createAdminClient();

  const { data: pro, error } = await supabase
    .from("glatko_professional_profiles")
    .select("*, profiles!glatko_professional_profiles_id_fkey(full_name, avatar_url)")
    .eq("id", id)
    .single();

  if (error || !pro) return null;

  const { data: services } = await supabase
    .from("glatko_pro_services")
    .select("*, category:category_id(id, slug, name, icon)")
    .eq("professional_id", id);

  return {
    ...pro,
    profile: pro.profiles ?? undefined,
    services: (services as ProService[]) ?? [],
  } as ProfessionalProfile;
}

/** Admin document review — bypasses RLS on glatko_verification_documents. */
export async function getVerificationDocumentsAsAdmin(
  professionalId: string
): Promise<VerificationDocument[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("glatko_verification_documents")
    .select("*")
    .eq("professional_id", professionalId)
    .order("created_at");

  if (error || !data) return [];
  return data as VerificationDocument[];
}

interface CreateProfessionalInput {
  userId: string;
  businessName?: string;
  bio?: string;
  phone?: string;
  city?: string;
  languages?: string[];
  yearsExperience?: number;
  hourlyRateMin?: number;
  hourlyRateMax?: number;
  categoryIds: string[];
  primaryCategoryId?: string;
}

export async function createProfessionalProfile(
  input: CreateProfessionalInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { error: profileError } = await supabase
    .from("glatko_professional_profiles")
    .insert({
      id: input.userId,
      business_name: input.businessName || null,
      bio: input.bio || null,
      phone: input.phone || null,
      location_city: input.city || null,
      languages: input.languages ?? ["en"],
      years_experience: input.yearsExperience ?? null,
      hourly_rate_min: input.hourlyRateMin ?? null,
      hourly_rate_max: input.hourlyRateMax ?? null,
      verification_status: "pending" as const,
    });

  if (profileError) {
    return { success: false, error: profileError.message };
  }

  if (input.categoryIds.length > 0) {
    const services = input.categoryIds.map((catId) => ({
      professional_id: input.userId,
      category_id: catId,
      is_primary: catId === input.primaryCategoryId,
    }));

    const { error: serviceError } = await supabase
      .from("glatko_pro_services")
      .insert(services);

    if (serviceError) {
      return { success: false, error: serviceError.message };
    }
  }

  return { success: true };
}

export async function updateVerificationStatus(
  professionalId: string,
  status: VerificationStatus,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient();

  const updates: Record<string, unknown> = {
    verification_status: status,
    updated_at: new Date().toISOString(),
  };

  if (status === "approved") {
    updates.is_verified = true;
    updates.verified_at = new Date().toISOString();
  }

  if (status === "rejected" && reason) {
    updates.rejection_reason = reason;
  }

  const { error } = await admin
    .from("glatko_professional_profiles")
    .update(updates)
    .eq("id", professionalId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function getVerificationDocuments(
  professionalId: string
): Promise<VerificationDocument[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("glatko_verification_documents")
    .select("*")
    .eq("professional_id", professionalId)
    .order("created_at");

  if (error || !data) return [];
  return data as VerificationDocument[];
}

export async function getCustomerRequests(customerId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("glatko_service_requests")
    .select(
      "*, category:glatko_service_categories(id, slug, name, icon)"
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return data ?? [];
}

export async function getServiceRequest(requestId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("glatko_service_requests")
    .select(
      `*, category:glatko_service_categories(id, slug, name, icon, parent_id),
       bids:glatko_bids!glatko_bids_service_request_id_fkey(id, price, price_type, message, status, created_at, estimated_duration_hours, available_date,
         professional:glatko_professional_profiles(id, business_name, avg_rating, total_reviews, completed_jobs, is_verified))`
    )
    .eq("id", requestId)
    .single();

  if (error) {
    console.error("[GLATKO:requests] getServiceRequest failed:", error, requestId);
    return null;
  }
  return data;
}

interface CreateServiceRequestInput {
  customer_id: string;
  category_id: string;
  title: string;
  description?: string;
  details: Record<string, unknown>;
  municipality: string;
  address?: string;
  budget_min?: number;
  budget_max?: number;
  urgency: string;
  preferred_date_start?: string;
  preferred_date_end?: string;
  photos: string[];
  preferred_professional_id?: string | null;
}

export type CreatedServiceRequestRow = {
  id: string;
  customer_id: string;
  category_id: string;
  title: string;
  municipality: string;
  preferred_professional_id: string | null;
};

export async function createServiceRequest(
  input: CreateServiceRequestInput
): Promise<
  | { success: true; request: CreatedServiceRequestRow }
  | { success: false; error: string }
> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("glatko_service_requests")
    .insert({ ...input, status: "published" })
    .select(
      "id, customer_id, category_id, title, municipality, preferred_professional_id"
    )
    .single();

  if (error) return { success: false as const, error: error.message };
  return {
    success: true as const,
    request: data as CreatedServiceRequestRow,
  };
}

const MAX_MATCHING_PRO_NOTIFICATIONS = 10;

/** Notify preferred pro (if any) and up to N other verified pros for the category + municipality. */
export async function notifyProfessionalsOfNewRequest(params: {
  requestId: string;
  customerId: string;
  categoryId: string;
  title: string;
  municipality: string;
  preferredProfessionalId?: string | null;
  /** JSONB `name` from glatko_service_categories for localized email labels */
  categoryNames?: Record<string, string>;
}): Promise<void> {
  const admin = createAdminClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  const { data: cust } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", params.customerId)
    .maybeSingle();

  const customerName = cust?.full_name?.trim() || "A customer";
  const municipalityNorm = params.municipality.trim().toLowerCase();

  const send = async (userId: string, isDirect: boolean) => {
    const body = isDirect
      ? `${customerName} requested a quote from you for "${params.title}".`
      : `A new request in your area matches your services: "${params.title}".`;

    await createNotification({
      user_id: userId,
      type: "new_request_match",
      title: isDirect ? "New quote request for you" : "New matching request",
      body,
      data: {
        requestId: params.requestId,
        customer_id: params.customerId,
        is_direct: isDirect,
        requestTitle: params.title,
        customerName,
        municipality: params.municipality,
        categoryNames: params.categoryNames ?? {},
      },
    });
  };

  const notified = new Set<string>();
  const preferredId = params.preferredProfessionalId ?? null;

  if (preferredId && preferredId !== params.customerId) {
    const { data: prefPro } = await admin
      .from("glatko_professional_profiles")
      .select("id, is_active, is_verified")
      .eq("id", preferredId)
      .maybeSingle();

    if (prefPro?.is_active && prefPro?.is_verified) {
      try {
        await send(preferredId, true);
        notified.add(preferredId);
      } catch {
        /* ignore */
      }
    }
  }

  const { data: serviceRows } = await admin
    .from("glatko_pro_services")
    .select("professional_id")
    .eq("category_id", params.categoryId);

  const candidateIds = Array.from(
    new Set(
      (serviceRows || [])
        .map((r) => r.professional_id as string)
        .filter((pid) => pid && pid !== params.customerId)
    )
  );

  if (candidateIds.length === 0) return;

  const { data: proRows } = await admin
    .from("glatko_professional_profiles")
    .select("id, location_city, is_active, is_verified")
    .in("id", candidateIds)
    .eq("is_active", true)
    .eq("is_verified", true);

  const cityMatches = (city: string | null | undefined) => {
    if (city == null || String(city).trim() === "") return true;
    return city.trim().toLowerCase() === municipalityNorm;
  };

  const otherIds = (proRows || [])
    .filter((p) => p.id !== preferredId && !notified.has(p.id as string))
    .filter((p) => cityMatches(p.location_city as string | null))
    .map((p) => p.id as string)
    .slice(0, MAX_MATCHING_PRO_NOTIFICATIONS);

  for (const pid of otherIds) {
    try {
      await send(pid, false);
    } catch {
      /* ignore */
    }
  }
}

export async function cancelServiceRequest(
  requestId: string,
  userId: string
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("glatko_service_requests")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("customer_id", userId);

  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

// ─── G3: Bidding System ───

export async function getMatchingRequests(professionalId: string) {
  const supabase = createClient();

  const { data: proServices } = await supabase
    .from("glatko_pro_services")
    .select("category_id")
    .eq("professional_id", professionalId);

  const categoryIds = proServices?.map((s) => s.category_id) || [];
  if (categoryIds.length === 0) return [];

  const { data, error } = await supabase
    .from("glatko_service_requests")
    .select(
      `*, category:glatko_service_categories(id, slug, name, icon),
       customer:profiles!customer_id(full_name, avatar_url)`
    )
    .in("category_id", categoryIds)
    .in("status", ["published", "bidding"])
    .lt("bid_count", 4)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[GLATKO:pro] getMatchingRequests query failed:", error);
    return [];
  }

  const { data: existingBids } = await supabase
    .from("glatko_bids")
    .select("service_request_id")
    .eq("professional_id", professionalId);

  const biddedIds = new Set(
    existingBids?.map((b) => b.service_request_id) || []
  );

  return (data || []).filter((r) => !biddedIds.has(r.id));
}

export async function getProfessionalBids(professionalId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("glatko_bids")
    .select(
      `*, service_request:glatko_service_requests!glatko_bids_service_request_id_fkey(
        id, title, status, municipality, urgency,
        budget_min, budget_max, created_at, photos,
        category:glatko_service_categories(id, slug, name, icon),
        customer:profiles!customer_id(full_name, avatar_url)
      )`
    )
    .eq("professional_id", professionalId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[GLATKO:pro] getProfessionalBids query failed:", error);
    return [];
  }
  return data || [];
}

export async function acceptBid(
  bidId: string,
  requestId: string,
  customerId: string
) {
  const supabase = createClient();

  const { data: reqRow, error: reqErr } = await supabase
    .from("glatko_service_requests")
    .select("customer_id, status")
    .eq("id", requestId)
    .single();

  if (reqErr || !reqRow || reqRow.customer_id !== customerId) {
    throw new Error("Unauthorized");
  }

  const previousStatus = String(reqRow.status ?? "");
  if (previousStatus !== "published" && previousStatus !== "bidding") {
    throw new Error("Request is no longer open for acceptance");
  }

  const { data: bidRow, error: bidReadErr } = await supabase
    .from("glatko_bids")
    .select("id, status, service_request_id")
    .eq("id", bidId)
    .single();

  if (
    bidReadErr ||
    !bidRow ||
    bidRow.service_request_id !== requestId ||
    bidRow.status !== "pending"
  ) {
    throw new Error("This bid is no longer available");
  }

  const { data: rejectedBids } = await supabase
    .from("glatko_bids")
    .select("id, professional_id")
    .eq("service_request_id", requestId)
    .neq("id", bidId)
    .eq("status", "pending");

  const { data: requestDetail } = await supabase
    .from("glatko_service_requests")
    .select(
      `title, municipality, category:glatko_service_categories(name)`
    )
    .eq("id", requestId)
    .maybeSingle();

  const categoryEmbed = requestDetail?.category as
    | { name?: Record<string, string> }
    | null
    | undefined;
  const categoryNames =
    categoryEmbed?.name && typeof categoryEmbed.name === "object"
      ? categoryEmbed.name
      : {};

  const { data: lockedRequest, error: lockErr } = await supabase
    .from("glatko_service_requests")
    .update({
      status: "assigned",
      assigned_bid_id: bidId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("customer_id", customerId)
    .in("status", ["published", "bidding"])
    .select("id")
    .maybeSingle();

  if (lockErr) throw lockErr;
  if (!lockedRequest?.id) {
    throw new Error("Request is no longer open for acceptance");
  }

  const { data: acceptedBid, error: acceptBidErr } = await supabase
    .from("glatko_bids")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", bidId)
    .eq("service_request_id", requestId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (acceptBidErr) throw acceptBidErr;

  if (!acceptedBid?.id) {
    await supabase
      .from("glatko_service_requests")
      .update({
        status: previousStatus,
        assigned_bid_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("customer_id", customerId);
    throw new Error("This bid is no longer available");
  }

  const { error: rejectError } = await supabase
    .from("glatko_bids")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("service_request_id", requestId)
    .neq("id", bidId)
    .eq("status", "pending");

  if (rejectError) throw rejectError;

  if (rejectedBids && rejectedBids.length > 0) {
    const requestTitle = requestDetail?.title ?? "";
    const municipality = requestDetail?.municipality ?? "";
    await Promise.all(
      rejectedBids.map((rb) =>
        createNotification({
          user_id: rb.professional_id,
          type: "bid_rejected",
          title: "Your bid was not selected",
          body: `Another professional was chosen for "${requestTitle || "this request"}".`,
          data: {
            requestId,
            bidId: rb.id,
            requestTitle,
            municipality,
            categoryNames,
          },
        })
      )
    );
  }
}

export async function withdrawBid(bidId: string, professionalId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("glatko_bids")
    .update({ status: "withdrawn", updated_at: new Date().toISOString() })
    .eq("id", bidId)
    .eq("professional_id", professionalId)
    .eq("status", "pending");

  if (error) throw error;
}

// ─── G4: Messaging ───

export async function sendMessage(data: {
  conversation_id: string;
  sender_id: string;
  content: string;
  content_type?: "text" | "image" | "file";
  file_url?: string;
  /** System auto-replies (e.g. bid accepted line) should not notify the recipient again. */
  skipRecipientNotification?: boolean;
  /** Skip OpenAI translation (content is already in the recipient's language). */
  skipTranslation?: boolean;
  /** When skipTranslation, language code of `content` for display metadata. */
  forcedOriginalLocale?: string;
  /** When skipTranslation: DB `original_locale` (e.g. sender language for system lines). */
  original_locale?: string | null;
  /** When skipTranslation: precomputed translation for the recipient (e.g. bid-accepted pro copy). */
  translated_content?: string | null;
  translated_locale?: string | null;
}) {
  const supabase = createClient();

  const { data: conv, error: convErr } = await supabase
    .from("glatko_conversations")
    .select("customer_id, professional_id")
    .eq("id", data.conversation_id)
    .single();

  if (
    convErr ||
    !conv ||
    (conv.customer_id !== data.sender_id &&
      conv.professional_id !== data.sender_id)
  ) {
    throw new Error("Unauthorized");
  }

  const recipientId =
    conv.customer_id === data.sender_id
      ? conv.professional_id
      : conv.customer_id;

  const rate = await checkMessageSendRateLimit(data.sender_id);
  if (!rate.ok) {
    throw new Error(
      "You are sending messages too quickly. Please wait a moment.",
    );
  }

  const admin = createAdminClient();
  const [senderRes, recipientRes] = await Promise.all([
    admin
      .from("profiles")
      .select("preferred_locale")
      .eq("id", data.sender_id)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("preferred_locale")
      .eq("id", recipientId)
      .maybeSingle(),
  ]);

  const senderRaw =
    (senderRes.data?.preferred_locale as string | null | undefined)?.trim() ||
    "en";
  const recipientRaw =
    (recipientRes.data?.preferred_locale as string | null | undefined)?.trim() ||
    "en";
  const senderLocale =
    senderRaw.toLowerCase().split(/[-_]/)[0]?.slice(0, 16) || "en";
  const recipientLocale =
    recipientRaw.toLowerCase().split(/[-_]/)[0]?.slice(0, 16) || "en";

  const contentType = data.content_type || "text";
  let outgoingContent =
    typeof data.content === "string" ? data.content : "";

  if (contentType === "text") {
    outgoingContent = outgoingContent.trim();
    if (!outgoingContent) {
      throw new Error("Message cannot be empty");
    }
    if (outgoingContent.length > MAX_CHAT_MESSAGE_LENGTH) {
      outgoingContent = outgoingContent.slice(0, MAX_CHAT_MESSAGE_LENGTH);
    }
  } else if (outgoingContent.length > MAX_CHAT_MESSAGE_LENGTH) {
    outgoingContent = outgoingContent.slice(0, MAX_CHAT_MESSAGE_LENGTH);
  }

  let originalLocale: string | null = null;
  let translatedContent: string | null = null;
  let translatedLocale: string | null = null;

  if (data.skipTranslation) {
    const hasManualTranslation =
      data.translated_content != null &&
      String(data.translated_content).trim() !== "" &&
      data.translated_locale != null &&
      String(data.translated_locale).trim() !== "";

    if (hasManualTranslation) {
      translatedContent = String(data.translated_content).trim();
      translatedLocale =
        String(data.translated_locale)
          .trim()
          .toLowerCase()
          .split(/[-_]/)[0]
          ?.slice(0, 16) || recipientLocale.slice(0, 16);
      const origParam =
        data.original_locale?.trim() ||
        data.forcedOriginalLocale?.trim() ||
        senderRaw;
      originalLocale =
        origParam.toLowerCase().split(/[-_]/)[0]?.slice(0, 16) ||
        senderLocale.slice(0, 16);
    } else {
      const forced =
        data.original_locale?.trim().toLowerCase().split(/[-_]/)[0] ||
        data.forcedOriginalLocale?.trim().toLowerCase().split(/[-_]/)[0] ||
        senderLocale;
      originalLocale = forced.slice(0, 16);
      translatedContent = null;
      translatedLocale = null;
    }
  } else if (contentType === "text" && outgoingContent) {
    originalLocale = senderLocale.slice(0, 16);
    if (senderLocale !== recipientLocale) {
      try {
        const { translateMessage } = await import("@/lib/ai/translate-message");
        const result = await translateMessage(outgoingContent, recipientLocale);
        if (result) {
          translatedContent = result.translatedContent;
          translatedLocale = recipientLocale.slice(0, 16);
          if (result.detectedLocale !== "unknown") {
            originalLocale = result.detectedLocale.slice(0, 16);
          }
        }
      } catch (err) {
        console.error("[GLATKO:translate] translateMessage failed:", err);
        glatkoCaptureException(err, { module: "messaging-translate" });
      }
    }
  } else {
    originalLocale = senderLocale.slice(0, 16);
  }

  const insertRow: Record<string, unknown> = {
    conversation_id: data.conversation_id,
    sender_id: data.sender_id,
    content: outgoingContent,
    content_type: contentType,
    original_locale: originalLocale,
    translated_content: translatedContent,
    translated_locale: translatedLocale,
  };
  if (data.file_url !== undefined) {
    insertRow.file_url = data.file_url;
  }

  const { data: message, error } = await supabase
    .from("glatko_messages")
    .insert(insertRow)
    .select()
    .single();

  if (error) throw error;

  await supabase
    .from("glatko_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", data.conversation_id);

  if (!data.skipRecipientNotification) {
    const previewSource = translatedContent ?? outgoingContent;
    const bodyText =
      previewSource.length > 100
        ? `${previewSource.slice(0, 100)}…`
        : previewSource;

    await createNotification({
      user_id: recipientId,
      type: "message",
      title: "New message",
      body: bodyText,
      data: {
        conversationId: data.conversation_id,
        conversation_id: data.conversation_id,
        senderId: data.sender_id,
      },
    }).catch(() => {});
  }

  return message;
}

export async function getOrCreateConversation(data: {
  service_request_id: string;
  bid_id?: string;
  customer_id: string;
  professional_id: string;
}) {
  const supabase = createClient();

  const { data: existing } = await supabase
    .from("glatko_conversations")
    .select("*")
    .eq("service_request_id", data.service_request_id)
    .eq("customer_id", data.customer_id)
    .eq("professional_id", data.professional_id)
    .single();

  if (existing) return existing;

  const { data: conversation, error } = await supabase
    .from("glatko_conversations")
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return conversation;
}

// ─── G5: Review + Trust ───

export async function startJob(requestId: string, professionalId: string) {
  const supabase = createClient();

  const { data: request } = await supabase
    .from("glatko_service_requests")
    .select("assigned_bid_id, status")
    .eq("id", requestId)
    .single();

  if (!request || request.status !== "assigned") {
    throw new Error("Invalid request status");
  }

  const { data: bid } = await supabase
    .from("glatko_bids")
    .select("professional_id")
    .eq("id", request.assigned_bid_id)
    .single();

  if (bid?.professional_id !== professionalId) {
    throw new Error("Unauthorized");
  }

  const { error } = await supabase
    .from("glatko_service_requests")
    .update({ status: "in_progress", updated_at: new Date().toISOString() })
    .eq("id", requestId);

  if (error) throw error;
}

export async function completeJob(requestId: string, professionalId: string) {
  const supabase = createClient();

  const { data: request } = await supabase
    .from("glatko_service_requests")
    .select("assigned_bid_id, status")
    .eq("id", requestId)
    .single();

  if (!request || request.status !== "in_progress") {
    throw new Error("Invalid request status");
  }

  const { data: bid } = await supabase
    .from("glatko_bids")
    .select("professional_id")
    .eq("id", request.assigned_bid_id)
    .single();

  if (bid?.professional_id !== professionalId) {
    throw new Error("Unauthorized");
  }

  const { error } = await supabase
    .from("glatko_service_requests")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", requestId);

  if (error) throw error;
}

export async function createReview(data: {
  service_request_id: string;
  bid_id: string;
  reviewer_id: string;
  reviewee_id: string;
  reviewer_role: "customer" | "professional";
  overall_rating: number;
  quality_rating?: number;
  communication_rating?: number;
  punctuality_rating?: number;
  review_text?: string;
  photos?: string[];
}) {
  const supabase = createClient();
  const { data: review, error } = await supabase
    .from("glatko_reviews")
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return review;
}

export async function getReviewStatus(requestId: string, userId: string) {
  const supabase = createClient();

  const { data: myReview } = await supabase
    .from("glatko_reviews")
    .select("*")
    .eq("service_request_id", requestId)
    .eq("reviewer_id", userId)
    .single();

  const { data: otherReview } = await supabase
    .from("glatko_reviews")
    .select("id, is_published")
    .eq("service_request_id", requestId)
    .neq("reviewer_id", userId)
    .single();

  return {
    myReview: myReview || null,
    otherHasReviewed: !!otherReview,
    bothPublished: myReview?.is_published === true,
  };
}

export async function getPublishedReviews(
  professionalId: string,
  limit = 10,
  offset = 0
) {
  const supabase = createClient();
  const { data, error, count } = await supabase
    .from("glatko_reviews")
    .select(
      `*,
      reviewer:profiles!reviewer_id(full_name, avatar_url),
      service_request:glatko_service_requests!glatko_reviews_service_request_id_fkey(
        title,
        category:glatko_service_categories(name, icon)
      )`,
      { count: "exact" }
    )
    .eq("reviewee_id", professionalId)
    .eq("reviewer_role", "customer")
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return { reviews: data || [], total: count || 0 };
}

export async function calculateTrustBadges(
  professionalId: string
): Promise<string[]> {
  const supabase = createClient();
  const { data: profile } = await supabase
    .from("glatko_professional_profiles")
    .select(
      "is_verified, avg_rating, total_reviews, completed_jobs, created_at"
    )
    .eq("id", professionalId)
    .single();

  if (!profile) return [];

  const badges: string[] = [];

  if (profile.is_verified) badges.push("verified");

  if (profile.avg_rating >= 4.8 && profile.completed_jobs >= 10) {
    badges.push("top_pro");
  }

  if (profile.completed_jobs >= 20) badges.push("experienced");

  const createdAt = new Date(profile.created_at);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  if (createdAt > thirtyDaysAgo && profile.total_reviews === 0) {
    badges.push("new_pro");
  }

  return badges;
}

// ─── G6: Notifications ───

export async function createNotification(data: {
  user_id: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const admin = createAdminClient();

  const { data: recipient, error: profileErr } = await admin
    .from("profiles")
    .select("id, is_active, is_deleted")
    .eq("id", data.user_id)
    .maybeSingle();

  if (profileErr) {
    console.error(
      "[GLATKO:notifications] recipient profile lookup failed:",
      profileErr.message,
    );
    return;
  }
  if (
    !recipient ||
    recipient.is_deleted === true ||
    recipient.is_active === false
  ) {
    console.warn(
      "[GLATKO:notifications] skip notification for missing/inactive/deleted user",
      data.user_id,
    );
    return;
  }

  // ── In-app dedup (Faz 0-A) ──────────────────────────────────────────────
  // High-frequency message / thread_message notifications: suppress a NEW
  // in-app row when one for the same conversation/thread already exists in the
  // last 5 minutes. Guards BOTH the action path and the notifyNewMessages cron
  // (re-activated by migration 054) from flooding the notification bell.
  //
  // The email-side equivalent in lib/email/dispatch.ts counts AFTER the row is
  // inserted (threshold `> 1`); here we run BEFORE the insert, so any existing
  // same-key row in the window means skip — net effect is identical: ≤ 1 row
  // per conversation/thread per 5 min. Only message / thread_message are
  // deduped; every other notification type always inserts.
  if (data.type === "message" || data.type === "thread_message") {
    const payload = data.data;
    const dedupeKey =
      data.type === "message"
        ? String(payload?.conversationId ?? payload?.conversation_id ?? "").trim()
        : String(payload?.threadId ?? payload?.thread_id ?? "").trim();

    if (dedupeKey) {
      const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recentRows } = await admin
        .from("glatko_notifications")
        .select("id, data")
        .eq("user_id", data.user_id)
        .eq("type", data.type)
        .gte("created_at", since);

      const alreadyNotified = (recentRows ?? []).some((row) => {
        const rowData = row.data as Record<string, unknown> | null;
        const key =
          data.type === "message"
            ? String(
                rowData?.conversationId ?? rowData?.conversation_id ?? "",
              ).trim()
            : String(rowData?.threadId ?? rowData?.thread_id ?? "").trim();
        return key === dedupeKey;
      });

      if (alreadyNotified) {
        return;
      }
    }
  }

  const { error } = await admin.from("glatko_notifications").insert(data);
  if (error) {
    console.error("[GLATKO:notifications] createNotification insert failed:", error);
    return;
  }

  // Faz 2-A: external-channel (SMS/Viber/WhatsApp) dispatch — fire-and-forget,
  // AFTER the in-app row so it never blocks/breaks in-app. Off by default (env
  // kill-switch). Talks to the Infobip Messages API directly — NEVER through the
  // email provider (no recursion). Chat messages are skipped here (delivered by
  // the unread-gated cron in Faz 2-C).
  void dispatchExternalNotification({
    user_id: data.user_id,
    type: data.type,
    title: data.title,
    body: data.body,
    data: data.data,
  }).catch(() => {});

  try {
    await dispatchNotificationEmail({
      userId: data.user_id,
      type: data.type,
      data: data.data,
      title: data.title,
      body: data.body,
    });
  } catch (err) {
    console.error("[GLATKO:dispatch] createNotification email hook failed:", err);
    glatkoCaptureException(err, { module: "create-notification-email" });
  }
}

type GlatkoServerSupabase = ReturnType<typeof createClient>;

export async function getUserNotifications(
  userId: string,
  limit = 20,
  unreadOnly = false,
  /** Same request-scoped client as `auth.getUser()` so JWT refresh applies to the SELECT. */
  supabaseArg?: GlatkoServerSupabase,
) {
  const supabase = supabaseArg ?? createClient();
  let query = supabase
    .from("glatko_notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.is("read_at", null);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[GLATKO:notifications] getUserNotifications failed:", error);
    return [];
  }
  return data || [];
}

export async function markNotificationRead(
  notificationId: string,
  userId: string,
  supabaseArg?: GlatkoServerSupabase,
) {
  const supabase = supabaseArg ?? createClient();
  const { error } = await supabase
    .from("glatko_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function markAllNotificationsRead(
  userId: string,
  supabaseArg?: GlatkoServerSupabase,
) {
  const supabase = supabaseArg ?? createClient();
  const { error } = await supabase
    .from("glatko_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
}

export async function getUnreadNotificationCount(
  userId: string,
  supabaseArg?: GlatkoServerSupabase,
) {
  const supabase = supabaseArg ?? createClient();
  const { count, error } = await supabase
    .from("glatko_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) {
    console.error("[GLATKO:notifications] getUnreadNotificationCount failed:", error);
    return 0;
  }
  return count || 0;
}

// ─── G7: Search + Discovery ───

/**
 * For a given category id, return [id] for sub-categories or
 * [id, ...all-children-ids] for root categories. Wizard inserts pro_services
 * junctions at the sub-category level (the cards in StepServiceAreas only
 * expose sub-checkboxes), so a root-category page that filtered by exact
 * category_id alone would never see those pros — only the rare anomaly of
 * a junction inserted at the root level (e.g. OttoWin's manual seed) would
 * match. Used by searchProfessionals, getCategoryWithStats, and
 * getCitiesServingCategory.
 */
async function expandRootCategoryIds(
  supabase: ReturnType<typeof createClient>,
  categoryId: string,
): Promise<string[]> {
  const { data: cat } = await supabase
    .from("glatko_service_categories")
    .select("id, parent_id")
    .eq("id", categoryId)
    .maybeSingle();
  if (!cat) return [categoryId];
  if (cat.parent_id) return [categoryId];
  const { data: subs } = await supabase
    .from("glatko_service_categories")
    .select("id")
    .eq("parent_id", categoryId)
    .eq("is_active", true);
  if (!subs || subs.length === 0) return [categoryId];
  return [categoryId, ...subs.map((s) => s.id as string)];
}

export async function searchProfessionals(params: {
  locale: string;
  categorySlug?: string;
  city?: string;
  minRating?: number;
  languages?: string[];
  query?: string;
  sortBy?: "rating" | "reviews" | "newest" | "jobs";
  page?: number;
  limit?: number;
}) {
  const supabase = createClient();
  const { page = 1, limit = 12 } = params;
  const offset = (page - 1) * limit;

  let q = supabase
    .from("glatko_professional_profiles")
    .select(
      `*,
      profile:profiles!id(full_name, avatar_url),
      services:glatko_pro_services(
        category:glatko_service_categories(id, slug, name, icon)
      )`,
      { count: "exact" }
    )
    .eq("is_active", true)
    .eq("is_verified", true);

  if (params.categorySlug) {
    const { data: cat } = await supabase
      .from("glatko_service_categories")
      .select("id")
      .eq("slug", params.categorySlug)
      .single();

    if (cat) {
      const categoryIds = await expandRootCategoryIds(supabase, cat.id as string);
      const { data: proIds } = await supabase
        .from("glatko_pro_services")
        .select("professional_id")
        .in("category_id", categoryIds);

      if (proIds && proIds.length > 0) {
        q = q.in(
          "id",
          proIds.map((p) => p.professional_id)
        );
      } else {
        return { professionals: [], total: 0, page, totalPages: 0 };
      }
    }
  }

  if (params.city) {
    q = q.eq("location_city", params.city);
  }

  if (params.minRating) {
    q = q.gte("avg_rating", params.minRating);
  }

  if (params.languages && params.languages.length > 0) {
    q = q.overlaps("languages", params.languages);
  }

  switch (params.sortBy) {
    case "rating":
      q = q.order("avg_rating", { ascending: false });
      break;
    case "reviews":
      q = q.order("total_reviews", { ascending: false });
      break;
    case "jobs":
      q = q.order("completed_jobs", { ascending: false });
      break;
    case "newest":
    default:
      q = q.order("created_at", { ascending: false });
      break;
  }

  q = q.range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) throw error;

  return {
    professionals: data || [],
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  };
}

export async function getCategoryWithStats(slug: string) {
  const supabase = createClient();

  const { data: category } = await supabase
    .from("glatko_service_categories")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!category) return null;

  const { data: children } = await supabase
    .from("glatko_service_categories")
    .select("*")
    .eq("parent_id", category.id)
    .eq("is_active", true)
    .order("sort_order");

  // Same root/sub semantics as searchProfessionals: root pages must count
  // pros offering ANY sub-category of this root, not just the ones with a
  // junction at the root id.
  const categoryIdsForCount = await expandRootCategoryIds(
    supabase,
    category.id as string,
  );
  const { count: proCount } = await supabase
    .from("glatko_pro_services")
    .select("professional_id", { count: "exact", head: true })
    .in("category_id", categoryIdsForCount);

  return {
    ...category,
    children: children || [],
    proCount: proCount || 0,
  };
}

// ─── G-CAT-4: SEO helpers ───

interface ParentCategorySlim {
  slug: string;
  name: Record<string, string>;
}

/**
 * Loaded for category detail JSON-LD: the category itself plus a slim
 * `parent` projection so breadcrumbs can include the root.
 */
export async function getCategoryBySlug(slug: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("glatko_service_categories")
    .select(
      "id, slug, parent_id, name, description, hero_image_url, seasonal, faqs, parent:parent_id (slug, name)",
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (error || !data) return null;

  // Supabase query builder may inline the FK relation as either an object
  // or a single-element array depending on schema; normalise both.
  const parentRel = data.parent as
    | ParentCategorySlim
    | ParentCategorySlim[]
    | null;
  const parent = Array.isArray(parentRel) ? parentRel[0] ?? null : parentRel;

  return {
    id: data.id as string,
    slug: data.slug as string,
    parent_id: data.parent_id as string | null,
    name: data.name as Record<string, string>,
    description: data.description as Record<string, string> | null,
    hero_image_url: data.hero_image_url as string | null,
    seasonal: data.seasonal as string | null,
    faqs: (data.faqs as Array<{
      q: Record<string, string>;
      a: Record<string, string>;
    }> | null) ?? [],
    parent_slug: parent?.slug ?? null,
    parent_name: parent?.name ?? null,
  };
}

/**
 * Sub-categories of a given root, ordered by sort_order. Same shape as
 * `getCategoryWithStats(...).children` but exported separately so SEO
 * pages can fetch only what they need.
 */
export async function getSubCategories(parentId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("glatko_service_categories")
    .select("id, slug, name, hero_image_url")
    .eq("parent_id", parentId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return data ?? [];
}

/**
 * All active categories used to drive the dynamic sitemap. Returns the
 * minimum projection (slug, parent_id, created_at, name) so the sitemap
 * function can `lastModified`-stamp each row. The schema has no
 * `updated_at`, so we surface the row's creation timestamp.
 */
export async function getAllActiveCategories() {
  const supabase = createClient();
  const { data } = await supabase
    .from("glatko_service_categories")
    .select("id, slug, parent_id, name, description, created_at")
    .eq("is_active", true);
  return (data ?? []) as Array<{
    id: string;
    slug: string;
    parent_id: string | null;
    name: Record<string, string>;
    description: Record<string, string> | null;
    created_at: string | null;
  }>;
}

/**
 * Set of service-category ids that have at least one approved + active
 * provider (G-SEO-FIX-1 / A1). Queried from the profile side — where the
 * approved+active filter lives — embedding each provider's pro_services
 * category links, so it stays a single round-trip (no N+1). The sitemap uses
 * this to drop empty leaf sub-categories (Phase 1: sitemap-exclude only, NO
 * noindex). "approved+active" mirrors getProfessionalsForSitemap exactly.
 */
export async function getApprovedProviderCategoryIds(): Promise<Set<string>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("glatko_professional_profiles")
    .select("id, glatko_pro_services(category_id)")
    .eq("is_active", true)
    .eq("verification_status", "approved");
  const ids = new Set<string>();
  if (error || !data) return ids;
  for (const pro of data as Array<{
    glatko_pro_services?: { category_id: string | null }[] | null;
  }>) {
    for (const svc of pro.glatko_pro_services ?? []) {
      if (svc.category_id) ids.add(svc.category_id);
    }
  }
  return ids;
}

/**
 * Distinct `location_city` values for active+verified pros that offer the
 * given category, used as the dynamic part of `Service.areaServed` /
 * `LocalBusiness.areaServed`. Returns [] when no verified pro is yet
 * advertising — caller falls back to the 6 default Karadağ cities.
 */
export async function getCitiesServingCategory(
  categoryId: string,
): Promise<string[]> {
  const supabase = createClient();
  // Same root/sub semantics as searchProfessionals: a root category's
  // areaServed should include cities from pros offering any sub-category.
  const categoryIds = await expandRootCategoryIds(supabase, categoryId);
  const { data, error } = await supabase
    .from("glatko_pro_services")
    .select(
      "professional:professional_id!inner(location_city, is_active, is_verified)",
    )
    .in("category_id", categoryIds)
    .eq("professional.is_active", true)
    .eq("professional.is_verified", true);

  if (error || !data) return [];

  const cities = new Set<string>();
  for (const row of data as Array<{
    professional:
      | { location_city: string | null }
      | Array<{ location_city: string | null }>
      | null;
  }>) {
    const rel = row.professional;
    const profile = Array.isArray(rel) ? rel[0] : rel;
    const city = profile?.location_city;
    if (city && typeof city === "string" && city.trim().length > 0) {
      cities.add(city.trim());
    }
  }
  return Array.from(cities);
}

export async function getSearchSuggestions(searchQuery: string, locale: string) {
  const supabase = createClient();
  const results: { type: string; label: string; slug: string }[] = [];

  const { data: categories } = await supabase
    .from("glatko_service_categories")
    .select("slug, name")
    .eq("is_active", true);

  if (categories) {
    for (const cat of categories) {
      const nameObj = cat.name as Record<string, string> | null;
      const name = nameObj?.[locale] || nameObj?.["en"] || "";
      if (name.toLowerCase().includes(searchQuery.toLowerCase())) {
        results.push({ type: "category", label: name, slug: cat.slug });
      }
    }
  }

  const { data: pros } = await supabase
    .from("glatko_professional_profiles")
    .select("id, business_name, profile:profiles!id(full_name)")
    .eq("is_active", true)
    .eq("is_verified", true)
    .limit(5);

  if (pros) {
    for (const pro of pros) {
      const profileData = pro.profile as unknown as { full_name: string } | null;
      const name = pro.business_name || profileData?.full_name || "";
      if (name.toLowerCase().includes(searchQuery.toLowerCase())) {
        results.push({ type: "professional", label: name, slug: pro.id });
      }
    }
  }

  return results.slice(0, 8);
}

// ─── G-CAT-3: Premium hybrid search (RPC) ───

interface GlatkoSearchRow {
  result_type: "category" | "professional";
  result_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  hero_image_url: string | null;
  rating: number | null;
  review_count: number | null;
  city: string | null;
  similarity_score: number;
  match_type: "direct" | "synonym";
}

function mapSearchRow(row: GlatkoSearchRow): SearchResult {
  return {
    type: row.result_type,
    id: row.result_id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle ?? "",
    heroImageUrl: row.hero_image_url,
    rating: row.rating,
    reviewCount: row.review_count,
    city: row.city,
    similarityScore: row.similarity_score,
    matchType: row.match_type,
  };
}

/**
 * Premium hybrid search via 016 RPC (trgm fuzzy + 9-lang synonyms).
 * Returns categories and professionals interleaved by relevance, split here
 * for the UI grouping. q < 2 chars returns empty.
 */
export async function glatkoSearch(
  q: string,
  locale: string,
  maxCategories = 5,
  maxProfessionals = 5,
): Promise<SearchResponse> {
  if (!q || q.trim().length < 2) {
    return { categories: [], professionals: [] };
  }
  const supabase = createClient();
  const { data, error } = await supabase.rpc("glatko_search", {
    q,
    loc: locale,
    max_categories: maxCategories,
    max_professionals: maxProfessionals,
  });
  if (error || !data) return { categories: [], professionals: [] };

  const rows = data as GlatkoSearchRow[];
  const categories: SearchResult[] = [];
  const professionals: SearchResult[] = [];
  for (const r of rows) {
    const mapped = mapSearchRow(r);
    if (r.result_type === "category") categories.push(mapped);
    else professionals.push(mapped);
  }

  // Founding provider plumbing (G-LAUNCH-POLISH-01): the `glatko_search` RPC
  // does not return is_founding_provider / founding_provider_number, so we
  // backfill them in a single bounded query (max 5 ids) before returning.
  // Migrating the RPC would be a separate sprint; this overhead is one
  // index lookup per search and stays under the autocomplete latency budget.
  if (professionals.length > 0) {
    const proIds = professionals.map((p) => p.id);
    const { data: foundingRows } = await supabase
      .from("glatko_professional_profiles")
      .select("id, is_founding_provider, founding_provider_number")
      .in("id", proIds);
    if (foundingRows) {
      const byId = new Map(
        foundingRows.map((r) => [
          r.id as string,
          {
            isFounding: Boolean(r.is_founding_provider),
            number: (r.founding_provider_number as number | null) ?? null,
          },
        ]),
      );
      for (const p of professionals) {
        const f = byId.get(p.id);
        if (f) {
          p.isFoundingProvider = f.isFounding;
          p.foundingProviderNumber = f.number;
        }
      }
    }
  }

  return { categories, professionals };
}

interface GlatkoTrendingRow {
  result_id: string;
  slug: string;
  title: string;
  hero_image_url: string | null;
  badge_priority: number | null;
}

/** Top P0 root categories for empty-state. */
export async function glatkoTrendingCategories(
  locale: string,
  maxResults = 8,
): Promise<TrendingCategory[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("glatko_trending_categories", {
    loc: locale,
    max_results: maxResults,
  });
  if (error || !data) return [];
  return (data as GlatkoTrendingRow[]).map((r) => ({
    id: r.result_id,
    slug: r.slug,
    title: r.title,
    heroImageUrl: r.hero_image_url,
    badgePriority: r.badge_priority,
  }));
}

// ─── G-CAT-3: Recent searches (logged-in users) ───

interface RecentSearchRow {
  id: string;
  query: string;
  locale: string;
  result_clicked: RecentSearchClickType | null;
  result_slug: string | null;
  searched_at: string;
}

/** Read current user's recent searches (RLS owner-only). */
export async function glatkoGetRecentSearches(
  limit = 8,
): Promise<RecentSearch[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("glatko_user_recent_searches")
    .select("id, query, locale, result_clicked, result_slug, searched_at")
    .eq("user_id", user.id)
    .order("searched_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  return (data as RecentSearchRow[]).map((r) => ({
    id: r.id,
    query: r.query,
    locale: r.locale,
    resultClicked: r.result_clicked,
    resultSlug: r.result_slug,
    searchedAt: r.searched_at,
  }));
}

/** Insert a recent search row for current user. Anonymous => no-op. */
export async function glatkoLogRecentSearch(input: {
  query: string;
  locale: string;
  resultClicked?: RecentSearchClickType | null;
  resultSlug?: string | null;
}): Promise<void> {
  const trimmed = input.query.trim();
  if (trimmed.length < 2) return;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("glatko_user_recent_searches").insert({
    user_id: user.id,
    query: trimmed,
    locale: input.locale,
    result_clicked: input.resultClicked ?? null,
    result_slug: input.resultSlug ?? null,
  });
}

/** Delete one recent search entry (owner-only via RLS). */
export async function glatkoDeleteRecentSearch(id: string): Promise<void> {
  const supabase = createClient();
  await supabase.from("glatko_user_recent_searches").delete().eq("id", id);
}

/** Clear all recent searches for current user. */
export async function glatkoClearRecentSearches(): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("glatko_user_recent_searches").delete().eq("user_id", user.id);
}

// ─── G8: Pro Dashboard Analytics ───

export async function getProAnalytics(professionalId: string) {
  const supabase = createClient();

  const { data: profile } = await supabase
    .from("glatko_professional_profiles")
    .select("avg_rating, total_reviews, completed_jobs, created_at")
    .eq("id", professionalId)
    .single();

  const { data: acceptedBids } = await supabase
    .from("glatko_bids")
    .select("price, price_type, created_at")
    .eq("professional_id", professionalId)
    .eq("status", "accepted");

  const totalEarnings = (acceptedBids || []).reduce(
    (sum, bid) => sum + Number(bid.price),
    0
  );

  const monthlyEarnings: { month: string; earnings: number; jobs: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const nextDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const monthBids = (acceptedBids || []).filter((b) => {
      const d = new Date(b.created_at);
      return d >= date && d < nextDate;
    });
    monthlyEarnings.push({
      month: date.toLocaleString("default", { month: "short", year: "2-digit" }),
      earnings: monthBids.reduce((s, b) => s + Number(b.price), 0),
      jobs: monthBids.length,
    });
  }

  const { count: pendingBids } = await supabase
    .from("glatko_bids")
    .select("id", { count: "exact", head: true })
    .eq("professional_id", professionalId)
    .eq("status", "pending");

  const { count: activeJobs } = await supabase
    .from("glatko_bids")
    .select("id", { count: "exact", head: true })
    .eq("professional_id", professionalId)
    .eq("status", "accepted");

  const { data: recentReviews } = await supabase
    .from("glatko_reviews")
    .select("overall_rating, created_at")
    .eq("reviewee_id", professionalId)
    .eq("reviewer_role", "customer")
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(20);

  return {
    profile,
    totalEarnings,
    monthlyEarnings,
    pendingBids: pendingBids || 0,
    activeJobs: activeJobs || 0,
    recentReviews: recentReviews || [],
  };
}

export async function getProAvailability(professionalId: string) {
  const supabase = createClient();

  const { data: weekly } = await supabase
    .from("glatko_availability")
    .select("*")
    .eq("professional_id", professionalId)
    .order("day_of_week");

  const { data: exceptions } = await supabase
    .from("glatko_availability_exceptions")
    .select("*")
    .eq("professional_id", professionalId)
    .gte("date", new Date().toISOString().split("T")[0])
    .order("date");

  return { weekly: weekly || [], exceptions: exceptions || [] };
}

export async function updateProAvailability(
  professionalId: string,
  day: number,
  startTime: string,
  endTime: string,
  isAvailable: boolean
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("glatko_availability")
    .upsert(
      {
        professional_id: professionalId,
        day_of_week: day,
        start_time: startTime,
        end_time: endTime,
        is_available: isAvailable,
      },
      { onConflict: "professional_id,day_of_week" }
    );
  if (error) throw error;
}

export async function upsertAvailabilityException(
  professionalId: string,
  date: string,
  isAvailable: boolean,
  note?: string
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("glatko_availability_exceptions")
    .upsert(
      { professional_id: professionalId, date, is_available: isAvailable, note },
      { onConflict: "professional_id,date" }
    );
  if (error) throw error;
}

export async function getProPackages(professionalId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("glatko_service_packages")
    .select(
      `*, category:glatko_service_categories(id, slug, name, icon)`
    )
    .eq("professional_id", professionalId)
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return data || [];
}

export async function createProPackage(data: {
  professional_id: string;
  category_id?: string;
  name: string;
  description?: string;
  price: number;
  price_type: "fixed" | "starting_at";
  estimated_duration_hours?: number;
  includes?: string[];
}) {
  const supabase = createClient();
  const { data: pkg, error } = await supabase
    .from("glatko_service_packages")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return pkg;
}

export async function updateProPackage(
  packageId: string,
  professionalId: string,
  updates: Partial<{
    name: string;
    description: string;
    price: number;
    price_type: string;
    estimated_duration_hours: number;
    includes: string[];
    is_active: boolean;
    sort_order: number;
  }>
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("glatko_service_packages")
    .update(updates)
    .eq("id", packageId)
    .eq("professional_id", professionalId);
  if (error) throw error;
}

export async function deleteProPackage(
  packageId: string,
  professionalId: string
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("glatko_service_packages")
    .update({ is_active: false })
    .eq("id", packageId)
    .eq("professional_id", professionalId);
  if (error) throw error;
}

export async function getProfileCompleteness(
  professionalId: string
): Promise<{ score: number; missing: string[] }> {
  const supabase = createClient();
  const { data: pro } = await supabase
    .from("glatko_professional_profiles")
    .select("*")
    .eq("id", professionalId)
    .single();

  if (!pro) return { score: 0, missing: ["profile"] };

  const checks = [
    { field: "bio", label: "bio" },
    { field: "phone", label: "phone" },
    { field: "location_city", label: "city" },
    { field: "years_experience", label: "experience" },
    { field: "hourly_rate_min", label: "rate" },
  ];

  const missing: string[] = [];
  let filled = 0;

  for (const check of checks) {
    if (pro[check.field as keyof typeof pro]) {
      filled++;
    } else {
      missing.push(check.label);
    }
  }

  if (pro.portfolio_images && (pro.portfolio_images as string[]).length > 0) {
    filled++;
  } else {
    missing.push("portfolio");
  }

  if (pro.languages && (pro.languages as string[]).length > 1) {
    filled++;
  } else {
    missing.push("languages");
  }

  const total = checks.length + 2;
  return { score: Math.round((filled / total) * 100), missing };
}

export async function updateProfessionalProfile(
  professionalId: string,
  updates: Partial<{
    business_name: string;
    bio: string;
    phone: string;
    location_city: string;
    languages: string[];
    years_experience: number;
    hourly_rate_min: number;
    hourly_rate_max: number;
    portfolio_images: string[];
  }>
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("glatko_professional_profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", professionalId);
  if (error) throw error;
}
