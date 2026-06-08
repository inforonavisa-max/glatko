"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Loader2, User, Briefcase, Check } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { localeNames, locales, type Locale } from "@/i18n/routing";
import { GLATKO_CITIES, OTHER_CITY_VALUE } from "@/lib/glatko/cities";
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
  const tCities = useTranslations("cities");
  const tOptIn = useTranslations("messagingOptIn");
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("customer");
  const [citySelect, setCitySelect] = useState("");
  const [cityOther, setCityOther] = useState("");
  const [locale, setLocale] = useState<string>(
    locales.includes(currentLocale as Locale) ? currentLocale : "tr",
  );
  const [channel, setChannel] = useState<"whatsapp" | "viber" | "">("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const city =
      citySelect === OTHER_CITY_VALUE ? cityOther.trim() : citySelect;
    if (!fullName.trim()) {
      setError(t("errNameRequired"));
      return;
    }
    if (!city) {
      setError(t("errCityRequired"));
      return;
    }
    const wantsMessaging = channel === "whatsapp" || channel === "viber";
    if (wantsMessaging && !consent) {
      // The submit button is disabled in this state; guard is defense-in-depth.
      return;
    }
    setLoading(true);
    try {
      const res = await completeOnboarding({
        full_name: fullName,
        role,
        city,
        locale,
        notification_channel: channel || undefined,
        messaging_opt_in: wantsMessaging && consent,
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
          value={citySelect}
          onChange={(e) => setCitySelect(e.target.value)}
          required
          className={inputCls}
        >
          <option value="" disabled>
            {t("cityPlaceholder")}
          </option>
          {GLATKO_CITIES.map((c) => (
            <option key={c.key} value={c.name}>
              {tCities(c.key as never)}
            </option>
          ))}
          <option value={OTHER_CITY_VALUE}>{tCities("other" as never)}</option>
        </select>
        {citySelect === OTHER_CITY_VALUE && (
          <input
            type="text"
            value={cityOther}
            onChange={(e) => setCityOther(e.target.value)}
            required
            maxLength={80}
            placeholder={tCities("other" as never)}
            aria-label={tCities("other" as never)}
            className={cn(inputCls, "mt-2")}
          />
        )}
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

      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-400">
          {t("channelLabel")}
        </legend>
        <p className="mb-2 text-xs text-gray-400 dark:text-white/30">
          {t("channelDesc")}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {(["whatsapp", "viber"] as const).map((c) => {
            const active = channel === c;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setChannel((prev) => (prev === c ? "" : c));
                  setConsent(false);
                }}
                className={cn(
                  "rounded-xl border px-4 py-3 text-sm font-medium transition-all",
                  active
                    ? "border-teal-500 bg-teal-50/60 text-teal-700 ring-2 ring-teal-500/20 dark:border-teal-400 dark:bg-teal-500/10 dark:text-teal-300"
                    : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:border-white/20",
                )}
              >
                {c === "whatsapp" ? "WhatsApp" : "Viber"}
              </button>
            );
          })}
        </div>
      </fieldset>

      {(channel === "whatsapp" || channel === "viber") && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-teal-200/70 bg-teal-50/50 px-4 py-3 dark:border-teal-500/20 dark:bg-teal-500/10"
        >
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="text-sm text-gray-700 dark:text-white/80">
              {tOptIn("consentMain", {
                channel: channel === "whatsapp" ? "WhatsApp" : "Viber",
              })}
            </span>
          </label>
          <p className="mt-2 ps-7 text-xs text-gray-400 dark:text-white/40">
            {tOptIn("legalNote")}
          </p>
        </motion.div>
      )}

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
        disabled={
          loading ||
          ((channel === "whatsapp" || channel === "viber") && !consent)
        }
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
