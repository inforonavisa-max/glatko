"use client";

import { useState } from "react";
import { VoiceOnboarding } from "./VoiceOnboarding";
import { OnboardingReview } from "./OnboardingReview";
import type { VoiceDraftResult } from "@/lib/pro-voice/types";
import type { ServiceCategory } from "@/types/glatko";

/**
 * G-VOICE-1 — orchestrates the two voice phases: capture → review. Holds the
 * draft in local state only; nothing here touches the manual wizard.
 */
export function VoiceFlow({
  categories,
  onSwitchToManual,
}: {
  categories: ServiceCategory[];
  onSwitchToManual: () => void;
}) {
  const [draft, setDraft] = useState<VoiceDraftResult | null>(null);

  if (draft) {
    return (
      <OnboardingReview
        draft={draft}
        categories={categories}
        onBack={() => setDraft(null)}
        onFallbackToManual={onSwitchToManual}
      />
    );
  }
  return <VoiceOnboarding onDraft={setDraft} onFallbackToManual={onSwitchToManual} />;
}
