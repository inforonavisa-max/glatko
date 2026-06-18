"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BadgeCheck, RotateCcw } from "lucide-react";
import {
  setEmployerTier,
  setEmployerVerified,
} from "@/app/[locale]/admin/career/employers/actions";
import type { AdminEmployerRow } from "@/app/[locale]/admin/career/employers/page";
import { cn } from "@/lib/utils";

interface Props {
  rows: AdminEmployerRow[];
  filter: string;
  locale: string;
}

// Admin chrome is TR-hardcoded by policy (admin i18n deferred, TODO i18n-b4).
const FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Tümü" },
  { value: "free", label: "Ücretsiz" },
  { value: "verified", label: "Doğrulanmış" },
  { value: "premium", label: "Premium" },
];

// Tier badge — mirror reviews' STATUS_BADGE, keyed by tier enum. The premium
// pill is the one amber signal (mirroring reviews' amber `flagged`); verified is
// emerald, free is neutral gray. Tier (enum) and `verified` (boolean) are
// independent columns — do not couple them here.
const TIER_BADGE: Record<string, { label: string; cls: string }> = {
  premium: {
    label: "Premium",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  verified: {
    label: "Doğrulanmış",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  free: {
    label: "Ücretsiz",
    cls: "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-white/60",
  },
};

const TIERS: ReadonlyArray<{ value: "free" | "verified" | "premium"; label: string }> = [
  { value: "free", label: "Ücretsiz" },
  { value: "verified", label: "Doğrulanmış" },
  { value: "premium", label: "Premium" },
];

export function AdminCareerEmployersList({ rows, filter, locale }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const act = (
    id: string,
    action:
      | { kind: "verify"; verified: boolean }
      | { kind: "tier"; tier: "free" | "verified" | "premium" },
  ) => {
    setPendingId(id);
    setError(null);
    startTransition(async () => {
      const result =
        action.kind === "verify"
          ? await setEmployerVerified(id, action.verified)
          : await setEmployerTier(id, action.tier);
      if (!result.success) setError(result.error ?? "İşlem başarısız");
      setPendingId(null);
    });
  };

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-gray-900 dark:text-white">
        İşveren yönetimi
      </h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-white/40">
        {rows.length} kayıt
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/${locale}/admin/career/employers?tier=${f.value}`}
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
          Bu filtrede işveren yok
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {rows.map((r) => {
            const badge = TIER_BADGE[r.tier] ?? TIER_BADGE.free;
            return (
              <div
                key={r.id}
                className="rounded-2xl border border-gray-200/80 bg-white/80 p-5 dark:border-white/[0.08] dark:bg-white/[0.04]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {r.company ?? "—"}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        badge.cls,
                      )}
                    >
                      {badge.label}
                    </span>
                    {r.verified && (
                      <BadgeCheck
                        className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                        aria-label="Doğrulanmış işveren"
                      />
                    )}
                  </div>
                  <span className="text-xs text-gray-500 dark:text-white/40">
                    {new Date(r.created_at).toLocaleDateString("tr", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>

                {r.requisition_count != null && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-white/40">
                    {r.requisition_count} talep
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {/* Verify toggle — single button (mirror reviews' remove/restore pair). */}
                  {r.verified ? (
                    <button
                      type="button"
                      onClick={() => act(r.id, { kind: "verify", verified: false })}
                      disabled={pendingId === r.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {pendingId === r.id ? "İşleniyor…" : "Doğrulamayı kaldır"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => act(r.id, { kind: "verify", verified: true })}
                      disabled={pendingId === r.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                    >
                      <BadgeCheck className="h-3.5 w-3.5" />
                      {pendingId === r.id ? "İşleniyor…" : "Doğrula"}
                    </button>
                  )}

                  {/* Set tier — segmented Free / Verified / Premium. Current tier is the
                      active (amber) selection and disabled (no-op self-click). */}
                  <div className="inline-flex flex-wrap gap-2">
                    {TIERS.map((t) => {
                      const isCurrent = r.tier === t.value;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() =>
                            act(r.id, { kind: "tier", tier: t.value })
                          }
                          disabled={isCurrent || pendingId === r.id}
                          className={cn(
                            "inline-flex items-center rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-50",
                            isCurrent
                              ? "bg-brandCareer text-white"
                              : "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/5",
                          )}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
