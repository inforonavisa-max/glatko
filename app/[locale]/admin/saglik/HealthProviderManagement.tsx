"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { setProviderPublishedAction, setProviderTierAction } from "./actions";
import { HEALTH_PROVIDER_TIERS, type HealthProviderTier } from "@/lib/saglik/admin-metrics";

interface Props {
  providerId: string;
  isPublished: boolean;
  /** Only an approved provider may be (re)published. */
  isApproved: boolean;
  currentTier: string;
}

/**
 * H8 provider management: unpublish/re-publish toggle + tier change. Clones the
 * ProActiveToggle + AdminTierEditor pattern into one card. Re-publish is disabled unless
 * the provider is approved (mirrors the 079 set_published guard). useTransition + refresh.
 */
export function HealthProviderManagement({
  providerId,
  isPublished,
  isApproved,
  currentTier,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tier, setTier] = useState<string>(
    HEALTH_PROVIDER_TIERS.includes(currentTier as HealthProviderTier) ? currentTier : "free",
  );
  const [error, setError] = useState<string | null>(null);

  function togglePublished() {
    const next = !isPublished;
    const confirmMsg = next
      ? t("admin.health.confirmPublish")
      : t("admin.health.confirmUnpublish");
    if (!window.confirm(confirmMsg)) return;
    setError(null);
    startTransition(async () => {
      const res = await setProviderPublishedAction(providerId, next);
      if (!res.success) setError(res.error);
      else router.refresh();
    });
  }

  function saveTier() {
    setError(null);
    startTransition(async () => {
      const res = await setProviderTierAction(providerId, tier);
      if (!res.success) setError(res.error);
      else router.refresh();
    });
  }

  // Tier option labels — TODO i18n (admin operational microcopy, hardcoded per policy).
  const TIER_LABELS: Record<HealthProviderTier, string> = {
    free: "Ücretsiz",
    premium: "Premium",
    business: "Business",
  };

  return (
    <div className="space-y-5 rounded-2xl border border-gray-200/50 bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
      <div>
        <h3 className="font-serif text-base font-semibold text-gray-900 dark:text-white">
          {t("admin.health.management")}
        </h3>
        <div className="mt-1 h-0.5 w-10 rounded-full bg-gradient-to-r from-brandHealth to-brandHealth-700" />
      </div>

      {/* Publish toggle */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {t("admin.health.published")}
          </p>
          <p className="text-xs text-gray-500 dark:text-white/50">
            {isPublished ? t("admin.health.publishedYes") : t("admin.health.publishedNo")}
          </p>
        </div>
        <button
          type="button"
          disabled={isPending || (!isPublished && !isApproved)}
          onClick={togglePublished}
          className={
            isPublished
              ? "rounded-lg bg-gradient-to-r from-red-500 to-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              : "rounded-lg bg-gradient-to-r from-brandHealth to-brandHealth-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          }
        >
          {isPublished ? t("admin.health.unpublish") : t("admin.health.publish")}
        </button>
      </div>

      {/* Tier editor */}
      <div className="border-t border-gray-100 pt-4 dark:border-white/[0.06]">
        <p className="mb-2 text-sm font-medium text-gray-900 dark:text-white">
          {t("admin.health.tier")}
        </p>
        <div className="flex items-center gap-2">
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            disabled={isPending}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brandHealth focus:outline-none focus:ring-1 focus:ring-brandHealth disabled:opacity-50 dark:border-white/20 dark:bg-white/5 dark:text-white"
          >
            {HEALTH_PROVIDER_TIERS.map((tv) => (
              <option key={tv} value={tv}>
                {TIER_LABELS[tv]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={isPending || tier === currentTier}
            onClick={saveTier}
            className="rounded-lg border border-brandHealth/40 bg-brandHealth-50 px-4 py-2 text-sm font-medium text-brandHealth-700 transition-colors hover:bg-brandHealth/10 disabled:opacity-50 dark:border-brandHealth/30 dark:bg-brandHealth/10 dark:text-brandHealth"
          >
            {t("common.save")}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
