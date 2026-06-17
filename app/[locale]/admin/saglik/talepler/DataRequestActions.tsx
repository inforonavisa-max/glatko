"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { resolveDataRequestAction } from "./actions";

/**
 * H10 data-rights queue resolve UI (clone of HealthProviderActions): useTransition +
 * window.confirm + router.refresh(). Only a 'pending' request is resolvable (mirrors the
 * 080 RPC guard); resolved rows render a status note instead of buttons.
 */
export function DataRequestActions({
  requestId,
  status,
}: {
  requestId: string;
  status: "pending" | "fulfilled" | "rejected";
}) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(next: "fulfilled" | "rejected") {
    const confirmKey =
      next === "fulfilled"
        ? "admin.health.dataRequests.confirmFulfill"
        : "admin.health.dataRequests.confirmReject";
    if (!window.confirm(t(confirmKey))) return;
    setError(null);
    startTransition(async () => {
      const res = await resolveDataRequestAction(requestId, next);
      if (!res.success) setError(res.error);
      else router.refresh();
    });
  }

  if (status !== "pending") {
    return (
      <span className="text-xs font-medium text-gray-400 dark:text-white/40">
        {status === "fulfilled"
          ? t("admin.health.dataRequests.statusFulfilled")
          : t("admin.health.dataRequests.statusRejected")}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => run("fulfilled")}
          className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-60 dark:border-green-500/30 dark:bg-green-900/20 dark:text-green-300"
        >
          {t("admin.health.dataRequests.markFulfilled")}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => run("rejected")}
          className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-300"
        >
          {t("admin.health.dataRequests.markRejected")}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
