"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, CheckCircle2, ShieldCheck, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  startPhoneVerification,
  confirmPhoneOtp,
  type PhoneActionError,
} from "@/lib/actions/phone";
import type { Locale } from "@/i18n/routing";
import type { ServiceCategory, MultiLangText } from "@/types/glatko";
import type { VoiceDraftResult, ConfirmEdits } from "@/lib/pro-voice/types";

function label(cat: ServiceCategory, locale: Locale): string {
  const n = cat.name as MultiLangText;
  return (
    n[locale] ??
    n.en ??
    n.tr ??
    (Object.values(n).find((v) => typeof v === "string") as string | undefined) ??
    cat.slug
  );
}

function splitList(text: string, max: number): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

export function OnboardingReview({
  draft,
  categories,
  onBack,
  onFallbackToManual,
}: {
  draft: VoiceDraftResult;
  categories: ServiceCategory[];
  onBack: () => void;
  onFallbackToManual: () => void;
}) {
  const t = useTranslations("pro.voice");
  const locale = useLocale() as Locale;
  const router = useRouter();

  const roots = useMemo(
    () => categories.filter((c) => c.parent_id === null),
    [categories],
  );

  const p = draft.profile;
  const [displayName, setDisplayName] = useState(p.display_name);
  const [categorySlug, setCategorySlug] = useState(p.category_slug);
  const [subServicesText, setSubServicesText] = useState(p.sub_services.join(", "));
  const [bio, setBio] = useState(p.bio);
  const [areasText, setAreasText] = useState(p.service_areas.join(", "));
  const [experience, setExperience] = useState(
    p.experience_years != null ? String(p.experience_years) : "",
  );

  // Phone OTP (reuses the existing verification server actions verbatim).
  const [phone, setPhone] = useState("");
  const [e164, setE164] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function otpErr(e: PhoneActionError): string {
    switch (e) {
      case "invalid_phone":
        return t("error.otpInvalidPhone");
      case "rate_limited":
        return t("error.otpRateLimited");
      case "phone_in_use":
        return t("error.otpPhoneInUse");
      case "wrong_code":
        return t("error.otpWrongCode");
      default:
        return t("error.otpGeneric");
    }
  }

  async function sendCode() {
    if (!phone.trim()) {
      toast.error(t("error.otpInvalidPhone"));
      return;
    }
    setSending(true);
    try {
      const res = await startPhoneVerification(phone.trim());
      if (!res.ok) {
        toast.error(otpErr(res.error));
        return;
      }
      setE164(res.phone);
      setOtpSent(true);
      toast.success(t("review.codeSent"));
    } finally {
      setSending(false);
    }
  }

  async function verifyCode() {
    if (!/^\d{4,10}$/.test(code.trim())) {
      toast.error(t("error.otpWrongCode"));
      return;
    }
    setVerifying(true);
    try {
      const res = await confirmPhoneOtp(e164 || phone.trim(), code.trim());
      if (!res.ok) {
        toast.error(otpErr(res.error));
        return;
      }
      setVerified(true);
      toast.success(t("review.verified"));
    } finally {
      setVerifying(false);
    }
  }

  async function confirm() {
    if (!verified) {
      toast.error(t("error.phoneNotVerified"));
      return;
    }
    if (!displayName.trim() || !categorySlug) {
      toast.error(t("error.missingFields"));
      return;
    }
    const edits: ConfirmEdits = {
      display_name: displayName.trim(),
      category_slug: categorySlug,
      sub_services: splitList(subServicesText, 8),
      bio: bio.trim(),
      service_areas: splitList(areasText, 12),
      experience_years: experience.trim() ? Number.parseInt(experience, 10) || null : null,
    };
    setConfirming(true);
    try {
      const res = await fetch("/api/pro-onboarding/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: draft.draftId, edits }),
      });
      if (res.ok) {
        toast.success(t("review.successToast"));
        router.push("/pro/dashboard");
        return;
      }
      if (res.status === 412) {
        setVerified(false);
        toast.error(t("error.phoneNotVerified"));
      } else if (res.status === 422) {
        toast.error(t("error.categoryUnresolved"));
      } else if (res.status === 409) {
        toast.error(t("error.alreadyPro"));
      } else {
        toast.error(t("error.confirmFailed"));
      }
    } catch {
      toast.error(t("error.confirmFailed"));
    } finally {
      setConfirming(false);
    }
  }

  const currentLabel = useMemo(() => {
    const cat = roots.find((c) => c.slug === categorySlug);
    return cat ? label(cat, locale) : categorySlug;
  }, [roots, categorySlug, locale]);

  return (
    <div className="rounded-2xl border border-teal-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-teal-500/20 dark:bg-white/[0.03]">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-white/50"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("review.back")}
      </button>

      <h2 className="font-serif text-xl font-semibold text-gray-900 dark:text-white">
        {t("review.title")}
      </h2>

      {/* Detected category badge (teal — horizontal service brand). */}
      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 px-3 py-1 text-sm font-medium text-teal-700 dark:text-teal-300">
        <CheckCircle2 className="h-4 w-4" />
        {t("review.detectedBadge")}: {currentLabel}
      </div>

      <div className="mt-6 space-y-5">
        {/* Photos preview (already uploaded — read-only). */}
        {draft.photoUrls.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {draft.photoUrls.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt=""
                className="h-16 w-16 rounded-lg border border-gray-200 object-cover dark:border-white/10"
              />
            ))}
          </div>
        )}

        <div>
          <Label htmlFor="vo-name">{t("review.nameLabel")}</Label>
          <Input
            id="vo-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="vo-cat">{t("review.categoryLabel")}</Label>
          <select
            id="vo-cat"
            value={categorySlug}
            onChange={(e) => setCategorySlug(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus-visible:ring-3 focus-visible:ring-teal-500/40 dark:border-white/15 dark:bg-white/5 dark:text-white"
          >
            {roots.map((c) => (
              <option key={c.slug} value={c.slug}>
                {label(c, locale)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="vo-subs">{t("review.servicesLabel")}</Label>
          <Input
            id="vo-subs"
            value={subServicesText}
            onChange={(e) => setSubServicesText(e.target.value)}
            placeholder={t("review.servicesHint")}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="vo-bio">{t("review.bioLabel")}</Label>
          <Textarea
            id="vo-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            className="mt-1"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="vo-areas">{t("review.areasLabel")}</Label>
            <Input
              id="vo-areas"
              value={areasText}
              onChange={(e) => setAreasText(e.target.value)}
              placeholder={t("review.areasHint")}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="vo-exp">{t("review.experienceLabel")}</Label>
            <Input
              id="vo-exp"
              type="number"
              min={0}
              max={70}
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        {/* ── Phone OTP (mandatory before confirm) ─────────────────────── */}
        <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-white/10 dark:bg-white/[0.02]">
          <p className="flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-white">
            <ShieldCheck className="h-4 w-4 text-teal-600" />
            {t("review.phoneLabel")}
          </p>
          {verified ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 dark:text-teal-300">
              <CheckCircle2 className="h-4 w-4" />
              {t("review.verified")}: {e164}
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-gray-500 dark:text-white/50">{t("review.phoneHint")}</p>
              <div className="mt-2 flex gap-2">
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+382 6X XXX XXX"
                  inputMode="tel"
                  disabled={otpSent}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={sending || otpSent}
                  className="shrink-0 rounded-lg border border-teal-600 px-3 text-sm font-medium text-teal-700 transition hover:bg-teal-50 disabled:opacity-50 dark:text-teal-300"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("review.sendCode")}
                </button>
              </div>
              {otpSent && (
                <div className="mt-2 flex gap-2">
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder={t("review.codeLabel")}
                    inputMode="numeric"
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={verifyCode}
                    disabled={verifying}
                    className="shrink-0 rounded-lg bg-teal-600 px-3 text-sm font-medium text-white transition hover:bg-teal-700 disabled:opacity-50"
                  >
                    {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : t("review.verify")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Confirm ──────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={confirm}
        disabled={confirming || !verified}
        className={cn(
          "mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-3 font-semibold text-white shadow-teal-md transition hover:bg-teal-700 active:translate-y-px",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {confirming ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            {t("review.confirming")}
          </>
        ) : (
          t("review.confirm")
        )}
      </button>

      <button
        type="button"
        onClick={onFallbackToManual}
        className="mt-3 w-full text-center text-sm text-gray-500 hover:underline dark:text-white/50"
      >
        {t("fallbackToManual")}
      </button>
    </div>
  );
}
