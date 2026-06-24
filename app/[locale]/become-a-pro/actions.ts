"use server";

import { z } from "zod";

import { getTranslations } from "next-intl/server";

import { createClient, createAdminClient } from "@/supabase/server";
import { sendAdminProApplicationEmail } from "@/lib/email/pro-emails";
import { glatkoCaptureException } from "@/lib/sentry/glatko-capture";

interface FormState {
  success: boolean;
  error?: string;
}

const PROFILE_BASE_FIELDS = z.object({
  businessName: z.string().min(1).max(120),
  bio: z.string().max(2000).optional(),
  phone: z.string().min(4).max(40),
  city: z.string().min(1).max(80),
  yearsExperience: z.coerce.number().min(0).max(80).optional(),
  hourlyRateMin: z.coerce.number().min(0).max(10000).optional(),
  hourlyRateMax: z.coerce.number().min(0).max(10000).optional(),
  serviceRadiusKm: z.coerce.number().min(5).max(100).default(25),
  insuranceStatus: z
    .enum(["none", "private", "business", "professional"])
    .default("none"),
  introductionVideoUrl: z.preprocess(
    (v) => {
      if (typeof v !== "string") return v;
      const trimmed = v.trim();
      if (!trimmed) return "";
      if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
      return trimmed;
    },
    z.string().url().optional().or(z.literal("")),
  ),
});

interface PortfolioInput {
  url: string;
  type: string;
  name: string;
  uploaded_at: string;
  path: string;
}

interface PricingInput {
  type: "hourly" | "fixed" | "per_unit";
  baseRate: string;
  currency: "EUR";
}

/**
 * G-PRO-1 Faz 6 — Pro onboarding submission.
 *
 * Writes:
 *   1. glatko_professional_profiles (upsert with new columns)
 *   2. glatko_pro_services (one per category, primary flag)
 *   3. glatko_pro_application_answers (one row per root category slug)
 *   4. profile_completion_score (RPC, persisted on profile)
 *
 * Fires admin notification email post-success (best-effort, never blocks
 * the success path). User-facing approve/reject mailers fire from
 * /admin/professionals/actions.ts when admin moderates.
 */
export async function submitProfessionalApplication(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations("becomePro.errors");
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: t("auth") };

  // Avatar is OPTIONAL (G-FUNNEL): it is persisted independently via
  // updateAvatar (scoped to the user's own storage path), so the submit
  // neither writes nor gates on it. The old hard "Avatar required" guard
  // stranded every pro who had no photo yet (e.g. OAuth users without a
  // Google picture) — they could not pass step 0, so nothing was ever
  // written. A missing photo is now surfaced as a soft "add a photo" nudge.

  // Parse + validate base profile fields
  const baseRaw = {
    businessName: String(formData.get("businessName") ?? "").trim(),
    bio: (String(formData.get("bio") ?? "") || undefined) ?? undefined,
    phone: String(formData.get("phone") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    yearsExperience:
      formData.get("yearsExperience") === ""
        ? undefined
        : formData.get("yearsExperience"),
    hourlyRateMin:
      formData.get("hourlyRateMin") === ""
        ? undefined
        : formData.get("hourlyRateMin"),
    hourlyRateMax:
      formData.get("hourlyRateMax") === ""
        ? undefined
        : formData.get("hourlyRateMax"),
    serviceRadiusKm: formData.get("serviceRadiusKm"),
    insuranceStatus: formData.get("insuranceStatus") || "none",
    introductionVideoUrl: String(formData.get("introductionVideoUrl") ?? ""),
  };
  const parsed = PROFILE_BASE_FIELDS.safeParse(baseRaw);
  if (!parsed.success) {
    return { success: false, error: t("validation") };
  }

  // Coerce to canonical lowercase at the write site: this is the path that
  // historically stored uppercase codes, and it bypasses the Zod schema
  // (languages is read raw from FormData, not from parsed.data).
  const languages = (formData.getAll("languages") as string[]).map((l) =>
    l.toLowerCase(),
  );
  const categoryIds = formData.getAll("categoryIds") as string[];
  const primaryCategoryId = String(
    formData.get("primaryCategoryId") ?? "",
  ).trim();

  if (categoryIds.length === 0) {
    return { success: false, error: t("selectService") };
  }
  if (!primaryCategoryId || !categoryIds.includes(primaryCategoryId)) {
    return { success: false, error: t("pickPrimary") };
  }

  // JSON fields: applicationAnswers, portfolioImages, pricingModel,
  // companyDocuments. All optional; default to empty.
  let applicationAnswers: Record<string, Record<string, unknown>> = {};
  try {
    const raw = String(formData.get("applicationAnswers") ?? "{}");
    applicationAnswers = JSON.parse(raw);
  } catch {
    applicationAnswers = {};
  }

  let portfolioImages: string[] = [];
  try {
    const raw = String(formData.get("portfolioImages") ?? "[]");
    portfolioImages = JSON.parse(raw) as string[];
  } catch {
    portfolioImages = [];
  }
  if (!Array.isArray(portfolioImages)) portfolioImages = [];

  let pricingModel: PricingInput | null = null;
  try {
    const raw = String(formData.get("pricingModel") ?? "");
    if (raw) {
      const p = JSON.parse(raw) as PricingInput;
      if (p && p.type && p.baseRate) {
        pricingModel = p;
      }
    }
  } catch {
    pricingModel = null;
  }

  let companyDocuments: PortfolioInput[] = [];
  try {
    const raw = String(formData.get("companyDocuments") ?? "[]");
    companyDocuments = JSON.parse(raw) as PortfolioInput[];
  } catch {
    companyDocuments = [];
  }
  if (!Array.isArray(companyDocuments)) companyDocuments = [];

  // Use admin client for the writes — RLS would force us to write through
  // owner-match policies which work fine, but admin client lets us also
  // set is_active=true and manage child tables in one go without
  // surprising policy interactions.
  const admin = createAdminClient();

  const profilePayload: Record<string, unknown> = {
    id: user.id,
    business_name: parsed.data.businessName,
    bio: parsed.data.bio ?? null,
    phone: parsed.data.phone,
    location_city: parsed.data.city,
    languages: languages.length > 0 ? languages : ["en"],
    years_experience: parsed.data.yearsExperience ?? null,
    hourly_rate_min: parsed.data.hourlyRateMin ?? null,
    hourly_rate_max: parsed.data.hourlyRateMax ?? null,
    service_radius_km: parsed.data.serviceRadiusKm ?? 25,
    insurance_status: parsed.data.insuranceStatus,
    introduction_video_url:
      parsed.data.introductionVideoUrl &&
      parsed.data.introductionVideoUrl.length > 0
        ? parsed.data.introductionVideoUrl
        : null,
    portfolio_images: portfolioImages,
    company_documents: companyDocuments,
    pricing_model: pricingModel,
    verification_status: "pending",
    is_active: true,
    is_verified: false,
  };

  const { error: profileWriteErr } = await admin
    .from("glatko_professional_profiles")
    .upsert(profilePayload, { onConflict: "id" });

  if (profileWriteErr) {
    glatkoCaptureException(new Error(profileWriteErr.message), {
      module: "become-a-pro/actions",
      op: "profile_upsert",
      professionalId: user.id,
    });
    return { success: false, error: t("generic") };
  }

  // Replace pro_services rows for this user (full overwrite — wizard
  // submit is the canonical state of the pro's category selections).
  await admin
    .from("glatko_pro_services")
    .delete()
    .eq("professional_id", user.id);

  if (categoryIds.length > 0) {
    const serviceRows = categoryIds.map((catId) => ({
      professional_id: user.id,
      category_id: catId,
      is_primary: catId === primaryCategoryId,
    }));
    const { error: servicesErr } = await admin
      .from("glatko_pro_services")
      .insert(serviceRows);
    if (servicesErr) {
      glatkoCaptureException(new Error(servicesErr.message), {
        module: "become-a-pro/actions",
        op: "services_insert",
        professionalId: user.id,
      });
      return { success: false, error: t("generic") };
    }
  }

  // Replace application_answers rows for this user
  await admin
    .from("glatko_pro_application_answers")
    .delete()
    .eq("professional_id", user.id);

  const answerRows = Object.entries(applicationAnswers)
    .filter(([, ans]) => ans && Object.keys(ans).length > 0)
    .map(([slug, ans]) => ({
      professional_id: user.id,
      category_slug: slug,
      answers: ans,
    }));
  if (answerRows.length > 0) {
    const { error: answersErr } = await admin
      .from("glatko_pro_application_answers")
      .insert(answerRows);
    if (answersErr) {
      glatkoCaptureException(new Error(answersErr.message), {
        module: "become-a-pro/actions",
        op: "answers_insert",
        professionalId: user.id,
      });
      return { success: false, error: t("generic") };
    }
  }

  // Compute profile completion score via RPC and persist on the row.
  const { data: scoreData } = await admin.rpc(
    "glatko_calculate_profile_completion",
    { p_professional_id: user.id },
  );
  const score = typeof scoreData === "number" ? scoreData : 0;
  await admin
    .from("glatko_professional_profiles")
    .update({ profile_completion_score: score })
    .eq("id", user.id);

  // Resolve service labels for the admin email
  let serviceLabels: string[] = [];
  if (categoryIds.length > 0) {
    const { data: cats } = await admin
      .from("glatko_service_categories")
      .select("id, name")
      .in("id", categoryIds);
    serviceLabels = (cats ?? []).map((c) => {
      const n = c.name as Record<string, string> | null | undefined;
      return n?.en ?? n?.me ?? "(unnamed)";
    });
  }

  // Fire-and-forget admin notification email
  void sendAdminProApplicationEmail({
    professionalId: user.id,
    professionalName: parsed.data.businessName,
    professionalEmail: user.email ?? "(no email)",
    city: parsed.data.city,
    serviceLabels,
    completionScore: score,
  }).catch((err) => {
    glatkoCaptureException(err, {
      module: "become-a-pro/actions",
      op: "admin_pending_email",
      professionalId: user.id,
    });
  });

  return { success: true };
}
