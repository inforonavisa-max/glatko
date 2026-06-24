import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, CheckCircle2, Clock, Crown, Sparkles, Trophy } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { PageBackground } from "@/components/ui/PageBackground";
import { FoundingCounter } from "@/components/glatko/founding/FoundingCounter";
import { createAdminClient } from "@/supabase/server";
import { buildAlternates } from "@/lib/seo";
import type { Locale } from "@/i18n/routing";

type PageProps = {
  params: Promise<{ locale: string }> | { locale: string };
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "founding.pro" });
  const alternates = buildAlternates(locale, "/become-a-pro/founding");
  return {
    title: { absolute: t("hero.title") },
    description: t("hero.subtitle"),
    alternates,
    openGraph: {
      title: t("hero.title"),
      description: t("hero.subtitle"),
      type: "website",
      url: alternates.canonical,
      siteName: "Glatko",
      locale,
    },
    robots: { index: true, follow: true },
  };
}

interface CountsShape {
  provider_count: number;
  provider_limit: number;
  provider_remaining: number;
  customer_count: number;
  customer_limit: number;
  customer_remaining: number;
}

async function fetchCounts(): Promise<CountsShape | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("glatko_founding_counts");
    if (error || !data) return null;
    return data as unknown as CountsShape;
  } catch {
    return null;
  }
}

export default async function FoundingProviderLandingPage({ params }: PageProps) {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return null;
  setRequestLocale(locale);
  const t = await getTranslations({ locale: locale as Locale, namespace: "founding.pro" });
  const counts = await fetchCounts();

  const valueProps = [
    {
      icon: Crown,
      title: t("value.badge.title"),
      desc: t("value.badge.desc"),
    },
    {
      icon: Sparkles,
      title: t("value.featured.title"),
      desc: t("value.featured.desc"),
    },
    {
      icon: Trophy,
      title: t("value.firstClient.title"),
      desc: t("value.firstClient.desc"),
    },
  ];

  const eligibilityItems = [
    t("eligibility.boka"),
    t("eligibility.verified"),
    t("eligibility.portfolio"),
    t("eligibility.experience"),
  ];

  const timeline = [
    {
      date: t("timeline.t1.date"),
      title: t("timeline.t1.title"),
      desc: t("timeline.t1.desc"),
    },
    {
      date: t("timeline.t2.date"),
      title: t("timeline.t2.title"),
      desc: t("timeline.t2.desc"),
    },
    {
      date: t("timeline.t3.date"),
      title: t("timeline.t3.title"),
      desc: t("timeline.t3.desc"),
    },
    {
      date: t("timeline.t4.date"),
      title: t("timeline.t4.title"),
      desc: t("timeline.t4.desc"),
    },
  ];

  const faqs = [
    { q: t("faq.q1.question"), a: t("faq.q1.answer") },
    { q: t("faq.q2.question"), a: t("faq.q2.answer") },
    { q: t("faq.q3.question"), a: t("faq.q3.answer") },
    { q: t("faq.q4.question"), a: t("faq.q4.answer") },
    { q: t("faq.q5.question"), a: t("faq.q5.answer") },
    { q: t("faq.q6.question"), a: t("faq.q6.answer") },
  ];

  return (
    <PageBackground opacity={0.08}>
      <div className="relative">
        <div className="absolute inset-x-0 top-0 -z-10 h-[600px] bg-gradient-to-b from-amber-500/[0.10] via-yellow-500/[0.04] to-transparent dark:from-amber-500/[0.08]" />
      </div>

      <div className="mx-auto max-w-5xl px-4 pb-24 pt-28 sm:px-6">
        {/* ── Hero ── */}
        <section className="text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-50/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300">
            <Crown className="h-3.5 w-3.5" aria-hidden />
            {t("hero.eyebrow")}
          </div>
          <h1 className="font-serif text-4xl font-bold leading-tight text-gray-900 dark:text-white sm:text-5xl">
            {t("hero.title")}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-gray-600 dark:text-white/70 sm:text-lg">
            {t("hero.subtitle")}
          </p>

          <div className="mx-auto mt-10 max-w-3xl">
            <FoundingCounter initialCounts={counts ?? undefined} />
          </div>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/become-a-pro"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 px-7 py-3.5 text-sm font-semibold text-amber-950 shadow-xl shadow-amber-500/30 transition-transform hover:-translate-y-0.5"
            >
              {t("hero.cta")}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white/60 px-6 py-3.5 text-sm font-medium text-gray-700 transition-colors hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.08]"
            >
              {t("hero.secondaryCta")}
            </Link>
          </div>
        </section>

        {/* ── Value proposition ── */}
        <section className="mt-24">
          <div className="text-center">
            <h2 className="font-serif text-3xl font-bold text-gray-900 dark:text-white">
              {t("value.title")}
            </h2>
            <div className="mx-auto mt-3 h-0.5 w-12 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500" />
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {valueProps.map((v) => {
              const Icon = v.icon;
              return (
                <div
                  key={v.title}
                  className="rounded-2xl border border-gray-200/60 bg-white/70 p-6 backdrop-blur-sm transition-all hover:-translate-y-1 hover:shadow-lg dark:border-white/[0.08] dark:bg-white/[0.03]"
                >
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/20 to-yellow-500/10">
                    <Icon className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                    {v.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-white/60">
                    {v.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Eligibility ── */}
        <section className="mt-24">
          <div className="rounded-3xl border border-gray-200/60 bg-white/70 p-8 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03] sm:p-12">
            <h2 className="font-serif text-2xl font-bold text-gray-900 dark:text-white">
              {t("eligibility.title")}
            </h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-white/50">
              {t("eligibility.subtitle")}
            </p>
            <ul className="mt-6 space-y-3">
              {eligibilityItems.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-500" aria-hidden />
                  <span className="text-gray-700 dark:text-white/80">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Timeline ── */}
        <section className="mt-24">
          <div className="text-center">
            <h2 className="font-serif text-3xl font-bold text-gray-900 dark:text-white">
              {t("timeline.title")}
            </h2>
            <div className="mx-auto mt-3 h-0.5 w-12 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500" />
          </div>
          <ol className="relative mt-10 space-y-6 border-l-2 border-amber-300/30 pl-6 dark:border-amber-400/20">
            {timeline.map((m, i) => (
              <li key={`${m.date}-${i}`} className="relative">
                <span className="absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-yellow-500 ring-4 ring-white dark:ring-[#0b1f23]">
                  <Clock className="h-2.5 w-2.5 text-amber-950" aria-hidden />
                </span>
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  {m.date}
                </p>
                <h3 className="mt-1 text-base font-semibold text-gray-900 dark:text-white">
                  {m.title}
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-white/60">{m.desc}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── FAQ ── */}
        <section className="mt-24">
          <div className="text-center">
            <h2 className="font-serif text-3xl font-bold text-gray-900 dark:text-white">
              {t("faq.title")}
            </h2>
            <div className="mx-auto mt-3 h-0.5 w-12 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500" />
          </div>
          <div className="mt-8 space-y-3">
            {faqs.map((f, i) => (
              <details
                key={`faq-${i}`}
                className="group rounded-2xl border border-gray-200/60 bg-white/70 px-5 py-4 backdrop-blur-sm transition-all open:bg-white/80 dark:border-white/[0.08] dark:bg-white/[0.03] dark:open:bg-white/[0.05]"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-gray-900 dark:text-white">
                  {f.q}
                  <span className="text-amber-600 transition-transform group-open:rotate-90 dark:text-amber-400">
                    →
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-white/60">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="mt-24 text-center">
          <div className="rounded-3xl border border-amber-300/40 bg-gradient-to-br from-amber-500/[0.08] via-yellow-500/[0.04] to-transparent p-10 backdrop-blur-sm dark:border-amber-400/20 dark:from-amber-500/[0.12]">
            <h2 className="font-serif text-3xl font-bold text-gray-900 dark:text-white">
              {t("cta.title")}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-gray-600 dark:text-white/70">
              {t("cta.subtitle")}
            </p>
            <Link
              href="/become-a-pro"
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 px-8 py-3.5 text-sm font-semibold text-amber-950 shadow-xl shadow-amber-500/30 transition-transform hover:-translate-y-0.5"
            >
              {t("cta.button")}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      </div>
    </PageBackground>
  );
}
