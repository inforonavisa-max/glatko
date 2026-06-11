"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { respondToReview } from "@/app/[locale]/pros/[slug]/actions";

interface QuoteReview {
  id: string;
  rating: number;
  comment: string | null;
  customer_display_name: string | null;
  created_at: string;
  pro_response: string | null;
  pro_response_at: string | null;
}

interface Props {
  reviews: QuoteReview[];
  locale: string;
  /** Logged-in viewer is this profile's professional → respond form (K3). */
  viewerIsOwner?: boolean;
}

/** G-REVIEW-R1 (K3): inline write/edit form for the pro's single public response. */
function ProResponseForm({
  reviewId,
  initialResponse,
  onClose,
}: {
  reviewId: string;
  initialResponse: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [text, setText] = useState(initialResponse);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await respondToReview({
        review_id: reviewId,
        response: text,
      });
      if (!result.success) {
        setError(result.error ?? t("pro.reviews.response.error"));
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <div className="mt-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={1000}
        placeholder={t("pro.reviews.response.placeholder")}
        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
      />
      <p className="mt-1 text-xs text-gray-500 dark:text-neutral-500">
        {text.length} / 1000
      </p>
      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !text.trim()}
          className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {t("pro.reviews.response.submit")}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-medium text-gray-700 dark:border-neutral-700 dark:text-neutral-300"
        >
          {t("pro.reviews.response.cancel")}
        </button>
      </div>
    </div>
  );
}

export function QuoteReviewsSection({
  reviews,
  locale,
  viewerIsOwner = false,
}: Props) {
  const t = useTranslations();
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

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

            {/* G-REVIEW-R1 (K3): public pro response block */}
            {review.pro_response && respondingTo !== review.id && (
              <div className="mt-3 rounded-lg bg-gray-50 dark:bg-neutral-800/60 border-l-2 border-teal-500 px-4 py-3">
                <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 mb-1 flex items-center gap-1">
                  <MessageCircle className="h-3.5 w-3.5" />
                  {t("pro.reviews.response.label")}
                </p>
                <p className="text-sm text-gray-700 dark:text-neutral-300 whitespace-pre-wrap">
                  {review.pro_response}
                </p>
              </div>
            )}

            {viewerIsOwner &&
              (respondingTo === review.id ? (
                <ProResponseForm
                  reviewId={review.id}
                  initialResponse={review.pro_response ?? ""}
                  onClose={() => setRespondingTo(null)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setRespondingTo(review.id)}
                  className="mt-3 text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline"
                >
                  {review.pro_response
                    ? t("pro.reviews.response.editCta")
                    : t("pro.reviews.response.cta")}
                </button>
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}
