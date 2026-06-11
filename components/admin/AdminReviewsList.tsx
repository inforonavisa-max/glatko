"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Star, EyeOff, RotateCcw } from "lucide-react";
import { setReviewStatus } from "@/app/[locale]/admin/reviews/actions";
import type { AdminReviewRow } from "@/app/[locale]/admin/reviews/page";
import { cn } from "@/lib/utils";

interface Props {
  rows: AdminReviewRow[];
  filter: string;
  locale: string;
}

// Admin chrome is TR-hardcoded by policy (admin i18n deferred, TODO i18n-b4).
const FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Tümü" },
  { value: "published", label: "Yayında" },
  { value: "removed", label: "Kaldırılmış" },
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  published: {
    label: "Yayında",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  flagged: {
    label: "İşaretli",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  removed: {
    label: "Kaldırılmış",
    cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
};

export function AdminReviewsList({ rows, filter, locale }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const act = (id: string, status: "published" | "removed") => {
    setPendingId(id);
    setError(null);
    startTransition(async () => {
      const result = await setReviewStatus(id, status);
      if (!result.success) setError(result.error ?? "İşlem başarısız");
      setPendingId(null);
    });
  };

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-gray-900 dark:text-white">
        Değerlendirme moderasyonu
      </h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-white/40">
        {rows.length} kayıt
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/${locale}/admin/reviews?status=${f.value}`}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
              filter === f.value
                ? "bg-teal-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-white/60",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {rows.length === 0 ? (
        <div className="mt-10 py-12 text-center text-sm text-gray-500 dark:text-white/40">
          Bu filtrede değerlendirme yok
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {rows.map((r) => {
            const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.published;
            return (
              <div
                key={r.id}
                className="rounded-2xl border border-gray-200/80 bg-white/80 p-5 dark:border-white/[0.08] dark:bg-white/[0.04]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {r.customer_display_name ?? "Anonim"}
                    </span>
                    <div className="flex" aria-label={`${r.rating} yıldız`}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={cn(
                            "h-4 w-4",
                            s <= r.rating
                              ? "text-yellow-500 fill-yellow-500"
                              : "text-gray-300 dark:text-neutral-600",
                          )}
                        />
                      ))}
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        badge.cls,
                      )}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-white/40">
                    {new Date(r.created_at).toLocaleDateString("tr", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>

                <p className="mt-1 text-xs text-gray-500 dark:text-white/40">
                  {r.business_name ?? r.professional_id} ·{" "}
                  {r.request_title ?? "—"}
                </p>

                {r.comment && (
                  <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700 dark:text-neutral-300">
                    {r.comment}
                  </p>
                )}
                {r.pro_response && (
                  <p className="mt-2 border-l-2 border-teal-500 pl-3 text-xs text-gray-500 dark:text-white/50">
                    Pro yanıtı: {r.pro_response}
                  </p>
                )}

                <div className="mt-4">
                  {r.status === "removed" ? (
                    <button
                      type="button"
                      onClick={() => act(r.id, "published")}
                      disabled={pendingId === r.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {pendingId === r.id ? "İşleniyor…" : "Geri al"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => act(r.id, "removed")}
                      disabled={pendingId === r.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                      {pendingId === r.id ? "İşleniyor…" : "Kaldır"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
