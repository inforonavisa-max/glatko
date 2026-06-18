"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { FileText, ExternalLink } from "lucide-react";
import { getLicenseDownloadUrl } from "./actions";

interface Props {
  providerId: string;
  /** Whether a license file exists (the raw path is NEVER sent to the client). */
  licenseFileSet: boolean;
}

/**
 * H8 license viewer: on click, calls the isAdminEmail-gated server action that mints a
 * short-TTL (~120s) signed download URL for the PRIVATE health-licenses bucket and opens
 * it in a new tab. The raw object path is never rendered or embedded in the page HTML;
 * the URL is minted on-demand per click so it's not cached. Degrades gracefully if no file.
 */
export function HealthLicenseViewer({ providerId, licenseFileSet }: Props) {
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!licenseFileSet) {
    return (
      <p className="text-sm text-gray-500 dark:text-white/50">
        {t("admin.health.noLicenseFile")}
      </p>
    );
  }

  function openLicense() {
    setError(null);
    startTransition(async () => {
      const res = await getLicenseDownloadUrl(providerId);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      // Open in a new tab — the signed URL expires shortly after.
      window.open(res.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={isPending}
        onClick={openLicense}
        className="inline-flex items-center gap-2 rounded-lg border border-brandHealth/40 bg-brandHealth-50 px-4 py-2.5 text-sm font-medium text-brandHealth-700 transition-colors hover:bg-brandHealth/10 disabled:opacity-50 dark:border-brandHealth/30 dark:bg-brandHealth/10 dark:text-brandHealth"
      >
        <FileText className="h-4 w-4" aria-hidden />
        {isPending ? t("common.loading") : t("admin.health.viewLicense")}
        <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden />
      </button>
      {error && (
        <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
