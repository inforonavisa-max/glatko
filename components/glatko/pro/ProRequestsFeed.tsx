"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Search, Camera, Clock, MapPin, DollarSign, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

interface Request {
  id: string;
  title: string;
  description: string | null;
  municipality: string | null;
  urgency: string;
  budget_min: number | null;
  budget_max: number | null;
  bid_count: number;
  max_bids: number;
  photos: string[];
  created_at: string;
  details: Record<string, unknown>;
  category?: { id: string; slug: string; name: Record<string, string>; icon: string | null };
  customer?: { full_name: string | null; avatar_url: string | null };
}

interface Props {
  requests: Request[];
  locale: string;
}

const URGENCY_STYLE: Record<string, string> = {
  asap: "bg-red-500/10 text-red-400 border-red-500/20",
  this_week: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  flexible: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  specific_date: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const URGENCY_KEY: Record<string, string> = {
  asap: "request.step3.urgency.urgent48h",
  this_week: "request.step3.urgency.thisWeek",
  flexible: "request.step3.urgency.flexible",
  specific_date: "request.step3.urgency.specificDate",
};

function timeAgo(dateStr: string, agoLabel: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return `< 1h ${agoLabel}`;
  if (hours < 24) return `${hours}h ${agoLabel}`;
  const days = Math.floor(hours / 24);
  return `${days}d ${agoLabel}`;
}

export function ProRequestsFeed({ requests, locale }: Props) {
  const t = useTranslations();
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");

  let filtered = requests;
  if (filter === "home") filtered = filtered.filter((r) => !r.category?.slug?.includes("boat") && !r.category?.slug?.includes("captain"));
  if (filter === "boat") filtered = filtered.filter((r) => r.category?.slug?.includes("boat") || r.category?.slug?.includes("captain") || r.category?.slug?.includes("antifouling") || r.category?.slug?.includes("engine") || r.category?.slug?.includes("hull") || r.category?.slug?.includes("winter") || r.category?.slug?.includes("charter") || r.category?.slug?.includes("emergency-repair") || r.category?.slug?.includes("haul"));

  if (sort === "budgetHigh") filtered = [...filtered].sort((a, b) => (b.budget_max ?? 0) - (a.budget_max ?? 0));
  if (sort === "urgentFirst") {
    const order: Record<string, number> = { asap: 0, this_week: 1, specific_date: 2, flexible: 3 };
    filtered = [...filtered].sort((a, b) => (order[a.urgency] ?? 9) - (order[b.urgency] ?? 9));
  }

  const filters = [
    { key: "all", label: t("proRequests.filter.all") },
    { key: "home", label: t("proRequests.filter.homeServices") },
    { key: "boat", label: t("proRequests.filter.boatServices") },
  ];

  const sorts = [
    { key: "newest", label: t("proRequests.sort.newest") },
    { key: "budgetHigh", label: t("proRequests.sort.budgetHigh") },
    { key: "urgentFirst", label: t("proRequests.sort.urgentFirst") },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="mb-8">
        <h1 className="font-serif text-2xl text-gray-900 dark:text-white md:text-3xl">{t("proRequests.title")}</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-white/50">{t("proRequests.subtitle")}</p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
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
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="ml-auto rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 focus:border-teal-500/50 focus:outline-none dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-white/60"
        >
          {sorts.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
          <Search className="mb-4 h-12 w-12 text-teal-500/30" />
          <h3 className="font-serif text-xl text-gray-900 dark:text-white">{t("proRequests.empty")}</h3>
          <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-white/40">{t("proRequests.emptyDesc")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((req, i) => {
            const catName = req.category?.name?.[locale] ?? req.category?.name?.en ?? "";
            return (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="group rounded-2xl border border-gray-200/50 bg-white/70 p-5 backdrop-blur-sm transition-all duration-300 hover:border-teal-500/20 hover:-translate-y-0.5 dark:border-white/[0.08] dark:bg-white/[0.03]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <Briefcase className="h-4 w-4 shrink-0 text-teal-500 dark:text-teal-400" />
                      <span className="text-xs text-gray-400 dark:text-white/40">{catName}</span>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">{req.title}</h3>
                    {req.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-white/50">{req.description}</p>
                    )}
                  </div>
                  <span className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-medium", URGENCY_STYLE[req.urgency] || URGENCY_STYLE.flexible)}>
                    {t(URGENCY_KEY[req.urgency] || "request.step3.urgency.flexible")}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-400 dark:text-white/40">
                  {req.municipality && (
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{req.municipality}</span>
                  )}
                  {(req.budget_min || req.budget_max) && (
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      {t("proRequests.card.budget")}: €{req.budget_min ?? "?"} - €{req.budget_max ?? "?"}
                    </span>
                  )}
                  {req.photos?.length > 0 && (
                    <span className="flex items-center gap-1"><Camera className="h-3 w-3" />{req.photos.length} {t("proRequests.card.photos")}</span>
                  )}
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(req.created_at, t("proRequests.card.ago"))}</span>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-200 dark:bg-white/[0.06]">
                      <div className="h-full rounded-full bg-teal-500/60" style={{ width: `${(req.bid_count / req.max_bids) * 100}%` }} />
                    </div>
                    <span className="text-xs text-gray-400 dark:text-white/30">{req.bid_count}/{req.max_bids} {t("proRequests.card.bidsReceived")}</span>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/${locale}/pro/dashboard/requests/${req.id}`}
                      className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 transition-all hover:border-teal-500/30 hover:text-teal-600 dark:border-white/[0.1] dark:text-white/60 dark:hover:bg-white/[0.08] dark:hover:text-white"
                    >
                      {t("proRequests.card.viewDetail")}
                    </Link>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
