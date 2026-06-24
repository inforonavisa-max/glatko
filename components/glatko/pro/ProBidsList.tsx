"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Gavel, Calendar, MapPin, DollarSign, Play, CheckCircle, MessageSquare, Loader2 } from "lucide-react";
import { withdrawBidAction, startJobAction, completeJobAction } from "@/app/[locale]/pro/dashboard/bids/actions";
import { cn } from "@/lib/utils";

interface BidItem {
  id: string;
  price: number;
  price_type: string;
  message: string | null;
  status: string;
  created_at: string;
  estimated_duration_hours: number | null;
  available_date: string | null;
  service_request?: {
    id: string;
    title: string;
    status: string;
    municipality: string | null;
    urgency: string;
    budget_min: number | null;
    budget_max: number | null;
    created_at: string;
    category?: { name: Record<string, string> };
  };
}

interface Props {
  bids: BidItem[];
  locale: string;
}

const BID_STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  accepted: "bg-green-500/10 text-green-400 border-green-500/20",
  rejected: "bg-red-500/10 text-red-400 border-red-500/20",
  withdrawn: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  expired: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

export function ProBidsList({ bids, locale }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const [isPending, startTransition] = useTransition();
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const filters = [
    { key: "all", label: t("bids.all") },
    { key: "pending", label: t("bids.pending") },
    { key: "accepted", label: t("bids.accepted") },
    { key: "rejected", label: t("bids.rejected") },
    { key: "withdrawn", label: t("bids.withdrawn") },
  ];

  const filtered = filter === "all" ? bids : bids.filter((b) => b.status === filter);

  function handleWithdraw(bidId: string) {
    if (!window.confirm(t("bids.withdrawConfirm"))) return;
    setWithdrawingId(bidId);
    startTransition(async () => {
      await withdrawBidAction(bidId);
      router.refresh();
      setWithdrawingId(null);
    });
  }

  function handleStartJob(requestId: string) {
    if (!window.confirm(t("jobStatus.startJobConfirm"))) return;
    setActionId(requestId);
    startTransition(async () => {
      await startJobAction(requestId);
      router.refresh();
      setActionId(null);
    });
  }

  function handleCompleteJob(requestId: string) {
    if (!window.confirm(t("jobStatus.completeJobConfirm"))) return;
    setActionId(requestId);
    startTransition(async () => {
      await completeJobAction(requestId);
      router.refresh();
      setActionId(null);
    });
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="mb-8">
        <h1 className="font-serif text-2xl text-gray-900 dark:text-white md:text-3xl">{t("bids.title")}</h1>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-4 py-2 text-xs font-medium transition-all",
              filter === f.key
                ? "border-teal-500 bg-teal-500/10 text-teal-600 dark:text-teal-400"
                : "border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:border-white/[0.1] dark:text-white/40 dark:hover:bg-white/[0.04] dark:hover:text-white/60"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
          <Gavel className="mb-4 h-12 w-12 text-teal-500/30" />
          <h3 className="font-serif text-xl text-gray-900 dark:text-white">{t("bids.empty")}</h3>
          <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-white/40">{t("bids.emptyDesc")}</p>
          <Link href={`/${locale}/pro/dashboard/requests`} className="mt-6 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-teal-500/25">
            {t("proRequests.title")}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((bid, i) => {
            const req = bid.service_request;
            const catName = req?.category?.name?.[locale] ?? req?.category?.name?.en ?? "";
            return (
              <motion.div
                key={bid.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className={cn(
                  "rounded-2xl border border-gray-200/50 bg-white/70 p-5 backdrop-blur-sm transition-all dark:border-white/[0.08] dark:bg-white/[0.03]",
                  bid.status === "rejected" || bid.status === "withdrawn" ? "opacity-60" : ""
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {req && (
                      <Link href={`/${locale}/pro/dashboard/requests/${req.id}`} className="text-lg font-medium text-gray-900 hover:text-teal-600 transition-colors dark:text-white dark:hover:text-teal-400">
                        {req.title}
                      </Link>
                    )}
                    <p className="mt-1 text-xs text-gray-400 dark:text-white/40">{catName}</p>
                  </div>
                  <span className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-medium", BID_STATUS_STYLE[bid.status] || BID_STATUS_STYLE.pending)}>
                    {t(`bids.${bid.status}`)}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <span className="text-2xl font-bold text-teal-500">€{bid.price}</span>
                  <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-400 dark:border-white/[0.1] dark:text-white/40">
                    {t(`bidForm.${bid.price_type}`)}
                  </span>
                  {bid.estimated_duration_hours && (
                    <span className="text-xs text-gray-400 dark:text-white/40">~{bid.estimated_duration_hours} {t("bidComparison.hours")}</span>
                  )}
                  {bid.available_date && (
                    <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-white/40">
                      <Calendar className="h-3 w-3" />{bid.available_date}
                    </span>
                  )}
                </div>

                {req && (
                  <div className="mt-3 flex items-center gap-3 text-xs text-gray-400 dark:text-white/30">
                    {req.municipality && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{req.municipality}</span>}
                    {(req.budget_min || req.budget_max) && <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />€{req.budget_min ?? "?"}-€{req.budget_max ?? "?"}</span>}
                  </div>
                )}

                {bid.status === "pending" && (
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => handleWithdraw(bid.id)}
                      disabled={isPending && withdrawingId === bid.id}
                      className="rounded-xl border border-red-500/30 px-4 py-2 text-xs font-medium text-red-400 transition-all hover:bg-red-500/10 disabled:opacity-50"
                    >
                      {isPending && withdrawingId === bid.id ? "..." : t("bids.withdraw")}
                    </button>
                  </div>
                )}

                {bid.status === "accepted" && req && (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <Link
                      href={`/${locale}/messages`}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/5 px-4 py-2 text-xs font-medium text-teal-400 transition-all hover:bg-teal-500/10"
                    >
                      <MessageSquare className="h-3 w-3" />
                      {t("bids.messageButton")}
                    </Link>
                    {req.status === "assigned" && (
                      <button
                        onClick={() => handleStartJob(req.id)}
                        disabled={isPending && actionId === req.id}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2 text-xs font-medium text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-xl disabled:opacity-50"
                      >
                        {isPending && actionId === req.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        {t("jobStatus.startJob")}
                      </button>
                    )}
                    {req.status === "in_progress" && (
                      <button
                        onClick={() => handleCompleteJob(req.id)}
                        disabled={isPending && actionId === req.id}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-green-500 to-green-600 px-4 py-2 text-xs font-medium text-white shadow-lg shadow-green-500/25 transition-all hover:shadow-xl disabled:opacity-50"
                      >
                        {isPending && actionId === req.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                        {t("jobStatus.completeJob")}
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
