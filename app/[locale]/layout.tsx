import { hasLocale } from "next-intl";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { buildAlternates } from "@/lib/seo";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { GlatkoHeader } from "@/components/GlatkoHeader";
import { GlatkoFooter } from "@/components/GlatkoFooter";
import { VerticalsNav } from "@/components/glatko/verticals/VerticalsNav";
import { isHealthVerticalEnabled } from "@/lib/saglik/flags";
import { createClient } from "@/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { CookieConsent } from "@/components/glatko/CookieConsent";
import { OnboardingWelcomeBanner } from "@/components/glatko/onboarding/OnboardingWelcomeBanner";
import { SentryUserScope } from "@/components/monitoring/SentryUserScope";
import { YandexMetrica } from "@/components/seo/YandexMetrica";
import { SearchModalProvider } from "@/components/glatko/search/SearchModalContext";
import { SearchModal } from "@/components/glatko/search/SearchModal";
import {
  generateOrganizationSchema,
  jsonLdScriptProps,
} from "@/lib/seo/jsonld";
import type { Metadata } from "next";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }> | { locale: string };
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }> | { locale: string };
}): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  const title = t("seo.landingTitle");
  const description = t("seo.landingDesc");
  // Locale homepage canonical + 9-locale hreflang via the single helper.
  // See docs/audits/gsc-audit-2026-05-18.md Bugs A/C for the prior
  // double-emission pattern this replaces.
  const alternates = buildAlternates(locale, "/");
  return {
    metadataBase: new URL("https://glatko.app"),
    title: {
      default: title,
      template: "%s | Glatko",
    },
    description,
    alternates,
    openGraph: {
      title,
      description,
      url: alternates.canonical,
      siteName: "Glatko",
      locale,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

const RTL_LOCALES = new Set(["ar"]);

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await Promise.resolve(params);

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();
  const dir = RTL_LOCALES.has(locale) ? "rtl" : "ltr";

  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user ?? null;
  const userId = user?.id ?? null;

  type ProfileBannerRow = {
    preferred_locale: string | null;
    full_name: string | null;
    onboarding_completed: boolean | null;
  };
  let profileBannerRow: ProfileBannerRow | null = null;

  if (userId && (routing.locales as readonly string[]).includes(locale)) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("preferred_locale, full_name, onboarding_completed")
        .eq("id", userId)
        .maybeSingle();

      profileBannerRow = profile;

      if (profile && profile.preferred_locale !== locale) {
        await supabase
          .from("profiles")
          .update({ preferred_locale: locale })
          .eq("id", userId);
      }
    } catch {
      /* never break layout for locale sync */
    }
  }

  let isPro = false;
  if (userId) {
    const { data: proProfile } = await supabase
      .from("glatko_professional_profiles")
      .select("id, verification_status")
      .eq("id", userId)
      .single();
    isPro = !!proProfile && proProfile.verification_status === "approved";
  }

  const onboardingFirstName =
    profileBannerRow?.full_name?.trim().split(/\s+/)[0] ?? "";
  const showOnboardingBanner =
    !!userId &&
    !isPro &&
    profileBannerRow?.onboarding_completed !== true;

  const isAdmin = user ? isAdminEmail(user.email) : false;

  return (
    <NextIntlClientProvider messages={messages}>
      <NuqsAdapter>
        <SearchModalProvider>
          <script {...jsonLdScriptProps(generateOrganizationSchema(locale))} />
          <SentryUserScope userId={userId} email={user?.email} />
          <div className="flex min-h-screen flex-col" dir={dir}>
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[999] focus:rounded-xl focus:bg-teal-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
            >
              Skip to content
            </a>
            <GlatkoHeader userId={userId} isPro={isPro} isAdmin={isAdmin} />
            {showOnboardingBanner ? (
              <div className="mt-16 shrink-0">
                <OnboardingWelcomeBanner displayName={onboardingFirstName} />
              </div>
            ) : null}
            <main id="main-content" className="flex-1">
              {/* Persistent vertical switcher (Hizmetler · İş · Sağlık) —
                  rendered here so it appears on EVERY page, not just the
                  homepage. Direct child of <main> (NOT wrapped) so its
                  position:sticky travels the full page height. Active tab is
                  derived from the pathname inside the component. */}
              <VerticalsNav healthEnabled={isHealthVerticalEnabled()} />
              {children}
            </main>
            <GlatkoFooter />
            <CookieConsent />
          </div>
          <SearchModal locale={locale} isAuthenticated={!!userId} />
          <YandexMetrica />
        </SearchModalProvider>
      </NuqsAdapter>
    </NextIntlClientProvider>
  );
}
