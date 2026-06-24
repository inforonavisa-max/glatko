import { createClient } from "@/supabase/server";
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import type { Metadata } from "next";
import { routing } from "@/i18n/routing";
import { buildAlternates } from "@/lib/seo";
import { BecomeAProWizard } from "@/components/glatko/become-a-pro/BecomeAProWizard";
import { GlatkoBentoImages } from "@/components/glatko/landing/BentoImagesGrid";
import { NoiseCTA } from "@/components/glatko/landing/NoiseCTA";
import { PageBackground } from "@/components/ui/PageBackground";
import { Link } from "@/i18n/navigation";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  const alternates = buildAlternates(locale, "/become-a-pro");
  return {
    title: t("nav.becomeAPro"),
    description: t("seo.landingDesc"),
    alternates,
    openGraph: {
      title: `${t("nav.becomeAPro")} — Glatko`,
      url: alternates.canonical,
      siteName: "Glatko",
      locale,
      type: "website",
    },
    robots: { index: true, follow: true },
  };
}

export default async function BecomeAProPage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  setRequestLocale(locale);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const t = await getTranslations();

  // Anonymous visitors (e.g. cold traffic from pro-acquisition ads) get a
  // public marketing pitch instead of a hard login redirect — the wizard
  // itself still requires auth, so each CTA routes through signup and back.
  // G-ADS supply-side: pro Search/Demand Gen ads can now land here directly
  // without bouncing cold clicks straight into a login wall.
  if (!user) {
    return (
      <PageBackground opacity={0.1}>
        <section className="mx-auto max-w-3xl px-4 pt-28 pb-10 text-center sm:px-6">
          <h1 className="font-serif text-3xl font-semibold text-gray-900 sm:text-4xl dark:text-white">
            {t("pro.wizard.title")}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-gray-600 dark:text-white/60">
            {t("pro.wizard.subtitle")}
          </p>
          <div className="mt-8">
            <Link
              href={{ pathname: "/login", query: { redirect: "/become-a-pro" } }}
              className="inline-flex rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/30 transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2"
            >
              {t("landing.cta.proFooterBtn")}
            </Link>
          </div>
        </section>
        <div className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
          <GlatkoBentoImages
            title={t("becomePro.whyJoin.title")}
            card1Title={t("becomePro.whyJoin.card1")}
            card1Desc={t("becomePro.whyJoin.card1Desc")}
            card2Title={t("becomePro.whyJoin.card2")}
            card2Desc={t("becomePro.whyJoin.card2Desc")}
            card3Title={t("becomePro.whyJoin.card3")}
            card3Desc={t("becomePro.whyJoin.card3Desc")}
            card4Title={t("becomePro.whyJoin.card4")}
            card4Desc={t("becomePro.whyJoin.card4Desc")}
          />
        </div>
        <NoiseCTA
          title={t("landing.cta.proTitle")}
          subtitle={t("landing.cta.proSubtitle")}
          buttonText={t("landing.cta.proFooterBtn")}
          buttonHref={{ pathname: "/login", query: { redirect: "/become-a-pro" } }}
        />
      </PageBackground>
    );
  }

  const { data: existingPro } = await supabase
    .from("glatko_professional_profiles")
    .select("id, verification_status")
    .eq("id", user.id)
    .maybeSingle();

  const { data: accountProfile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  // Fetch BOTH roots and sub-categories. StepServiceAreas splits them itself
  // (`parents` = roots, `childrenOf(parentId)` = subs of a given root); the
  // per-card expansion only renders sub-checkboxes — there is nothing else
  // to click to make a selection. Filtering this query to roots only made
  // every parent card a no-op (expansion empty / no children), so clicks
  // looked dead and step 2 was unreachable. Bug shipped unnoticed because
  // founding pros completed signup before sub-categories landed in migration
  // 038 (G-CAT-6 expansion).
  const { data: categories } = await supabase
    .from("glatko_service_categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  if (existingPro) {
    return (
      <PageBackground opacity={0.12}>
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="text-center">
            <h1 className="font-serif text-2xl font-semibold text-gray-900 dark:text-white">
              {t("pro.wizard.alreadyPro")}
            </h1>
            <p className="mt-2 text-gray-500 dark:text-white/50">
              {t("pro.wizard.successDesc")}
            </p>
          </div>
        </div>
      </PageBackground>
    );
  }

  return (
    <PageBackground opacity={0.1}>
      {/* G-UX-1: form üstte, ikna materyali altta. Kullanıcı bu sayfaya
          zaten "pro ol" demek için geldi; "neden Glatko" alttan referans
          rolünde kalsın. */}
      <div className="mx-auto max-w-3xl px-4 pt-28 pb-12 sm:px-6">
        <BecomeAProWizard
          userId={user.id}
          categories={
            (categories ?? []) as import("@/types/glatko").ServiceCategory[]
          }
          userEmail={user.email ?? ""}
          displayName={accountProfile?.full_name ?? null}
          initialAvatarUrl={accountProfile?.avatar_url ?? null}
        />
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
        <GlatkoBentoImages
          title={t("becomePro.whyJoin.title")}
          card1Title={t("becomePro.whyJoin.card1")}
          card1Desc={t("becomePro.whyJoin.card1Desc")}
          card2Title={t("becomePro.whyJoin.card2")}
          card2Desc={t("becomePro.whyJoin.card2Desc")}
          card3Title={t("becomePro.whyJoin.card3")}
          card3Desc={t("becomePro.whyJoin.card3Desc")}
          card4Title={t("becomePro.whyJoin.card4")}
          card4Desc={t("becomePro.whyJoin.card4Desc")}
        />
      </div>
      <div className="mx-auto max-w-3xl px-4 pb-12 sm:px-6">
        <div className="rounded-2xl border border-gray-200/60 bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.03]">
          <h3 className="mb-2 font-serif text-lg font-semibold text-gray-900 dark:text-white">
            {t("becomePro.legalLink.title")}
          </h3>
          <p className="text-sm leading-relaxed text-gray-600 dark:text-white/60">
            {t.rich("becomePro.legalLink.body", {
              link: (chunks) => (
                <a
                  href="https://ronalegal.com"
                  target="_blank"
                  rel="noopener"
                  className="font-medium text-teal-700 underline-offset-2 hover:underline dark:text-teal-300"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>
      </div>
      <NoiseCTA
        title={t("landing.cta.proTitle")}
        subtitle={t("landing.cta.proSubtitle")}
        buttonText={t("landing.cta.proFooterBtn")}
        buttonHref="/become-a-pro"
      />
    </PageBackground>
  );
}
