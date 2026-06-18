"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

type Audience = "employer" | "worker";
type FormStatus = "idle" | "submitting" | "success" | "error" | "invalid";

// Option-label maps live under careerVertical.* (mirror healthVertical.specialties).
// Employer "sector of need" reuses the seeded sector list (migration 078) conceptually.
const SECTOR_KEYS = ["construction", "hospitality", "other"] as const;
// Worker trade / role.
const TRADE_KEYS = ["construction", "hospitality", "other"] as const;
// Optional years-of-experience bands.
const EXPERIENCE_KEYS = ["junior", "mid", "senior"] as const;
// Source region — region, never exact country (anonymization rule R-anon).
const REGION_KEYS = [
  "farEast",
  "middleEast",
  "africa",
  "europe",
  "montenegro",
] as const;

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brandCareer focus:outline-none focus:ring-2 focus:ring-brandCareer/20 dark:border-white/10 dark:bg-white/5 dark:text-white";

export function CareerWaitlistForm({ locale }: { locale: Locale }) {
  const t = useTranslations("careerVertical");
  const [audience, setAudience] = useState<Audience>("employer");
  const [status, setStatus] = useState<FormStatus>("idle");

  // Switching audience swaps the field set and resets validation to idle so a
  // stale invalid/error from the previous audience doesn't persist (edge case).
  function selectAudience(next: Audience) {
    if (next === audience) return;
    setAudience(next);
    setStatus("idle");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    const name = String(data.get("name") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();

    // Audience-specific fields.
    const company = String(data.get("company") ?? "").trim();
    const sector = String(data.get("sector") ?? "");
    const headcount = String(data.get("headcount") ?? "").trim();
    const city = String(data.get("city") ?? "").trim();
    const trade = String(data.get("trade") ?? "");
    const experience = String(data.get("experience") ?? "");
    const region = String(data.get("region") ?? "");

    const payload =
      audience === "employer"
        ? { audience, name, phone, email, locale, company, sector, headcount, city }
        : { audience, name, phone, email, locale, trade, experience, region };

    // Pre-fetch guard: validate the ACTIVE audience's required set (mirror health).
    const requiredOk =
      name &&
      phone &&
      (audience === "employer" ? company && sector : trade);
    if (!requiredOk) {
      setStatus("invalid");
      return;
    }

    setStatus("submitting");
    try {
      const res = await fetch("/api/career/waitlist", {
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
      <div className="mt-6 flex items-center gap-3 rounded-xl bg-brandCareer-50 p-4 text-sm text-brandCareer-700 dark:bg-brandCareer/10 dark:text-brandCareer">
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        {t("waitlist.success")}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
      {/* Audience toggle — segmented control. Default = employer (demand-side seeding). */}
      <input type="hidden" name="audience" value={audience} />
      <div
        role="radiogroup"
        aria-label={t("waitlist.audienceEmployer") + " / " + t("waitlist.audienceWorker")}
        className="grid grid-cols-2 gap-2"
      >
        {(["employer", "worker"] as const).map((value) => {
          const active = audience === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => selectAudience(value)}
              className={cn(
                "rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-brandCareer bg-brandCareer-50 text-brandCareer-700 dark:border-brandCareer dark:bg-brandCareer/15 dark:text-brandCareer"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10",
              )}
            >
              {value === "employer"
                ? t("waitlist.audienceEmployer")
                : t("waitlist.audienceWorker")}
            </button>
          );
        })}
      </div>

      {/* Shared fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
            {t("waitlist.name")} *
          </span>
          <input name="name" type="text" required maxLength={120} className={inputClass} />
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

      {/* Employer field set */}
      {audience === "employer" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
              {t("waitlist.company")} *
            </span>
            <input name="company" type="text" required maxLength={120} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
              {t("waitlist.sector")} *
            </span>
            <select name="sector" required defaultValue="" className={inputClass}>
              <option value="" disabled />
              {SECTOR_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`trades.${key}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
              {t("waitlist.headcount")}
            </span>
            <input name="headcount" type="text" inputMode="numeric" maxLength={8} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
              {t("waitlist.city")}
            </span>
            <input name="city" type="text" maxLength={80} className={inputClass} />
          </label>
        </div>
      )}

      {/* Worker field set — never any fee/price/payment field (R7) */}
      {audience === "worker" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
              {t("waitlist.trade")} *
            </span>
            <select name="trade" required defaultValue="" className={inputClass}>
              <option value="" disabled />
              {TRADE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`trades.${key}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
              {t("waitlist.experience")}
            </span>
            <select name="experience" defaultValue="" className={inputClass}>
              <option value="" disabled />
              {EXPERIENCE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`experienceBands.${key}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
              {t("waitlist.region")}
            </span>
            <select name="region" defaultValue="" className={inputClass}>
              <option value="" disabled />
              {REGION_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`regions.${key}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* Email — optional, shared */}
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
          "flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brandCareer to-brandCareer-700 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brandCareer/25 transition-all hover:shadow-brandCareer/40",
          status === "submitting" && "cursor-not-allowed opacity-70",
        )}
      >
        {status === "submitting" && <Loader2 className="h-4 w-4 animate-spin" />}
        {status === "submitting" ? t("waitlist.submitting") : t("waitlist.submit")}
      </button>

      {/* Disclosure line — real PII (name/phone/email) is collected via the
          career.waitlist SECURITY DEFINER RPC; links to the localized privacy
          policy (next-intl resolves the slug). */}
      <p className="text-xs text-gray-400 dark:text-white/30">
        {t("waitlist.privacyNote")}{" "}
        <Link
          href="/privacy"
          className="underline transition-colors hover:text-brandCareer-700 dark:hover:text-brandCareer"
        >
          {t("waitlist.privacyLinkText")}
        </Link>
      </p>
    </form>
  );
}
