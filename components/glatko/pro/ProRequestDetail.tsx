"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, MapPin, Clock, Calendar, DollarSign, Camera, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { urgencyToStep3Key } from "@/lib/utils/urgencyI18n";

interface Props {
  request: {
    id: string;
    title: string;
    description: string | null;
    municipality: string | null;
    address: string | null;
    urgency: string;
    budget_min: number | null;
    budget_max: number | null;
    bid_count: number;
    max_bids: number;
    photos: string[];
    created_at: string;
    preferred_date_start: string | null;
    preferred_date_end: string | null;
    details: Record<string, unknown>;
    category?: { id: string; slug: string; name: Record<string, string>; icon: string | null };
    customer?: { full_name: string | null; avatar_url: string | null };
  };
  locale: string;
}

export function ProRequestDetail({ request, locale }: Props) {
  const t = useTranslations();
  const catName = request.category?.name?.[locale] ?? request.category?.name?.en ?? "";
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <Link href={`/${locale}/pro/dashboard/requests`} className="mb-6 inline-flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-teal-500 dark:text-white/40 dark:hover:text-teal-400">
        <ArrowLeft className="h-4 w-4" />
        {t("proRequests.title")}
      </Link>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-gray-200/50 bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="mb-1 text-xs text-gray-400 dark:text-white/40">{catName}</p>
                <h1 className="font-serif text-2xl text-gray-900 dark:text-white">{request.title}</h1>
              </div>
              <span className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
                request.urgency === "asap" ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"
              )}>
                {t(`request.step3.urgency.${urgencyToStep3Key(request.urgency)}`)}
              </span>
            </div>

            {request.customer && (
              <div className="mb-4 flex items-center gap-2 text-sm text-gray-500 dark:text-white/50">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500 dark:bg-white/[0.1] dark:text-white/60">
                  {request.customer.full_name?.charAt(0) ?? "?"}
                </div>
                {request.customer.full_name?.split(" ")[0] ?? "Customer"}
              </div>
            )}

            {request.description && <p className="mb-4 text-sm text-gray-600 dark:text-white/60">{request.description}</p>}

            <div className="grid gap-3 sm:grid-cols-2">
              {request.municipality && (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-white/50">
                  <MapPin className="h-4 w-4 text-teal-400" />{request.municipality}{request.address ? ` — ${request.address}` : ""}
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-white/50">
                <Clock className="h-4 w-4 text-teal-400" />{t(`request.step3.urgency.${urgencyToStep3Key(request.urgency)}`)}
              </div>
              {request.preferred_date_start && (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-white/50">
                  <Calendar className="h-4 w-4 text-teal-400" />{request.preferred_date_start}{request.preferred_date_end ? ` — ${request.preferred_date_end}` : ""}
                </div>
              )}
              {(request.budget_min || request.budget_max) && (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-white/50">
                  <DollarSign className="h-4 w-4 text-teal-400" />€{request.budget_min ?? "?"} - €{request.budget_max ?? "?"}
                </div>
              )}
            </div>
          </div>

          {/* Photos */}
          {request.photos?.length > 0 && (
            <div className="rounded-2xl border border-gray-200/50 bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-gray-400 uppercase tracking-wider dark:text-white/40">
                <Camera className="h-4 w-4" />{t("dashboard.detail.photos")}
              </h3>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                {request.photos.map((url) => (
                  <div key={url} className="aspect-square overflow-hidden rounded-xl">
                    <Image src={url} alt="" width={120} height={120} unoptimized className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: quotes now flow through Business Opportunities (G-REVIEW-R1 K4) */}
        <div className="lg:col-span-1">
          <div className="sticky top-4 rounded-2xl border border-gray-200/50 bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal-500/10">
              <Target className="h-6 w-6 text-teal-500" />
            </div>
            <p className="text-sm text-gray-600 dark:text-white/60">
              {t("proRequests.detail.quotesViaLeads")}
            </p>
            <Link
              href={`/${locale}/pro/dashboard/leads`}
              className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40"
            >
              {t("nav.leads")}
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
