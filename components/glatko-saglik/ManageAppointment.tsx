"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CircleSlash, Clock, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";

/**
 * Glatko Sağlık — H5b/H9 appointment manage (cancel + reschedule) (Client Component).
 *
 * Patient self-service actions reached from the confirm SMS/email manage link.
 * A 'confirmed' appointment whose slot is still in the FUTURE offers two CTAs:
 *   - Reschedule → /health/r/[token]/reschedule (pick a new slot, same provider/
 *     service/location; the move is atomic — see migration 075).
 *   - Cancel → an are-you-sure step that POSTs the opaque manage_token to
 *     /api/health/cancel; on success the card flips to a terminal 'cancelled' state.
 * Once the slot has PASSED (slotPassed) — or the appointment is no longer
 * 'confirmed' — both actions are INERT: a graceful "this appointment has passed /
 * can no longer be changed" message, no CTA (defense-in-depth; the RPCs also reject).
 */

type AppointmentStatus = "confirmed" | "cancelled" | "completed" | "no_show";

export function ManageAppointment({
  token,
  initialStatus,
  slotPassed,
}: {
  token: string;
  initialStatus: AppointmentStatus;
  locale: string;
  /** True when the appointment slot has already started → actions are inert. */
  slotPassed: boolean;
}) {
  const t = useTranslations("healthVertical.booking");

  const [status, setStatus] = useState<AppointmentStatus>(initialStatus);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doCancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/health/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload: { ok?: boolean } = await res.json().catch(() => ({}));
      if (res.ok && payload.ok) {
        setStatus("cancelled");
        setConfirming(false);
        return;
      }
      setError(t("cancelError"));
    } catch {
      setError(t("cancelError"));
    } finally {
      setBusy(false);
    }
  }

  // ── Terminal: already cancelled ───────────────────────────────────────────
  if (status === "cancelled") {
    return (
      <section className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-6 text-center dark:border-white/10 dark:bg-white/5">
        <CircleSlash className="mx-auto h-9 w-9 text-gray-400 dark:text-white/40" />
        <h2 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">
          {t("cancelledTitle")}
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600 dark:text-white/70">
          {t("cancelledBody")}
        </p>
      </section>
    );
  }

  // ── Inert: slot already passed (confirmed but in the past) → graceful, no action ──
  if (status === "confirmed" && slotPassed) {
    return (
      <section className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-6 text-center dark:border-white/10 dark:bg-white/5">
        <Clock className="mx-auto h-9 w-9 text-gray-400 dark:text-white/40" />
        <h2 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">
          {t("passedTitle")}
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600 dark:text-white/70">
          {t("passedBody")}
        </p>
      </section>
    );
  }

  // ── Non-confirmed, non-cancelled (completed / no_show): no action ──────────
  if (status !== "confirmed") {
    return null;
  }

  // ── Confirmed + future: reschedule + cancel ────────────────────────────────
  return (
    <section className="mt-6">
      {error && (
        <p
          role="alert"
          aria-live="assertive"
          className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {confirming ? (
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-5 dark:border-red-500/30 dark:bg-red-500/10">
          <p className="text-sm text-gray-700 dark:text-white/80">
            {t("cancelConfirm")}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={doCancel}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? t("cancelling") : t("cancelConfirmCta")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10"
            >
              {t("keepCta")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          {/* Reschedule (primary, teal) → the new-slot sub-page. */}
          <Link
            href={{ pathname: "/health/r/[token]/reschedule", params: { token } }}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40"
          >
            {t("rescheduleCta")}
          </Link>
          {/* Cancel (destructive, opens confirm step). */}
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
          >
            {t("cancelCta")}
          </button>
        </div>
      )}
    </section>
  );
}
