"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/supabase/browser";
import { useRouter } from "@/i18n/navigation";
import { AuthBrandPanel } from "@/components/glatko/auth/AuthBrandPanel";
import { AccountLinkAlert } from "@/components/auth/AccountLinkAlert";
import { lookupAuthMethods } from "@/lib/actions/auth-methods";
import { cn } from "@/lib/utils";
import { PhoneLoginPanel } from "@/components/auth/PhoneLoginPanel";

const inputCls = cn(
  "block w-full rounded-xl border border-gray-200 dark:border-white/10",
  "bg-gray-50 dark:bg-white/5 px-4 py-3 text-sm",
  "text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30",
  "focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
);

export default function LoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [oauthOnlyProviders, setOauthOnlyProviders] = useState<string[]>([]);
  const [mode, setMode] = useState<"email" | "phone">("email");

  function isInvalidCredentialsError(err: { code?: string; message?: string }) {
    if (err.code === "invalid_credentials") return true;
    const msg = (err.message ?? "").toLowerCase();
    return msg.includes("invalid login") || msg.includes("invalid credentials");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setOauthOnlyProviders([]);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      if (isInvalidCredentialsError(signInError)) {
        const methods = await lookupAuthMethods(email);
        if (!methods.hasPassword && methods.oauthProviders.length > 0) {
          setOauthOnlyProviders(methods.oauthProviders);
          setLoading(false);
          return;
        }
      }
      setError(signInError.message);
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function handleOAuthLogin(provider: string) {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: provider as "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  function handleGoogleLogin() {
    return handleOAuthLogin("google");
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
            {t("auth.login")}
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">
            {t("brand.tagline")}
          </p>

          <div className="mt-8">
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={handleGoogleLogin}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {t("auth.google")}
            </motion.button>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-gray-200 dark:border-neutral-700" />
              </div>
              <div className="relative flex justify-center text-sm font-medium leading-6">
                <span className="bg-white px-6 text-gray-400 dark:bg-neutral-950 dark:text-neutral-500">
                  {t("auth.orContinueWith")}
                </span>
              </div>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 dark:bg-white/5">
              <button
                type="button"
                onClick={() => {
                  setMode("email");
                  setError("");
                  setOauthOnlyProviders([]);
                }}
                aria-pressed={mode === "email"}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-all",
                  mode === "email"
                    ? "bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white"
                    : "text-gray-500 hover:text-gray-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                )}
              >
                {t("auth.email")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("phone");
                  setError("");
                  setOauthOnlyProviders([]);
                }}
                aria-pressed={mode === "phone"}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-all",
                  mode === "phone"
                    ? "bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white"
                    : "text-gray-500 hover:text-gray-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                )}
              >
                {t("auth.phoneLogin.tabPhone")}
              </button>
            </div>

            {mode === "phone" ? (
              <PhoneLoginPanel />
            ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-400">
                  {t("auth.email")}
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className={inputCls}
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-neutral-400">
                    {t("auth.password")}
                  </label>
                  <Link href="/forgot-password" className="text-xs font-medium text-teal-600 hover:text-teal-500 dark:text-teal-400">
                    {t("auth.forgotPassword")}
                  </Link>
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className={inputCls}
                />
              </div>

              {oauthOnlyProviders.length > 0 ? (
                <AccountLinkAlert
                  providers={oauthOnlyProviders}
                  onUseProvider={handleOAuthLogin}
                />
              ) : (
                error && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
                  >
                    {error}
                  </motion.p>
                )
              )}

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.login")}
              </motion.button>
            </form>
            )}

            <p className="mt-8 text-center text-sm text-gray-500 dark:text-neutral-400">
              {t("auth.noAccount")}{" "}
              <Link href="/register" className="font-semibold text-teal-600 hover:text-teal-500 dark:text-teal-400">
                {t("auth.registerNow")}
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
