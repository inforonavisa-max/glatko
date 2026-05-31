"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  categoriesToConsentMode,
  fbqConsentFromCategories,
  readConsent,
  writeConsent,
  type ConsentCategories,
} from "@/lib/analytics/consent";

/**
 * Apply a consent choice at runtime: push a Consent Mode v2 update to the GTM
 * dataLayer via the gtag() IArguments wrapper (NOT a raw array push — GA4/GTM
 * only processes the arguments-typed command form; mirrors gtm-consent-default
 * and the G-ADS-2.1 mount-restore in app/layout.tsx), then mirror to the Meta
 * Pixel. Safe before GTM/fbq load (dataLayer replays; fbq no-op when undefined).
 */
function applyConsent(c: ConsentCategories): void {
  if (typeof window === "undefined") return;
  const dataLayer = (window.dataLayer = window.dataLayer || []);
  const gtag = function gtag(this: void): void {
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  } as (...args: unknown[]) => void;
  gtag("consent", "update", categoriesToConsentMode(c));

  if (typeof window.fbq === "function") {
    window.fbq("consent", fbqConsentFromCategories(c));
  }
}

function ToggleSwitch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-900",
        checked ? "bg-teal-500" : "bg-gray-300 dark:bg-white/15",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function CategoryRow({
  label,
  description,
  checked,
  locked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  locked?: boolean;
  onChange?: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">
          {label}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-white/50">
          {description}
        </p>
      </div>
      <ToggleSwitch
        checked={checked}
        disabled={locked}
        onChange={onChange}
        label={label}
      />
    </div>
  );
}

const rejectBtn =
  "rounded-xl border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/5";
const acceptBtn =
  "rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40";

export function CookieConsent() {
  const t = useTranslations();
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    // Returning-visitor consent is restored SYNCHRONOUSLY by the inline
    // beforeInteractive script in app/layout.tsx (before hydration / GTM init —
    // G-ADS-2.1). This effect only drives banner visibility + toggle pre-fill.
    const existing = readConsent();
    if (existing) {
      setAnalytics(existing.analytics);
      setMarketing(existing.marketing);
    } else {
      setVisible(true);
    }

    // Footer "Cookie settings" re-opens the preferences with current choices.
    function openPreferences() {
      const current = readConsent();
      setAnalytics(current?.analytics ?? false);
      setMarketing(current?.marketing ?? false);
      setExpanded(true);
      setVisible(true);
    }
    window.addEventListener("open-cookie-preferences", openPreferences);
    return () =>
      window.removeEventListener("open-cookie-preferences", openPreferences);
  }, []);

  function commit(cats: ConsentCategories) {
    applyConsent(cats);
    writeConsent(cats);
    setAnalytics(cats.analytics);
    setMarketing(cats.marketing);
    setVisible(false);
    setExpanded(false);
  }

  const acceptAll = () =>
    commit({ necessary: true, analytics: true, marketing: true });
  const rejectAll = () =>
    commit({ necessary: true, analytics: false, marketing: false });
  const savePreferences = () =>
    commit({ necessary: true, analytics, marketing });

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-[200] p-4 sm:p-6"
          role="dialog"
          aria-modal="false"
          aria-label={t("cookie.preferencesTitle")}
        >
          <div className="mx-auto max-h-[80vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-gray-200/60 bg-white/95 p-5 shadow-xl backdrop-blur-sm dark:border-white/[0.08] dark:bg-neutral-900/95 sm:p-6">
            {!expanded ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-center text-sm leading-relaxed text-gray-600 dark:text-white/60 sm:text-left">
                  {t("cookie.message")}{" "}
                  <Link
                    href="/cookies"
                    className="font-medium text-teal-600 hover:underline dark:text-teal-400"
                  >
                    {t("cookie.learnMore")}
                  </Link>
                </p>
                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <button
                    onClick={() => setExpanded(true)}
                    className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 underline-offset-4 transition-colors hover:text-teal-600 hover:underline dark:text-white/60 dark:hover:text-teal-400"
                  >
                    {t("cookie.customize")}
                  </button>
                  <button onClick={rejectAll} className={rejectBtn}>
                    {t("cookie.rejectAll")}
                  </button>
                  <button onClick={acceptAll} className={acceptBtn}>
                    {t("cookie.acceptAll")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                    {t("cookie.preferencesTitle")}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-white/50">
                    {t("cookie.preferencesIntro")}
                  </p>
                </div>

                <div className="divide-y divide-gray-200/70 dark:divide-white/[0.06]">
                  <CategoryRow
                    label={t("cookie.categories.necessary.label")}
                    description={t("cookie.categories.necessary.description")}
                    checked
                    locked
                  />
                  <CategoryRow
                    label={t("cookie.categories.analytics.label")}
                    description={t("cookie.categories.analytics.description")}
                    checked={analytics}
                    onChange={setAnalytics}
                  />
                  <CategoryRow
                    label={t("cookie.categories.marketing.label")}
                    description={t("cookie.categories.marketing.description")}
                    checked={marketing}
                    onChange={setMarketing}
                  />
                </div>

                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <Link
                    href="/cookies"
                    className="text-center text-xs font-medium text-teal-600 hover:underline dark:text-teal-400 sm:text-left"
                  >
                    {t("cookie.learnMore")}
                  </Link>
                  <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <button onClick={rejectAll} className={rejectBtn}>
                      {t("cookie.rejectAll")}
                    </button>
                    <button onClick={savePreferences} className={acceptBtn}>
                      {t("cookie.savePreferences")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
