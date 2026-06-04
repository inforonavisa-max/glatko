"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  Bell,
  DollarSign,
  CheckCircle,
  MessageSquare,
  RefreshCw,
  Star,
  ShieldCheck,
  ShieldX,
  CheckCheck,
} from "lucide-react";
import { PageBackground } from "@/components/ui/PageBackground";
import {
  getNotificationsAction,
  markReadAction,
  markAllReadAction,
} from "./actions";
import { cn } from "@/lib/utils";
import { useRouter } from "@/i18n/navigation";
import { getNotificationHref } from "@/lib/glatko/notification-href";

interface GlatkoNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

const typeConfig: Record<string, { icon: typeof Bell; bgColor: string; iconColor: string }> = {
  new_bid: { icon: DollarSign, bgColor: "bg-teal-500/10", iconColor: "text-teal-600 dark:text-teal-400" },
  bid_accepted: { icon: CheckCircle, bgColor: "bg-green-500/10", iconColor: "text-green-600 dark:text-green-400" },
  bid_rejected: { icon: ShieldX, bgColor: "bg-red-500/10", iconColor: "text-red-500 dark:text-red-400" },
  message: { icon: MessageSquare, bgColor: "bg-blue-500/10", iconColor: "text-blue-600 dark:text-blue-400" },
  status_change: { icon: RefreshCw, bgColor: "bg-purple-500/10", iconColor: "text-purple-600 dark:text-purple-400" },
  review: { icon: Star, bgColor: "bg-amber-500/10", iconColor: "text-amber-600 dark:text-amber-400" },
  verification_approved: { icon: ShieldCheck, bgColor: "bg-teal-500/10", iconColor: "text-teal-600 dark:text-teal-400" },
  verification_rejected: { icon: ShieldX, bgColor: "bg-red-500/10", iconColor: "text-red-500 dark:text-red-400" },
  new_request_match: { icon: Bell, bgColor: "bg-teal-500/10", iconColor: "text-teal-600 dark:text-teal-400" },
  new_quote: { icon: DollarSign, bgColor: "bg-teal-500/10", iconColor: "text-teal-600 dark:text-teal-400" },
  thread_message: { icon: MessageSquare, bgColor: "bg-blue-500/10", iconColor: "text-blue-600 dark:text-blue-400" },
};

const defaultConfig = { icon: Bell, bgColor: "bg-gray-500/10", iconColor: "text-gray-500 dark:text-gray-400" };

type FilterType = "all" | "unread" | "bids" | "messages" | "status" | "reviews";

const filterToTypes: Record<FilterType, string[] | null> = {
  all: null,
  unread: null,
  bids: ["new_bid", "bid_accepted", "bid_rejected", "new_request_match", "new_quote"],
  messages: ["message", "thread_message"],
  status: ["status_change", "verification_approved", "verification_rejected"],
  reviews: ["review"],
};

function getLocalizedTitle(type: string, t: ReturnType<typeof useTranslations>): string {
  const map: Record<string, string> = {
    new_bid: t("notifications.newBid.title"),
    bid_accepted: t("notifications.bidAccepted.title"),
    bid_rejected: t("notifications.bidRejected.title"),
    message: t("notifications.newMessage.title"),
    status_change: t("notifications.jobStarted.title"),
    review: t("notifications.reviewReceived.title"),
    verification_approved: t("notifications.verificationApproved.title"),
    verification_rejected: t("notifications.verificationRejected.title"),
    new_request_match: t("notifications.newRequestMatch.title"),
    new_quote: t("notifications.newQuote.title"),
    thread_message: t("notifications.newMessage.title"),
  };
  return map[type] || type;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export default function NotificationsPage() {
  const t = useTranslations();
  const router = useRouter();
  const [notifications, setNotifications] = useState<GlatkoNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getNotificationsAction(100, filter === "unread");
      setNotifications(data as GlatkoNotification[]);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  async function handleMarkAllRead() {
    await markAllReadAction();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
    );
  }

  async function handleClick(n: GlatkoNotification) {
    if (!n.read_at) {
      await markReadAction(n.id);
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, read_at: new Date().toISOString() } : item))
      );
    }
    router.push(getNotificationHref(n) as Parameters<typeof router.push>[0]);
  }

  const filtered =
    filter === "all" || filter === "unread"
      ? notifications
      : notifications.filter((n) => filterToTypes[filter]?.includes(n.type));

  const filters: { key: FilterType; label: string }[] = [
    { key: "all", label: t("notifications.all") },
    { key: "unread", label: t("notifications.unread") },
    { key: "bids", label: t("notifications.bids") },
    { key: "messages", label: t("notifications.messages") },
    { key: "status", label: t("notifications.statusChanges") },
    { key: "reviews", label: t("notifications.reviewsFilter") },
  ];

  return (
    <PageBackground>
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-serif text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
              {t("notifications.title")}
            </h1>
            <div className="mt-1 h-0.5 w-12 rounded-full bg-gradient-to-r from-teal-500 to-teal-600" />
          </div>
          {notifications.some((n) => !n.read_at) && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleMarkAllRead}
              className="mt-1 flex items-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/5 px-3 py-2 text-xs font-medium text-teal-600 transition-colors hover:bg-teal-500/10 dark:text-teal-400"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {t("notifications.markAllRead")}
            </motion.button>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-medium transition-all",
                filter === f.key
                  ? "bg-teal-500 text-white shadow-md shadow-teal-500/25"
                  : "border border-gray-200 bg-white/70 text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/60 dark:hover:bg-white/[0.08]"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="mt-8 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-gray-200/50 bg-white/70 py-16 text-center backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
              <Bell className="h-14 w-14 text-teal-500/30" strokeWidth={1.5} />
              <p className="font-serif text-lg font-semibold text-gray-900 dark:text-white">
                {t("notifications.empty")}
              </p>
              <p className="text-sm text-gray-500 dark:text-white/40">
                {t("notifications.emptyDesc")}
              </p>
            </div>
          )}

          {!loading &&
            filtered.map((n, i) => {
              const config = typeConfig[n.type] || defaultConfig;
              const Icon = config.icon;
              return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <button
                    onClick={() => handleClick(n)}
                    className={cn(
                      "flex w-full items-start gap-4 rounded-2xl border p-4 text-left backdrop-blur-sm transition-all duration-300",
                      "border-gray-200/50 bg-white/70 hover:border-teal-500/20 hover:shadow-md",
                      "dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-teal-500/20",
                      "cursor-pointer",
                      !n.read_at && "border-l-2 border-l-teal-500 bg-teal-500/[0.02] dark:bg-teal-500/[0.04]"
                    )}
                  >
                    <div className={cn("mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", config.bgColor)}>
                      <Icon className={cn("h-5 w-5", config.iconColor)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={cn("text-sm text-gray-900 dark:text-white", !n.read_at ? "font-bold" : "font-medium")}>
                          {getLocalizedTitle(n.type, t)}
                        </p>
                        {!n.read_at && (
                          <span className="h-2.5 w-2.5 rounded-full bg-teal-500 shadow-[0_0_6px_rgba(20,184,166,0.6)]" />
                        )}
                      </div>
                      {n.body && (
                        <p className="mt-0.5 text-sm text-gray-600 dark:text-white/50">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-1.5 text-xs text-gray-400 dark:text-white/30">
                        {formatTime(n.created_at)}
                      </p>
                    </div>
                  </button>
                </motion.div>
              );
            })}
        </div>
      </div>
    </PageBackground>
  );
}
