"use client";

import { cn } from "@/lib/utils";
import type { useTranslations } from "next-intl";
import { ProWizardAvatarUpload } from "./ProWizardAvatarUpload";

const CITY_SLUGS = [
  "budva",
  "kotor",
  "tivat",
  "podgorica",
  "hercegNovi",
  "bar",
  "ulcinj",
] as const;

// Canonical lowercase codes (DB stores these); the UI uppercases them for
// display via CSS (text-transform), never by storing upper-cased values.
const LANGUAGES = ["tr", "en", "de", "it", "ru", "uk", "sr", "me", "ar"];

const inputCls = cn(
  "w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5",
  "py-3 px-4 text-sm text-gray-900 dark:text-white",
  "placeholder:text-gray-400 dark:placeholder:text-white/30",
  "focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/30 transition-all"
);

const labelCls = "text-xs font-medium text-gray-500 dark:text-white/50 mb-1.5";

const INSURANCE_STATUSES = [
  "none",
  "private",
  "business",
  "professional",
] as const;

export interface StepPersonalInfoProps {
  businessName: string;
  setBusinessName: (v: string) => void;
  bio: string;
  setBio: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  city: string;
  setCity: (v: string) => void;
  languages: string[];
  toggleLanguage: (lang: string) => void;
  experience: string;
  setExperience: (v: string) => void;
  hourlyMin: string;
  setHourlyMin: (v: string) => void;
  hourlyMax: string;
  setHourlyMax: (v: string) => void;
  /** G-PRO-1: service radius (km) — slider 5-100. */
  serviceRadiusKm: number;
  setServiceRadiusKm: (v: number) => void;
  /** G-PRO-1: pro insurance status. */
  insuranceStatus: string;
  setInsuranceStatus: (v: string) => void;
  /** G-PRO-1: introduction video URL (optional, e.g. YouTube/Vimeo). */
  introductionVideoUrl: string;
  setIntroductionVideoUrl: (v: string) => void;
  userEmail: string;
  displayName: string | null;
  avatarUrl: string;
  onAvatarUrlChange: (url: string) => void;
  t: ReturnType<typeof useTranslations>;
}

export function StepPersonalInfo({
  businessName,
  setBusinessName,
  bio,
  setBio,
  phone,
  setPhone,
  city,
  setCity,
  languages,
  toggleLanguage,
  experience,
  setExperience,
  hourlyMin,
  setHourlyMin,
  hourlyMax,
  setHourlyMax,
  serviceRadiusKm,
  setServiceRadiusKm,
  insuranceStatus,
  setInsuranceStatus,
  introductionVideoUrl,
  setIntroductionVideoUrl,
  userEmail,
  displayName,
  avatarUrl,
  onAvatarUrlChange,
  t,
}: StepPersonalInfoProps) {
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
        {t("pro.wizard.step1Title")}
      </h2>

      <ProWizardAvatarUpload
        displayName={displayName}
        email={userEmail}
        initialUrl={avatarUrl || null}
        onUrlChange={onAvatarUrlChange}
      />

      <div>
        <label className={labelCls}>{t("pro.wizard.businessName")}</label>
        <input
          className={inputCls}
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder={t("pro.wizard.businessNamePlaceholder")}
        />
      </div>

      <div>
        <label className={labelCls}>{t("pro.wizard.bio")}</label>
        <textarea
          className={cn(inputCls, "min-h-[100px] resize-y")}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder={t("pro.wizard.bioPlaceholder")}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{t("pro.wizard.phone")}</label>
          <input
            className={inputCls}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+382 ..."
          />
        </div>
        <div>
          <label className={labelCls}>{t("pro.wizard.city")}</label>
          <select
            className={inputCls}
            value={city}
            onChange={(e) => setCity(e.target.value)}
          >
            <option value="">{t("pro.wizard.selectCity")}</option>
            {CITY_SLUGS.map((slug) => (
              <option key={slug} value={slug}>
                {t(`cities.${slug}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>{t("pro.wizard.languages")}</label>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => toggleLanguage(lang)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium uppercase transition-all",
                languages.includes(lang)
                  ? "bg-teal-500 text-white"
                  : "border border-gray-200 dark:border-white/10 text-gray-600 dark:text-white/50 hover:border-teal-500/50"
              )}
            >
              {lang}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div>
          <label className={labelCls}>{t("pro.wizard.experience")}</label>
          <input
            className={inputCls}
            type="number"
            min={0}
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <label className={labelCls}>{t("pro.wizard.hourlyMin")}</label>
          <input
            className={inputCls}
            type="number"
            min={0}
            value={hourlyMin}
            onChange={(e) => setHourlyMin(e.target.value)}
            placeholder="EUR"
          />
        </div>
        <div>
          <label className={labelCls}>{t("pro.wizard.hourlyMax")}</label>
          <input
            className={inputCls}
            type="number"
            min={0}
            value={hourlyMax}
            onChange={(e) => setHourlyMax(e.target.value)}
            placeholder="EUR"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100/80 bg-white/40 p-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
        <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
          {t("becomePro.personalInfo.premiumFieldsTitle")}
        </h3>

        <div className="space-y-5">
          <div>
            <label className={labelCls}>
              {t("becomePro.personalInfo.serviceRadiusLabel")}
              <span className="ml-2 text-teal-600 dark:text-teal-400">
                {serviceRadiusKm} km
              </span>
            </label>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={serviceRadiusKm}
              onChange={(e) => setServiceRadiusKm(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-teal-500 dark:bg-white/10"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-white/40">
              {t("becomePro.personalInfo.serviceRadiusHint")}
            </p>
          </div>

          <div>
            <label className={labelCls}>
              {t("becomePro.personalInfo.insuranceLabel")}
            </label>
            <div className="flex flex-wrap gap-2">
              {INSURANCE_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setInsuranceStatus(s)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-xs font-medium transition-all",
                    insuranceStatus === s
                      ? "border-teal-500 bg-teal-500 text-white shadow-md shadow-teal-500/25"
                      : "border-gray-200 bg-white text-gray-700 hover:border-teal-500/40 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70",
                  )}
                >
                  {t(`becomePro.personalInfo.insurance.${s}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>
              {t("becomePro.personalInfo.introVideoLabel")}
              <span className="ml-2 text-gray-400">
                ({t("becomePro.optional")})
              </span>
            </label>
            <input
              className={inputCls}
              type="url"
              value={introductionVideoUrl}
              onChange={(e) => setIntroductionVideoUrl(e.target.value)}
              placeholder="https://youtube.com/..."
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-white/40">
              {t("becomePro.personalInfo.introVideoHint")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
