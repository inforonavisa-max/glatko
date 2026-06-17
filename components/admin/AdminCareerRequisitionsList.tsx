"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import { setRequisitionStatus } from "@/app/[locale]/admin/career/requisitions/actions";
import type { AdminRequisitionRow } from "@/app/[locale]/admin/career/requisitions/page";
import { cn } from "@/lib/utils";

interface Props {
  rows: AdminRequisitionRow[];
  filter: string;
  locale: string;
}

// Admin chrome is TR-hardcoded by policy (admin i18n deferred, TODO i18n-b4).
// These are NOT routed through the careerVertical.* dictionary.
const FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Tümü" },
  { value: "submitted", label: "Alındı" },
  { value: "under_curation", label: "İncelemede" },
  { value: "shortlist_ready", label: "Aday Hazır" },
  { value: "interest_expressed", label: "İlgi Bildirildi" },
  { value: "approved", label: "Onaylandı" },
  { value: "placed", label: "Yerleşti" },
  { value: "in_guarantee", label: "Garantide" },
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  submitted: {
    label: "Alındı",
    cls: "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-white/60",
  },
  under_curation: {
    label: "İncelemede",
    cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  // The one amber pill — owner-action-pending "act now" signal (mirrors how
  // reviews uses amber for `flagged`). Do NOT amber-tint other pills.
  shortlist_ready: {
    label: "Aday Hazır",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  interest_expressed: {
    label: "İlgi Bildirildi",
    cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  approved: {
    label: "Onaylandı",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  placed: {
    label: "Yerleşti",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  in_guarantee: {
    label: "Garantide",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
};

// Linear lifecycle: each status maps to the single forward transition legal
// from it. The card passes the status it currently displays as `p_expected`
// (compare-and-set) so a stale console view can't skip/double-apply a stage.
// Terminal `in_guarantee` has no entry → no forward button.
const FORWARD: Record<string, { next: string; label: string }> = {
  submitted: { next: "under_curation", label: "İncelemeye Al" },
  under_curation: { next: "shortlist_ready", label: "Aday Hazır" },
  shortlist_ready: { next: "interest_expressed", label: "İlgi Bildirildi" },
  interest_expressed: { next: "approved", label: "Onayla" },
  approved: { next: "placed", label: "Yerleşti olarak işaretle" },
  placed: { next: "in_guarantee", label: "Garantiye Al" },
};

export function AdminCareerRequisitionsList({ rows, filter, locale }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const act = (id: string, expected: string, next: string) => {
    setPendingId(id);
    setError(null);
    startTransition(async () => {
      const result = await setRequisitionStatus(id, expected, next);
      if (!result.success) setError(result.error ?? "İşlem başarısız");
      setPendingId(null);
    });
  };

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-gray-900 dark:text-white">
        Talep yönetimi
      </h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-white/40">
        {rows.length} kayıt
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/${locale}/admin/career/requisitions?status=${f.value}`}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
              filter === f.value
                ? "bg-brandCareer text-white"
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
          Bu filtrede talep yok
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {rows.map((r) => {
            const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.submitted;
            const forward = FORWARD[r.status];
            const isTerminal = !forward;
            return (
              <div
                key={r.id}
                className="rounded-2xl border border-gray-200/80 bg-white/80 p-5 dark:border-white/[0.08] dark:bg-white/[0.04]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {r.employer_company ?? "—"}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-white/40">
                      {r.sector_label ?? "—"} · {r.role ?? "—"}
                      {r.headcount ? ` ×${r.headcount}` : ""}
                    </span>
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
                  {r.service_path === "full_service"
                    ? "Tam hizmet"
                    : "Komisyon"}
                  {r.shortlist_count > 0
                    ? ` · ${r.shortlist_count} aday sunuldu`
                    : ""}
                </p>

                <div className="mt-4">
                  {isTerminal ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 dark:text-white/30">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Süreç tamamlandı
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => act(r.id, r.status, forward.next)}
                      disabled={pendingId === r.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                      {pendingId === r.id ? "İşleniyor…" : forward.label}
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
