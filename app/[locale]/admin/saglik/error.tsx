"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, RotateCw } from "lucide-react";

/**
 * H10 — error boundary for the admin health section (parity with the patient/provider
 * trees). A genuine admin read/write failure lands here as a designed retry screen.
 * PII-free logging: only error.message (the admin lib raises stable codes; the
 * appointment/consent RPCs return masked phone, never raw PII). Chrome uses common.*
 * (the admin section is i18n per the existing admin chrome policy).
 */
export default function HealthAdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");

  useEffect(() => {
    console.error("[health-admin] render error:", error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <AlertTriangle className="mx-auto h-9 w-9 text-gray-400" />
      <h1 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">{t("error")}</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500 dark:text-white/50">
        {t("errorDesc")}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brandHealth to-brandHealth-700 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:opacity-90"
      >
        <RotateCw className="h-4 w-4" />
        {t("retry")}
      </button>
    </div>
  );
}
