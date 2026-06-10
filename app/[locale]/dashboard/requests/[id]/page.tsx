import { redirect, notFound } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/supabase/server";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getServiceRequest } from "@/lib/supabase/glatko.server";
import { Link } from "@/i18n/navigation";
import { PageBackground } from "@/components/ui/PageBackground";
import { CancelRequestButton } from "@/components/glatko/dashboard/CancelRequestButton";
import { BidComparison } from "@/components/glatko/dashboard/BidComparison";
import {
  ArrowLeft,
  MapPin,
  Clock,
  Calendar,
  DollarSign,
  Phone,
  MessageSquare,
  Image as ImageIcon,
  Layers,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RequestStatus } from "@/types/glatko";
import { urgencyToStep3Key } from "@/lib/utils/urgencyI18n";

type Props = {
  params: Promise<{ locale: string; id: string }> | { locale: string; id: string };
};

type BidData = {
  id: string;
  price: number;
  price_type: string;
  message: string | null;
  status: string;
  created_at: string;
  estimated_duration_hours: number | null;
  available_date: string | null;
  professional?: {
    id: string;
    business_name: string | null;
    avg_rating: number;
    total_reviews: number;
    completed_jobs: number;
    is_verified: boolean;
  };
};

const STATUS_COLOR: Record<string, string> = {
  draft: "border-gray-200 bg-gray-100 text-gray-600 dark:border-white/10 dark:bg-white/10 dark:text-white/50",
  published: "border-teal-200 bg-teal-50 text-teal-600 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-400",
  bidding: "border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400",
  assigned: "border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-400",
  in_progress: "border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
  completed: "border-green-200 bg-green-50 text-green-600 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-400",
  reviewed: "border-green-200 bg-green-50 text-green-700 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-300",
  closed: "border-gray-200 bg-gray-100 text-gray-500 dark:border-white/10 dark:bg-white/10 dark:text-white/50",
  expired: "border-orange-200 bg-orange-50 text-orange-600 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-400",
  cancelled: "border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
};

const TIMELINE_STATUSES: RequestStatus[] = [
  "published",
  "bidding",
  "assigned",
  "in_progress",
  "completed",
];

export default async function RequestDetailPage({ params }: Props) {
  const resolved = await Promise.resolve(params);
  const { locale, id } = resolved;
  setRequestLocale(locale);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login?redirect=/dashboard/requests/${id}`);
  }

  const request = await getServiceRequest(id);
  if (!request) notFound();

  const t = await getTranslations();

  const status = (request.status as RequestStatus) ?? "draft";
  const isCancellable = ["draft", "published", "bidding"].includes(status);
  const catName =
    request.category?.name?.[locale as keyof typeof request.category.name] ??
    request.category?.name?.en ??
    "";

  const createdDate = new Date(request.created_at).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const statusIdx = TIMELINE_STATUSES.indexOf(status);

  const infoCards = [
    catName ? { icon: Layers, label: t("dashboard.detail.category") ?? "Category", value: catName } : null,
    request.municipality ? { icon: MapPin, label: t("dashboard.detail.location") ?? "Location", value: `${request.municipality}${request.address ? ` – ${request.address}` : ""}` } : null,
    (request.budget_min || request.budget_max) ? { icon: DollarSign, label: t("dashboard.detail.budget") ?? "Budget", value: `${request.budget_min ?? ""}${request.budget_min && request.budget_max ? " – " : ""}${request.budget_max ?? ""} EUR` } : null,
    { icon: Clock, label: t("dashboard.detail.urgency") ?? "Urgency", value: t(`request.step3.urgency.${urgencyToStep3Key(request.urgency)}`) },
    { icon: Calendar, label: t("dashboard.detail.date") ?? "Date", value: createdDate },
    (request.details as Record<string, unknown>)?.phone ? { icon: Phone, label: t("dashboard.detail.phone") ?? "Phone", value: String((request.details as Record<string, unknown>).phone) } : null,
  ].filter(Boolean) as { icon: typeof Clock; label: string; value: string }[];

  return (
    <PageBackground opacity={0.06}>
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-28 sm:px-6">
        {/* ── Breadcrumb ── */}
        <Link
          href="/dashboard/requests"
          className="mb-6 inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-teal-600 dark:text-white/50 dark:hover:text-teal-400"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("dashboard.detail.back")}
        </Link>

        {/* ── Header ── */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-serif text-2xl font-bold text-gray-900 dark:text-white">
              {request.title}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-white/50">
              {catName} &middot; {createdDate}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-full border px-4 py-1.5 text-xs font-semibold",
              STATUS_COLOR[status] ?? STATUS_COLOR.draft
            )}
          >
            {t(`dashboard.requests.status.${status}`)}
          </span>
        </div>

        {/* ── Timeline — vertical dots with teal line ── */}
        <div className="mb-8 rounded-2xl border border-gray-200/50 bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
          <h2 className="mb-5 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
            {t("dashboard.detail.timeline")}
          </h2>
          <div className="flex items-center gap-0">
            {TIMELINE_STATUSES.map((s, i) => {
              const reached = statusIdx >= i;
              const isCurrent = statusIdx === i;
              return (
                <div key={s} className="flex flex-1 items-center">
                  <div className="relative">
                    {isCurrent && reached && (
                      <div className="absolute inset-0 animate-ping rounded-full bg-teal-500/30" />
                    )}
                    <div
                      className={cn(
                        "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all",
                        reached
                          ? "bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-md shadow-teal-500/25"
                          : "border-2 border-gray-200 text-gray-400 dark:border-white/[0.12] dark:text-white/30"
                      )}
                    >
                      {reached && !isCurrent ? (
                        <Check className="h-4 w-4" strokeWidth={3} />
                      ) : (
                        i + 1
                      )}
                    </div>
                  </div>
                  {i < TIMELINE_STATUSES.length - 1 && (
                    <div
                      className={cn(
                        "mx-1 h-0.5 flex-1 rounded-full",
                        statusIdx > i
                          ? "bg-teal-500"
                          : "bg-gray-200 dark:bg-white/[0.06]"
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex text-[10px] text-gray-400 dark:text-white/30">
            {TIMELINE_STATUSES.map((s) => (
              <div key={s} className="flex-1 text-center">
                {t(`dashboard.requests.status.${s}`)}
              </div>
            ))}
          </div>
        </div>

        {/* ── Status banner ── */}
        {(status === "in_progress" || status === "assigned") && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-teal-500/20 bg-teal-500/[0.04] px-5 py-4">
            <div className={cn("h-2.5 w-2.5 shrink-0 rounded-full", status === "in_progress" ? "animate-pulse bg-teal-400" : "bg-indigo-400")} />
            <p className="text-sm font-medium text-gray-700 dark:text-white/70">
              {status === "assigned" ? t("jobStatus.assigned") : t("jobStatus.inProgress")}
            </p>
          </div>
        )}

        {/* ── Info grid — glassmorphism mini cards ── */}
        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {infoCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="flex items-start gap-3 rounded-2xl border border-gray-200/50 bg-white/70 p-4 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 dark:bg-teal-500/15">
                  <Icon className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
                    {card.label}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">
                    {card.value}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Description ── */}
        {request.description && (
          <div className="mb-8 rounded-2xl border border-gray-200/50 bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
              {t("dashboard.detail.details")}
            </h2>
            <p className="text-sm leading-relaxed text-gray-700 dark:text-white/60">
              {request.description}
            </p>
          </div>
        )}

        {/* ── Photos ── */}
        {request.photos && (request.photos as string[]).length > 0 && (
          <div className="mb-8 rounded-2xl border border-gray-200/50 bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
            <h2 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
              <ImageIcon className="h-4 w-4" />
              {t("dashboard.detail.photos")}
            </h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {(request.photos as string[]).map((url: string) => (
                <div key={url} className="group relative aspect-square overflow-hidden rounded-xl border border-gray-200/50 dark:border-white/[0.08]">
                  <Image
                    src={url}
                    alt=""
                    width={128}
                    height={128}
                    unoptimized
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Bids section ── */}
        <div className="mb-8 rounded-2xl border border-gray-200/50 bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
          <h2 className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
            <MessageSquare className="h-4 w-4" />
            {t("bidComparison.title")} ({request.bid_count ?? 0}/{request.max_bids ?? 4})
          </h2>
          <BidComparison
            bids={(request.bids as BidData[]) ?? []}
            requestId={id}
            requestStatus={status}
            locale={locale}
          />
        </div>

        {/* ── Cancel button ── */}
        {isCancellable && (
          <div className="flex justify-end">
            <CancelRequestButton requestId={id} />
          </div>
        )}
      </div>
    </PageBackground>
  );
}
