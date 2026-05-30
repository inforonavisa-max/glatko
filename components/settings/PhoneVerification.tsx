"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Smartphone, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  startPhoneVerification,
  confirmPhoneOtp,
  resendPhoneOtp,
  type PhoneActionError,
} from "@/lib/actions/phone";

const RESEND_COOLDOWN_SECONDS = 60;
const OTP_LENGTH = 6;

const inputCls = cn(
  "block w-full rounded-xl border border-gray-200 dark:border-white/10",
  "bg-white px-4 py-3 text-sm dark:bg-white/5",
  "text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30",
  "focus:border-teal-500 focus:ring-2 focus:ring-teal-500/50 focus:outline-none",
);

type Props = {
  initialPhone: string | null;
  initialVerified: boolean;
};

type Step = "enter_phone" | "enter_code" | "verified";

export function PhoneVerification({ initialPhone, initialVerified }: Props) {
  const t = useTranslations("phoneVerify");
  const router = useRouter();

  const [step, setStep] = useState<Step>(
    initialVerified ? "verified" : "enter_phone",
  );
  const [phoneInput, setPhoneInput] = useState(initialPhone ?? "");
  const [verifiedPhone, setVerifiedPhone] = useState(initialPhone ?? "");
  // Normalized E.164 the OTP was actually sent to (from the server action).
  const [pendingPhone, setPendingPhone] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(
      () => setCooldown((c) => (c <= 1 ? 0 : c - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, [cooldown]);

  const errorMessage = useCallback(
    (error: PhoneActionError): string => {
      switch (error) {
        case "invalid_phone":
          return t("errorInvalidPhone");
        case "rate_limited":
          return t("errorRateLimited");
        case "phone_in_use":
          return t("errorPhoneInUse");
        case "wrong_code":
          return t("errorWrongCode");
        default:
          return t("errorGeneric");
      }
    },
    [t],
  );

  function handleSend() {
    const value = phoneInput.trim();
    if (!value || pending) return;
    startTransition(async () => {
      const res = await startPhoneVerification(value);
      if (!res.ok) {
        toast.error(errorMessage(res.error));
        return;
      }
      setPendingPhone(res.phone);
      setCode("");
      setStep("enter_code");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      toast.success(t("codeSentToast"));
    });
  }

  function handleVerify() {
    if (pending || code.length < OTP_LENGTH) return;
    startTransition(async () => {
      const res = await confirmPhoneOtp(pendingPhone, code);
      if (!res.ok) {
        toast.error(errorMessage(res.error));
        return;
      }
      setVerifiedPhone(pendingPhone);
      setStep("verified");
      toast.success(t("verifiedToast"));
      router.refresh();
    });
  }

  function handleResend() {
    if (pending || cooldown > 0) return;
    startTransition(async () => {
      const res = await resendPhoneOtp(pendingPhone);
      if (!res.ok) {
        toast.error(errorMessage(res.error));
        return;
      }
      setPendingPhone(res.phone);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      toast.success(t("codeSentToast"));
    });
  }

  return (
    <section className="rounded-2xl border border-gray-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-teal-50 p-2.5 dark:bg-teal-500/10">
          <Smartphone
            className="h-5 w-5 text-teal-600 dark:text-teal-400"
            aria-hidden
          />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-white/60">
            {t("description")}
          </p>

          {step === "verified" ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
              <CheckCircle2
                className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden
              />
              <span className="font-medium text-gray-900 dark:text-white">
                {verifiedPhone}
              </span>
              <span className="rounded-full bg-emerald-600/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400">
                {t("verifiedBadge")}
              </span>
              <span className="sr-only">{t("verified")}</span>
            </div>
          ) : step === "enter_phone" ? (
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-white/50">
                  {t("phoneLabel")}
                </span>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  className={inputCls}
                  placeholder={t("phonePlaceholder")}
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  disabled={pending}
                />
              </label>
              <Button
                type="button"
                onClick={handleSend}
                disabled={pending || !phoneInput.trim()}
                className="bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-lg shadow-teal-500/25 hover:from-teal-600 hover:to-teal-700"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  t("sendCode")
                )}
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-white/50">
                  {t("codeLabel", { phone: pendingPhone })}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={OTP_LENGTH}
                  className={cn(inputCls, "tracking-[0.5em]")}
                  placeholder={"•".repeat(OTP_LENGTH)}
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))
                  }
                  disabled={pending}
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={handleVerify}
                  disabled={pending || code.length < OTP_LENGTH}
                  className="bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-lg shadow-teal-500/25 hover:from-teal-600 hover:to-teal-700"
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    t("verify")
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResend}
                  disabled={pending || cooldown > 0}
                >
                  {cooldown > 0
                    ? t("resendIn", { seconds: cooldown })
                    : t("resend")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
