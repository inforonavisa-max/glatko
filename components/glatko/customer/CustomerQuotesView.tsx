"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Star,
  MapPin,
  MessageSquare,
  Clock,
  ShieldCheck,
  Crown,
  Award,
  Hourglass,
} from "lucide-react";
import { Tooltip } from "@/components/aceternity/tooltip";
import { openOrCreateThread } from "@/app/[locale]/messages/actions";

type CategoryNames = Record<string, string>;

interface QuotePro {
  id: string;
  business_name: string | null;
  location_city: string | null;
  avg_rating: number | null;
  completed_jobs: number | null;
  is_founding_provider: boolean | null;
  founding_provider_number: number | null;
  verification_tier: "basic" | "business" | "professional" | null;
  languages: string[] | null;
}

interface Quote {
  id: string;
  price_amount: number;
  price_currency: string;
  pricing_model: string;
  message: string;
  submitted_at: string;
  status: string;
  glatko_professional_profiles: QuotePro | null;
}

interface RequestPayload {
  id: string;
  title: string;
  description: string | null;
  municipality: string | null;
  budget_min: number | null;
  budget_max: number | null;
  status: string;
  created_at: string;
  glatko_service_categories: {
    slug: string;
    name: CategoryNames | null;
  } | null;
  glatko_request_quotes: Quote[] | null;
}

interface Props {
  request: RequestPayload;
  proExtras: Record<string, { avatar_url: string | null }>;
  dispatchedAt: string | null;
  locale: string;
}

const WAITLIST_DEADLINE_MS = 30 * 60 * 1000;

function pickName(
  names: CategoryNames | null,
  locale: string,
  fallback: string,
): string {
  if (!names) return fallback;
  return names[locale] ?? names.en ?? fallback;
}

function formatTime(seconds: number): string {
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export function CustomerQuotesView({
  request,
  proExtras,
  dispatchedAt,
  locale,
}: Props) {
  const t = useTranslations();
  const router = useRouter();

  const quotes = request.glatko_request_quotes ?? [];
  const quoteCount = quotes.length;
  const sortedQuotes = [...quotes].sort(
    (a, b) => Number(a.price_amount) - Number(b.price_amount),
  );

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [openingThread, setOpeningThread] = useState<string | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);

  async function handleStartChat(quote: Quote) {
    if (openingThread) return; // ignore re-entry while a thread is opening
    const pro = quote.glatko_professional_profiles;
    if (!pro) return;
    setOpeningThread(quote.id);
    setThreadError(null);
    try {
      const result = await openOrCreateThread({
        request_id: request.id,
        professional_id: pro.id,
        initial_quote_id: quote.id,
      });
      if (!result.success || !result.data) {
        setThreadError(result.error ?? t("messaging.openThreadError"));
        setOpeningThread(null);
        return;
      }
      router.push(`/${locale}/messages/${result.data.thread_id}`);
    } catch (err) {
      setThreadError(
        err instanceof Error ? err.message : t("messaging.openThreadError"),
      );
      setOpeningThread(null);
    }
  }

  useEffect(() => {
    if (!dispatchedAt || quoteCount >= 3) {
      setTimeLeft(null);
      return;
    }

    const dispatchTime = new Date(dispatchedAt).getTime();
    const deadline = dispatchTime + WAITLIST_DEADLINE_MS;

    function tick() {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        setTimeLeft(0);
      } else {
        setTimeLeft(Math.floor(remaining / 1000));
      }
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [dispatchedAt, quoteCount]);

  const categoryName = pickName(
    request.glatko_service_categories?.name ?? null,
    locale,
    request.glatko_service_categories?.slug ?? "",
  );

  const budget =
    request.budget_min != null || request.budget_max != null
      ? `EUR ${request.budget_min ?? ""}${
          request.budget_min != null && request.budget_max != null ? "–" : ""
        }${request.budget_max ?? ""}`
      : "";

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      {/* Request header */}
      <div className="mb-8 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 p-6 border border-blue-100 dark:border-blue-900">
        <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {request.title}
          </h1>
          {categoryName && (
            <span className="text-xs px-2 py-0.5 bg-white dark:bg-neutral-900 text-gray-600 dark:text-neutral-400 rounded">
              {categoryName}
            </span>
          )}
        </div>
        {request.description && (
          <p className="text-gray-700 dark:text-neutral-300 mb-4 whitespace-pre-wrap">
            {request.description}
          </p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-600 dark:text-neutral-400">
          {request.municipality && (
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {request.municipality}
            </div>
          )}
          {budget && (
            <div>
              {t("customer.quotes.budget")}: {budget}
            </div>
          )}
        </div>
      </div>

      {/* Wait-list timer */}
      {timeLeft !== null && timeLeft > 0 && quoteCount < 3 && (
        <div className="mb-6 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-4 flex items-center gap-3">
          <Hourglass className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-amber-900 dark:text-amber-300">
              {t("customer.quotes.waitingMoreQuotes")} ({3 - quoteCount})
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {t("customer.quotes.waitingTimer")}: {formatTime(timeLeft)}
            </p>
          </div>
        </div>
      )}

      {timeLeft === 0 && quoteCount < 3 && (
        <div className="mb-6 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-4">
          <p className="font-medium text-blue-900 dark:text-blue-300">
            {t("customer.quotes.waitlistActivated")}
          </p>
        </div>
      )}

      {/* Quotes header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
          {t("customer.quotes.quotesReceived")} ({quoteCount})
        </h2>
        {quoteCount > 1 && (
          <p className="text-sm text-gray-600 dark:text-neutral-400">
            {t("customer.quotes.quotesSortedByPrice")}
          </p>
        )}
      </div>

      {quoteCount === 0 ? (
        <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-12 text-center">
          <Clock className="h-12 w-12 text-gray-400 dark:text-neutral-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {t("customer.quotes.noQuotesYet")}
          </h3>
          <p className="text-gray-600 dark:text-neutral-400">
            {t("customer.quotes.noQuotesYetBody")}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {sortedQuotes.map((quote, idx) => {
            const pro = quote.glatko_professional_profiles;
            if (!pro) return null;
            const extras = proExtras[pro.id] ?? { avatar_url: null };
            const isBest = idx === 0 && quoteCount > 1;
            const tier = pro.verification_tier ?? "basic";
            const businessName = pro.business_name ?? "";
            const initial = businessName.substring(0, 2).toUpperCase() || "—";

            return (
              <div
                key={quote.id}
                role="button"
                tabIndex={0}
                aria-busy={openingThread === quote.id}
                onClick={() => handleStartChat(quote)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleStartChat(quote);
                  }
                }}
                className={`cursor-pointer rounded-xl border p-6 bg-white dark:bg-neutral-900 hover:shadow-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  isBest
                    ? "border-emerald-300 dark:border-emerald-700 ring-2 ring-emerald-200 dark:ring-emerald-900"
                    : "border-gray-200 dark:border-neutral-800"
                }`}
              >
                {isBest && (
                  <div className="mb-3 inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded text-xs font-medium">
                    <Award className="h-3 w-3" />
                    {t("customer.quotes.bestPrice")}
                  </div>
                )}

                <div className="flex items-start gap-3 mb-4">
                  {extras.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={extras.avatar_url}
                      alt={businessName}
                      className="w-12 h-12 rounded-full object-cover ring-2 ring-gray-200 dark:ring-neutral-700"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold shrink-0">
                      {initial}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <a
                      href={`/${locale}/provider/${pro.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold text-gray-900 dark:text-white hover:underline truncate block"
                    >
                      {businessName}
                    </a>
                    {pro.location_city && (
                      <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-neutral-400">
                        <MapPin className="h-3 w-3" />
                        {pro.location_city}
                      </div>
                    )}
                  </div>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-1 mb-4">
                  {pro.is_founding_provider && (
                    <Tooltip
                      content={t("customer.quotes.foundingTooltip")}
                    >
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-xs font-medium cursor-help">
                        <Crown className="h-3 w-3" />
                        {t("customer.quotes.foundingLabel")}
                        {pro.founding_provider_number != null
                          ? ` #${pro.founding_provider_number}`
                          : ""}
                      </span>
                    </Tooltip>
                  )}
                  {tier !== "basic" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded text-xs font-medium">
                      <ShieldCheck className="h-3 w-3" />
                      {tier === "professional" ? "Premium" : "Business"}
                    </span>
                  )}
                </div>

                {/* Stats */}
                <div className="flex gap-3 mb-4 text-sm">
                  {pro.avg_rating != null && pro.avg_rating > 0 && (
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      <span className="font-medium text-gray-900 dark:text-white">
                        {Number(pro.avg_rating).toFixed(1)}
                      </span>
                    </div>
                  )}
                  {pro.completed_jobs != null && pro.completed_jobs > 0 && (
                    <div className="text-gray-600 dark:text-neutral-400">
                      {pro.completed_jobs}{" "}
                      {t("customer.quotes.completedJobs")}
                    </div>
                  )}
                </div>

                {/* Quote */}
                <div className="border-t border-gray-200 dark:border-neutral-800 pt-4 mb-4">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                    {quote.price_currency} {quote.price_amount}
                    <span className="text-sm font-normal text-gray-500 dark:text-neutral-500 ml-2">
                      {t(`customer.quotes.pricingModel.${quote.pricing_model}`)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-neutral-300 line-clamp-4 whitespace-pre-wrap">
                    {quote.message}
                  </p>
                </div>

                {/* CTAs */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartChat(quote);
                    }}
                    disabled={openingThread === quote.id}
                    className="w-full px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    <MessageSquare className="h-4 w-4" />
                    {openingThread === quote.id
                      ? t("messaging.openingThread")
                      : t("customer.quotes.contactPro")}
                  </button>
                  <div className="flex gap-2">
                    {/* Disintermediation (G-DISINT): off-platform WhatsApp
                        removed — first contact is the in-app message thread
                        (button above). */}
                    <a
                      href={`/${locale}/provider/${pro.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-neutral-700 text-gray-700 dark:text-neutral-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-neutral-800 text-center"
                    >
                      {t("customer.quotes.viewProfile")}
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {threadError && (
        <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
          {threadError}
        </div>
      )}
    </div>
  );
}
