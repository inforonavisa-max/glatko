"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, RotateCw } from "lucide-react";

/**
 * Error boundary for the gated health pages. A genuine read-RPC failure (thrown
 * by lib/saglik/queries) lands here as a designed, graceful screen with a retry
 * — it never crashes the route or masquerades as an empty/404. Client component
 * (Next requirement for error.tsx); strings come from the health dictionary.
 */
export default function HealthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("healthVertical.directory");

  useEffect(() => {
    // Surface to the console for diagnostics; no PII in directory reads.
    console.error("[health-directory] render error:", error.message);
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
