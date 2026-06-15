"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

const SPECIALTY_KEYS = [
  "dentist",
  "gp",
  "psychologist",
  "physio",
  "other",
] as const;

type FormStatus = "idle" | "submitting" | "success" | "error" | "invalid";

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-white/10 dark:bg-white/5 dark:text-white";

export function HealthWaitlistForm({ locale }: { locale: Locale }) {
  const t = useTranslations("healthVertical");
  const [status, setStatus] = useState<FormStatus>("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      fullName: String(data.get("fullName") ?? "").trim(),
      specialty: String(data.get("specialty") ?? ""),
      city: String(data.get("city") ?? "").trim(),
      phone: String(data.get("phone") ?? "").trim(),
      email: String(data.get("email") ?? "").trim(),
      locale,
    };

    if (!payload.fullName || !payload.specialty || !payload.city || !payload.phone) {
      setStatus("invalid");
      return;
    }

    setStatus("submitting");
    try {
      const res = await fetch("/api/health/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setStatus(res.status === 400 ? "invalid" : "error");
        return;
      }
      setStatus("success");
      form.reset();
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="mt-6 flex items-center gap-3 rounded-xl bg-brandHealth-50 p-4 text-sm text-brandHealth-700 dark:bg-brandHealth/10 dark:text-brandHealth">
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        {t("waitlist.success")}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
            {t("waitlist.name")} *
          </span>
          <input name="fullName" type="text" required maxLength={120} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
            {t("waitlist.specialty")} *
          </span>
          <select name="specialty" required defaultValue="" className={inputClass}>
            <option value="" disabled />
            {SPECIALTY_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(`specialties.${key}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
            {t("waitlist.city")} *
          </span>
          <input name="city" type="text" required maxLength={80} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
            {t("waitlist.phone")} *
          </span>
          <input
            name="phone"
            type="tel"
            required
            maxLength={24}
            placeholder="+382 6x xxx xxx"
            className={inputClass}
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
          {t("waitlist.email")}
        </span>
        <input name="email" type="email" maxLength={160} className={inputClass} />
      </label>

      {(status === "error" || status === "invalid") && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {status === "invalid" ? t("waitlist.errorValidation") : t("waitlist.errorGeneric")}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40",
          status === "submitting" && "cursor-not-allowed opacity-70",
        )}
      >
        {status === "submitting" && <Loader2 className="h-4 w-4 animate-spin" />}
        {status === "submitting" ? t("waitlist.submitting") : t("waitlist.submit")}
      </button>

      {/* Disclosure line — real PII is collected once migration 065 is live;
          links to the localized privacy policy (next-intl resolves the slug). */}
      <p className="text-xs text-gray-400 dark:text-white/30">
        {t("waitlist.privacyNote")}{" "}
        <Link
          href="/privacy"
          className="underline transition-colors hover:text-gray-600 dark:hover:text-white/50"
        >
          {t("waitlist.privacyLinkText")}
        </Link>
      </p>
    </form>
  );
}
