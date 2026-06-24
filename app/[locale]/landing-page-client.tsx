"use client";

import { useRef } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import {
  Anchor,
  ArrowRight,
  Hammer,
  Home,
  Scissors,
  Sparkles,
  Tag,
  type LucideIcon,
} from "lucide-react";
import type { Locale } from "@/i18n/routing";
import type { MultiLangText } from "@/types/glatko";
import { AceternityHeroBackground } from "@/components/aceternity/hero-background";
import { LinesGradient } from "@/components/aceternity/lines-gradient";
import { LazyAnimation } from "@/components/ui/LazyAnimation";

// G-PERF-2: 3-instance CollisionMechanism cluster split into its own
// client-only chunk so framer-motion code paths it pulls in don't load
// synchronously with the landing bundle. Visually identical — beams
// still appear inside the hero, just on a separate render tick.
const HeroCollisionBeams = dynamic<{
  parentRef: React.RefObject<HTMLDivElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}>(
  () =>
    import("@/components/glatko/landing/HeroCollisionBeams").then(
      (m) => m.HeroCollisionBeams,
    ),
  { ssr: false, loading: () => null },
);
import { SpotlightCard } from "@/components/landing/spotlight-card";
import {
  SectionReveal,
  StaggerItem,
} from "@/components/landing/scroll-reveal";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { LogoMarquee } from "@/components/glatko/landing/LogoMarquee";

// G-PERF-1: below-fold landing sections split into async chunks.
// SSR is preserved (ssr: true) so the HTML still includes the rendered
// content for SEO and immediate paint; only the client hydration JS is
// fetched as a separate chunk. Loading placeholder is null because SSR
// already painted the section — the placeholder only flashes during SPA
// navigation, not on initial page load.
const dynamicSection = <P extends object>(
  loader: () => Promise<{ [k: string]: React.ComponentType<P> }>,
  exportName: string,
) =>
  dynamic<P>(() => loader().then((m) => m[exportName] as React.ComponentType<P>), {
    ssr: true,
    loading: () => null,
  });

const BentoFeatures = dynamicSection<Record<string, never>>(
  () => import("@/components/glatko/landing/BentoFeatures"),
  "BentoFeatures",
);
const DeepFeatures = dynamicSection<Record<string, never>>(
  () => import("@/components/glatko/landing/DeepFeatures"),
  "DeepFeatures",
);
const Testimonials = dynamicSection<Record<string, never>>(
  () => import("@/components/glatko/landing/Testimonials"),
  "Testimonials",
);
const FAQ = dynamicSection<Record<string, never>>(
  () => import("@/components/glatko/landing/FAQ"),
  "FAQ",
);
const DashedGridCTA = dynamicSection<Record<string, never>>(
  () => import("@/components/glatko/landing/DashedGridCTA"),
  "DashedGridCTA",
);
const ImagesCTA = dynamicSection<{
  title: string;
  subtitle: string;
  buttonText: string;
  buttonHref: string;
  trustText: string;
}>(() => import("@/components/glatko/landing/ImagesCTA"), "ImagesCTA");
const MobileShowcase = dynamicSection<{ title: string; subtitle: string }>(
  () => import("@/components/glatko/landing/MobileShowcase"),
  "MobileShowcase",
);

const easePremium = [0.25, 0.4, 0.25, 1] as const;

export interface FeaturedCategoryCard {
  id: string;
  slug: string;
  name: MultiLangText;
  description: MultiLangText | null;
  hero_image_url: string | null;
  icon: string | null;
}

const ICON_MAP: Record<string, LucideIcon> = {
  Anchor,
  Hammer,
  Home,
  Scissors,
  Sparkles,
  Tag,
};

function pickLocalized(text: MultiLangText | null, locale: Locale): string {
  if (!text) return "";
  return (
    text[locale] ??
    text.en ??
    (Object.values(text).find((v): v is string => typeof v === "string") ?? "")
  );
}

export interface RootCategoryLink {
  slug: string;
  name: MultiLangText;
}

interface LandingPageClientProps {
  featuredCategories: FeaturedCategoryCard[];
  totalCategoryCount: number;
  allCategories: RootCategoryLink[];
  locale: Locale;
}

export default function LandingPageClient({
  featuredCategories,
  totalCategoryCount,
  allCategories,
  locale,
}: LandingPageClientProps) {
  const t = useTranslations();
  const reduced = useReducedMotion();
  const heroParentRef = useRef<HTMLDivElement>(null);
  const heroCollisionTargetRef = useRef<HTMLDivElement>(null);

  const fadeUpVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        duration: reduced ? 0 : 0.8,
        delay: reduced ? 0 : i * 0.15,
        ease: easePremium,
      },
    }),
  };

  const heroTitle = t("hero.title");

  return (
    <>
      {/* Organization schema lives in the locale layout (single source);
          WebSite/SearchAction is rendered by the parent server page. */}

      {/* ── Hero ── */}
      <section
        ref={heroParentRef}
        className="relative flex min-h-screen items-center justify-center overflow-hidden pt-16"
      >
        <div
          className="pointer-events-none absolute inset-0 z-0 opacity-30"
          aria-hidden
        >
          <LinesGradient />
        </div>
        <AceternityHeroBackground />
        {!reduced && (
          <LazyAnimation
            className="pointer-events-none absolute inset-0 z-[5]"
            aria-hidden
          >
            <HeroCollisionBeams
              parentRef={heroParentRef}
              containerRef={heroCollisionTargetRef}
            />
          </LazyAnimation>
        )}

        <div className="relative z-10 mx-auto max-w-4xl px-4 text-center">
          {/*
            Hero h1 is rendered statically (no opacity:0 first paint) so it can
            be the LCP candidate. Per-word stagger removed \u2014 the full title
            paints at FCP, then the subtitle + CTAs below provide motion polish.
            See G-PERF-1 investigation: word-by-word framer-motion was deferring
            LCP to ~5.7s. Hero background animations (LinesGradient, CollisionMechanism)
            still play; only the title text is now SSR-visible.
          */}
          <h1 className="font-serif text-5xl font-light leading-[1.1] tracking-tight text-gray-900 dark:text-white sm:text-6xl md:text-7xl lg:text-8xl">
            {heroTitle}
          </h1>
          <motion.p
            variants={fadeUpVariants}
            initial="hidden"
            animate="visible"
            custom={1}
            style={reduced ? undefined : { willChange: "transform, opacity" }}
            className="mx-auto mt-6 max-w-2xl text-lg text-gray-600 dark:text-white/60 sm:text-xl"
          >
            {t("hero.subtitle")}
          </motion.p>
          <motion.div
            variants={fadeUpVariants}
            initial="hidden"
            animate="visible"
            custom={2}
            style={reduced ? undefined : { willChange: "transform, opacity" }}
            className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Link href="/request-service">
              <motion.span
                whileHover={reduced ? undefined : { scale: 1.02, boxShadow: "0 0 30px rgba(20,184,166,0.3)" }}
                whileTap={reduced ? undefined : { scale: 0.98 }}
                className="inline-block rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-8 py-4 text-lg font-medium text-white shadow-lg shadow-teal-500/25 transition-all"
              >
                {t("hero.cta")}
              </motion.span>
            </Link>
            <Link href={{ pathname: "/services", query: { openSearch: "1" } }}>
              <motion.span
                whileHover={reduced ? undefined : { scale: 1.02, backgroundColor: "rgba(20,184,166,0.1)" }}
                whileTap={reduced ? undefined : { scale: 0.98 }}
                className="inline-block rounded-xl border border-teal-500/30 px-8 py-4 text-lg font-medium text-teal-700 backdrop-blur-sm transition-all hover:border-teal-500/50 dark:text-teal-300"
              >
                {t("search.title")}
              </motion.span>
            </Link>
          </motion.div>
          {/* Collision-beam target (vanity trust stats removed — G-VANITY) */}
          <div ref={heroCollisionTargetRef} className="min-h-[1px] w-full" />
        </div>
      </section>

      {/* ── Logo Cloud (marquee) — from blocks/logo-clouds/logo-cloud-marquee.tsx ── */}
      <LogoMarquee />

      {/* ── Categories ── */}
      {/*
        DB-driven 4 featured cards (Airbnb pattern). Cards are rendered from
        glatko_service_categories rows fetched in the parent server page; the
        full grid (14 categories) lives at /services. Subcategory chips were
        removed — they are surfaced on the category detail page.
      */}
      <section id="categories" className="px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <SectionReveal className="mb-16 text-center">
            <h2 className="font-serif text-3xl text-gray-900 dark:text-white sm:text-4xl">
              {t("categories.title")}
            </h2>
            <p className="mt-4 text-gray-500 dark:text-white/50">
              {t("categories.subtitleDynamic", { count: totalCategoryCount })}
            </p>
          </SectionReveal>
          <div className="grid gap-8 md:grid-cols-2">
            {featuredCategories.map((cat, i) => {
              const Icon = (cat.icon && ICON_MAP[cat.icon]) || Tag;
              const name = pickLocalized(cat.name, locale);
              const description = pickLocalized(cat.description, locale);
              return (
                <StaggerItem key={cat.id} index={i}>
                  <SpotlightCard>
                    {cat.hero_image_url && (
                      <div className="-mx-8 -mt-8 mb-6 overflow-hidden rounded-t-2xl">
                        <Image
                          src={cat.hero_image_url}
                          alt={name}
                          width={800}
                          height={450}
                          className="h-44 w-full object-cover sm:h-52"
                          sizes="(min-width: 768px) 50vw, 100vw"
                          priority={i === 0}
                        />
                      </div>
                    )}
                    <div className="mb-4 flex items-center gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-500/10 dark:bg-teal-500/15">
                        <Icon className="h-8 w-8 text-teal-600 dark:text-teal-400" />
                      </div>
                      <div className="text-left">
                        <h3 className="font-sans text-xl font-semibold text-gray-900 dark:text-white">
                          {name}
                        </h3>
                        {description && (
                          <p className="text-sm text-gray-500 dark:text-white/50">
                            {description}
                          </p>
                        )}
                      </div>
                    </div>
                    <Link
                      href={{ pathname: "/services/[slug]", params: { slug: cat.slug } }}
                      className="text-sm font-semibold text-teal-600 hover:underline dark:text-teal-400"
                    >
                      {t("categories.getQuote")} →
                    </Link>
                  </SpotlightCard>
                </StaggerItem>
              );
            })}
          </div>

          {allCategories.length > 0 && (
            <nav
              aria-label={t("categories.title")}
              className="mt-12 flex flex-wrap justify-center gap-x-5 gap-y-2"
            >
              {allCategories.map((cat) => (
                <Link
                  key={cat.slug}
                  href={{ pathname: "/services/[slug]", params: { slug: cat.slug } }}
                  className="text-sm text-gray-600 transition-colors hover:text-teal-600 hover:underline dark:text-white/60 dark:hover:text-teal-400"
                >
                  {pickLocalized(cat.name, locale)}
                </Link>
              ))}
            </nav>
          )}

          <div className="mt-12 text-center">
            <Link
              href="/services"
              className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-white px-6 py-3 text-sm font-semibold text-teal-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 dark:border-teal-500/30 dark:bg-white/5 dark:text-teal-300 dark:hover:bg-teal-500/10"
            >
              {t("categories.viewAllCategories", { count: totalCategoryCount })}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Bento Features (How It Works) — from blocks/bento-grids/bento-grid-with-skeletons.tsx ── */}
      <BentoFeatures />

      {/* ── Deep Features (Why Glatko?) — from schedule/features3.tsx pattern ── */}
      <DeepFeatures />

      <MobileShowcase
        title={t("landing.mobile.title")}
        subtitle={t("landing.mobile.subtitle")}
      />

      {/* ── Testimonials — from schedule/testimonials.tsx ── */}
      <Testimonials />

      <ImagesCTA
        title={t("landing.cta.title")}
        subtitle={t("landing.cta.subtitle")}
        buttonText={t("landing.cta.requestBtn")}
        buttonHref="/request-service"
        trustText={t("auth.brandPanel.bullet1")}
      />

      {/* ── FAQ — from schedule/faq.tsx ── */}
      <FAQ />

      {/* ── CTA — from blocks/cta/cta-with-dashed-grid-lines.tsx ── */}
      <DashedGridCTA />
    </>
  );
}
