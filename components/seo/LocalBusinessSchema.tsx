import type { ProfessionalProfile } from "@/types/glatko";
import { jsonLdScriptProps } from "@/lib/seo/jsonld";

interface Props {
  pro: ProfessionalProfile;
}

export function LocalBusinessSchema({ pro }: Props) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: pro.business_name || pro.profile?.full_name || undefined,
    image: pro.profile?.avatar_url || undefined,
    address: pro.location_city
      ? {
          "@type": "PostalAddress",
          addressLocality: pro.location_city,
          addressCountry: "ME",
        }
      : undefined,
    aggregateRating:
      pro.total_reviews > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: pro.avg_rating,
            reviewCount: pro.total_reviews,
          }
        : undefined,
  };

  return <script {...jsonLdScriptProps(schema)} />;
}
