"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { openOrCreateThread } from "@/app/[locale]/messages/actions";
import {
  Clock,
  MapPin,
  DollarSign,
  AlertCircle,
  CheckCircle,
  FileText,
  Hourglass,
  MessageSquare,
} from "lucide-react";
import { Tooltip } from "@/components/aceternity/tooltip";
import {
  Modal,
  ModalBody,
  ModalContent,
  useModal,
} from "@/components/aceternity/modal";
import { QuoteSendForm } from "./QuoteSendForm";

type CategoryNames = Record<string, string>;

interface LeadRequest {
  id: string;
  title: string;
  description: string | null;
  municipality: string | null;
  budget_min: number | null;
  budget_max: number | null;
  preferred_date_start: string | null;
  preferred_date_end: string | null;
  urgency: string | null;
  status: string;
  created_at: string;
  glatko_service_categories: {
    slug: string;
    name: CategoryNames | null;
  } | null;
}

interface LeadQuote {
  id: string;
  price_amount: number;
  price_currency: string;
  status: string;
  submitted_at: string;
}

export interface Lead {
  id: string;
  request_id: string;
  match_score: number;
  match_rank: number;
  is_primary: boolean;
  notified_at: string;
  viewed_at: string | null;
  quote_id: string | null;
  glatko_service_requests: LeadRequest;
  /**
   * PostgREST embeds this via the notifications.quote_id FK (many-to-one),
   * so it arrives as a single object — older code assumed an array.
   */
  glatko_request_quotes: LeadQuote | LeadQuote[] | null;
}

interface ThreadInfo {
  thread_id: string;
  pro_unread_count: number;
}

interface Props {
  leads: Lead[];
  threadByRequestId?: Record<string, ThreadInfo>;
  locale: string;
  /** The logged-in pro's profile id (= professional_id). Lets the pro open a
   *  thread with the customer once they've quoted (G-QUOTE-MESSAGING-FLOW-01). */
  proId: string;
}

const URGENCY_KEY: Record<string, string> = {
  asap: "pro.leads.urgency.asap",
  this_week: "pro.leads.urgency.this_week",
  flexible: "pro.leads.urgency.flexible",
  specific_date: "pro.leads.urgency.specific_date",
};

function pickCategoryName(
  names: CategoryNames | null,
  locale: string,
  fallbackSlug: string,
): string {
  if (!names) return fallbackSlug;
  return names[locale] ?? names.en ?? fallbackSlug;
}

function formatBudget(min: number | null, max: number | null): string {
  if (min == null && max == null) return "";
  if (min != null && max != null) return `EUR ${min}–${max}`;
  if (min != null) return `EUR ${min}+`;
  return `EUR ≤${max}`;
}

export function LeadsList({
  leads,
  threadByRequestId = {},
  locale,
  proId,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [openingFor, setOpeningFor] = useState<string | null>(null);
  const [msgError, setMsgError] = useState<string | null>(null);

  async function handleMessageCustomer(
    requestId: string,
    quoteId: string | null,
  ) {
    if (openingFor) return; // ignore re-entry while a thread is opening
    setOpeningFor(requestId);
    setMsgError(null);
    try {
      const result = await openOrCreateThread({
        request_id: requestId,
        professional_id: proId,
        initial_quote_id: quoteId,
      });
      if (!result.success || !result.data) {
        setMsgError(result.error ?? t("messaging.openThreadError"));
        setOpeningFor(null);
        return;
      }
      router.push(`/${locale}/messages/${result.data.thread_id}`);
    } catch (err) {
      setMsgError(
        err instanceof Error ? err.message : t("messaging.openThreadError"),
      );
      setOpeningFor(null);
    }
  }

  if (leads.length === 0) {
    return (
      <div className="container mx-auto py-12 px-4 max-w-5xl">
        <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-12 text-center">
          <FileText className="h-12 w-12 text-gray-400 dark:text-neutral-600 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
            {t("pro.leads.emptyTitle")}
          </h2>
          <p className="text-gray-600 dark:text-neutral-400 max-w-md mx-auto">
            {t("pro.leads.emptyBody")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {t("pro.leads.title")}
        </h1>
        <p className="text-gray-600 dark:text-neutral-400 mt-2">
          {t("pro.leads.subtitle")} · {leads.length}
        </p>
      </div>

      <div className="grid gap-4">
        {leads.map((lead) => {
          const request = lead.glatko_service_requests;
          const sentQuote = Array.isArray(lead.glatko_request_quotes)
            ? lead.glatko_request_quotes[0]
            : (lead.glatko_request_quotes ?? undefined);
          const isPrimary = lead.is_primary;
          const matchPercent = Math.round(Number(lead.match_score) * 100);
          const categoryName = pickCategoryName(
            request.glatko_service_categories?.name ?? null,
            locale,
            request.glatko_service_categories?.slug ?? "",
          );
          const budget = formatBudget(request.budget_min, request.budget_max);
          const urgencyKey = request.urgency
            ? URGENCY_KEY[request.urgency]
            : null;
          const requestActive = request.status === "published";

          return (
            <div
              key={lead.id}
              className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {request.title}
                  </h3>
                  {isPrimary ? (
                    <Tooltip content={t("pro.leads.primaryMatchTooltip")}>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded text-xs font-medium cursor-help">
                        <CheckCircle className="h-3 w-3" />
                        {t("pro.leads.primaryMatch")}
                      </span>
                    </Tooltip>
                  ) : (
                    <Tooltip content={t("pro.leads.waitlistMatchTooltip")}>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs font-medium cursor-help">
                        <Hourglass className="h-3 w-3" />
                        {t("pro.leads.waitlistMatch")}
                      </span>
                    </Tooltip>
                  )}
                  {categoryName && (
                    <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-400 rounded">
                      {categoryName}
                    </span>
                  )}
                </div>
                <Tooltip content={t("pro.leads.matchScoreTooltip")}>
                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 cursor-help whitespace-nowrap">
                    {matchPercent}% {t("pro.leads.match")}
                  </span>
                </Tooltip>
              </div>

              {request.description && (
                <p className="text-sm text-gray-600 dark:text-neutral-400 mb-4 line-clamp-2">
                  {request.description}
                </p>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-500 dark:text-neutral-500 mb-4">
                {request.municipality && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    <span>{request.municipality}</span>
                  </div>
                )}
                {budget && (
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-4 w-4" />
                    <span>{budget}</span>
                  </div>
                )}
                {urgencyKey && (
                  <div className="flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    <span>{t(urgencyKey)}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  <span>
                    {new Date(lead.notified_at).toLocaleDateString(locale, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {sentQuote ? (
                  <span className="px-4 py-2 bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-300 rounded-lg text-sm font-medium">
                    ✓ {t("pro.leads.quoteAlreadySent")} ·{" "}
                    {sentQuote.price_currency} {sentQuote.price_amount}
                  </span>
                ) : !requestActive ? (
                  <span className="px-4 py-2 bg-yellow-50 dark:bg-yellow-950/20 text-yellow-700 dark:text-yellow-400 rounded-lg text-sm font-medium">
                    {t("pro.leads.requestNotActive")}
                  </span>
                ) : (
                  <Modal>
                    <SendQuoteTrigger
                      label={t("pro.leads.sendQuote")}
                    />
                    <ModalBody className="md:max-w-2xl">
                      <ModalContent>
                        <QuoteSendForm lead={lead} />
                      </ModalContent>
                    </ModalBody>
                  </Modal>
                )}
                {threadByRequestId[lead.request_id] && (
                  <Link
                    href={`/${locale}/messages/${
                      threadByRequestId[lead.request_id].thread_id
                    }`}
                    className="px-4 py-2 border border-gray-300 dark:border-neutral-700 text-gray-700 dark:text-neutral-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-neutral-800 flex items-center gap-2"
                  >
                    <MessageSquare className="h-4 w-4" />
                    {t("messaging.viewThread")}
                    {threadByRequestId[lead.request_id].pro_unread_count >
                      0 && (
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-blue-600 text-white rounded-full text-xs font-semibold">
                        {threadByRequestId[lead.request_id].pro_unread_count}
                      </span>
                    )}
                  </Link>
                )}
                {/* G-QUOTE-MESSAGING: once the pro has quoted, let them open the
                    thread instead of waiting for the customer to message first.
                    Hidden once a thread exists ("View thread" above takes over). */}
                {sentQuote && !threadByRequestId[lead.request_id] && (
                  <button
                    type="button"
                    onClick={() =>
                      handleMessageCustomer(lead.request_id, sentQuote.id)
                    }
                    disabled={openingFor === lead.request_id}
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-60"
                  >
                    <MessageSquare className="h-4 w-4" />
                    {openingFor === lead.request_id
                      ? t("messaging.openingThread")
                      : t("pro.leads.messageCustomer")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {msgError && (
        <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
          {msgError}
        </div>
      )}
    </div>
  );
}

function SendQuoteTrigger({ label }: { label: string }) {
  const { setOpen } = useModal();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-sm font-medium hover:from-blue-700 hover:to-indigo-700 transition-colors"
    >
      {label}
    </button>
  );
}
