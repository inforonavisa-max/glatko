"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Mail, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addEmail, type AddEmailError } from "@/lib/actions/email";

const inputCls = cn(
  "block w-full rounded-xl border border-gray-200 dark:border-white/10",
  "bg-white px-4 py-3 text-sm dark:bg-white/5",
  "text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30",
  "focus:border-teal-500 focus:ring-2 focus:ring-teal-500/50 focus:outline-none",
);

type Step = "enter" | "sent";

/**
 * Shown on /settings/security ONLY for accounts without an email (phone-only).
 * Lets the user add an email → confirmation mail → password = backup login.
 * Email/Google users never see this (gated by hasEmail in SecuritySection).
 */
export function EmailAddCard() {
  const t = useTranslations("auth.addEmail");
  const [step, setStep] = useState<Step>("enter");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function messageFor(err: AddEmailError): string {
    switch (err) {
      case "invalid_email":
        return t("errInvalidEmail");
      case "email_in_use":
        return t("errInUse");
      case "rate_limited":
        return t("errRateLimited");
      case "already_has_email":
        return t("errAlreadyHasEmail");
      default:
        return t("errGeneric");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      try {
        const res = await addEmail(email);
        if (!res.ok) {
          setError(messageFor(res.error));
          return;
        }
        setSentTo(res.email);
        setStep("sent");
        toast.success(t("sentToast"));
      } catch {
        setError(t("errNetwork"));
      }
    });
  }

  function handleChangeEmail() {
    setStep("enter");
    setError("");
  }

  return (
    <section className="rounded-2xl border border-gray-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-teal-50 p-2.5 dark:bg-teal-500/10">
          <Mail className="h-5 w-5 text-teal-600 dark:text-teal-400" aria-hidden />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-white/60">
            {t("description")}
          </p>

          {step === "sent" ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                <CheckCircle2
                  className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden
                />
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {t("sentDescription", { email: sentTo })}
                </p>
              </div>
              <button
                type="button"
                onClick={handleChangeEmail}
                className="text-sm font-medium text-teal-600 transition-colors hover:text-teal-500 dark:text-teal-400"
              >
                {t("changeEmail")}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-3" noValidate>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-white/50">
                  {t("emailLabel")}
                </span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className={inputCls}
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={pending}
                  required
                />
              </label>

              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={pending || !email.trim()}
                className="bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-lg shadow-teal-500/25 hover:from-teal-600 hover:to-teal-700"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  t("addButton")
                )}
              </Button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
