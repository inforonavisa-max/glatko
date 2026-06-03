"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import { Loader2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { PHONE_COUNTRIES, DEFAULT_PHONE_COUNTRY } from "@/lib/phone/countries";
import {
  startPhoneLogin,
  verifyPhoneLogin,
  resendPhoneLoginOtp,
  type PhoneLoginError,
} from "@/lib/actions/phone-login";

const inputCls = cn(
  "block w-full rounded-xl border border-gray-200 dark:border-white/10",
  "bg-gray-50 dark:bg-white/5 px-4 py-3 text-sm",
  "text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30",
  "focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all",
);

const RESEND_COOLDOWN_SECONDS = 60;

type Step = "phone" | "otp";

export function PhoneLoginPanel() {
  const t = useTranslations("auth.phoneLogin");
  const locale = useLocale();
  const router = useRouter();

  const [step, setStep] = useState<Step>("phone");
  const [country, setCountry] = useState<string>(DEFAULT_PHONE_COUNTRY);
  const [phone, setPhone] = useState("");
  const [e164, setE164] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(
      () => setCooldown((s) => (s <= 1 ? 0 : s - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, [cooldown]);

  // Focus the OTP field as soon as we enter the code step.
  useEffect(() => {
    if (step === "otp") otpInputRef.current?.focus();
  }, [step]);

  function messageFor(err: PhoneLoginError): string {
    switch (err) {
      case "invalid_phone":
        return t("errInvalidPhone");
      case "rate_limited":
        return t("errRateLimited");
      case "wrong_code":
        return t("errWrongCode");
      case "send_failed":
        return t("errSendFailed");
      default:
        return t("errGeneric");
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await startPhoneLogin({ phone, region: country, locale });
      if (!res.ok) {
        setError(messageFor(res.error));
        return;
      }
      setE164(res.phone);
      setOtp("");
      setStep("otp");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setError(t("errNetwork"));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await verifyPhoneLogin({ phone: e164, token: otp });
      if (!res.ok) {
        setError(messageFor(res.error));
        return;
      }
      router.push(res.needsOnboarding ? "/onboarding" : "/");
      router.refresh();
    } catch {
      setError(t("errNetwork"));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || loading) return;
    setError("");
    setLoading(true);
    try {
      const res = await resendPhoneLoginOtp(e164);
      if (!res.ok) {
        setError(messageFor(res.error));
        return;
      }
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setError(t("errNetwork"));
    } finally {
      setLoading(false);
    }
  }

  function handleChangeNumber() {
    setStep("phone");
    setOtp("");
    setError("");
    setCooldown(0);
  }

  const selected =
    PHONE_COUNTRIES.find((c) => c.iso === country) ?? PHONE_COUNTRIES[0];

  if (step === "otp") {
    return (
      <form onSubmit={handleVerify} className="space-y-5" noValidate>
        <div>
          <label
            htmlFor="otp-code"
            className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-400"
          >
            {t("otpLabel")}
          </label>
          <p className="mb-2 text-xs text-gray-500 dark:text-neutral-400">
            {t("otpHint", { phone: e164 })}
          </p>
          <input
            id="otp-code"
            ref={otpInputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d*"
            maxLength={6}
            value={otp}
            onChange={(e) =>
              setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            required
            placeholder={t("otpPlaceholder")}
            className={cn(inputCls, "text-center text-lg tracking-[0.5em]")}
          />
        </div>

        {error && <ErrorNote message={error} />}

        <SubmitButton
          loading={loading}
          label={t("verify")}
          disabled={otp.length < 4}
        />

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={handleChangeNumber}
            className="font-medium text-gray-500 transition-colors hover:text-gray-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            {t("changeNumber")}
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || loading}
            className="font-medium text-teal-600 transition-colors hover:text-teal-500 disabled:cursor-not-allowed disabled:text-gray-300 dark:text-teal-400 dark:disabled:text-neutral-600"
          >
            {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resend")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSend} className="space-y-5" noValidate>
      <div>
        <label
          htmlFor="phone-number"
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-400"
        >
          {t("phoneLabel")}
        </label>
        <div className="flex gap-2">
          <label htmlFor="phone-country" className="sr-only">
            {t("countryLabel")}
          </label>
          <select
            id="phone-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-label={t("countryLabel")}
            className={cn(inputCls, "w-28 shrink-0 px-2")}
          >
            {PHONE_COUNTRIES.map((c) => (
              <option key={c.iso} value={c.iso}>
                {c.flag} +{c.dial}
              </option>
            ))}
          </select>
          <input
            id="phone-number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            placeholder={t("phonePlaceholder")}
            className={inputCls}
          />
        </div>
        <p className="mt-1.5 text-xs text-gray-400 dark:text-white/30">
          {selected.flag} +{selected.dial}
        </p>
      </div>

      {error && <ErrorNote message={error} />}

      <SubmitButton loading={loading} label={t("sendCode")} />
    </form>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <motion.p
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
    >
      {message}
    </motion.p>
  );
}

function SubmitButton({
  loading,
  label,
  disabled,
}: {
  loading: boolean;
  label: string;
  disabled?: boolean;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      type="submit"
      disabled={loading || disabled}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : label}
    </motion.button>
  );
}
