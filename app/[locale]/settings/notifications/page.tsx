import { redirect } from "next/navigation";
import { createClient } from "@/supabase/server";
import { getProfileSettings } from "@/lib/actions/profile";
import { NotificationSettingsClient } from "@/components/settings/NotificationSettingsClient";

export default async function NotificationSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/login`);
  }

  const settings = await getProfileSettings();
  if (!settings.ok) {
    redirect(`/${locale}/login`);
  }

  const { data: proRow } = await supabase
    .from("glatko_professional_profiles")
    .select("id")
    .eq("id", user.id)
    .eq("verification_status", "approved")
    .maybeSingle();

  return (
    <NotificationSettingsClient
      initialPrefs={settings.profile.notification_prefs}
      isPro={!!proRow}
      hasPhone={settings.hasPhone}
      initialChannel={settings.profile.notification_channel}
    />
  );
}
