import type { Metadata } from "next";
import { createClient } from "@/supabase/server";
import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getProfessionalProfile } from "@/lib/supabase/glatko.server";
import { ProDashboardShell } from "@/components/glatko/pro/ProDashboardShell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }> | { locale: string };
};

export default async function ProDashboardLayout({ children, params }: Props) {
  const { locale } = await Promise.resolve(params);
  setRequestLocale(locale);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login?redirect=/pro/dashboard`);

  const profile = await getProfessionalProfile(user.id);
  if (!profile) redirect(`/${locale}/become-a-pro`);

  const t = await getTranslations();

  return (
    <ProDashboardShell
      profile={profile}
      locale={locale}
      translations={{
        home: t("proDashboard.nav.home"),
        leads: t("nav.leads"),
        requests: t("proDashboard.nav.requests"),
        bids: t("proDashboard.nav.bids"),
        profile: t("proDashboard.nav.profile"),
        settings: t("proDashboard.nav.settings"),
        inbox: t("nav.inbox"),
        packages: t("packages.title"),
        availability: t("availability.title"),
        editProfile: t("proProfile.title"),
      }}
    >
      {children}
    </ProDashboardShell>
  );
}
