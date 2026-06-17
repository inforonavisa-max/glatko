"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, RotateCw } from "lucide-react";

/**
 * Error boundary for the gated career (İş & Kariyer) pages. A genuine read-RPC
 * failure (thrown by lib/kariyer/queries) lands here as a designed, graceful
 * screen with a retry — it never crashes the route or masquerades as an
 * empty/404. Client component (Next requirement for error.tsx); strings come
 * from the career dictionary, retry button uses the amber gradient.
 */
export default function CareerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("careerVertical.pool");

  useEffect(() => {
    // Surface to the console for diagnostics; pool/showcase reads carry no PII.
    console.error("[career-pool] render error:", error.message);
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
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 transition-all hover:shadow-amber-500/40"
      >
        <RotateCw className="h-4 w-4" />
        {t("retry")}
      </button>
    </div>
  );
}
