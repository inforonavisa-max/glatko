import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";

import { routing, type Locale } from "@/i18n/routing";
import { createClient } from "@/supabase/server";
import { isHealthVerticalEnabled } from "@/lib/saglik/flags";
import { getOwnProvider } from "@/lib/saglik/provider";
import { listSpecialties } from "@/lib/saglik/queries";
import { PageBackground } from "@/components/ui/PageBackground";
import { OnboardingWizard } from "@/components/glatko-saglik/OnboardingWizard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function BasvuruPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  if (!isHealthVerticalEnabled()) notFound();
  setRequestLocale(locale);
  const l = locale as Locale;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const [draft, specialties, t] = await Promise.all([
    getOwnProvider(user.id, l),
    listSpecialties(l),
    getTranslations({ locale, namespace: "healthVertical" }),
  ]);

  return (
    <PageBackground opacity={0.08}>
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-24 sm:pt-28">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-brandHealth-700 dark:text-brandHealth">
            {t("pro.onboarding.kicker")}
          </p>
          <h1 className="mt-1 font-serif text-2xl font-light tracking-tight text-gray-900 dark:text-white sm:text-3xl">
            {t("pro.onboarding.title")}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-gray-600 dark:text-white/60">
            {t("pro.onboarding.subtitle")}
          </p>
        </header>
        <OnboardingWizard
          locale={l}
          specialties={specialties}
          initialDraft={draft}
        />
      </div>
    </PageBackground>
  );
}
