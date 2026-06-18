"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { approveProvider, rejectProvider } from "./actions";

interface Props {
  providerId: string;
  currentStatus: "pending" | "approved" | "rejected";
}

/**
 * H8 approve / reasoned-reject UI (clone of components/glatko/admin/AdminActions.tsx):
 * useTransition + window.confirm + reject textarea + router.refresh(). Only a 'pending'
 * provider is decidable (mirrors the 079 RPC / canDecide guard) — terminal states render
 * a status note instead of buttons. brandHealth accent on the approve button.
 */
export function HealthProviderActions({ providerId, currentStatus }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function runApprove() {
    if (!window.confirm(t("admin.health.confirmApprove"))) return;
    setError(null);
    startTransition(async () => {
      const res = await approveProvider(providerId);
      if (!res.success) setError(res.error);
      else router.refresh();
    });
  }

  function runReject() {
    if (!window.confirm(t("admin.health.confirmReject"))) return;
    setError(null);
    startTransition(async () => {
      const res = await rejectProvider(providerId, rejectReason);
      if (!res.success) setError(res.error);
      else router.refresh();
    });
  }

  if (currentStatus === "approved") {
    return (
      <p className="text-sm font-medium text-green-600 dark:text-green-400">
        {t("admin.health.statusApproved")}
      </p>
    );
  }
  if (currentStatus === "rejected") {
    return (
      <p className="text-sm font-medium text-red-600 dark:text-red-400">
        {t("admin.health.statusRejected")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <button
          type="button"
          disabled={isPending}
          onClick={runApprove}
          className="rounded-lg bg-gradient-to-r from-brandHealth to-brandHealth-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? t("common.loading") : t("admin.health.approve")}
        </button>

        {!showRejectForm ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => setShowRejectForm(true)}
            className="rounded-lg bg-gradient-to-r from-red-500 to-red-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {t("admin.health.reject")}
          </button>
        ) : (
          <div className="flex w-full max-w-md flex-col gap-3">
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reddetme nedeni (sağlayıcıya iletilir)" /* TODO i18n */
              rows={3}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400 dark:border-white/20 dark:bg-white/5 dark:text-white dark:placeholder:text-white/40"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={runReject}
                className="rounded-lg bg-gradient-to-r from-red-500 to-red-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isPending ? t("common.loading") : t("admin.health.reject")}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setShowRejectForm(false);
                  setRejectReason("");
                }}
                className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-white/20 dark:text-white/70 dark:hover:bg-white/5"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
      {error && (
        <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
