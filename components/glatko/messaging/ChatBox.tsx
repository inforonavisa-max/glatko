"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, CheckCircle, Send, Sparkles, Star } from "lucide-react";
import { createClient } from "@/supabase/browser";
import {
  sendMessage,
  markQuoteComplete,
  confirmQuoteCompletion,
} from "@/app/[locale]/messages/actions";
import { ReviewModal } from "@/components/glatko/customer/ReviewModal";
import { trackEventWithMeta } from "@/lib/analytics/track";

interface ThreadMessage {
  id: string;
  sender_id: string;
  body: string;
  body_locale: string | null;
  translated_body: string | null;
  translated_locale: string | null;
  read_at: string | null;
  created_at: string;
}

export interface QuoteSummary {
  id: string;
  completion_state: string;
  has_review: boolean;
}

interface Props {
  threadId: string;
  currentUserId: string;
  counterpartName: string;
  counterpartAvatar: string | null;
  requestTitle: string;
  initialMessages: ThreadMessage[];
  locale: string;
  threadActive: boolean;
  quote: QuoteSummary | null;
  isProUser: boolean;
  isCustomerUser: boolean;
  counterpartId: string | null;
}

function formatTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatBox({
  threadId,
  currentUserId,
  counterpartName,
  counterpartAvatar,
  requestTitle,
  initialMessages,
  locale,
  threadActive,
  quote,
  isProUser,
  isCustomerUser,
  counterpartId,
}: Props) {
  const t = useTranslations();
  const supabase = createClient();

  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // G-REV-1 — local mirror of quote state so the banner reacts to
  // mark/confirm/review without a full page refresh.
  const [completionState, setCompletionState] = useState<string>(
    quote?.completion_state ?? "in_progress",
  );
  const [hasReview, setHasReview] = useState<boolean>(
    quote?.has_review ?? false,
  );
  const [completing, setCompleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const firstScrollDone = useRef(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      scrollToBottom(firstScrollDone.current ? "smooth" : "auto");
      firstScrollDone.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [messages.length, scrollToBottom]);

  // Realtime subscription — both INSERT (new messages) and UPDATE (G-MSG-2
  // translated_body backfill from /api/messages/translate completing).
  useEffect(() => {
    const channel = supabase
      .channel(`thread:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "glatko_thread_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const newMsg = payload.new as ThreadMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          if (newMsg.sender_id !== currentUserId) {
            void supabase.rpc("glatko_mark_thread_read", {
              p_thread_id: threadId,
            });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "glatko_thread_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const updated = payload.new as ThreadMessage;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id
                ? {
                    ...m,
                    translated_body: updated.translated_body,
                    translated_locale: updated.translated_locale,
                    read_at: updated.read_at,
                  }
                : m,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [threadId, currentUserId, supabase]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);

    // Optimistic insert
    const tempId = `temp-${Date.now()}`;
    const optimistic: ThreadMessage = {
      id: tempId,
      sender_id: currentUserId,
      body: trimmed,
      body_locale: locale,
      translated_body: null,
      translated_locale: null,
      read_at: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setBody("");

    try {
      const result = await sendMessage({
        thread_id: threadId,
        body: trimmed,
        body_locale: locale,
      });
      if (!result.success) {
        // Roll back optimistic message
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setError(result.error ?? t("messaging.sendError"));
        setBody(trimmed);
      } else {
        // G-ADS-3: customer_message_sent — only fire for customer-side senders.
        // isCustomerUser is page-level role flag from messages/[id]/page.tsx.
        // For provider mesage sends we intentionally skip; provider-side
        // event tracking is out of G-ADS-3 scope.
        if (isCustomerUser) {
          trackEventWithMeta("customer_message_sent", {
            thread_id: threadId,
            provider_id: counterpartId ?? undefined,
          });
        }
        // Replace temp with real id (Realtime will also deliver but dedupe handles it)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? {
                  ...m,
                  id: result.data?.message_id ?? m.id,
                }
              : m,
          ),
        );
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setError(err instanceof Error ? err.message : t("messaging.sendError"));
      setBody(trimmed);
    } finally {
      setSending(false);
    }
  }

  const initial = (counterpartName || "—").substring(0, 2).toUpperCase();

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] max-h-[100dvh] pt-16">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3 flex items-center gap-3">
        <Link
          href={`/${locale}/messages`}
          className="p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800"
          aria-label={t("messaging.back")}
        >
          <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-neutral-300" />
        </Link>
        {counterpartAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={counterpartAvatar}
            alt={counterpartName}
            className="w-10 h-10 rounded-full object-cover ring-2 ring-gray-200 dark:ring-neutral-700"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold">
            {initial}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-gray-900 dark:text-white truncate">
            {counterpartName}
          </h1>
          {requestTitle && (
            <p className="text-xs text-gray-500 dark:text-neutral-500 truncate">
              {requestTitle}
            </p>
          )}
        </div>
      </div>

      {/* G-REV-1 completion banner */}
      {quote && (
        <CompletionBanner
          quoteId={quote.id}
          completionState={completionState}
          hasReview={hasReview}
          isProUser={isProUser}
          isCustomerUser={isCustomerUser}
          completing={completing}
          confirming={confirming}
          error={completionError}
          counterpartName={counterpartName}
          onMarkComplete={async () => {
            setCompleting(true);
            setCompletionError(null);
            const result = await markQuoteComplete(quote.id);
            if (!result.success) {
              setCompletionError(
                result.error ?? t("messaging.completion.markError"),
              );
              setCompleting(false);
              return;
            }
            setCompletionState("pro_marked_complete");
            setCompleting(false);
          }}
          onConfirm={async (confirmed) => {
            setConfirming(true);
            setCompletionError(null);
            const result = await confirmQuoteCompletion({
              quote_id: quote.id,
              confirmed,
            });
            if (!result.success) {
              setCompletionError(
                result.error ?? t("messaging.completion.confirmError"),
              );
              setConfirming(false);
              return;
            }
            setCompletionState(
              confirmed ? "customer_confirmed" : "customer_disputed",
            );
            setConfirming(false);
          }}
          onWriteReview={() => setReviewOpen(true)}
        />
      )}

      {reviewOpen && quote && (
        <ReviewModal
          quoteId={quote.id}
          proName={counterpartName}
          onClose={() => setReviewOpen(false)}
          onSubmitted={() => {
            setReviewOpen(false);
            setHasReview(true);
          }}
        />
      )}

      {/* Message list */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-6 space-y-2 bg-gray-50 dark:bg-neutral-950"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-gray-500 dark:text-neutral-500">
            <p className="text-sm">{t("messaging.threadEmptyHint")}</p>
          </div>
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              msg={m}
              mine={m.sender_id === currentUserId}
              locale={locale}
            />
          ))
        )}
      </div>

      {/* Composer */}
      {threadActive ? (
        <form
          onSubmit={handleSubmit}
          className="border-t border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3"
        >
          {error && (
            <div className="mb-2 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmit(
                    e as unknown as FormEvent<HTMLFormElement>,
                  );
                }
              }}
              disabled={sending}
              rows={1}
              maxLength={5000}
              placeholder={t("messaging.composerPlaceholder")}
              className="flex-1 resize-none px-4 py-2 rounded-2xl border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={sending || !body.trim()}
              aria-label={t("messaging.send")}
              className="p-3 rounded-full bg-blue-600 text-white disabled:opacity-50 hover:bg-blue-700 shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      ) : (
        <div className="border-t border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-900 px-4 py-3 text-center text-sm text-gray-600 dark:text-neutral-400">
          {t("messaging.threadInactive")}
        </div>
      )}
    </div>
  );
}

interface CompletionBannerProps {
  quoteId: string;
  completionState: string;
  hasReview: boolean;
  isProUser: boolean;
  isCustomerUser: boolean;
  completing: boolean;
  confirming: boolean;
  error: string | null;
  counterpartName: string;
  onMarkComplete: () => Promise<void>;
  onConfirm: (confirmed: boolean) => Promise<void>;
  onWriteReview: () => void;
}

function CompletionBanner({
  completionState,
  hasReview,
  isProUser,
  isCustomerUser,
  completing,
  confirming,
  error,
  onMarkComplete,
  onConfirm,
  onWriteReview,
}: CompletionBannerProps) {
  const t = useTranslations();

  if (
    completionState === "in_progress" &&
    isProUser
  ) {
    return (
      <div className="border-b border-gray-200 dark:border-neutral-800 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-emerald-900 dark:text-emerald-300">
            {t("messaging.completion.proProgressHint")}
          </p>
          <button
            type="button"
            onClick={onMarkComplete}
            disabled={completing}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-1 disabled:opacity-60"
          >
            <CheckCircle className="h-4 w-4" />
            {completing
              ? t("messaging.completion.marking")
              : t("messaging.completion.markAsCompleted")}
          </button>
        </div>
        {error && (
          <p className="mt-2 text-xs text-red-700 dark:text-red-400">{error}</p>
        )}
      </div>
    );
  }

  if (
    completionState === "pro_marked_complete" &&
    isCustomerUser
  ) {
    return (
      <div className="border-b border-gray-200 dark:border-neutral-800 bg-blue-50 dark:bg-blue-950/20 px-4 py-3">
        <p className="font-medium text-blue-900 dark:text-blue-300">
          {t("messaging.completion.proMarkedComplete")}
        </p>
        <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
          {t("messaging.completion.proMarkedCompleteBody")}
        </p>
        <div className="flex gap-2 mt-3 flex-wrap">
          <button
            type="button"
            onClick={() => onConfirm(true)}
            disabled={confirming}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-60"
          >
            ✓ {t("messaging.completion.confirmCompletion")}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(false)}
            disabled={confirming}
            className="px-4 py-2 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 rounded-lg text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-60"
          >
            {t("messaging.completion.disputeCompletion")}
          </button>
        </div>
        {error && (
          <p className="mt-2 text-xs text-red-700 dark:text-red-400">{error}</p>
        )}
      </div>
    );
  }

  if (
    completionState === "pro_marked_complete" &&
    isProUser
  ) {
    return (
      <div className="border-b border-gray-200 dark:border-neutral-800 bg-blue-50 dark:bg-blue-950/20 px-4 py-3">
        <p className="text-sm text-blue-900 dark:text-blue-300">
          {t("messaging.completion.waitingCustomerConfirm")}
        </p>
      </div>
    );
  }

  if (completionState === "customer_confirmed" && isCustomerUser) {
    if (hasReview) {
      return (
        <div className="border-b border-gray-200 dark:border-neutral-800 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3">
          <p className="text-sm text-emerald-900 dark:text-emerald-300">
            {t("messaging.completion.reviewSubmitted")}
          </p>
        </div>
      );
    }
    return (
      <div className="border-b border-gray-200 dark:border-neutral-800 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 px-4 py-3">
        <button
          type="button"
          onClick={onWriteReview}
          className="w-full px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg font-medium flex items-center justify-center gap-2"
        >
          <Star className="h-4 w-4" />
          {t("messaging.completion.writeReview")}
        </button>
      </div>
    );
  }

  if (completionState === "customer_confirmed" && isProUser) {
    return (
      <div className="border-b border-gray-200 dark:border-neutral-800 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3">
        <p className="text-sm text-emerald-900 dark:text-emerald-300">
          {t("messaging.completion.jobCompleted")}
        </p>
      </div>
    );
  }

  if (completionState === "customer_disputed") {
    return (
      <div className="border-b border-gray-200 dark:border-neutral-800 bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
        <p className="text-sm text-amber-900 dark:text-amber-300">
          {t("messaging.completion.disputed")}
        </p>
      </div>
    );
  }

  if (completionState === "cancelled") {
    return (
      <div className="border-b border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-900 px-4 py-3">
        <p className="text-sm text-gray-700 dark:text-neutral-400">
          {t("messaging.completion.cancelled")}
        </p>
      </div>
    );
  }

  return null;
}

interface BubbleProps {
  msg: ThreadMessage;
  mine: boolean;
  locale: string;
}

function MessageBubble({ msg, mine, locale }: BubbleProps) {
  const t = useTranslations();
  const [showOriginal, setShowOriginal] = useState(false);

  // Translation visible when: counterpart sent it, body was translated to
  // a different locale, and translated text is set. Self-sent messages
  // and same-locale skips show only the original.
  const hasTranslation =
    !mine &&
    Boolean(msg.translated_body) &&
    Boolean(msg.translated_locale) &&
    msg.translated_locale !== msg.body_locale;

  const primaryText = hasTranslation
    ? (msg.translated_body as string)
    : msg.body;

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2 ${
          mine
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-white dark:bg-neutral-800 text-gray-900 dark:text-white rounded-bl-sm border border-gray-200 dark:border-neutral-700"
        }`}
      >
        <p className="whitespace-pre-wrap break-words text-sm">{primaryText}</p>

        {hasTranslation && (
          <>
            {showOriginal && (
              <p
                className={`mt-1 whitespace-pre-wrap break-words text-sm italic border-t pt-1 ${
                  mine
                    ? "border-blue-300/40 text-blue-50/90"
                    : "border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400"
                }`}
              >
                {msg.body}
              </p>
            )}
            <div
              className={`flex items-center gap-2 mt-1 text-[11px] ${
                mine ? "text-blue-100/80" : "text-gray-500 dark:text-neutral-500"
              }`}
            >
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                {t("messaging.translatedFrom")}{" "}
                <span className="uppercase">
                  {(msg.body_locale ?? "").toUpperCase()}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setShowOriginal((v) => !v)}
                className="underline hover:opacity-100 opacity-80"
              >
                {showOriginal
                  ? t("messaging.hideOriginal")
                  : t("messaging.showOriginal")}
              </button>
            </div>
          </>
        )}

        <div
          className={`flex items-center gap-1 mt-1 text-xs ${
            mine
              ? "text-blue-100/80 justify-end"
              : "text-gray-500 dark:text-neutral-500"
          }`}
        >
          <span>{formatTime(msg.created_at, locale)}</span>
          {mine && msg.read_at && (
            <span aria-label={t("messaging.read")}>· ✓✓</span>
          )}
        </div>
      </div>
    </div>
  );
}
