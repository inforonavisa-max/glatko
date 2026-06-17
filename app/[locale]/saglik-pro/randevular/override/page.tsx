import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";

import { routing, type Locale } from "@/i18n/routing";
import { createClient } from "@/supabase/server";
import { isHealthVerticalEnabled } from "@/lib/saglik/flags";
import { getOwnProvider, listOverrides } from "@/lib/saglik/provider";
import { PageBackground } from "@/components/ui/PageBackground";
import { Link } from "@/i18n/navigation";
import { SaglikProNav } from "@/components/glatko-saglik/SaglikProNav";
import { ProviderScheduleOverrideEditor } from "@/components/glatko-saglik/ProviderScheduleOverrideEditor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function OverridePage({
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

  const [draft, overrides, t] = await Promise.all([
    getOwnProvider(user.id, l),
    listOverrides(user.id),
    getTranslations({ locale, namespace: "healthVertical" }),
  ]);

  return (
    <PageBackground opacity={0.08}>
      <div className="pt-16">
        <SaglikProNav />
        <div className="mx-auto max-w-3xl px-4 pb-24 pt-8">
          {draft ? (
            <ProviderScheduleOverrideEditor locale={l} initialOverrides={overrides} />
          ) : (
            <div className="rounded-2xl border border-dashed border-brandHealth-200 bg-white/60 p-8 text-center dark:border-brandHealth/30 dark:bg-white/5">
              <h1 className="font-serif text-xl font-light text-gray-900 dark:text-white">
                {t("pro.profile.noProviderTitle")}
              </h1>
              <p className="mx-auto mt-2 max-w-sm text-sm text-gray-600 dark:text-white/60">
                {t("pro.profile.noProviderBody")}
              </p>
              <Link
                href="/health-pro/basvuru"
                className="mt-5 inline-flex items-center rounded-full bg-brandHealth-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brandHealth-700"
              >
                {t("pro.profile.goToOnboarding")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </PageBackground>
  );
}
