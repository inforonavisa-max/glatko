"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";

interface QuoteReview {
  id: string;
  rating: number;
  comment: string | null;
  customer_display_name: string | null;
  created_at: string;
}

interface Props {
  reviews: QuoteReview[];
  locale: string;
}

export function QuoteReviewsSection({ reviews, locale }: Props) {
  const t = useTranslations();

  const avg =
    reviews.length === 0
      ? 0
      : reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

  return (
    <section>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t("pro.reviews.title")}
        </h2>
        {reviews.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
              <span className="font-semibold text-gray-900 dark:text-white">
                {avg.toFixed(1)}
              </span>
            </div>
            <span className="text-gray-600 dark:text-neutral-400 text-sm">
              ({reviews.length})
            </span>
          </div>
        )}
      </div>

      {reviews.length === 0 && (
        <div className="py-12 text-center">
          <Star className="mx-auto mb-4 h-12 w-12 text-gray-300 dark:text-neutral-600" />
          <p className="text-sm text-gray-500 dark:text-neutral-400">
            {t("ratings.noReviews")}
          </p>
        </div>
      )}

      <div className="space-y-4">
        {reviews.map((review) => (
          <div
            key={review.id}
            className="rounded-lg border border-gray-200 dark:border-neutral-800 p-4"
          >
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-900 dark:text-white">
                  {review.customer_display_name ?? t("pro.reviews.anonymous")}
                </span>
                <div className="flex" aria-label={`${review.rating} stars`}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`h-4 w-4 ${
                        s <= review.rating
                          ? "text-yellow-500 fill-yellow-500"
                          : "text-gray-300 dark:text-neutral-600"
                      }`}
                    />
                  ))}
                </div>
              </div>
              <span className="text-sm text-gray-500 dark:text-neutral-500">
                {new Date(review.created_at).toLocaleDateString(locale, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
            {review.comment && (
              <p className="text-gray-700 dark:text-neutral-300 mt-2 whitespace-pre-wrap">
                {review.comment}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
