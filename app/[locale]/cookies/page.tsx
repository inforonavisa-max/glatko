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

const ALL_SECTIONS = ["s1", "s2", "s3", "s4", "s5"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const alternates = buildAlternates(locale, "/cookies");
  return {
    title: "Cookie Policy — Glatko",
    description: "Cookie policy for the Glatko platform — types and management.",
    alternates,
    openGraph: {
      title: "Cookie Policy — Glatko",
      url: alternates.canonical,
      siteName: "Glatko",
      locale,
      type: "website",
    },
    robots: { index: true, follow: true },
  };
}

export default async function CookiesPage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <PageBackground opacity={0.08}>
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-28">
        <SectionTitle>{t("legal.cookies")}</SectionTitle>
        <GlassmorphCard className="p-8 md:p-12" hover={false}>
          <div className="space-y-6 text-sm leading-relaxed text-gray-600 dark:text-white/60">
            <p>{t("legal.cookiesContent.intro")}</p>
            {ALL_SECTIONS.map((s) => {
              const titleKey = `legal.cookiesContent.${s}Title` as const;
              const bodyKey = `legal.cookiesContent.${s}` as const;
              const title = t.has(titleKey) ? t(titleKey) : null;
              if (!title) return null;
              return (
                <div key={s}>
                  <h2 className="mt-2 text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
                  <p className="mt-1.5">{t(bodyKey)}</p>
                </div>
              );
            })}
          </div>
        </GlassmorphCard>
      </div>
    </PageBackground>
  );
}
