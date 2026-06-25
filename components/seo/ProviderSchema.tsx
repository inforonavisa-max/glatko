import type { ProfessionalProfile } from "@/types/glatko";
import { jsonLdScriptProps } from "@/lib/seo/jsonld";

interface QuoteReview {
  id: string;
  rating: number;
  comment: string | null;
  customer_display_name: string | null;
  created_at: string;
}

interface Props {
  pro: ProfessionalProfile;
  reviews: QuoteReview[];
  canonicalUrl: string;
}

/**
 * G-SEO-FOUNDATION: LocalBusiness + AggregateRating + Review[] JSON-LD for
 * provider profile pages. Supersedes the leaner LocalBusinessSchema by
 * including up to N quote-review entries so Google can build the rich-result
 * star snippet directly from the markup (rather than waiting for crawl-side
 * review aggregation).
 */
export function ProviderSchema({ pro, reviews, canonicalUrl }: Props) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": canonicalUrl,
    name: pro.business_name || pro.profile?.full_name || undefined,
    url: canonicalUrl,
    image: pro.profile?.avatar_url || undefined,
    description: pro.bio?.trim() || undefined,
    address: pro.location_city
      ? {
          "@type": "PostalAddress",
          addressLocality: pro.location_city,
          addressCountry: "ME",
        }
      : undefined,
    // Disintermediation (G-DISINT): no telephone in public JSON-LD — the pro's
    // phone must not reach the client/crawlers from a customer-facing surface.
    aggregateRating:
      pro.total_reviews > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: pro.avg_rating,
            reviewCount: pro.total_reviews,
            bestRating: 5,
            worstRating: 1,
          }
        : undefined,
    review: reviews.length
      ? reviews.map((r) => ({
          "@type": "Review",
          author: {
            "@type": "Person",
            name: r.customer_display_name || "Customer",
          },
          datePublished: r.created_at,
          reviewRating: {
            "@type": "Rating",
            ratingValue: r.rating,
            bestRating: 5,
            worstRating: 1,
          },
          reviewBody: r.comment || undefined,
        }))
      : undefined,
  };

  return <script {...jsonLdScriptProps(schema)} />;
}
