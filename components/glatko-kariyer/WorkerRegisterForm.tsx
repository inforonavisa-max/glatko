"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { locales, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

type FormStatus = "idle" | "submitting" | "success" | "error" | "invalid";
// `invalid` carries a reason so the consent-specific message is distinguishable
// from a generic field-validation failure (spec edge case: consent is the
// lawful basis, not just another required field).
type InvalidReason = "fields" | "consent";

// Role / trade options. Mirrors health's SPECIALTY_KEYS constant pattern — the
// labels resolve against the seeded `careerVertical.sectors.*.name` 9-locale
// copy. Deep profile data (skills, exact trade) is collected in later wizard
// steps, NOT here, so Step 1 keeps the list intentionally short.
const ROLE_KEYS = ["construction", "hospitality"] as const;

// Source region — region, NEVER exact country (anonymization rule, PART 4).
// Exact country is collected later in the gated profile. Labels resolve against
// the existing `careerVertical.pool.region.*` subtree.
const REGION_KEYS = [
  "farEast",
  "middleEast",
  "africa",
  "balkans",
  "other",
] as const;

// Native language endonyms for the optional preferred-language select. The
// select defaults to the active locale; the value sent is a routing Locale.
const LANGUAGE_LABELS: Record<Locale, string> = {
  tr: "Türkçe",
  en: "English",
  de: "Deutsch",
  it: "Italiano",
  ru: "Русский",
  uk: "Українська",
  sr: "Srpski",
  me: "Crnogorski",
  ar: "العربية",
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// E.164-ish: optional +, 6–15 digits after stripping separators (mirror health).
const PHONE_RE = /^\+?\d{6,15}$/;

// Health inputClass with the focus ring swapped teal/sky → amber (brandCareer);
// neutral gray borders + dark-mode variants kept verbatim.
const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brandCareer focus:outline-none focus:ring-2 focus:ring-brandCareer/20 dark:border-white/10 dark:bg-white/5 dark:text-white";

export function WorkerRegisterForm({ locale }: { locale: Locale }) {
  const t = useTranslations("careerVertical.worker.register");
  // Cross-cutting labels (sector names, source-region names) live outside the
  // register subtree — next-intl has no parent traversal, so use a second
  // translator scoped one level up (mirror WorkerPoolBrowser's `pool.region.*`).
  const tShared = useTranslations("careerVertical");

  const [status, setStatus] = useState<FormStatus>("idle");
  const [invalidReason, setInvalidReason] = useState<InvalidReason>("fields");

  // Controlled inputs (the explicit difference from the FormData mirror): each
  // field is held in useState, validated in one validate() helper on submit.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [region, setRegion] = useState("");
  const [language, setLanguage] = useState<Locale>(locale);
  const [consent, setConsent] = useState(false);

  // One validate() helper. Returns the failing reason (or null when valid) so
  // the caller can set the right `invalid` message before any fetch.
  function validate(): InvalidReason | null {
    const cleanPhone = phone.replace(/[\s().-]/g, "");
    const emailOk = email.trim().length > 0 && email.length <= 160 && EMAIL_RE.test(email.trim());
    const passwordOk = password.length >= 8;
    const phoneOk = cleanPhone.length > 0 && PHONE_RE.test(cleanPhone);
    const roleOk = role !== "";
    const regionOk = region !== "";
    if (!emailOk || !passwordOk || !phoneOk || !roleOk || !regionOk) return "fields";
    // Consent is checked last and is load-bearing: Art. 9 special-category data
    // has no legitimate-interest fallback, so submit is BLOCKED until checked.
    if (!consent) return "consent";
    return null;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const reason = validate();
    if (reason) {
      // Set synchronously BEFORE any fetch when validate() fails (mirror health's
      // early return). Fields are NOT cleared.
      setInvalidReason(reason);
      setStatus("invalid");
      return;
    }

    const payload = {
      email: email.trim(),
      password,
      // Separators stripped client-side like health.
      phone: phone.replace(/[\s().-]/g, ""),
      role,
      region,
      language,
      consent: true,
      locale,
    };

    setStatus("submitting");
    try {
      const res = await fetch("/api/career/worker/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        // API 400 (server re-validation) → invalid; 500 / other → error.
        // Mirrors health's `res.status === 400 ? "invalid" : "error"`.
        if (res.status === 400) {
          setInvalidReason("fields");
          setStatus("invalid");
        } else {
          setStatus("error");
        }
        return;
      }
      // Duplicate email also returns { ok: true } (idempotent, anti-enumeration)
      // → the same success panel routes an existing worker forward harmlessly.
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  // Success ROUTES ONWARD (unlike the employer form): amber panel + amber CTA to
  // the profile builder, step 2. This replaces the form entirely.
  if (status === "success") {
    return (
      <div className="mt-6 rounded-xl bg-brandCareer-50 p-5 text-brandCareer-700 dark:bg-brandCareer/10 dark:text-brandCareer">
        <div className="flex items-center gap-3 text-sm font-semibold">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {t("successTitle")}
        </div>
        <p className="mt-1.5 text-sm text-brandCareer-700/90 dark:text-brandCareer/90">
          {t("successBody")}
        </p>
        <Link
          href="/career/worker/profile"
          className="mt-4 inline-flex items-center justify-center rounded-xl bg-brandCareer px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brandCareer/25 transition-colors hover:bg-brandCareer-700"
        >
          {t("successCta")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
      {/* Account group */}
      <p className="text-xs font-semibold uppercase tracking-wide text-brandCareer-700 dark:text-brandCareer">
        {t("accountGroup")}
      </p>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
          {t("emailLabel")} *
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
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
            {t("passwordLabel")} *
          </span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
            {t("phoneLabel")} *
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

      {/* Basics group (minimal — deep profile data lives in later wizard steps) */}
      <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-brandCareer-700 dark:text-brandCareer">
        {t("basicsGroup")}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
            {t("roleLabel")} *
          </span>
          <select
            name="role"
            required
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={inputClass}
          >
            <option value="" disabled>
              {t("rolePlaceholder")}
            </option>
            {ROLE_KEYS.map((key) => (
              <option key={key} value={key}>
                {tShared(`sectors.${key}.name`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
            {t("regionLabel")} *
          </span>
          <select
            name="region"
            required
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className={inputClass}
          >
            <option value="" disabled>
              {t("regionPlaceholder")}
            </option>
            {REGION_KEYS.map((key) => (
              <option key={key} value={key}>
                {tShared(`pool.region.${key}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-gray-400 dark:text-white/30">{t("regionHint")}</p>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70">
          {t("languageLabel")}
        </span>
        <select
          name="language"
          value={language}
          onChange={(e) => setLanguage(e.target.value as Locale)}
          className={inputClass}
        >
          {locales.map((code) => (
            <option key={code} value={code}>
              {LANGUAGE_LABELS[code]}
            </option>
          ))}
        </select>
      </label>

      {/* Consent — REQUIRED, load-bearing. The lawful basis for Art. 9 data;
          submit is BLOCKED until checked. Links to the localized privacy policy
          (next-intl resolves the slug). */}
      <label className="flex items-start gap-3 rounded-xl bg-brandCareer-50/40 p-3.5 dark:bg-brandCareer/5">
        <input
          name="consent"
          type="checkbox"
          required
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brandCareer accent-brandCareer focus:ring-brandCareer/20 dark:border-white/20"
        />
        <span className="text-xs leading-relaxed text-gray-700 dark:text-white/70">
          {t("consentLabel")}{" "}
          <Link
            href="/privacy"
            className="underline transition-colors hover:text-brandCareer-700 dark:hover:text-brandCareer"
          >
            {t("consentLink")}
          </Link>
        </span>
      </label>

      {(status === "error" || status === "invalid") && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {status === "error"
            ? t("errGeneric")
            : invalidReason === "consent"
              ? t("errConsentRequired")
              : t("errValidation")}
        </p>
      )}

      {/* "Free for you" reassurance strip — worker-side trust signal with no
          employer-side counterpart (R7: worker is NEVER charged). */}
      <p className="text-xs font-medium text-brandCareer-700 dark:text-brandCareer">
        {t("freeForYou")}
      </p>

      {/* Conversion CTA — the ONE solid amber button on the surface (NOT the
          waitlist gradient). Hover deepens toward brandCareer-700. */}
      <button
        type="submit"
        disabled={status === "submitting"}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl bg-brandCareer px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brandCareer/25 transition-colors hover:bg-brandCareer-700",
          status === "submitting" && "cursor-not-allowed opacity-70",
        )}
      >
        {status === "submitting" && <Loader2 className="h-4 w-4 animate-spin" />}
        {status === "submitting" ? t("submitting") : t("submit")}
      </button>

      <p className="text-center text-xs text-gray-500 dark:text-white/40">
        {t("haveAccount")}{" "}
        <Link
          href="/career/login"
          className="font-medium text-brandCareer-700 underline transition-colors hover:text-brandCareer dark:text-brandCareer"
        >
          {t("loginLink")}
        </Link>
      </p>
    </form>
  );
}
