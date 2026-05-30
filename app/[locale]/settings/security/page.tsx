import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/supabase/server";
import { PageBackground } from "@/components/ui/PageBackground";
import { SecuritySection } from "@/components/settings/SecuritySection";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("settings.security.title"),
  };
}

export default async function SecuritySettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    redirect(`/${locale}/login?redirect=/settings/security`);
  }

  // Detect whether the user has a password set vs. is OAuth-only.
  // Drives "Set password" vs. "Change password" CTA + linked-providers list.
  const { data: methods } = await supabase
    .rpc("get_auth_methods", { p_email: user.email })
    .maybeSingle<{ has_password: boolean; oauth_providers: string[] | null }>();

  const hasPassword = Boolean(methods?.has_password);
  const oauthProviders = Array.isArray(methods?.oauth_providers)
    ? methods.oauth_providers
    : [];

  // Phone-verification state (Sprint A) for the verification card.
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone, phone_verified")
    .eq("id", user.id)
    .maybeSingle<{ phone: string | null; phone_verified: boolean | null }>();

  return (
    <PageBackground opacity={0.08}>
      <SecuritySection
        email={user.email}
        hasPassword={hasPassword}
        oauthProviders={oauthProviders}
        phone={profile?.phone ?? null}
        phoneVerified={Boolean(profile?.phone_verified)}
      />
    </PageBackground>
  );
}
