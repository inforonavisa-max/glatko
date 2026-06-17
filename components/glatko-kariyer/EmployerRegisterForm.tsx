"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

// Seeded sector list (migration 078) — Construction + Hospitality at launch.
// Mirror health's SPECIALTY_KEYS constant pattern; labels resolve from the
// existing careerVertical.sectors.<key>.name subtree.
const SECTOR_KEYS = ["construction", "hospitality"] as const;
// Optional expected-hiring-volume bands (UX-level; see spec 11 Fields).
const VOLUME_KEYS = ["small", "medium", "large"] as const;

type FormStatus = "idle" | "submitting" | "success" | "error" | "invalid";

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brandCareer focus:outline-none focus:ring-2 focus:ring-brandCareer/20 dark:border-white/10 dark:bg-white/5 dark:text-white";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// E.164-ish after stripping separators: optional +, 6–15 digits.
const PHONE_RE = /^\+?\d{6,15}$/;

export function EmployerRegisterForm({ locale }: { locale: Locale }) {
  const t = useTranslations("careerVertical");
  const [status, setStatus] = useState<FormStatus>("idle");

  // Controlled fields (spec 11 difference from the FormData mirror).
  const [company, setCompany] = useState("");
  const [sector, setSector] = useState("");
  const [volume, setVolume] = useState("");
  const [city, setCity] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [contactLanguage, setContactLanguage] = useState<string>(locale);
  const [consent, setConsent] = useState(false);

  // Separate consent-specific invalid message from the generic required one.
  const [consentMissing, setConsentMissing] = useState(false);

  // Single validate() helper — runs synchronously on submit; returns the
  // built payload or null (mirror health's early-return-on-invalid pattern).
  function validate() {
    const companyTrim = company.trim();
    const cityTrim = city.trim();
    const contactNameTrim = contactName.trim();
    const emailTrim = email.trim();
    // Strip separators client-side like the health route does.
    const phoneTrim = phone.replace(/[\s().-]/g, "");

    if (companyTrim.length < 2 || companyTrim.length > 160) return null;
    if (!(SECTOR_KEYS as readonly string[]).includes(sector)) return null;
    if (cityTrim.length < 2 || cityTrim.length > 80) return null;
    if (contactNameTrim.length < 2 || contactNameTrim.length > 120) return null;
    if (emailTrim.length === 0 || emailTrim.length > 160 || !EMAIL_RE.test(emailTrim)) return null;
    if (!PHONE_RE.test(phoneTrim)) return null;

    return {
      company: companyTrim,
      sector,
      volume,
      city: cityTrim,
      contactName: contactNameTrim,
      email: emailTrim,
      phone: phoneTrim,
      contactLanguage,
      consent: true,
      locale,
    };
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Consent is load-bearing — blocks submit with its own message (spec 11).
    if (!consent) {
      setConsentMissing(true);
      setStatus("invalid");
      return;
    }
    setConsentMissing(false);

    const payload = validate();
    if (!payload) {
      setStatus("invalid");
      return;
    }

    setStatus("submitting");
    try {
      const res = await fetch("/api/career/employer/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setStatus(res.status === 400 ? "invalid" : "error");
        return;
      }
      // Duplicate email returns { ok: true } too (anti-enumeration, idempotent).
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="mt-6 rounded-xl bg-brandCareer-50 p-4 dark:bg-brandCareer/10">
        <div className="flex items-center gap-3 text-sm text-brandCareer-700 dark:text-brandCareer">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {t("employer.register.successBody")}
        </div>
        <Link
          href="/career/login"
          className="mt-3 inline-block text-xs font-medium text-brandCareer-700 underline transition-colors hover:text-brandCareer dark:text-brandCareer"
        >
          {t("employer.register.loginLink")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
      {/* Company group */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
            {t("employer.register.companyLabel")} *
          </span>
          <input
            name="company"
            type="text"
            required
            maxLength={160}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
            {t("employer.register.sectorLabel")} *
          </span>
          <select
            name="sector"
            required
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className={inputClass}
          >
            <option value="" disabled />
            {SECTOR_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(`sectors.${key}.name`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
            {t("employer.register.volumeLabel")}
          </span>
          <select
            name="volume"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            className={inputClass}
          >
            <option value="" disabled />
            {VOLUME_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(`employer.register.volumeOptions.${key}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
            {t("employer.register.cityLabel")} *
          </span>
          <input
            name="city"
            type="text"
            required
            maxLength={80}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      {/* Contact group */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
            {t("employer.register.contactLabel")} *
          </span>
          <input
            name="contactName"
            type="text"
            required
            maxLength={120}
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
            {t("employer.register.phoneLabel")} *
          </span>
          <input
            name="phone"
            type="tel"
            required
            maxLength={24}
            placeholder="+382 6x xxx xxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      {/* Work email — full-width row (required) */}
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
          {t("employer.register.emailLabel")} *
        </span>
        <input
          name="email"
          type="email"
          required
          maxLength={160}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </label>

      {/* Preferred contact language — optional, defaults to active locale */}
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
          {t("employer.register.languageLabel")}
        </span>
        <select
          name="contactLanguage"
          value={contactLanguage}
          onChange={(e) => setContactLanguage(e.target.value)}
          className={inputClass}
        >
          {(["tr", "en", "de", "it", "ru", "uk", "sr", "me", "ar"] as const).map((value) => (
            <option key={value} value={value}>
              {t(`employer.register.languageOptions.${value}`)}
            </option>
          ))}
        </select>
      </label>

      {/* Consent — required checkbox, blocks submit until checked (spec 11) */}
      <label className="flex items-start gap-2.5">
        <input
          name="consent"
          type="checkbox"
          checked={consent}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (e.target.checked) setConsentMissing(false);
          }}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brandCareer focus:ring-2 focus:ring-brandCareer/20 dark:border-white/20 dark:bg-white/5"
        />
        <span className="text-xs text-gray-600 dark:text-white/60">
          {t("employer.register.consentText")}{" "}
          <Link
            href="/privacy"
            className="underline transition-colors hover:text-brandCareer-700 dark:hover:text-brandCareer"
          >
            {t("employer.register.privacyLinkText")}
          </Link>
        </span>
      </label>

      {(status === "error" || status === "invalid") && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {status === "error"
            ? t("employer.register.errGeneric")
            : consentMissing
              ? t("employer.register.errConsent")
              : t("employer.register.errValidation")}
        </p>
      )}

      {/* Conversion CTA — the ONE solid amber-600 button on this surface
          (spec 11: NOT a gradient; hover deepens toward brandCareer-700). */}
      <button
        type="submit"
        disabled={status === "submitting"}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl bg-brandCareer px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brandCareer/25 transition-all hover:bg-brandCareer-700 hover:shadow-brandCareer/40",
          status === "submitting" && "cursor-not-allowed opacity-70",
        )}
      >
        {status === "submitting" && <Loader2 className="h-4 w-4 animate-spin" />}
        {status === "submitting"
          ? t("employer.register.submitting")
          : t("employer.register.submit")}
      </button>

      {/* Disclosure line — B2B contact data; the route writes via a SECURITY
          DEFINER RPC over the service-role client (career schema not exposed
          to PostgREST). next-intl resolves the privacy slug. */}
      <p className="text-xs text-gray-400 dark:text-white/30">
        {t("employer.register.privacyNote")}{" "}
        <Link
          href="/privacy"
          className="underline transition-colors hover:text-brandCareer-700 dark:hover:text-brandCareer"
        >
          {t("employer.register.privacyLinkText")}
        </Link>
      </p>
    </form>
  );
}
