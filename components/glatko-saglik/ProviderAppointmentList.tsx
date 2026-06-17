"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Check, XCircle, UserX, Ban } from "lucide-react";

import {
  changeAppointmentStatus,
  loadProviderAppointments,
} from "@/app/[locale]/saglik-pro/actions";
import type { ProviderAppointment } from "@/lib/saglik/provider";
import { canTransition, type AppointmentStatus } from "@/lib/saglik/occupancy";
import { intlLocale } from "@/lib/saglik/intl";
import type { Locale } from "@/i18n/routing";

/**
 * Glatko Sağlık — H7b appointment list + status actions. Lists the provider's OWN
 * appointments (name + MASKED phone, slot, service, status badge), filterable by
 * scope (upcoming/past/all) and status. Actions per confirmed row: Complete /
 * No-show / Cancel-with-reason, wired to the owner-checked server actions via
 * useTransition with inline error + a cancel-reason confirm step. Mobile-first.
 */

type Scope = "upcoming" | "past" | "all";
type StatusFilter = "confirmed" | "completed" | "cancelled" | "no_show" | null;

const SCOPES: Scope[] = ["upcoming", "past", "all"];

export function ProviderAppointmentList({
  locale,
  initialAppointments,
}: {
  locale: Locale;
  initialAppointments: ProviderAppointment[];
}) {
  const t = useTranslations("healthVertical");
  const a = (k: string) => t(`pro.appointments.${k}`);
  const [pending, startTransition] = useTransition();

  const [scope, setScope] = useState<Scope>("upcoming");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
  const [items, setItems] = useState<ProviderAppointment[]>(initialAppointments);
  const [error, setError] = useState<string | null>(null);
  // appointmentId currently in the cancel-reason confirm step.
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  function refilter(nextScope: Scope, nextStatus: StatusFilter) {
    setScope(nextScope);
    setStatusFilter(nextStatus);
    setError(null);
    startTransition(async () => {
      const res = await loadProviderAppointments(locale, nextScope, nextStatus);
      if (res.ok) setItems(res.appointments);
      else setError(a("loadError"));
    });
  }

  function act(id: string, status: "completed" | "no_show" | "cancelled", why?: string) {
    setError(null);
    startTransition(async () => {
      const res = await changeAppointmentStatus(id, status, why);
      if (!res.ok) {
        setError(res.error === "INVALID_STATUS" ? a("invalidStatus") : a("actionError"));
        return;
      }
      setCancelling(null);
      setReason("");
      // Re-pull the current filter so the row's new status (or its removal from
      // 'confirmed') is reflected without a full reload.
      const reload = await loadProviderAppointments(locale, scope, statusFilter);
      if (reload.ok) setItems(reload.appointments);
    });
  }

  const dateTime = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale(locale), {
      timeZone: "Europe/Podgorica",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));

  return (
    <div>
      <h2 className="font-serif text-xl font-light tracking-tight text-gray-900 dark:text-white">
        {a("title")}
      </h2>

      {/* Scope tabs */}
      <div className="mt-3 flex flex-wrap gap-2">
        {SCOPES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => refilter(s, statusFilter)}
            aria-pressed={scope === s}
            className={
              scope === s
                ? "rounded-full bg-brandHealth-600 px-3 py-1.5 text-xs font-semibold text-white"
                : "rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-gray-300 dark:border-white/10 dark:text-white/60"
            }
          >
            {a(`scope.${s}`)}
          </button>
        ))}
        <span className="mx-1 self-center text-gray-300 dark:text-white/20" aria-hidden>
          |
        </span>
        {([null, "confirmed", "completed", "cancelled", "no_show"] as StatusFilter[]).map(
          (st) => (
            <button
              key={st ?? "any"}
              type="button"
              onClick={() => refilter(scope, st)}
              aria-pressed={statusFilter === st}
              className={
                statusFilter === st
                  ? "rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-gray-900"
                  : "rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-gray-300 dark:border-white/10 dark:text-white/60"
              }
            >
              {st ? a(`status.${st}`) : a("status.any")}
            </button>
          ),
        )}
        {pending && (
          <Loader2 className="h-4 w-4 animate-spin self-center text-brandHealth-600" aria-hidden />
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-gray-200 bg-white/40 p-6 text-center text-sm text-gray-400 dark:border-white/10 dark:bg-white/5 dark:text-white/30">
          {a("empty")}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => {
            const status = item.status as AppointmentStatus;
            const isConfirmed = status === "confirmed";
            return (
              <li
                key={item.appointmentId}
                className="rounded-2xl border border-gray-200 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {item.patientName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-white/50">
                      <bdi>{item.patientPhoneMasked}</bdi> · {item.serviceName}
                      {item.source === "provider" && (
                        <span className="ml-1 rounded bg-brandHealth-50 px-1.5 py-0.5 text-[10px] font-medium text-brandHealth-700 dark:bg-brandHealth/10 dark:text-brandHealth">
                          {a("sourceProvider")}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-sm text-gray-700 dark:text-white/70">
                      {dateTime(item.slotStart)}
                    </p>
                  </div>
                  <StatusBadge status={status} label={a(`status.${status}`)} />
                </div>

                {item.patientNote && (
                  <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-white/5 dark:text-white/60">
                    {item.patientNote}
                  </p>
                )}

                {isConfirmed && cancelling !== item.appointmentId && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pending || !canTransition(status, "completed").ok}
                      onClick={() => act(item.appointmentId, "completed")}
                      className="inline-flex items-center gap-1.5 rounded-full border border-brandHealth-200 px-3 py-1.5 text-xs font-medium text-brandHealth-700 transition hover:bg-brandHealth-50 disabled:opacity-50 dark:border-brandHealth/30 dark:text-brandHealth dark:hover:bg-brandHealth/10"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden /> {a("markCompleted")}
                    </button>
                    <button
                      type="button"
                      disabled={pending || !canTransition(status, "no_show").ok}
                      onClick={() => act(item.appointmentId, "no_show")}
                      className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-50 dark:border-amber-400/30 dark:text-amber-300 dark:hover:bg-amber-400/10"
                    >
                      <UserX className="h-3.5 w-3.5" aria-hidden /> {a("markNoShow")}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setCancelling(item.appointmentId);
                        setReason("");
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-400/30 dark:text-red-300 dark:hover:bg-red-400/10"
                    >
                      <Ban className="h-3.5 w-3.5" aria-hidden /> {a("markCancelled")}
                    </button>
                  </div>
                )}

                {isConfirmed && cancelling === item.appointmentId && (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50/50 p-3 dark:border-red-400/30 dark:bg-red-400/5">
                    <label className="block text-xs font-medium text-gray-700 dark:text-white/70">
                      {a("cancelReasonLabel")}
                    </label>
                    <input
                      type="text"
                      value={reason}
                      maxLength={500}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={a("cancelReasonPlaceholder")}
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brandHealth focus:outline-none focus:ring-1 focus:ring-brandHealth dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => act(item.appointmentId, "cancelled", reason)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                      >
                        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                        <XCircle className="h-3.5 w-3.5" aria-hidden /> {a("confirmCancel")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCancelling(null)}
                        className="rounded-full border border-gray-200 px-4 py-1.5 text-xs font-medium text-gray-600 transition hover:border-gray-300 dark:border-white/10 dark:text-white/60"
                      >
                        {a("cancelAbort")}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status, label }: { status: AppointmentStatus; label: string }) {
  const cls: Record<AppointmentStatus, string> = {
    confirmed:
      "bg-brandHealth-50 text-brandHealth-700 dark:bg-brandHealth/10 dark:text-brandHealth",
    completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
    cancelled: "bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300",
    no_show: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
  };
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls[status]}`}
    >
      {label}
    </span>
  );
}
