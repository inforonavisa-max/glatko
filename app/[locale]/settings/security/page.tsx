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
  if (!user) {
    redirect(`/${locale}/login?redirect=/settings/security`);
  }

  const hasEmail = Boolean(user.email);

  // Auth methods (password vs OAuth) are keyed on email. Phone-only accounts
  // have no email yet, so skip the lookup (it would return no rows anyway).
  let hasPassword = false;
  let oauthProviders: string[] = [];
  if (user.email) {
    const { data: methods } = await supabase
      .rpc("get_auth_methods", { p_email: user.email })
      .maybeSingle<{ has_password: boolean; oauth_providers: string[] | null }>();
    hasPassword = Boolean(methods?.has_password);
    oauthProviders = Array.isArray(methods?.oauth_providers)
      ? methods.oauth_providers
      : [];
  }

  // Phone-verification state (Sprint A) + email mirror for the reconcile below.
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone, phone_verified, email")
    .eq("id", user.id)
    .maybeSingle<{
      phone: string | null;
      phone_verified: boolean | null;
      email: string | null;
    }>();

  // Self-heal: once a phone-only user confirms an added email, auth.users.email
  // is set but the profiles mirror (INSERT-only backfill trigger) is not. Sync
  // it here on this authenticated, dynamic page.
  if (user.email && profile && profile.email !== user.email) {
    await supabase
      .from("profiles")
      .update({ email: user.email, updated_at: new Date().toISOString() })
      .eq("id", user.id);
  }

  return (
    <PageBackground opacity={0.08}>
      <SecuritySection
        email={user.email ?? ""}
        hasEmail={hasEmail}
        hasPassword={hasPassword}
        oauthProviders={oauthProviders}
        phone={profile?.phone ?? null}
        phoneVerified={Boolean(profile?.phone_verified)}
      />
    </PageBackground>
  );
}
