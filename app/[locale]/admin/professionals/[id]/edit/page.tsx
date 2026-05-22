// Form fields are TR-hardcoded (admin panel i18n policy, see
// TODO(i18n-b4)); the page chrome (breadcrumb, title, banner) IS i18n.
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { createAdminClient } from "@/supabase/server";
import { loadCategoryOptions } from "@/lib/admin/loadCategoryOptions";
import {
  ProviderCreateForm,
  type EditInitialData,
} from "@/components/admin/providers/ProviderCreateForm";
import type { SubscriptionPlan } from "@/components/admin/providers/SubscriptionFields";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ locale: string; id: string }> | { locale: string; id: string };
}

type ProRow = {
  id: string;
  slug: string | null;
  business_name: string | null;
  bio: string | null;
  phone: string | null;
  location_city: string | null;
  hourly_rate_min: number | null;
  hourly_rate_max: number | null;
  years_experience: number | null;
  service_radius_km: number | null;
  languages: string[] | null;
  verification_tier: "basic" | "business" | "professional" | null;
  is_active: boolean | null;
  admin_notes: string | null;
  subscription_plan: SubscriptionPlan | null;
  subscription_started_at: string | null;
  subscription_end_date: string | null;
  portfolio_images: string[] | null;
};

async function loadEditInitialData(
  providerId: string,
): Promise<EditInitialData | null> {
  const admin = createAdminClient();

  const { data: pro } = await admin
    .from("glatko_professional_profiles")
    .select(
      "id, slug, business_name, bio, phone, location_city, hourly_rate_min, hourly_rate_max, years_experience, service_radius_km, languages, verification_tier, is_active, admin_notes, subscription_plan, subscription_started_at, subscription_end_date, portfolio_images",
    )
    .eq("id", providerId)
    .maybeSingle<ProRow>();

  if (!pro) return null;

  const [{ data: profile }, { data: services }] = await Promise.all([
    admin
      .from("profiles")
      .select("full_name, phone, city, preferred_locale, avatar_url")
      .eq("id", providerId)
      .maybeSingle(),
    admin
      .from("glatko_pro_services")
      .select("category_id, is_primary")
      .eq("professional_id", providerId),
  ]);

  return {
    provider_id: pro.id,
    slug: pro.slug ?? "",
    full_name: (profile?.full_name as string | null) ?? null,
    phone: (profile?.phone as string | null) ?? pro.phone,
    city_display: (profile?.city as string | null) ?? null,
    location_city: pro.location_city,
    preferred_locale: (profile?.preferred_locale as string | null) ?? null,
    avatar_url: (profile?.avatar_url as string | null) ?? null,
    business_name: pro.business_name,
    bio: pro.bio,
    hourly_rate_min: pro.hourly_rate_min,
    hourly_rate_max: pro.hourly_rate_max,
    years_experience: pro.years_experience,
    service_radius_km: pro.service_radius_km,
    languages: pro.languages,
    verification_tier: pro.verification_tier,
    is_active: pro.is_active ?? true,
    admin_notes: pro.admin_notes,
    subscription_plan: pro.subscription_plan,
    subscription_started_at: pro.subscription_started_at,
    subscription_end_date: pro.subscription_end_date,
    portfolio_images: pro.portfolio_images,
    services: (services ?? []).map((s) => ({
      category_id: s.category_id as string,
      is_primary: Boolean(s.is_primary),
    })),
  };
}

export default async function AdminEditProviderPage({ params }: Props) {
  const { locale, id } = await Promise.resolve(params);
  setRequestLocale(locale);
  const t = await getTranslations();

  const [initialData, categories] = await Promise.all([
    loadEditInitialData(id),
    loadCategoryOptions(),
  ]);

  if (!initialData) notFound();

  const displayName = initialData.business_name ?? initialData.full_name ?? id;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <nav className="flex items-center gap-1 text-xs text-gray-500 dark:text-white/50">
          <Link
            href={`/${locale}/admin/professionals`}
            className="hover:text-teal-600 dark:hover:text-teal-400"
          >
            {t("admin.professionals.title")}
          </Link>
          <span>/</span>
          <Link
            href={`/${locale}/admin/professionals/${id}`}
            className="inline-flex items-center gap-1 hover:text-teal-600 dark:hover:text-teal-400"
          >
            <ChevronLeft className="h-3 w-3" />
            {displayName}
          </Link>
          <span>/</span>
          <span className="text-gray-700 dark:text-white/70">
            {t("admin.professionals.editPro")}
          </span>
        </nav>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white md:text-3xl">
          {t("admin.professionals.editProTitle")}
        </h1>
        <p className="text-sm text-gray-500 dark:text-white/50">
          {t("admin.professionals.editProSubtitle")}
        </p>
      </header>

      {!initialData.is_active && (
        <div className="rounded-2xl border border-amber-300/60 bg-amber-50 px-5 py-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/[0.08] dark:text-amber-300">
          {t("admin.professionals.proInactiveEditWarning")}
        </div>
      )}

      <ProviderCreateForm
        mode="edit"
        initialData={initialData}
        categories={categories}
      />
    </div>
  );
}
