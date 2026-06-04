"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Key, LogOut, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PasswordChangeModal } from "./PasswordChangeModal";
import { SetPasswordModal } from "./SetPasswordModal";
import { PhoneVerification } from "./PhoneVerification";
import { EmailAddCard } from "./EmailAddCard";
import { signOutEverywhere } from "@/lib/actions/profile";

const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  apple: "Apple",
  facebook: "Facebook",
  github: "GitHub",
};

type Props = {
  email: string;
  hasEmail: boolean;
  hasPassword: boolean;
  oauthProviders: string[];
  phone: string | null;
  phoneVerified: boolean;
};

export function SecuritySection({
  email,
  hasEmail,
  hasPassword,
  oauthProviders,
  phone,
  phoneVerified,
}: Props) {
  const t = useTranslations("settings.security");
  const router = useRouter();
  const [changePwdOpen, setChangePwdOpen] = useState(false);
  const [setPwdOpen, setSetPwdOpen] = useState(false);
  const [signOutPending, startSignOut] = useTransition();

  function handleSignOutEverywhere() {
    if (typeof window !== "undefined" && !window.confirm(t("signOut.confirm"))) {
      return;
    }
    startSignOut(async () => {
      const res = await signOutEverywhere();
      if ("error" in res && res.error) {
        toast.error(t("signOut.error"));
        return;
      }
      toast.success(t("signOut.success"));
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 pt-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="font-serif text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-white/60">
          {t("subtitle")}
        </p>
      </header>

      <div className="space-y-6">
        {hasEmail ? (
        <section className="rounded-2xl border border-gray-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-teal-50 p-2.5 dark:bg-teal-500/10">
              <Key className="h-5 w-5 text-teal-600 dark:text-teal-400" aria-hidden />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {t("password.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-white/60">
                {hasPassword ? t("password.hasPassword") : t("password.noPassword")}
              </p>
              <div className="mt-4">
                {hasPassword ? (
                  <Button onClick={() => setChangePwdOpen(true)} variant="outline">
                    {t("password.change")}
                  </Button>
                ) : (
                  <Button
                    onClick={() => setSetPwdOpen(true)}
                    className="bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-lg shadow-teal-500/25 hover:from-teal-600 hover:to-teal-700"
                  >
                    {t("password.set")}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>
        ) : (
          <EmailAddCard />
        )}

        <PhoneVerification
          initialPhone={phone}
          initialVerified={phoneVerified}
        />

        {oauthProviders.length > 0 && (
          <section className="rounded-2xl border border-gray-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-emerald-50 p-2.5 dark:bg-emerald-500/10">
                <CheckCircle2
                  className="h-5 w-5 text-emerald-600 dark:text-emerald-400"
                  aria-hidden
                />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  {t("providers.title")}
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-white/60">
                  {t("providers.description")}
                </p>
                <ul className="mt-4 space-y-2">
                  {oauthProviders.map((p) => (
                    <li
                      key={p}
                      className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/5"
                    >
                      <span className="font-medium text-gray-900 dark:text-white">
                        {PROVIDER_LABEL[p] ?? p}
                      </span>
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        {t("providers.linked")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-gray-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-rose-50 p-2.5 dark:bg-rose-500/10">
              <LogOut className="h-5 w-5 text-rose-600 dark:text-rose-400" aria-hidden />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {t("signOut.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-white/60">
                {t("signOut.description")}
              </p>
              <div className="mt-4">
                <Button
                  onClick={handleSignOutEverywhere}
                  disabled={signOutPending}
                  variant="outline"
                  className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
                >
                  {signOutPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    t("signOut.cta")
                  )}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <PasswordChangeModal open={changePwdOpen} onOpenChange={setChangePwdOpen} />
      <SetPasswordModal
        open={setPwdOpen}
        onOpenChange={setSetPwdOpen}
        email={email}
      />
    </div>
  );
}
