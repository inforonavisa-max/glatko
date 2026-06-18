import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { buildAlternates } from "@/lib/seo";
import { isHealthVerticalEnabled } from "@/lib/saglik/flags";
import { PageBackground } from "@/components/ui/PageBackground";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { GlassmorphCard } from "@/components/ui/GlassmorphCard";
import type { Metadata } from "next";

/**
 * Glatko Sağlık — H10 health-specific privacy notice (PDPL/AZLP Art.13).
 *
 * A SIBLING of /privacy & /terms (top-level segment, NOT under /health/) so it is
 * NEVER caught by the health flag-guard middleware and ALWAYS resolves — the H5b
 * consent checkbox links here, so it must work even while the vertical flag is OFF.
 * Mirrors app/[locale]/privacy/page.tsx structure exactly (PageBackground /
 * SectionTitle / GlassmorphCard / a legal.healthPrivacyContent.* section loop /
 * buildAlternates single-source metadata).
 *
 * The legal TEXT is a sound DRAFT for Rohat / RoNa Legal to finalize (MASTER_PLAN
 * §H10 L5/L6 are explicitly human legal work) — see legal.healthPrivacyContent.draftNote.
 */

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
};

// PDPL/AZLP Art.13 sections: controller, purpose, legal basis (explicit consent),
// data collected, retention, recipients, patient rights, deletion-request route,
// security, contact/DPO.
const ALL_SECTIONS = [
  "s1",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
  "s7",
  "s8",
  "s9",
  "s10",
] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const alternates = buildAlternates(locale, "/health-privacy");
  const t = await getTranslations({ locale });
  const title = t("legal.healthPrivacy");
  return {
    title,
    description: t("legal.healthPrivacyContent.metaDescription"),
    alternates,
    openGraph: {
      title: `${title} — Glatko`,
      url: alternates.canonical,
      siteName: "Glatko",
      locale,
      type: "website",
    },
    // SEO quarantine: the notice stays REACHABLE (it's linked from the booking consent
    // checkbox) but noindex while the vertical is dark — avoids an orphan indexed page
    // (it's not in the sitemap) that leaks the vertical pre-launch. Flips to indexable
    // automatically at launch when the flag turns on (matches the rest of the vertical).
    robots: isHealthVerticalEnabled()
      ? { index: true, follow: true }
      : { index: false, follow: false },
  };
}

export default async function HealthPrivacyPage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <PageBackground opacity={0.08}>
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-28">
        <SectionTitle>{t("legal.healthPrivacy")}</SectionTitle>
        <GlassmorphCard className="p-8 md:p-12" hover={false}>
          <p className="mb-2 text-xs text-gray-400 dark:text-white/30">
            {t("legal.lastUpdated")}: {t("legal.effectiveDate")}
          </p>
          {/* Draft disclaimer — the legal text is reviewable by RoNa Legal, not final. */}
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            {t("legal.healthPrivacyContent.draftNote")}
          </p>
          <div className="space-y-6 text-sm leading-relaxed text-gray-600 dark:text-white/60">
            <p>{t("legal.healthPrivacyContent.intro")}</p>
            {ALL_SECTIONS.map((s) => {
              const titleKey = `legal.healthPrivacyContent.${s}Title` as const;
              const bodyKey = `legal.healthPrivacyContent.${s}` as const;
              const sectionTitle = t.has(titleKey) ? t(titleKey) : null;
              if (!sectionTitle) return null;
              return (
                <div key={s}>
                  <h2 className="mt-2 text-base font-semibold text-gray-900 dark:text-white">
                    {sectionTitle}
                  </h2>
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
