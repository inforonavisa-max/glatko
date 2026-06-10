import Image from "next/image";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Briefcase,
  CheckCircle,
  Clock,
  Globe,
  Languages,
  MapPin,
  MessageCircle,
  Phone,
  Star,
  Eye,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { PageBackground } from "@/components/ui/PageBackground";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import {
  getProfessionalProfileBySlug,
  calculateTrustBadges,
} from "@/lib/supabase/glatko.server";
import { TrustBadge } from "@/components/glatko/trust/TrustBadge";
import { VerifiedBadgeWithProof } from "@/components/glatko/verification/VerifiedBadgeWithProof";
import { FoundingProviderBadge } from "@/components/glatko/founding/FoundingProviderBadge";
import { ContactLinkButton } from "@/components/glatko/provider/ContactLinkButton";
import type {
  VerificationData,
  VerificationDoc,
} from "@/components/glatko/verification/VerificationProofModal";
import { QuoteReviewsSection } from "@/components/glatko/pro/QuoteReviewsSection";
import { ProviderSchema } from "@/components/seo/ProviderSchema";
import { buildAlternates, hreflangForLocale } from "@/lib/seo";
import type { Metadata } from "next";
import type { MultiLangText, ProService } from "@/types/glatko";

function labelForCategory(
  category: ProService["category"] | undefined,
  locale: Locale
): string {
  const raw = category?.name;
  if (!raw || typeof raw !== "object") return "";
  const n = raw as MultiLangText;
  return (
    n[locale] ??
    n.en ??
    n.tr ??
    (Object.values(n).find((v) => typeof v === "string") as string | undefined) ??
    ""
  );
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

type PageProps = {
  params:
    | Promise<{ locale: string; slug: string }>
    | { locale: string; slug: string };
};

/**
 * Provider profiles are locale-neutral: business_name + bio + services are a
 * single untranslated row, so all 9 locale URLs serve near-identical content.
 * We consolidate indexing onto ONE canonical to avoid duplicate-content
 * dilution ("Crawled — currently not indexed"); the hreflang alternates still
 * advertise every locale URL, so per-locale users land on their localized UI.
 * Target = "me" — Glatko's primary market (Montenegro) — so provider SERPs
 * consolidate to the local URL rather than English.
 * See docs/audits/gsc-audit-2026-05-18.md Bug F; G-CANONICAL-FIX (2026-06-02)
 * switched the consolidation target /en → /me.
 */
const PROVIDER_CANONICAL_LOCALE = "me";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const profile = await getProfessionalProfileBySlug(slug);
  if (!profile) return {};
  const name =
    profile.business_name?.trim() ||
    profile.profile?.full_name?.trim() ||
    "Professional";
  const city = profile.location_city || "Montenegro";
  // Consolidate canonical onto the primary-market locale (see the
  // PROVIDER_CANONICAL_LOCALE note above). hreflang alternates are unchanged —
  // every locale URL is still advertised; only the indexing target moves.
  const alts = buildAlternates(locale, "/pros/[slug]", { slug });
  const canonical =
    alts.languages[hreflangForLocale(PROVIDER_CANONICAL_LOCALE)];

  return {
    title: name,
    description: `${name} — verified professional in ${city}. ${profile.avg_rating.toFixed(1)}★ rating, ${profile.completed_jobs} jobs completed.`,
    alternates: {
      canonical,
      languages: alts.languages,
    },
    openGraph: {
      title: `${name} — Glatko`,
      description: `Verified professional in ${city}. Get a quote on Glatko.`,
      url: canonical,
      siteName: "Glatko",
      locale,
      type: "profile",
    },
    robots: { index: true, follow: true },
  };
}

export default async function ProviderProfileBySlugPage({ params }: PageProps) {
  const { locale: localeParam, slug } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, localeParam)) notFound();
  const locale = localeParam as Locale;
  setRequestLocale(locale);
  const t = await getTranslations();

  const profile = await getProfessionalProfileBySlug(slug);
  if (!profile) notFound();
  const id = profile.id;

  const { createClient: _createSupabase } = await import("@/supabase/server");
  const _supabase = _createSupabase();
  const { data: quoteReviewsRaw } = await _supabase
    .from("glatko_quote_reviews")
    .select("id, rating, comment, customer_display_name, created_at")
    .eq("professional_id", id)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(10);
  const quoteReviews = (quoteReviewsRaw ?? []) as Array<{
    id: string;
    rating: number;
    comment: string | null;
    customer_display_name: string | null;
    created_at: string;
  }>;
  const trustBadges = await calculateTrustBadges(id);

  const displayName =
    profile.business_name?.trim() ||
    profile.profile?.full_name?.trim() ||
    t("pro.profile.newPro");

  const services = profile.services ?? [];
  const categories = Array.from(
    new Map(
      services
        .map((s) => s.category)
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map((c) => [c.id, c])
    ).values()
  );

  const rating = profile.avg_rating;
  const fullStars = Math.min(5, Math.round(rating));

  const proAny = profile as unknown as {
    verified_at?: string | null;
    tier_documents?: Record<
      string,
      { verified?: boolean; verified_at?: string }
    > | null;
    verification_tier?: "basic" | "business" | "professional" | null;
  };
  const docMap = proAny.tier_documents ?? {};
  const verificationData: VerificationData = {
    verifiedAt: proAny.verified_at ?? null,
    verifiedBy: "Glatko Trust Team",
    tier: proAny.verification_tier ?? "basic",
    documents: (
      [
        "business_registration",
        "license",
        "insurance",
        "tax_certificate",
      ] as VerificationDoc["type"][]
    ).map((type) => ({
      type,
      verified: Boolean(docMap[type]?.verified),
      verifiedAt: docMap[type]?.verified_at,
    })),
  };

  const statItems = [
    {
      value: profile.completed_jobs,
      label: t("pro.profile.completedJobs"),
      icon: CheckCircle,
    },
    ...(profile.response_time_minutes != null
      ? [
          {
            value: `${profile.response_time_minutes}m`,
            label: t("pro.profile.responseTime"),
            icon: Clock,
          },
        ]
      : []),
    ...(profile.years_experience != null
      ? [
          {
            value: profile.years_experience,
            label: t("pro.profile.yearsExp"),
            icon: Briefcase,
          },
        ]
      : []),
    { value: rating.toFixed(1), label: t("pro.profile.rating"), icon: Star },
  ];

  // Mirror generateMetadata: JSON-LD @id must match the <link rel="canonical">
  // Google selects — both consolidate onto the primary-market locale.
  const canonicalUrl = buildAlternates(locale, "/pros/[slug]", { slug })
    .languages[hreflangForLocale(PROVIDER_CANONICAL_LOCALE)];

  return (
    <PageBackground opacity={0.06}>
      <ProviderSchema
        pro={profile}
        reviews={quoteReviews}
        canonicalUrl={canonicalUrl}
      />

      <div className="relative">
        <div className="absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-teal-600/[0.15] via-teal-500/[0.06] to-transparent dark:from-teal-600/[0.12] dark:via-teal-500/[0.04]" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 pb-20 pt-28 sm:px-6">
        <div className="relative mb-8 rounded-3xl border border-gray-200/60 bg-white/80 p-6 shadow-xl backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03] sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            {profile.profile?.avatar_url ? (
              // priority: this avatar is the mobile LCP element. It sits above
              // the fold (top ~145px) and, once the bio is pushed below the
              // fold by the stacked mobile layout, it's the largest contentful
              // element in the viewport. Default next/image lazy-loading made
              // it paint only after the main thread cleared (~8-9s in the
              // audit, vs 1.2s FCP). `priority` drops the lazy attr, adds
              // fetchpriority=high + a preload so it loads in the first wave.
              // (Desktop LCP is the bio text and already paints at FCP — this
              // change targets the mobile regression specifically.) G-CWV-FIX-1B
              <Image
                src={profile.profile.avatar_url}
                alt=""
                width={112}
                height={112}
                priority
                className="h-28 w-28 shrink-0 rounded-full border-4 border-white object-cover shadow-2xl dark:border-[#0b1f23]"
              />
            ) : (
              <div
                className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-4 border-white bg-teal-500/20 text-3xl font-semibold text-teal-700 shadow-2xl dark:border-[#0b1f23] dark:text-teal-300"
                aria-hidden
              >
                {initialsFromName(displayName)}
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
                  {displayName}
                </h1>
                {profile.is_verified && (
                  <VerifiedBadgeWithProof
                    verificationData={verificationData}
                    size="md"
                  />
                )}
                {profile.is_founding_provider ? (
                  <FoundingProviderBadge
                    size="md"
                    number={profile.founding_provider_number ?? undefined}
                    tooltipText={
                      profile.founding_provider_number
                        ? t("founding.badge.tooltip", {
                            number: profile.founding_provider_number,
                          })
                        : undefined
                    }
                  />
                ) : null}
              </div>

              {trustBadges.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {trustBadges.map((badge) => (
                    <TrustBadge key={badge} badge={badge} size="md" />
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <div
                  className="flex items-center gap-0.5"
                  role="img"
                  aria-label={`${rating.toFixed(1)}`}
                >
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      className={cn(
                        "h-5 w-5",
                        i < fullStars
                          ? "fill-teal-500 text-teal-500"
                          : "text-gray-300 dark:text-white/15"
                      )}
                      aria-hidden
                    />
                  ))}
                </div>
                <span className="text-sm font-medium tabular-nums text-gray-700 dark:text-white/80">
                  {rating.toFixed(1)}
                </span>
                <span className="text-sm text-gray-400 dark:text-white/40">
                  ({profile.total_reviews} {t("ratings.reviews")})
                </span>
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-white/60">
                {profile.location_city && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin
                      className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400"
                      aria-hidden
                    />
                    {profile.location_city}
                  </span>
                )}
                {profile.languages.length > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Languages
                      className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400"
                      aria-hidden
                    />
                    {profile.languages.join(", ")}
                  </span>
                )}
                {profile.years_experience != null && (
                  <span className="inline-flex items-center gap-1.5">
                    <Globe
                      className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400"
                      aria-hidden
                    />
                    {profile.years_experience} {t("pro.profile.yearsExp")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {statItems.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="rounded-2xl border border-gray-200/50 bg-white/70 p-5 text-center backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]"
              >
                <Icon className="mx-auto mb-2 h-5 w-5 text-teal-500/60" />
                <div className="text-2xl font-bold tabular-nums text-teal-600 dark:text-teal-400">
                  {stat.value}
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-white/40">
                  {stat.label}
                </div>
              </div>
            );
          })}
        </div>

        {profile.bio?.trim() && (
          <div className="mb-8 rounded-2xl border border-gray-200/50 bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
            <h2 className="mb-1 font-serif text-xl font-semibold text-gray-900 dark:text-white">
              {t("pro.profile.about")}
            </h2>
            <div className="mt-1 h-0.5 w-8 rounded-full bg-gradient-to-r from-teal-500 to-transparent" />
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-gray-600 dark:text-white/60">
              {profile.bio.trim()}
            </p>
          </div>
        )}

        <div className="mb-8">
          <h2 className="mb-1 font-serif text-xl font-semibold text-gray-900 dark:text-white">
            {t("pro.profile.services")}
          </h2>
          <div className="mb-5 h-0.5 w-8 rounded-full bg-gradient-to-r from-teal-500 to-transparent" />
          {categories.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-white/40">
              {t("pro.profile.noServices")}
            </p>
          ) : (
            <div className="space-y-3">
              {services.map((s, i) => {
                const isPrimary = i === 0;
                return (
                  <div
                    key={`${s.category?.id ?? i}-${s.id ?? i}`}
                    className={cn(
                      "flex items-center gap-4 rounded-2xl border p-4 transition-all duration-300 hover:border-teal-500/30",
                      isPrimary
                        ? "border-l-2 border-l-teal-500 border-gray-200/50 bg-white/70 dark:border-l-teal-500 dark:border-white/[0.08] dark:bg-white/[0.03]"
                        : "border-gray-200/50 bg-white/70 dark:border-white/[0.08] dark:bg-white/[0.03]"
                    )}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 dark:bg-teal-500/15">
                      <Briefcase className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {labelForCategory(s.category, locale)}
                        </span>
                        {isPrimary && (
                          <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-medium text-teal-600 dark:text-teal-400">
                            {t("pro.profile.primary") ?? "Primary"}
                          </span>
                        )}
                      </div>
                    </div>
                    {(s.custom_rate_min || s.custom_rate_max) && (
                      <span className="shrink-0 text-sm font-medium text-teal-600 dark:text-teal-400">
                        {s.custom_rate_min && `€${s.custom_rate_min}`}
                        {s.custom_rate_min && s.custom_rate_max && " – "}
                        {s.custom_rate_max && `€${s.custom_rate_max}`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mb-8">
          <h2 className="mb-1 font-serif text-xl font-semibold text-gray-900 dark:text-white">
            {t("pro.profile.portfolio")}
          </h2>
          <div className="mb-5 h-0.5 w-8 rounded-full bg-gradient-to-r from-teal-500 to-transparent" />
          {profile.portfolio_images.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Eye className="mb-3 h-10 w-10 text-gray-300 dark:text-white/15" />
              <p className="text-sm text-gray-500 dark:text-white/40">
                {t("pro.profile.noPortfolio")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {profile.portfolio_images.map((src) => (
                <div
                  key={src}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-gray-200/50 dark:border-white/[0.08]"
                >
                  <Image
                    src={src}
                    alt=""
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    sizes="(max-width: 640px) 50vw, 33vw"
                    unoptimized
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all duration-300 group-hover:bg-black/30">
                    <Eye className="h-6 w-6 text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mb-8 rounded-2xl border border-gray-200/50 bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
          <QuoteReviewsSection reviews={quoteReviews} locale={locale} />
        </div>

        <div className="rounded-2xl border border-gray-200/50 bg-white/70 p-8 text-center backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
          <h3 className="font-serif text-xl font-semibold text-gray-900 dark:text-white">
            {t("pro.profile.ctaTitle") ?? t("pro.profile.requestQuote")}
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-white/40">
            {t("pro.profile.ctaDesc") ?? ""}
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={{ pathname: "/request-service", query: { pro: id } }}
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-xl hover:shadow-teal-500/30"
            >
              {t("pro.profile.requestQuote")}
            </Link>
            {profile.phone && (
              <>
                <ContactLinkButton
                  href={`https://wa.me/${profile.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent("Merhaba, Glatko üzerinden ulaşıyorum.")}`}
                  channel="whatsapp"
                  providerId={id}
                  providerSlug={slug}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#25D366]/25 transition-all hover:bg-[#20BD5A] hover:shadow-xl hover:shadow-[#25D366]/30"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </ContactLinkButton>
                <ContactLinkButton
                  href={`viber://chat?number=${encodeURIComponent(profile.phone.replace(/[^0-9+]/g, ""))}`}
                  channel="viber"
                  providerId={id}
                  providerSlug={slug}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#7360F2] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#7360F2]/25 transition-all hover:bg-[#6352E0] hover:shadow-xl hover:shadow-[#7360F2]/30"
                >
                  <Phone className="h-4 w-4" />
                  Viber
                </ContactLinkButton>
              </>
            )}
          </div>
        </div>
      </div>
    </PageBackground>
  );
}
