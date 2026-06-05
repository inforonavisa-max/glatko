import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { buildAlternates } from "@/lib/seo";
import { PageBackground } from "@/components/ui/PageBackground";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { GlassmorphCard } from "@/components/ui/GlassmorphCard";
import { Mail, MapPin, Clock, MessageCircle, Phone, Building2 } from "lucide-react";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  return {
    title: "Contact",
    description: "Contact the Glatko team — email, WhatsApp, Viber and office hours.",
    alternates: buildAlternates(locale, "/contact"),
    openGraph: {
      title: "Contact — Glatko",
      url: `https://glatko.app/${locale}/contact`,
      siteName: "Glatko",
      locale,
      type: "website",
    },
    robots: { index: true, follow: true },
  };
}

export default async function ContactPage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const c = (key: string) => t(`legal.contactContent.${key}`);
  const whatsapp = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT;
  const viber = process.env.NEXT_PUBLIC_VIBER_SUPPORT;
  return (
    <PageBackground opacity={0.08}>
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-28">
        <SectionTitle>{t("legal.contact")}</SectionTitle>
        <GlassmorphCard className="p-8 md:p-12" hover={false}>
          <p className="mb-8 text-sm text-gray-600 dark:text-white/60">{c("intro")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-start gap-4 rounded-xl border border-gray-100 bg-gray-50/50 p-5 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-teal-500" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">{c("emailLabel")}</p>
                <a href={`mailto:${c("email")}`} className="text-sm font-medium text-teal-600 hover:underline dark:text-teal-400">{c("email")}</a>
              </div>
            </div>
            <div className="flex items-start gap-4 rounded-xl border border-gray-100 bg-gray-50/50 p-5 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-teal-500" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">{c("addressLabel")}</p>
                <p className="text-sm text-gray-700 dark:text-white/70">{c("address")}</p>
              </div>
            </div>
            <div className="flex items-start gap-4 rounded-xl border border-gray-100 bg-gray-50/50 p-5 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-500" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">{c("companyLabel")}</p>
                <p className="text-sm text-gray-700 dark:text-white/70">{c("company")}</p>
              </div>
            </div>
            <div className="flex items-start gap-4 rounded-xl border border-gray-100 bg-gray-50/50 p-5 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-teal-500" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">{c("hoursLabel")}</p>
                <p className="text-sm text-gray-700 dark:text-white/70">{c("hours")}</p>
              </div>
            </div>
            {whatsapp && (
              <a
                href={`https://wa.me/${whatsapp}?text=${encodeURIComponent("Hello, I'm reaching out via Glatko.")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-4 rounded-xl border border-[#25D366]/20 bg-[#25D366]/5 p-5 transition-colors hover:bg-[#25D366]/10"
              >
                <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#25D366]" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">{c("whatsappLabel")}</p>
                  <p className="text-sm text-gray-700 dark:text-white/70">{c("whatsappDesc")}</p>
                </div>
              </a>
            )}
            {viber && (
              <a
                href={`viber://chat?number=${encodeURIComponent(viber)}`}
                className="flex items-start gap-4 rounded-xl border border-[#7360F2]/20 bg-[#7360F2]/5 p-5 transition-colors hover:bg-[#7360F2]/10"
              >
                <Phone className="mt-0.5 h-5 w-5 shrink-0 text-[#7360F2]" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">{c("viberLabel")}</p>
                  <p className="text-sm text-gray-700 dark:text-white/70">{c("viberDesc")}</p>
                </div>
              </a>
            )}
          </div>
        </GlassmorphCard>
      </div>
    </PageBackground>
  );
}
