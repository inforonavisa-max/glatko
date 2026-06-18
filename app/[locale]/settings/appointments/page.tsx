import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/supabase/server";
import { PageBackground } from "@/components/ui/PageBackground";
import { isHealthVerticalEnabled } from "@/lib/saglik/flags";
import { listUserAppointments, type UserAppointment } from "@/lib/saglik/booking";
import { UserAppointmentsList } from "@/components/glatko-saglik/UserAppointmentsList";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return { title: t("healthVertical.account.title") };
}

// Always per-request (live appointment status) + noindex (inherited from layout).
export const dynamic = "force-dynamic";

export default async function AppointmentsSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations();

  // Flag-guard (Demir Kural 1): this is a health-vertical surface living OUTSIDE the
  // health (gated) layout, so it does NOT inherit its 404-when-off behavior. Mirror it
  // here — with the flag off (prod) the route 404s, so it ships dark like the rest of
  // the vertical; in Preview/Development (flag on) it is reachable.
  if (!isHealthVerticalEnabled()) notFound();

  // Auth-gated (same pattern as the other settings tabs).
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/login?redirect=/settings/appointments`);
  }

  // The user may have no linked patient row yet → an empty list (never a crash).
  let appointments: UserAppointment[] = [];
  try {
    appointments = await listUserAppointments(user.id, l);
  } catch {
    // A read-RPC hiccup degrades to an empty list (the account page must still render).
    appointments = [];
  }

  return (
    <PageBackground opacity={0.08}>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="font-serif text-3xl font-light tracking-tight text-gray-900 dark:text-white">
          {t("healthVertical.account.title")}
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-white/70">
          {t("healthVertical.account.subtitle")}
        </p>
        <div className="mt-8">
          <UserAppointmentsList appointments={appointments} locale={l} />
        </div>
      </div>
    </PageBackground>
  );
}
