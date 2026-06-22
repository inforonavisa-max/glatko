"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Mic, FileText, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { VoiceFlow } from "./VoiceFlow";
import type { ServiceCategory } from "@/types/glatko";

/**
 * G-VOICE-1 — the thin tab layer over /become-a-pro. The manual wizard is the
 * DEFAULT tab and is passed in as `manualSlot` UNCHANGED (its element is created
 * by the server page; we only render it). It stays mounted at all times (hidden
 * when the voice tab is active) so its localStorage/useState is never reset —
 * the manual flow is byte-identical to before, plus a tab bar.
 *
 * When voiceEnabled is false (flag off / dark), we render ONLY the manual slot:
 * no wrapper, no tabs — exactly today's page.
 */
export function ProOnboardingTabs({
  voiceEnabled,
  categories,
  manualSlot,
}: {
  voiceEnabled: boolean;
  categories: ServiceCategory[];
  manualSlot: ReactNode;
}) {
  const t = useTranslations("pro.voice");
  const [tab, setTab] = useState<"manual" | "voice">("manual");

  if (!voiceEnabled) return <>{manualSlot}</>;

  const tabBtn = (active: boolean) =>
    cn(
      "relative flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition",
      active
        ? "bg-white text-teal-700 shadow-sm dark:bg-white/10 dark:text-teal-300"
        : "text-gray-500 hover:text-gray-700 dark:text-white/50 dark:hover:text-white/80",
    );

  return (
    <div>
      <div
        role="tablist"
        aria-label={t("title")}
        className="mb-6 flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-white/5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "manual"}
          onClick={() => setTab("manual")}
          className={tabBtn(tab === "manual")}
        >
          <FileText className="h-4 w-4" />
          {t("tab.manual")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "voice"}
          onClick={() => setTab("voice")}
          className={tabBtn(tab === "voice")}
        >
          <Mic className="h-4 w-4" />
          {t("tab.voice")}
          <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 dark:text-teal-300">
            <Sparkles className="h-2.5 w-2.5" />
            {t("tab.easierBadge")}
          </span>
        </button>
      </div>

      {/* Manual stays mounted (hidden when inactive) → zero state loss. */}
      <div className={cn(tab !== "manual" && "hidden")}>{manualSlot}</div>
      <div className={cn(tab !== "voice" && "hidden")}>
        <VoiceFlow categories={categories} onSwitchToManual={() => setTab("manual")} />
      </div>
    </div>
  );
}
