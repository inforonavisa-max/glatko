// TODO(i18n-b4): admin panel atomic i18n migration
"use client";

import { FormSection, FormField, formInputCls } from "./ProviderFormPrimitives";
import { cn } from "@/lib/utils";

export type SubscriptionPlan =
  | "trial"
  | "monthly"
  | "quarterly"
  | "annual"
  | "lifetime";

const PLAN_OPTIONS: { value: SubscriptionPlan | ""; label: string }[] = [
  { value: "", label: "Plan Yok" },
  { value: "trial", label: "Deneme" },
  { value: "monthly", label: "Aylık" },
  { value: "quarterly", label: "3 Aylık" },
  { value: "annual", label: "Yıllık" },
  { value: "lifetime", label: "Ömür Boyu" },
];

interface Props {
  /** "" represents "Plan Yok" (no plan). */
  plan: SubscriptionPlan | "";
  onPlanChange: (value: SubscriptionPlan | "") => void;
  /** datetime-local string ("YYYY-MM-DDTHH:mm") or "". */
  startedAt: string;
  onStartedAtChange: (value: string) => void;
  endDate: string;
  onEndDateChange: (value: string) => void;
  /** When true, end date is cleared and submitted as null (open-ended). */
  unlimited: boolean;
  onUnlimitedChange: (value: boolean) => void;
}

/**
 * Subscription block for the admin pro EDIT form. Maps to the Sprint B1
 * columns subscription_plan / subscription_started_at / subscription_end_date.
 * The "Süresiz" toggle makes the open-ended intent explicit: when on, the end
 * date input is disabled and the form submits subscription_end_date = null.
 */
export function SubscriptionFields({
  plan,
  onPlanChange,
  startedAt,
  onStartedAtChange,
  endDate,
  onEndDateChange,
  unlimited,
  onUnlimitedChange,
}: Props) {
  return (
    <FormSection title="Abonelik Bilgileri">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Plan">
          <select
            value={plan}
            onChange={(e) =>
              onPlanChange(e.target.value as SubscriptionPlan | "")
            }
            className={formInputCls}
          >
            {PLAN_OPTIONS.map((opt) => (
              <option key={opt.value || "none"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label="Başlangıç Tarihi"
          hint="Boş bırakırsanız değişmez."
        >
          <input
            type="datetime-local"
            value={startedAt}
            onChange={(e) => onStartedAtChange(e.target.value)}
            className={formInputCls}
          />
        </FormField>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={unlimited}
            onChange={(e) => onUnlimitedChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500/40 dark:border-white/20"
          />
          <span className="text-xs font-medium text-gray-700 dark:text-white/70">
            Süresiz
          </span>
        </label>

        <FormField
          label="Bitiş Tarihi"
          hint={
            unlimited
              ? "Pro süresiz aktif kalır (örn. lifetime plan veya manuel uzatma)."
              : "Plan bu tarihte sona erer."
          }
        >
          <input
            type="datetime-local"
            value={unlimited ? "" : endDate}
            disabled={unlimited}
            onChange={(e) => onEndDateChange(e.target.value)}
            className={cn(formInputCls, unlimited && "opacity-60")}
          />
        </FormField>
      </div>
    </FormSection>
  );
}
