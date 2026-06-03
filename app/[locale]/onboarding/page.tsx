import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/supabase/server";
import { AuthBrandPanel } from "@/components/glatko/auth/AuthBrandPanel";
import { OnboardingForm } from "@/components/auth/OnboardingForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("auth.onboarding.title"),
    robots: { index: false, follow: false },
  };
}

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Guard on the user (NOT user.email) — phone-only accounts have no email.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/login`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, onboarding_completed, preferred_locale")
    .eq("id", user.id)
    .maybeSingle();

  // Skip onboarding for anyone already set up (real name or completed flag) —
  // e.g. existing email/Google users who sign in by phone.
  const name = (profile?.full_name ?? "").trim();
  const alreadyOnboarded =
    profile?.onboarding_completed === true ||
    (name !== "" && name !== "Glatko User");
  if (alreadyOnboarded) {
    redirect(`/${locale}`);
  }

  const t = await getTranslations({ locale, namespace: "auth.onboarding" });

  return (
    <div className="grid min-h-screen w-full grid-cols-1 md:grid-cols-2">
      <AuthBrandPanel />

      <div className="flex items-center justify-center bg-white px-4 py-12 dark:bg-neutral-950 sm:px-6 lg:px-20 xl:px-32">
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {t("title")}
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">
            {t("subtitle")}
          </p>
          <div className="mt-8">
            <OnboardingForm
              currentLocale={profile?.preferred_locale ?? locale}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
