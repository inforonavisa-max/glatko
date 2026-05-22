// TODO(i18n-b4): admin panel atomic i18n migration
"use client";

import { cn } from "@/lib/utils";
import { FormField, formInputCls } from "./ProviderFormPrimitives";

const MAX_LEN = 2000;

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Admin-only free-text note on a pro profile. Stored in
 * glatko_professional_profiles.admin_notes (Sprint B1). Not shown to the pro.
 * Sprint B2 admin-form policy: TR-hardcoded labels (see TODO above).
 */
export function AdminNotesField({ value, onChange }: Props) {
  const remaining = MAX_LEN - value.length;
  return (
    <FormField
      label="Admin Notları"
      hint="Bu notlar pro tarafından GÖRÜLMEZ. Maksimum 2000 karakter."
    >
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, MAX_LEN))}
          maxLength={MAX_LEN}
          rows={4}
          placeholder="Sadece adminlerin göreceği özel notlar..."
          className={cn(formInputCls, "resize-y")}
        />
        <span
          className={cn(
            "pointer-events-none absolute bottom-2 right-3 text-[11px] tabular-nums",
            remaining < 100
              ? "text-amber-600 dark:text-amber-400"
              : "text-gray-400 dark:text-white/30",
          )}
        >
          {value.length} / {MAX_LEN}
        </span>
      </div>
    </FormField>
  );
}
