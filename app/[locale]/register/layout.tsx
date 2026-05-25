import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

type Props = { params: Promise<{ locale: string }>; children: React.ReactNode };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("auth.register"),
    description: t("brand.tagline"),
    robots: { index: false, follow: false },
  };
}

export default function Layout({ children }: Props) {
  return children;
}
