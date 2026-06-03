"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Loader2, User, Briefcase, Check } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { localeNames, locales, type Locale } from "@/i18n/routing";
import { GLATKO_CITIES } from "@/lib/glatko/cities";
import { completeOnboarding } from "@/lib/actions/onboarding";

const inputCls = cn(
  "block w-full rounded-xl border border-gray-200 dark:border-white/10",
  "bg-gray-50 dark:bg-white/5 px-4 py-3 text-sm",
  "text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30",
  "focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all",
);

type Role = "customer" | "pro";

export function OnboardingForm({
  currentLocale,
}: {
  currentLocale: string;
}) {
  const t = useTranslations("auth.onboarding");
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("customer");
  const [city, setCity] = useState("");
  const [locale, setLocale] = useState<string>(
    locales.includes(currentLocale as Locale) ? currentLocale : "tr",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!fullName.trim()) {
      setError(t("errNameRequired"));
      return;
    }
    if (!city) {
      setError(t("errCityRequired"));
      return;
    }
    setLoading(true);
    try {
      const res = await completeOnboarding({
        full_name: fullName,
        role,
        city,
        locale,
      });
      if (!res.ok) {
        setError(t("errGeneric"));
        return;
      }
      router.push(res.redirectTo, { locale: res.locale as Locale });
      router.refresh();
    } catch {
      setError(t("errGeneric"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div>
        <label
          htmlFor="ob-name"
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-400"
        >
          {t("displayNameLabel")}
        </label>
        <input
          id="ob-name"
          type="text"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          maxLength={60}
          placeholder={t("displayNamePlaceholder")}
          className={inputCls}
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-400">
          {t("roleLabel")}
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <RoleCard
            active={role === "customer"}
            onClick={() => setRole("customer")}
            icon={<User className="h-5 w-5" />}
            title={t("roleCustomer")}
            desc={t("roleCustomerDesc")}
          />
          <RoleCard
            active={role === "pro"}
            onClick={() => setRole("pro")}
            icon={<Briefcase className="h-5 w-5" />}
            title={t("rolePro")}
            desc={t("roleProDesc")}
          />
        </div>
      </fieldset>

      <div>
        <label
          htmlFor="ob-city"
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-400"
        >
          {t("cityLabel")}
        </label>
        <select
          id="ob-city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          required
          className={inputCls}
        >
          <option value="" disabled>
            {t("cityPlaceholder")}
          </option>
          {GLATKO_CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="ob-lang"
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-400"
        >
          {t("languageLabel")}
        </label>
        <select
          id="ob-lang"
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
          className={inputCls}
        >
          {locales.map((code) => (
            <option key={code} value={code}>
              {localeNames[code]}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
        >
          {error}
        </motion.p>
      )}

      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("continue")}
      </motion.button>

      {role === "pro" && (
        <p className="text-center text-xs text-gray-400 dark:text-white/30">
          {t("proRedirectHint")}
        </p>
      )}
    </form>
  );
}

function RoleCard({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all",
        active
          ? "border-teal-500 bg-teal-50/60 ring-2 ring-teal-500/20 dark:border-teal-400 dark:bg-teal-500/10"
          : "border-gray-200 bg-gray-50 hover:border-gray-300 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20",
      )}
    >
      {active && (
        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-teal-500 text-white">
          <Check className="h-3 w-3" />
        </span>
      )}
      <span className="text-teal-600 dark:text-teal-400">{icon}</span>
      <span className="text-sm font-semibold text-gray-900 dark:text-white">
        {title}
      </span>
      <span className="text-xs text-gray-500 dark:text-neutral-400">{desc}</span>
    </button>
  );
}
