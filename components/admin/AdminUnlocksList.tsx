"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BadgeCheck, Check, Clock, FileText, Loader2 } from "lucide-react";

import {
  approveUnlock,
  markUnlockPaid,
} from "@/app/[locale]/admin/career/unlocks/actions";
import type { AdminUnlockRow } from "@/app/[locale]/admin/career/unlocks/page";

interface Props {
  rows: AdminUnlockRow[];
  filter: string;
  locale: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin chrome is TR-hardcoded by policy (admin-i18n-policy). These are NOT
// `careerVertical.*` dictionary keys — the 9-locale dictionaries cover only the
// public/employer/worker surfaces. Owner console = Turkish string literals.
// Accent = amber / brandCareer (swaps health's teal). Amber is wayfinding + the
// two action CTAs (Onayla, Ödendi) only; the unlocked completion pill is GREEN.
// ─────────────────────────────────────────────────────────────────────────────

const FILTERS: Array<{ value: string; label: string }> = [
  { value: "unpaid", label: "İlgi" },
  { value: "invoiced", label: "Fatura kesildi" },
  { value: "paid", label: "Kilit açıldı" },
  { value: "all", label: "Tümü" },
];

/**
 * The gate state machine (load-bearing — Spec 27 §"gate state machine"). State
 * derives from (ownerApproved, paymentStatus, unlockedAt); the client NEVER
 * fabricates the unlock locally — after any action `revalidatePath` re-reads and
 * the card re-renders from fresh server data.
 *   1. interest  — ownerApproved=false, paymentStatus='unpaid'  → amber, Onayla
 *   2. invoiced  — ownerApproved=true,  paymentStatus='invoiced' → amber, Ödendi
 *   3. unlocked  — paymentStatus='paid', unlockedAt set          → GREEN, terminal
 *   * fallback   — any unmapped combo                            → neutral gray pill
 */
type GateState = "interest" | "invoiced" | "unlocked" | "unknown";

function deriveState(row: AdminUnlockRow): GateState {
  if (row.paymentStatus === "paid" && row.unlockedAt != null) return "unlocked";
  if (row.ownerApproved && row.paymentStatus === "invoiced") return "invoiced";
  if (!row.ownerApproved && row.paymentStatus === "unpaid") return "interest";
  return "unknown";
}

export function AdminUnlocksList({ rows, filter, locale }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const run = (
    id: string,
    action: (unlockId: string) => Promise<{ success: boolean; error?: string }>,
  ) => {
    setPendingId(id);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    startTransition(async () => {
      const result = await action(id);
      if (!result.success) {
        setErrors((prev) => ({
          ...prev,
          [id]: result.error ?? "İşlem başarısız",
        }));
      }
      setPendingId(null);
    });
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-gray-900 dark:text-white md:text-3xl">
            Açılım Onayları
          </h1>
          <div className="mt-2 h-0.5 w-12 rounded-full bg-gradient-to-r from-amber-500 to-amber-600" />
          <p className="mt-2 text-sm text-gray-500 dark:text-white/50">
            İlgi → Onay → Fatura → Ödendi → Kilit açıldı
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-white/40">
            {rows.length} kayıt
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const isActive = filter === f.value;
            return (
              <Link
                key={f.value}
                href={
                  f.value === "unpaid"
                    ? `/${locale}/admin/career/unlocks`
                    : `/${locale}/admin/career/unlocks?status=${f.value}`
                }
                className={
                  isActive
                    ? "rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                    : "rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-white/60 dark:hover:bg-white/[0.04]"
                }
              >
                {f.label}
              </Link>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-gray-200/50 bg-white/70 px-6 py-16 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
          <FileText
            className="h-14 w-14 text-amber-500/30"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <h2 className="mt-4 font-serif text-lg font-semibold text-gray-700 dark:text-white/70">
            Açılım talebi yok
          </h2>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => {
            const state = deriveState(row);
            const pending = pendingId === row.id;
            const actionError = errors[row.id];
            return (
              <div
                key={row.id}
                className="rounded-2xl border border-gray-200/80 bg-white/80 p-5 dark:border-white/[0.08] dark:bg-white/[0.04]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {/* R7/R8 #9: worker CODE + employer company only — never a
                        name/phone/email/passport or any signed document URL. */}
                    <p className="font-mono text-base font-semibold text-gray-900 dark:text-white">
                      {row.workerCode}
                    </p>
                    <p className="mt-0.5 text-sm text-gray-600 dark:text-white/70">
                      {row.employerCompany}
                    </p>
                    {row.requisitionId ? (
                      <p className="mt-1 text-xs text-gray-400 dark:text-white/40">
                        İlan: {row.requisitionId}
                      </p>
                    ) : null}
                  </div>
                  <StatePill state={state} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-white/40">
                  <span>
                    İlgi:{" "}
                    {new Date(row.interestAt).toLocaleDateString("tr", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  {state === "invoiced" && row.feeInvoiceId ? (
                    <span className="font-mono text-gray-600 dark:text-white/50">
                      Fatura: {row.feeInvoiceId}
                    </span>
                  ) : null}
                  {state === "unlocked" && row.unlockedAt ? (
                    <span className="text-green-600 dark:text-green-300">
                      Kilit açıldı:{" "}
                      {new Date(row.unlockedAt).toLocaleDateString("tr", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  ) : null}
                </div>

                {actionError ? (
                  <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-300">
                    {actionError}
                  </p>
                ) : null}

                {/* Actions: amber CTAs are the gate's money steps. The unlocked
                    (terminal-success) row carries no further action. */}
                {state === "interest" ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => run(row.id, approveUnlock)}
                      disabled={pending}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
                    >
                      {pending ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {pending ? "İşleniyor…" : "Onayla"}
                    </button>
                    {/* GAP (Spec 27): deny has no RPC/enum value yet. Rendered
                        disabled/"yakında" — do NOT simulate deny client-side. */}
                    <button
                      type="button"
                      disabled
                      title="Reddetme yakında (RPC bekleniyor)"
                      className="inline-flex cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-red-300 px-4 py-2 text-xs font-semibold text-red-700 opacity-50 dark:border-red-500/30 dark:text-red-400"
                    >
                      Reddet (yakında)
                    </button>
                  </div>
                ) : state === "invoiced" ? (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => run(row.id, markUnlockPaid)}
                      disabled={pending}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
                    >
                      {pending ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {pending ? "İşleniyor…" : "Ödendi olarak işaretle"}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatePill({ state }: { state: GateState }) {
  if (state === "unlocked") {
    // Completion → GREEN/success, NOT amber (completion is not a call-to-action).
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
        <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Kilit açıldı
      </span>
    );
  }
  if (state === "unknown") {
    // Unmapped status combo → neutral gray pill (never crash on unmapped value).
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500 dark:bg-white/10 dark:text-white/50">
        Bilinmiyor
      </span>
    );
  }
  // interest + invoiced → amber wayfinding pills.
  const label =
    state === "invoiced"
      ? "Onaylandı — fatura kesildi (ödeme bekliyor)"
      : "İlgi — onay bekliyor";
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
