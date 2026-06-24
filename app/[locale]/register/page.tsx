"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Loader2, CheckCircle2 } from "lucide-react";
import { createClient } from "@/supabase/browser";
import { AuthBrandPanel } from "@/components/glatko/auth/AuthBrandPanel";
import { cn } from "@/lib/utils";
import { trackEventWithMeta } from "@/lib/analytics/track";
import { readPostLoginRedirect } from "@/lib/auth/redirect";

const inputCls = cn(
  "block w-full rounded-xl border border-gray-200 dark:border-white/10",
  "bg-gray-50 dark:bg-white/5 px-4 py-3 text-sm",
  "text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30",
  "focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
);

export default function RegisterPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleRegister() {
    setError(null);
    if (!fullName.trim() || !email.trim() || !password.trim() || !passwordConfirm.trim()) {
      setError(t("auth.allFieldsRequired"));
      return;
    }
    if (password.length < 8) { setError(t("auth.passwordTooShort")); return; }
    if (password !== passwordConfirm) { setError(t("auth.passwordMismatch")); return; }
    setLoading(true);
    try {
      const supabase = createClient();
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      // Honor ?redirect= so a cold pro who registers (rather than logs in) is
      // returned to the wizard after email confirmation. Locale-prefixed to
      // mirror login's OAuth handler; falls back to "/" when absent.
      const redirect = readPostLoginRedirect();
      const nextPath = redirect ? `/${locale}${redirect}` : "/";
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${baseUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });
      if (authError) throw authError;
      if (data.user) {
        await supabase.from("profiles").upsert({ id: data.user.id, full_name: fullName });
        // G-ADS-3: customer signup conversion event (fired only on success path,
        // after profile upsert; safe-fail if gtag unavailable).
        trackEventWithMeta("customer_signup", {
          customer_user_id: data.user.id,
          signup_method: "email",
        });
      }
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally { setLoading(false); }
  }

  if (success) {
    return (
      <div className="grid min-h-screen w-full grid-cols-1 md:grid-cols-2">
        <AuthBrandPanel />
        <div className="flex items-center justify-center bg-white px-4 py-12 dark:bg-neutral-950">
          <div className="mx-auto w-full max-w-md text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" strokeWidth={1.5} />
            </div>
            <h2 className="font-serif text-2xl font-semibold text-gray-900 dark:text-white">{t("auth.verifyEmail")}</h2>
            <p className="mt-3 text-sm text-gray-500 dark:text-white/50">
              <strong className="text-gray-700 dark:text-white/80">{email}</strong> {t("auth.verifyEmailDesc")}
            </p>
            <Link href="/login" className="mt-8 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40">
              {t("auth.goToLogin")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen w-full grid-cols-1 md:grid-cols-2">
      <AuthBrandPanel />

      <div className="flex items-center justify-center bg-white px-4 py-12 dark:bg-neutral-950 sm:px-6 lg:px-20 xl:px-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.4, 0.25, 1] }}
          className="mx-auto w-full max-w-md"
        >
          <div className="md:hidden mb-8 flex items-center gap-1">
            <span className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Glatko</span>
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-teal-500" />
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {t("auth.register")}
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">
            {t("auth.freeAccount")}
          </p>

          <div className="mt-8 space-y-5">
            {error && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </motion.div>
            )}

            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-400">
                {t("auth.fullName")}
              </label>
              <input id="name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t("auth.fullName")} className={inputCls} />
            </div>

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-400">
                {t("auth.email")}
              </label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className={inputCls} />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-400">
                {t("auth.password")}
              </label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={inputCls} />
            </div>

            <div>
              <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-400">
                {t("auth.confirmPassword")}
              </label>
              <input id="confirm" type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleRegister()} placeholder="••••••••" className={inputCls} />
            </div>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={handleRegister}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.createAccount")}
            </motion.button>

            <p className="text-center text-sm text-gray-500 dark:text-neutral-400">
              {t("auth.hasAccount")}{" "}
              <Link href="/login" className="font-semibold text-teal-600 dark:text-teal-400">{t("auth.loginNow")}</Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
