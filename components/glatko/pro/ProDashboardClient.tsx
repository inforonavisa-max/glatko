"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  Gavel,
  Briefcase,
  CheckCircle,
  ArrowRight,
  Search,
  TrendingUp,
  DollarSign,
  Star,
  MessageSquare,
  Package,
} from "lucide-react";
import dynamic from "next/dynamic";

const AreaChart = dynamic(
  () => import("@tremor/react").then((m) => m.AreaChart),
  { ssr: false, loading: () => <div className="h-48 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.03]" /> }
);
const BarChart = dynamic(
  () => import("@tremor/react").then((m) => m.BarChart),
  { ssr: false, loading: () => <div className="h-48 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.03]" /> }
);
const ProgressBar = dynamic(
  () => import("@tremor/react").then((m) => m.ProgressBar),
  { ssr: false, loading: () => <div className="h-2 animate-pulse rounded-full bg-gray-100 dark:bg-white/[0.03]" /> }
);
import {
  getProAnalyticsAction,
  getProfileCompletenessAction,
} from "@/app/[locale]/pro/dashboard/actions";

interface Props {
  displayName: string;
  isVerified: boolean;
  rating: number;
  pendingBids: number;
  activeJobs: number;
  completedJobs: number;
  matchingRequestsCount: number;
  recentBidsCount: number;
  locale: string;
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === 0) return;
    const duration = 800;
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      setDisplay(Math.round(progress * value));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [value]);
  return <>{display}</>;
}

export function ProDashboardClient(props: Props) {
  const t = useTranslations();
  const safeRating = Number(props.rating);
  const displayRating = Number.isFinite(safeRating) ? safeRating : 0;
  const [analytics, setAnalytics] = useState<{
    totalEarnings: number;
    monthlyEarnings: { month: string; earnings: number; jobs: number }[];
    recentReviews: { overall_rating: number; created_at: string }[];
  } | null>(null);
  const [completeness, setCompleteness] = useState<{
    score: number;
    missing: string[];
  } | null>(null);

  useEffect(() => {
    getProAnalyticsAction()
      .then((raw) => {
        if (!raw) {
          setAnalytics(null);
          return;
        }
        setAnalytics({
          totalEarnings: raw.totalEarnings,
          monthlyEarnings: raw.monthlyEarnings,
          recentReviews: (raw.recentReviews ?? []).map((r) => ({
            overall_rating: Number(r.overall_rating) || 0,
            created_at: r.created_at,
          })),
        });
      })
      .catch(() => {});
    getProfileCompletenessAction().then(setCompleteness).catch(() => {});
  }, []);

  const missingLabels: Record<string, string> = {
    bio: t("proAnalytics.addBio"),
    phone: t("proAnalytics.addPhone"),
    city: t("proAnalytics.addCity"),
    experience: t("proAnalytics.addExperience"),
    rate: t("proAnalytics.addRate"),
    portfolio: t("proAnalytics.addPortfolio"),
    languages: t("proAnalytics.addLanguages"),
  };

  const kpiCards = [
    {
      icon: DollarSign,
      value: analytics?.totalEarnings ?? 0,
      label: t("proAnalytics.totalEarnings"),
      prefix: "€",
      color: "text-teal-400",
    },
    {
      icon: Star,
      value: displayRating,
      label: t("proAnalytics.avgRating"),
      suffix: ` (${analytics?.recentReviews?.length ?? 0})`,
      color: "text-amber-400",
      isDecimal: true,
    },
    {
      icon: Briefcase,
      value: Number(props.completedJobs) || 0,
      label: t("proAnalytics.completedJobs"),
      color: "text-green-400",
    },
    {
      icon: Gavel,
      value: props.pendingBids,
      label: t("proAnalytics.pendingBids"),
      color: "text-purple-400",
    },
  ];

  const quickActions = [
    {
      href: `/${props.locale}/pro/dashboard/requests`,
      icon: Search,
      label: t("proDashboard.nav.requests"),
      count: props.matchingRequestsCount,
      color: "text-teal-400",
    },
    {
      href: `/${props.locale}/pro/dashboard/bids`,
      icon: Gavel,
      label: t("proDashboard.nav.bids"),
      count: props.recentBidsCount,
      color: "text-amber-400",
    },
    {
      href: `/${props.locale}/messages`,
      icon: MessageSquare,
      label: t("nav.inbox"),
      color: "text-blue-400",
    },
    {
      href: `/${props.locale}/pro/dashboard/packages`,
      icon: Package,
      label: t("packages.title"),
      color: "text-pink-400",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="mb-8 rounded-3xl border border-gray-200/50 bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03] md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-500/10 text-xl font-bold text-teal-600 dark:text-teal-400">
              {props.displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="font-serif text-2xl text-gray-900 dark:text-white md:text-3xl">
                {t("proAnalytics.welcome")}, {props.displayName}
              </h1>
              <div className="mt-1 flex items-center gap-2">
                {props.isVerified && (
                  <span className="inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400">
                    <CheckCircle className="h-3 w-3" /> Verified
                  </span>
                )}
                {displayRating > 0 && (
                  <span className="text-xs text-gray-400 dark:text-white/40">
                    ★ {displayRating.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </div>
          {completeness && (
            <div className="w-full max-w-xs">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-white/50">
                  {t("proAnalytics.profileCompleteness")}
                </span>
                <span className="font-medium text-teal-600 dark:text-teal-400">
                  {completeness.score}%
                </span>
              </div>
              <ProgressBar value={completeness.score} color="teal" className="mt-1" />
              {completeness.score < 100 && completeness.missing.length > 0 && (
                <p className="mt-1 text-[10px] text-gray-400 dark:text-white/30">
                  {missingLabels[completeness.missing[0]] || completeness.missing[0]}
                </p>
              )}
              {completeness.score >= 100 && (
                <p className="mt-1 flex items-center gap-1 text-[10px] text-green-400">
                  <CheckCircle className="h-3 w-3" />
                  {t("proAnalytics.profileComplete")}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + i * 0.05 }}
              className="rounded-2xl border border-gray-200/50 bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]"
            >
              <Icon className={`mb-3 h-6 w-6 ${kpi.color}`} />
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {kpi.prefix || ""}
                {kpi.isDecimal ? (
                  displayRating.toFixed(1)
                ) : (
                  <AnimatedNumber value={kpi.value} />
                )}
                {kpi.suffix || ""}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-white/40">{kpi.label}</p>
            </motion.div>
          );
        })}
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl border border-gray-200/50 bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]"
        >
          <h3 className="mb-4 flex items-center gap-2 font-serif text-lg text-gray-900 dark:text-white">
            <TrendingUp className="h-5 w-5 text-teal-500 dark:text-teal-400" />
            {t("proAnalytics.earningsTrend")}
          </h3>
          {analytics?.monthlyEarnings && (
            <AreaChart
              className="h-48"
              data={analytics.monthlyEarnings}
              index="month"
              categories={["earnings"]}
              colors={["teal"]}
              valueFormatter={(v) => `€${v}`}
              showLegend={false}
              showGridLines={false}
              curveType="monotone"
            />
          )}
          {!analytics && (
            <div className="flex h-48 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="rounded-2xl border border-gray-200/50 bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]"
        >
          <h3 className="mb-4 flex items-center gap-2 font-serif text-lg text-gray-900 dark:text-white">
            <Star className="h-5 w-5 text-amber-500 dark:text-amber-400" />
            {t("proAnalytics.ratingTrend")}
          </h3>
          {analytics?.recentReviews && analytics.recentReviews.length > 0 ? (
            <BarChart
              className="h-48"
              data={analytics.recentReviews.map((r, i) => ({
                review: `#${analytics.recentReviews.length - i}`,
                rating: r.overall_rating,
              }))}
              index="review"
              categories={["rating"]}
              colors={["teal"]}
              valueFormatter={(v) => `${v}/5`}
              showLegend={false}
              showGridLines={false}
            />
          ) : analytics ? (
            <div className="flex h-48 items-center justify-center text-sm text-gray-400 dark:text-white/30">
              {t("pro.profile.noReviews")}
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
            </div>
          )}
        </motion.div>
      </div>

      <div>
        <h3 className="mb-4 font-serif text-lg text-gray-900 dark:text-white">
          {t("proAnalytics.quickActions")}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.href} href={action.href}>
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  className="group flex items-center justify-between rounded-2xl border border-gray-200/50 bg-white/70 p-5 backdrop-blur-sm transition-colors hover:border-teal-500/30 dark:border-white/[0.08] dark:bg-white/[0.03]"
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`h-5 w-5 ${action.color}`} />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {action.label}
                      </p>
                      {"count" in action && action.count != null && (
                        <p className="text-xs text-gray-400 dark:text-white/30">
                          {action.count}
                        </p>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-teal-500 dark:text-white/20 dark:group-hover:text-teal-400" />
                </motion.div>
              </Link>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
