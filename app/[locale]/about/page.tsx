import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { buildAlternates } from "@/lib/seo";
import { PageBackground } from "@/components/ui/PageBackground";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { GlassmorphCard } from "@/components/ui/GlassmorphCard";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  return {
    title: t("legal.about"),
    description: t("legal.aboutContent.intro"),
    alternates: buildAlternates(locale, "/about"),
    openGraph: {
      title: `${t("legal.about")} — Glatko`,
      description: t("legal.aboutContent.intro"),
      url: `https://glatko.app/${locale}/about`,
      siteName: "Glatko",
      locale,
      type: "website",
    },
    robots: { index: true, follow: true },
  };
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const c = (key: string) => t(`legal.aboutContent.${key}`);
  return (
    <PageBackground opacity={0.08}>
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-28">
        <SectionTitle>{t("legal.about")}</SectionTitle>
        <GlassmorphCard className="p-8 md:p-12" hover={false}>
          <div className="space-y-5 text-sm leading-relaxed text-gray-600 dark:text-white/60">
            <p>{c("intro")}</p>
            <p>{c("mission")}</p>
            <p>{c("location")}</p>
            <p>{c("services")}</p>
            <p>{c("howItWorks")}</p>
            <p>{c("languages")}</p>
            <p>{c("operator")}</p>
            <p className="pt-4 text-gray-500 dark:text-white/40">
              {c("contactLine")}: <a href={`mailto:${c("contactEmail")}`} className="font-medium text-teal-600 hover:underline dark:text-teal-400">{c("contactEmail")}</a>
            </p>
          </div>
        </GlassmorphCard>
      </div>
    </PageBackground>
  );
}
