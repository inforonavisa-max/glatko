"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Link from "next/link";
import {
  Star,
  CheckCircle,
  Calendar,
  Clock,
  Loader2,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { acceptBidAction } from "@/app/[locale]/dashboard/requests/[id]/actions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { trackEventWithMeta } from "@/lib/analytics/track";

interface BidData {
  id: string;
  price: number;
  price_type: string;
  message: string | null;
  status: string;
  created_at: string;
  estimated_duration_hours: number | null;
  available_date: string | null;
  professional?: {
    id: string;
    business_name: string | null;
    avg_rating: number;
    total_reviews: number;
    completed_jobs: number;
    is_verified: boolean;
  };
}

interface Props {
  bids: BidData[];
  requestId: string;
  requestStatus: string;
  locale: string;
}

export function BidComparison({ bids, requestId, requestStatus, locale }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleAccept(bidId: string) {
    if (!window.confirm(t("bidComparison.acceptConfirm") + "\n\n" + t("bidComparison.acceptConfirmDesc"))) return;
    setAcceptingId(bidId);
    startTransition(async () => {
      try {
        const result = await acceptBidAction(bidId, requestId);
        if (result.success) {
          // G-ADS-3: secondary customer conversion event — bid accepted.
          // Fired before redirect/state flip; provider_id pulled from bid row.
          const acceptedBid = bids.find((b) => b.id === bidId);
          trackEventWithMeta("customer_bid_accepted", {
            bid_id: bidId,
            job_id: requestId,
            provider_id: acceptedBid?.professional?.id,
          });
        }
        if (result.success && result.conversationId) {
          router.push({
            pathname: "/inbox/[conversationId]",
            params: { conversationId: result.conversationId },
          });
          return;
        }
        if (result.success) {
          setSuccess(true);
          setTimeout(() => router.refresh(), 1500);
          return;
        }
        toast.error(result.error ?? t("bidComparison.acceptError"));
      } finally {
        setAcceptingId(null);
      }
    });
  }

  if (bids.length === 0) {
    return (
      <div className="py-10 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-white/[0.05]">
          <div className="flex gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-400" style={{ animationDelay: "0ms" }} />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-400" style={{ animationDelay: "150ms" }} />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-400" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
        <p className="text-sm text-gray-500 dark:text-white/40">{t("bidComparison.noBids")}</p>
      </div>
    );
  }

  const canAccept = ["published", "bidding"].includes(requestStatus);

  return (
    <div className="grid min-w-0 max-w-full gap-4 md:grid-cols-2">
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="col-span-full rounded-2xl border border-teal-500/30 bg-teal-500/[0.06] p-5 text-center"
          >
            <CheckCircle className="mx-auto mb-2 h-8 w-8 text-teal-500" />
            <p className="text-sm font-medium text-teal-600 dark:text-teal-400">{t("bidComparison.assignedSuccess")}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {bids.map((bid, i) => {
        const pro = bid.professional;
        const isAccepted = bid.status === "accepted";
        const isRejected = bid.status === "rejected";
        const fullStars = Math.round(pro?.avg_rating ?? 0);

        return (
          <motion.div
            key={bid.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.08 }}
            className={cn(
              "min-w-0 rounded-2xl border p-5 transition-all duration-300",
              isAccepted
                ? "border-teal-500/40 bg-teal-500/[0.04] dark:bg-teal-500/[0.06]"
                : isRejected
                  ? "border-gray-200/50 bg-gray-50/50 opacity-50 dark:border-white/[0.04] dark:bg-white/[0.01]"
                  : "border-gray-200/50 bg-white/50 hover:border-teal-500/20 dark:border-white/[0.08] dark:bg-white/[0.02]"
            )}
          >
            {/* Accepted / rejected badges */}
            {isAccepted && (
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 px-3 py-1 text-xs font-medium text-teal-600 dark:text-teal-400">
                <CheckCircle className="h-3 w-3" />
                {t("bidComparison.accepted")}
              </div>
            )}
            {isRejected && (
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-500 dark:text-red-400">
                {t("bidComparison.rejected")}
              </div>
            )}

            {/* Quick message link for accepted */}
            {isAccepted && (
              <Link
                href={`/${locale}/inbox`}
                className="mb-4 inline-flex items-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/[0.04] px-4 py-2 text-xs font-medium text-teal-600 transition-all hover:bg-teal-500/10 dark:text-teal-400"
              >
                <MessageSquare className="h-3 w-3" />
                {t("bidComparison.messageButton")}
              </Link>
            )}

            {/* Pro info + price */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-600 dark:bg-white/[0.06] dark:text-white/60">
                  {pro?.business_name?.charAt(0) ?? "P"}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {pro?.business_name ?? t("dashboard.detail.anonymous")}
                    </p>
                    {pro?.is_verified && (
                      <ShieldCheck className="h-3.5 w-3.5 text-teal-500" />
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }, (_, j) => (
                        <Star
                          key={j}
                          className={cn(
                            "h-3 w-3",
                            j < fullStars
                              ? "fill-teal-500 text-teal-500"
                              : "text-gray-300 dark:text-white/15"
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-gray-400 dark:text-white/40">
                      {(pro?.avg_rating ?? 0).toFixed(1)} ({pro?.total_reviews ?? 0})
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <p className="text-2xl font-bold text-teal-600 dark:text-teal-400 sm:text-3xl">
                  €{bid.price}
                </p>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-white/[0.06] dark:text-white/40">
                  {t(`bidForm.${bid.price_type}`)}
                </span>
              </div>
            </div>

            {/* Message */}
            {bid.message && (
              <p className="mt-4 break-words rounded-xl bg-gray-50 p-3 text-sm italic text-gray-600 dark:bg-white/[0.02] dark:text-white/50">
                &ldquo;{bid.message}&rdquo;
              </p>
            )}

            {/* Meta */}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-400 dark:text-white/40">
              {bid.available_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-teal-500" />
                  {t("bidComparison.available")}: {bid.available_date}
                </span>
              )}
              {bid.estimated_duration_hours && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-teal-500" />
                  {t("bidComparison.duration")}: ~{bid.estimated_duration_hours} {t("bidComparison.hours")}
                </span>
              )}
            </div>

            {/* Action buttons */}
            {!isRejected && canAccept && bid.status === "pending" && (
              <div className="mt-5 flex flex-col gap-2 border-t border-gray-100 pt-4 dark:border-white/[0.06] sm:flex-row sm:items-center">
                {pro && (
                  <Link
                    href={`/${locale}/provider/${pro.id}`}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-center text-xs font-medium text-gray-600 transition-all hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/60 dark:hover:bg-white/[0.06] sm:w-auto"
                  >
                    {t("bidComparison.viewProfile")}
                  </Link>
                )}
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleAccept(bid.id)}
                  disabled={isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-6 py-2.5 text-xs font-semibold text-white shadow-lg shadow-teal-500/25 transition-all disabled:opacity-50 sm:ml-auto sm:w-auto"
                >
                  {isPending && acceptingId === bid.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle className="h-3 w-3" />
                  )}
                  {t("bidComparison.accept")}
                </motion.button>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
