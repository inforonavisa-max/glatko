"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
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
import { createClient } from "@/supabase/browser";
import {
  getNotificationsAction,
  markReadAction,
  markAllReadAction,
  getUnreadCountAction,
} from "@/app/[locale]/notifications/actions";
import { cn } from "@/lib/utils";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
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
    review_request: t("notifications.reviewRequest.title"),
  };
  return map[type] || type;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

interface NotificationBellProps {
  userId: string;
}

export function NotificationBell({ userId }: NotificationBellProps) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<GlatkoNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [bounce, setBounce] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const [data, count] = await Promise.all([
        getNotificationsAction(20, false),
        getUnreadCountAction(),
      ]);
      setNotifications(data as GlatkoNotification[]);
      setUnreadCount(count);
    } catch (err) {
      console.error("[NOTIFICATION-BELL] loadNotifications failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "glatko_notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as GlatkoNotification;
          setNotifications((prev) => [n, ...prev]);
          setUnreadCount((prev) => prev + 1);
          setBounce(true);
          setTimeout(() => setBounce(false), 600);
          toast(getLocalizedTitle(n.type, t), {
            description: n.body || undefined,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, t]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleMarkAllRead() {
    await markAllReadAction();
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    setUnreadCount(0);
  }

  async function handleClick(n: GlatkoNotification) {
    if (!n.read_at) {
      await markReadAction(n.id);
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, read_at: new Date().toISOString() } : item))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    setOpen(false);
    router.push(getNotificationHref(n) as Parameters<typeof router.push>[0]);
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => { setOpen(!open); if (!open) loadNotifications(); }}
        className="relative rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-white/70 dark:hover:bg-white/[0.06]"
        aria-label={t("notifications.title")}
      >
        <motion.div animate={bounce ? { scale: [1, 1.3, 1] } : {}} transition={{ duration: 0.4 }}>
          <Bell className="h-5 w-5" />
        </motion.div>
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-teal-500 px-1 text-[10px] font-bold text-white shadow-lg shadow-teal-500/30"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 top-full z-50 mt-2 w-[360px] overflow-hidden rounded-2xl border border-gray-200/50 bg-white/95 shadow-2xl backdrop-blur-sm dark:border-white/[0.08] dark:bg-[#0a0a0a]/95 sm:w-[380px]"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-white/[0.06]">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                {t("notifications.title")}
              </h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-xs font-medium text-teal-600 transition-colors hover:text-teal-500 dark:text-teal-400"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  {t("notifications.markAllRead")}
                </button>
              )}
            </div>

            <div className="max-h-[400px] overflow-y-auto overscroll-contain">
              {loading && notifications.length === 0 && (
                <div className="flex items-center justify-center py-12">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
                </div>
              )}

              {!loading && notifications.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <Bell className="h-8 w-8 text-gray-300 dark:text-white/20" />
                  <p className="text-sm text-gray-500 dark:text-white/40">
                    {t("notifications.empty")}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-white/25">
                    {t("notifications.emptyDesc")}
                  </p>
                </div>
              )}

              {notifications.map((n) => {
                const config = typeConfig[n.type] || defaultConfig;
                const Icon = config.icon;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.04]",
                      !n.read_at && "bg-teal-50/50 dark:bg-teal-500/[0.04]"
                    )}
                  >
                    <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", config.bgColor)}>
                      <Icon className={cn("h-4 w-4", config.iconColor)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm text-gray-900 dark:text-white", !n.read_at ? "font-semibold" : "font-medium")}>
                        {getLocalizedTitle(n.type, t)}
                      </p>
                      {n.body && (
                        <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-white/45">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] text-gray-400 dark:text-white/30">
                        {timeAgo(n.created_at)}
                      </p>
                    </div>
                    {!n.read_at && (
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-teal-500 shadow-[0_0_6px_rgba(20,184,166,0.6)]" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="border-t border-gray-100 px-4 py-2.5 dark:border-white/[0.06]">
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="block text-center text-xs font-medium text-teal-600 transition-colors hover:text-teal-500 dark:text-teal-400"
              >
                {t("notifications.viewAll")} &rarr;
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
