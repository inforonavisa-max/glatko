"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarClock, Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { BookingWidget } from "@/components/glatko-saglik/BookingWidget";
import type { HealthBookingService, HealthBookingLocation } from "@/lib/saglik/queries";

/**
 * Glatko Sağlık — H9 reschedule orchestrator (Client Component).
 *
 * Hosts the reused BookingWidget (locked to the ORIGINAL provider/service/location)
 * to pick a new slot → on hold-created it advances to an identity re-verify step
 * (the manage page carries NO patient cookie, so the patient must re-prove identity
 * via OTP — skipping it would let anyone holding the token book on a stranger's
 * behalf). After verify, confirming POSTs the new hold + the old token to
 * /api/health/reschedule and routes to the new appointment's confirmation page.
 *
 * Stages: pick (widget) → verify (OTP send/verify) → confirm (POST reschedule).
 */

type Stage = "pick" | "verify" | "confirm";
type OtpPhase = "form" | "code";

export function RescheduleFlow({
  token,
  slug,
  providerId,
  service,
  location,
  locale,
}: {
  token: string;
  slug: string;
  providerId: string;
  /** The ORIGINAL service (single-element list locks the widget to it). */
  service: HealthBookingService;
  /** The ORIGINAL location. */
  location: HealthBookingLocation;
  locale: string;
}) {
  const t = useTranslations("healthVertical.booking");
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("pick");
  const [holdId, setHoldId] = useState<string | null>(null);

  // OTP re-verify (reuses the booking OTP endpoint; binds glatko_hpatient on success).
  const [otpPhase, setOtpPhase] = useState<OtpPhase>("form");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A11y: move focus to the OTP input when the verify step advances to 'code'
  // (the input is conditionally rendered, so this runs after it mounts).
  const codeInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (otpPhase === "code") codeInputRef.current?.focus();
  }, [otpPhase]);

  // Confirm step.
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const onHoldCreated = useCallback((id: string) => {
    setHoldId(id);
    setStage("verify");
    setError(null);
  }, []);

  function mapApiError(payload: { error?: string; reason?: string; attemptsLeft?: number }): string {
    if (payload.error === "rate_limited") {
      return payload.reason === "ip_hourly" ? t("errRateLimitedIp") : t("errRateLimitedPhone");
    }
    if (payload.error === "sms_failed") return t("errSmsFailed");
    if (payload.error === "invalid_phone") return t("errPhoneInvalid");
    if (payload.error === "invalid_code") return t("errCodeInvalid");
    if (payload.reason === "WRONG_CODE") return t("errWrongCode", { count: payload.attemptsLeft ?? 0 });
    if (payload.reason === "TOO_MANY_ATTEMPTS") return t("errTooManyAttempts");
    if (payload.reason === "OTP_EXPIRED") return t("errOtpExpired");
    if (payload.reason === "CONSENT_REQUIRED") return t("errConsentRequired");
    return t("errGeneric");
  }

  async function sendCode() {
    setError(null);
    if (phone.trim().length < 6) return setError(t("errPhoneInvalid"));
    setBusy(true);
    try {
      const res = await fetch("/api/health/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, locale }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(mapApiError(payload));
        return;
      }
      setCode("");
      setOtpPhase("code");
    } catch {
      setError(t("errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) return setError(t("errCodeInvalid"));
    setBusy(true);
    try {
      // Re-verify binds glatko_hpatient (httpOnly) for this session as a LIVENESS proof
      // only. The new appointment is booked against the ORIGINAL appointment's patient
      // (migration 076), and the reschedule RPC requires this re-verified phone to match
      // the original patient's phone_hash — so the real name/email/phone carry over and a
      // token-holder can't move a stranger's slot. The placeholder `fullName` is therefore
      // never used for the new appointment; it only satisfies the verify RPC's name field.
      const res = await fetch("/api/health/otp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          code: code.trim(),
          fullName: t("rescheduleVerifyName"),
          consentHealth: true,
          locale,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok && payload.ok) {
        setStage("confirm");
        return;
      }
      setError(mapApiError(payload));
      if (payload.reason === "TOO_MANY_ATTEMPTS" || payload.reason === "OTP_EXPIRED") {
        setOtpPhase("form");
      }
    } catch {
      setError(t("errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  const confirmReschedule = useCallback(async () => {
    if (!holdId) return;
    setConfirmError(null);
    setConfirming(true);
    try {
      const res = await fetch("/api/health/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, holdId, locale }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok && payload.ok) {
        router.push({ pathname: "/health/randevu/onay/[token]", params: { token: payload.manageToken } });
        return;
      }
      if (res.status === 409) setConfirmError(t("bookSlotTaken"));
      else if (res.status === 410) setConfirmError(t("bookExpired"));
      else if (res.status === 403) setConfirmError(t("errGeneric"));
      else setConfirmError(t("bookFailed"));
    } catch {
      setConfirmError(t("bookFailed"));
    } finally {
      setConfirming(false);
    }
  }, [holdId, token, locale, router, t]);

  const inputCls =
    "mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30";
  const labelCls = "text-sm font-medium text-gray-700 dark:text-white/80";

  // ── Stage: pick a new slot (reused widget, locked to original service/location) ──
  if (stage === "pick") {
    return (
      <div className="mt-6">
        <p className="mb-3 text-sm text-gray-600 dark:text-white/70">{t("rescheduleIntro")}</p>
        <BookingWidget
          slug={slug}
          providerId={providerId}
          services={[service]}
          locations={[location]}
          locale={locale}
          onHoldCreated={onHoldCreated}
          lockSelectors
        />
      </div>
    );
  }

  // ── Stage: re-verify identity (OTP) ────────────────────────────────────────
  if (stage === "verify") {
    return (
      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-premium-sm dark:border-white/10 dark:bg-white/5">
        <div className="flex items-center gap-2 text-gray-900 dark:text-white">
          <ShieldCheck className="h-5 w-5 text-brandHealth" />
          <span className="text-sm font-semibold">{t("rescheduleVerifyTitle")}</span>
        </div>
        <p className="mt-2 text-sm text-gray-600 dark:text-white/70">{t("rescheduleVerifyBody")}</p>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="rf-phone" className={labelCls}>{t("phoneLabel")}</label>
            <input id="rf-phone" type="tel" inputMode="tel" value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={otpPhase === "code"} placeholder={t("phonePlaceholder")} className={inputCls} />
          </div>

          {otpPhase === "code" && (
            <div>
              <p className="text-sm text-gray-600 dark:text-white/70">{t("codeSent")}</p>
              <label htmlFor="rf-code" className={`${labelCls} mt-3 block`}>{t("codeLabel")}</label>
              <input id="rf-code" ref={codeInputRef} type="text" inputMode="numeric" autoComplete="one-time-code"
                aria-describedby={error ? "rf-error" : undefined}
                maxLength={6} value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder={t("codePlaceholder")} className={`${inputCls} font-mono tracking-[0.4em]`} />
            </div>
          )}

          {error && (
            <p id="rf-error" role="alert" aria-live="assertive" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}

          {otpPhase === "form" ? (
            <button type="button" onClick={sendCode} disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40 disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? t("sending") : t("sendCode")}
            </button>
          ) : (
            <>
              <button type="button" onClick={verify} disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40 disabled:opacity-60">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? t("verifying") : t("verify")}
              </button>
              <button type="button" onClick={sendCode} disabled={busy}
                className="w-full text-center text-sm font-medium text-teal-600 hover:underline disabled:opacity-60 dark:text-teal-400">
                {t("resend")}
              </button>
            </>
          )}
        </div>
      </section>
    );
  }

  // ── Stage: confirm the move ────────────────────────────────────────────────
  return (
    <section className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-6 text-center dark:border-teal-500/30 dark:bg-teal-500/10">
      <CalendarClock className="mx-auto h-10 w-10 text-teal-600 dark:text-teal-400" />
      <h2 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">
        {t("rescheduleConfirmTitle")}
      </h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600 dark:text-white/70">
        {t("rescheduleConfirmBody")}
      </p>
      <button
        type="button"
        onClick={confirmReschedule}
        disabled={confirming}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40 disabled:opacity-60"
      >
        {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
        {confirming ? t("completing") : t("rescheduleConfirmCta")}
      </button>
      {confirmError && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-300">
          {confirmError}
        </p>
      )}
    </section>
  );
}
