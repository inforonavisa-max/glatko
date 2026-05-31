"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/supabase/browser";
import { MessageSquare } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { sendMessageAction } from "@/app/[locale]/inbox/[conversationId]/actions";
import { ChatHeader } from "./ChatHeader";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { trackEventWithMeta } from "@/lib/analytics/track";

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  content_type: string;
  file_url: string | null;
  read_at: string | null;
  created_at: string;
  original_locale?: string | null;
  translated_content?: string | null;
  translated_locale?: string | null;
}

interface ChatRoomProps {
  conversationId: string;
  currentUserId: string;
  initialMessages: Message[];
  otherUser: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    is_verified?: boolean;
  };
  requestTitle: string | null;
  requestId: string | null;
  /**
   * True when currentUser is the customer side of this conversation.
   * Used by G-ADS-3 to gate `customer_message_sent` events so we don't
   * pollute the customer funnel with provider-side sends.
   */
  isCustomer: boolean;
}

function getDateLabel(
  dateStr: string,
  todayLabel: string,
  yesterdayLabel: string
): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (msgDay.getTime() === today.getTime()) return todayLabel;
  if (msgDay.getTime() === yesterday.getTime()) return yesterdayLabel;
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function ChatRoom({
  conversationId,
  currentUserId,
  initialMessages,
  otherUser,
  requestTitle,
  requestId,
  isCustomer,
}: ChatRoomProps) {
  const t = useTranslations();
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [sending, setSending] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const firstScrollDoneRef = useRef(false);

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    firstScrollDoneRef.current = false;
  }, [conversationId]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const behavior = firstScrollDoneRef.current ? "smooth" : "auto";
      firstScrollDoneRef.current = true;
      scrollMessagesToBottom(behavior);
    });
    return () => cancelAnimationFrame(id);
  }, [messages.length, scrollMessagesToBottom]);

  useEffect(() => {
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "glatko_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });

          if (newMsg.sender_id !== currentUserId) {
            supabase
              .from("glatko_messages")
              .update({ read_at: new Date().toISOString() })
              .eq("id", newMsg.id)
              .then();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, supabase]);

  const handleSend = async (content: string) => {
    setSending(true);
    try {
      const result = await sendMessageAction(conversationId, content);
      if (!result.success) {
        toast.error(t("chat.sendFailed"));
        return;
      }
      // G-ADS-3: customer_message_sent — only for customer-side senders.
      // Provider-side events are out of G-ADS-3 scope.
      if (isCustomer) {
        trackEventWithMeta("customer_message_sent", {
          conversation_id: conversationId,
          provider_id: otherUser.id,
        });
      }
    } finally {
      setSending(false);
    }
  };

  const todayLabel = t("inbox.today");
  const yesterdayLabel = t("inbox.yesterday");

  return (
    <div className="box-border flex h-[calc(100dvh-4rem)] min-h-0 max-h-[100dvh] flex-col overflow-hidden pt-16 sm:h-[calc(100vh-4rem)] sm:max-h-none">
      <ChatHeader
        otherUser={otherUser}
        requestTitle={requestTitle}
        requestId={requestId}
      />

      <div
        ref={messagesContainerRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-white/[0.04]">
              <MessageSquare className="h-6 w-6 text-gray-400 dark:text-white/30" />
            </div>
            <p className="text-sm text-gray-500 dark:text-white/40">
              {t("chat.noMessages")}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => {
                const showDate =
                  idx === 0 ||
                  !isSameDay(messages[idx - 1].created_at, msg.created_at);
                const dateLabel = showDate
                  ? getDateLabel(msg.created_at, todayLabel, yesterdayLabel)
                  : null;

                return (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isOwn={msg.sender_id === currentUserId}
                    showDate={showDate}
                    dateLabel={dateLabel}
                  />
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      <ChatInput onSend={handleSend} disabled={sending} />
    </div>
  );
}
