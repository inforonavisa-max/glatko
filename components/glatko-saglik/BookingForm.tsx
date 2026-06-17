"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Loader2, ShieldCheck } from "lucide-react";

/**
 * Glatko Sağlık — H5a booking form (Client Component).
 *
 * 5-min hold countdown + patient form + two-checkbox PDPL consent + Infobip OTP
 * (send → verify). On verify the encrypted patient row is created server-side
 * (POST/PUT /api/health/otp). H5a STOPS at "phone verified ✓" — the real
 * reservation (health.book_appointment) is H5b; the disabled CTA is its hook.
 * The note + the returned patientId + holdId are held in state, ready for H5b.
 */

type Phase = "form" | "code" | "verified";

export function BookingForm({
  holdId,
  expiresAt,
  providerSlug,
  locale,
}: {
  holdId: string;
  expiresAt: string;
  providerSlug: string;
  locale: string;
}) {
  const t = useTranslations("healthVertical");
  const router = useRouter();
  const b = (k: string, values?: Record<string, string | number>) => t(`booking.${k}`, values);

  // ── 5-min countdown ───────────────────────────────────────────────────────
  // `remaining` is computed client-only (starts null) so the SSR markup and the
  // first client render match — a time-based initial value hydrates mismatched.
  const expiryMs = new Date(expiresAt).getTime();
  const [remaining, setRemaining] = useState<number | null>(null);
  const releasedRef = useRef(false);

  const releaseAndLeave = useCallback(() => {
    if (releasedRef.current) return;
    releasedRef.current = true;
    // Best-effort release; keepalive so it survives the navigation.
    void fetch("/api/health/holds", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdId }),
      keepalive: true,
    }).catch(() => {});
    router.push({ pathname: "/health/uzman/[slug]", params: { slug: providerSlug } });
  }, [holdId, providerSlug, router]);

  const [phase, setPhase] = useState<Phase>("form");

  // A11y: move focus to the OTP input when the form advances to the 'code' phase
  // so a keyboard/SR user lands on the field they must fill next (the input is
  // conditionally rendered, so this fires after it mounts). Guarded behind the
  // effect + a ref → no hydration impact (same lesson as the countdown null-init).
  const codeInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (phase === "code") codeInputRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (phase === "verified") return; // stop the clock once verified
    const tick = () => {
      const ms = Math.max(0, expiryMs - Date.now());
      setRemaining(ms);
      if (ms <= 0) releaseAndLeave(); // releasedRef guards a double-fire
    };
    tick(); // first compute happens on the client only → no hydration mismatch
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiryMs, releaseAndLeave, phase]);

  const countdown =
    remaining === null
      ? "—:—"
      : `${Math.floor(remaining / 60000)}:${Math.floor((remaining % 60000) / 1000)
          .toString()
          .padStart(2, "0")}`;

  // ── form fields ───────────────────────────────────────────────────────────
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState(""); // carried to H5b (book_appointment p_note)
  const [consentHealth, setConsentHealth] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [code, setCode] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  function mapApiError(status: number, payload: { error?: string; reason?: string; attemptsLeft?: number }): string {
    if (payload.error === "rate_limited") {
      return payload.reason === "ip_hourly" ? b("errRateLimitedIp") : b("errRateLimitedPhone");
    }
    if (payload.error === "sms_failed") return b("errSmsFailed");
    if (payload.error === "invalid_phone") return b("errPhoneInvalid");
    if (payload.error === "invalid_code") return b("errCodeInvalid");
    if (payload.reason === "WRONG_CODE") return b("errWrongCode", { count: payload.attemptsLeft ?? 0 });
    if (payload.reason === "TOO_MANY_ATTEMPTS") return b("errTooManyAttempts");
    if (payload.reason === "OTP_EXPIRED") return b("errOtpExpired");
    if (payload.reason === "CONSENT_REQUIRED") return b("errConsentRequired");
    return b("errGeneric");
  }

  async function sendCode() {
    setError(null);
    if (fullName.trim().length < 2) return setError(b("errNameRequired"));
    if (!consentHealth) return setError(b("errConsentRequired"));
    if (phone.trim().length < 6) return setError(b("errPhoneInvalid"));
    setBusy(true);
    try {
      const res = await fetch("/api/health/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, locale }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(mapApiError(res.status, payload));
        return;
      }
      setCode("");
      setPhase("code");
    } catch {
      setError(b("errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) return setError(b("errCodeInvalid"));
    setBusy(true);
    try {
      const res = await fetch("/api/health/otp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          code: code.trim(),
          fullName: fullName.trim(),
          email: email.trim() || undefined,
          consentHealth,
          consentMarketing,
          locale,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok && payload.ok) {
        setPhase("verified");
        return;
      }
      setError(mapApiError(res.status, payload));
      if (payload.reason === "TOO_MANY_ATTEMPTS" || payload.reason === "OTP_EXPIRED") {
        setPhase("form"); // force a fresh code request
      }
    } catch {
      setError(b("errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  const complete = useCallback(async () => {
    setCompleteError(null);
    setCompleting(true);
    try {
      const res = await fetch("/api/health/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdId, note: note.trim() || undefined, locale }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok && payload.ok) {
        router.push({ pathname: "/health/randevu/onay/[token]", params: { token: payload.manageToken } });
        return;
      }
      if (res.status === 409) setCompleteError(b("bookSlotTaken"));
      else if (res.status === 410) setCompleteError(b("bookExpired"));
      else setCompleteError(b("bookFailed"));
    } catch {
      setCompleteError(b("bookFailed"));
    } finally {
      setCompleting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdId, note, locale, router]);

  const inputCls =
    "mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30";
  const labelCls = "text-sm font-medium text-gray-700 dark:text-white/80";

  // ── verified terminal state (H5a ends here) ───────────────────────────────
  if (phase === "verified") {
    return (
      <section className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-6 text-center dark:border-teal-500/30 dark:bg-teal-500/10">
        <ShieldCheck className="mx-auto h-10 w-10 text-teal-600 dark:text-teal-400" />
        <h2 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">
          {b("verifiedTitle")}
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600 dark:text-white/70">
          {b("verifiedBody")}
        </p>
        <button
          type="button"
          onClick={complete}
          disabled={completing}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40 disabled:opacity-60"
        >
          {completing && <Loader2 className="h-4 w-4 animate-spin" />}
          {completing ? b("completing") : b("completeCta")}
        </button>
        {completeError && (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-300">
            {completeError}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="mt-6">
      {/* Countdown */}
      <div className="flex items-center justify-between rounded-xl border border-brandHealth-200 bg-brandHealth-50 px-4 py-2.5 text-sm dark:border-brandHealth/30 dark:bg-brandHealth/10">
        <span className="font-medium text-brandHealth-700 dark:text-brandHealth">{b("expiresIn")}</span>
        <span className="font-mono font-semibold tabular-nums text-brandHealth-700 dark:text-brandHealth">
          {countdown}
        </span>
      </div>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
        {b("formTitle")}
      </h2>

      <div className="mt-3 space-y-4">
        <div>
          <label htmlFor="bf-name" className={labelCls}>{b("nameLabel")}</label>
          <input id="bf-name" type="text" value={fullName} maxLength={120}
            onChange={(e) => setFullName(e.target.value)}
            disabled={phase === "code"} placeholder={b("namePlaceholder")} className={inputCls} />
        </div>
        <div>
          <label htmlFor="bf-phone" className={labelCls}>{b("phoneLabel")}</label>
          <input id="bf-phone" type="tel" inputMode="tel" value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={phase === "code"} placeholder={b("phonePlaceholder")} className={inputCls} />
        </div>
        <div>
          <label htmlFor="bf-email" className={labelCls}>{b("emailLabel")}</label>
          <input id="bf-email" type="email" value={email} maxLength={160}
            onChange={(e) => setEmail(e.target.value)}
            disabled={phase === "code"} placeholder={b("emailLabel")} className={inputCls} />
        </div>
        <div>
          <label htmlFor="bf-note" className={labelCls}>{b("noteLabel")}</label>
          <textarea id="bf-note" value={note} maxLength={500} rows={2}
            onChange={(e) => setNote(e.target.value)}
            disabled={phase === "code"} placeholder={b("notePlaceholder")} className={inputCls} />
        </div>

        {/* PDPL Md.13 — two separate, not-prechecked consents */}
        <label className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-white/70">
          <input type="checkbox" checked={consentHealth} disabled={phase === "code"}
            onChange={(e) => setConsentHealth(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-teal-600 focus:ring-teal-500/30 dark:border-white/20 dark:bg-white/5" />
          <span>
            {b("consentHealthLabel")}{" "}
            <Link href="/health-privacy" className="font-medium text-teal-600 underline hover:text-teal-700 dark:text-teal-400">
              {b("consentHealthLink")}
            </Link>
          </span>
        </label>
        <label className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-white/70">
          <input type="checkbox" checked={consentMarketing} disabled={phase === "code"}
            onChange={(e) => setConsentMarketing(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-teal-600 focus:ring-teal-500/30 dark:border-white/20 dark:bg-white/5" />
          <span>{b("consentMarketingLabel")}</span>
        </label>

        {/* OTP code (phase === code) */}
        {phase === "code" && (
          <div>
            <p className="text-sm text-gray-600 dark:text-white/70">{b("codeSent")}</p>
            <label htmlFor="bf-code" className={`${labelCls} mt-3 block`}>{b("codeLabel")}</label>
            <input id="bf-code" ref={codeInputRef} type="text" inputMode="numeric" autoComplete="one-time-code"
              aria-describedby={error ? "bf-error" : undefined}
              maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder={b("codePlaceholder")} className={`${inputCls} font-mono tracking-[0.4em]`} />
          </div>
        )}

        {error && (
          <p id="bf-error" role="alert" aria-live="assertive" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </p>
        )}

        {/* Primary action (teal CTA — §1.5) */}
        {phase === "form" ? (
          <button type="button" onClick={sendCode} disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40 disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? b("sending") : b("sendCode")}
          </button>
        ) : (
          <>
            <button type="button" onClick={verify} disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40 disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? b("verifying") : b("verify")}
            </button>
            <button type="button" onClick={sendCode} disabled={busy}
              className="w-full text-center text-sm font-medium text-teal-600 hover:underline disabled:opacity-60 dark:text-teal-400">
              {b("resend")}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
