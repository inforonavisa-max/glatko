"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, RotateCw } from "lucide-react";

/**
 * H10 — error boundary for the provider tree (parity with the patient (gated) tree).
 * A genuine read/write failure lands here as a designed, graceful screen with a retry
 * — it never crashes the route. PII-free logging: only error.message (the lib layer
 * raises stable RPC codes, never patient data).
 */
export default function SaglikProError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("healthVertical.directory");

  useEffect(() => {
    // No PII in provider-tree reads/writes — only the stable message/code.
    console.error("[health-provider] render error:", error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-40 text-center">
      <AlertTriangle className="mx-auto h-9 w-9 text-gray-400" />
      <h1 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
        {t("errorTitle")}
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500 dark:text-white/50">
        {t("errorBody")}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40"
      >
        <RotateCw className="h-4 w-4" />
        {t("retry")}
      </button>
    </div>
  );
}
