"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertCircle,
  Briefcase,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FolderOpen,
  Loader2,
  ShieldCheck,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { submitProfessionalApplication } from "@/app/[locale]/become-a-pro/actions";
import { adoptOAuthAvatar } from "@/lib/actions/profile";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { trackEventWithMeta } from "@/lib/analytics/track";
import { useFormPersistence } from "@/lib/hooks/useFormPersistence";
import type { ServiceCategory, MultiLangText } from "@/types/glatko";
import type { Locale } from "@/i18n/routing";
import type { AnswersMap } from "@/lib/types/request-questions";

import { StepPersonalInfo } from "./StepPersonalInfo";
import { StepServiceAreas } from "./StepServiceAreas";
import { StepApplicationQuestions } from "./StepApplicationQuestions";
import { StepPortfolio, type PricingModel } from "./StepPortfolio";
import { StepDocuments } from "./StepDocuments";
import { StepReview } from "./StepReview";
import type { ProDocument } from "./DocumentsUploader";

const STEPS = [
  { icon: User, key: "personalInfo" },
  { icon: Briefcase, key: "serviceAreas" },
  { icon: ClipboardList, key: "applicationQuestions" },
  { icon: FolderOpen, key: "portfolio" },
  { icon: ShieldCheck, key: "documents" },
  { icon: Sparkles, key: "review" },
] as const;

interface Props {
  userId: string;
  categories: ServiceCategory[];
  userEmail: string;
  displayName: string | null;
  initialAvatarUrl: string | null;
}

interface Snapshot {
  businessName: string;
  bio: string;
  phone: string;
  city: string;
  languages: string[];
  experience: string;
  hourlyMin: string;
  hourlyMax: string;
  serviceRadiusKm: number;
  insuranceStatus: string;
  introductionVideoUrl: string;
  selectedCategoryIds: string[];
  primaryCategoryId: string;
  applicationAnswers: Record<string, AnswersMap>;
  portfolioImages: string[];
  pricing: PricingModel;
  companyDocuments: ProDocument[];
  step: number;
}

function categoryLabel(cat: ServiceCategory, locale: Locale): string {
  const n = cat.name as MultiLangText;
  return (
    n[locale] ??
    n.en ??
    n.tr ??
    (Object.values(n).find((v) => typeof v === "string") as string | undefined) ??
    cat.slug
  );
}

/**
 * G-PRO-1 Faz 5 — Pro onboarding wizard parent (6 steps). Orchestrates
 * Personal Info → Service Areas → Application Questions → Portfolio →
 * Documents → Review. State is persisted to localStorage (24h TTL) under
 * a per-user key so a refresh mid-form doesn't lose progress. Submit
 * fires submitProfessionalApplication which writes profile + services +
 * answers + portfolio + documents in one server-side transaction-ish
 * sequence.
 */
export function BecomeAProWizard({
  userId,
  categories,
  userEmail,
  displayName,
  initialAvatarUrl,
}: Props) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [isNarrow, setIsNarrow] = useState(false);
  // Anchor we scroll the submit error into view on (long form → top error box
  // alone is invisible from the bottom submit button; G-FUNNEL).
  const submitErrorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const [step, setStep] = useState(0);

  // G-UX-1: Her step değişikliğinde sayfayı en üste smooth-scroll. İlk
  // render'ı atlıyoruz (kullanıcı zaten üstte, gereksiz animasyon olmasın);
  // sonraki step transitions (Next/Back/draft restore) scroll tetikler.
  const isFirstStepRender = useRef(true);
  useEffect(() => {
    if (isFirstStepRender.current) {
      isFirstStepRender.current = false;
      return;
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [step]);

  // Step 1
  const [businessName, setBusinessName] = useState("");
  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [experience, setExperience] = useState("");
  const [hourlyMin, setHourlyMin] = useState("");
  const [hourlyMax, setHourlyMax] = useState("");
  const [serviceRadiusKm, setServiceRadiusKm] = useState(25);
  const [insuranceStatus, setInsuranceStatus] = useState("none");
  const [introductionVideoUrl, setIntroductionVideoUrl] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl?.trim() ?? "");

  // Step 2
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [primaryCategoryId, setPrimaryCategoryId] = useState("");
  const [expandedParent, setExpandedParent] = useState<string | null>(null);

  // Step 3
  const [applicationAnswers, setApplicationAnswers] = useState<
    Record<string, AnswersMap>
  >({});

  // Step 4
  const [portfolioImages, setPortfolioImages] = useState<string[]>([]);
  const [pricing, setPricing] = useState<PricingModel>({
    type: "hourly",
    baseRate: "",
    currency: "EUR",
  });

  // Step 5
  const [companyDocuments, setCompanyDocuments] = useState<ProDocument[]>([]);

  // Submit/state
  const [isPending, startTransition] = useTransition();
  const [submitState, setSubmitState] = useState<{ success: boolean; error?: string }>({
    success: false,
  });

  useEffect(() => {
    setAvatarUrl(initialAvatarUrl?.trim() ?? "");
  }, [initialAvatarUrl]);

  // G-FUNNEL: if the user has no avatar yet but signed up via an OAuth
  // provider that carries a profile picture (e.g. Google), adopt it once on
  // mount so most users skip the upload entirely. No-op for users without a
  // provider picture (they add one via the single-step uploader). Best-effort.
  const oauthAdoptTried = useRef(false);
  useEffect(() => {
    if (oauthAdoptTried.current) return;
    if (initialAvatarUrl && initialAvatarUrl.trim().length > 0) return;
    oauthAdoptTried.current = true;
    let active = true;
    void adoptOAuthAvatar()
      .then((res) => {
        if (active && "success" in res && res.success && res.url) {
          setAvatarUrl(res.url);
          router.refresh();
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [initialAvatarUrl, router]);

  // Helpers
  const parents = useMemo(() => categories.filter((c) => !c.parent_id), [
    categories,
  ]);
  const childrenOf = useCallback(
    (parentId: string) => categories.filter((c) => c.parent_id === parentId),
    [categories],
  );

  const toggleLanguage = (lang: string) =>
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );

  const toggleCategory = (id: string) =>
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );

  // Auto-sync primaryCategoryId to the first selected category. Without this
  // users hit a stuck state on step 2: they tick a sub-category, see the
  // green ring on the parent card, click "Next" — but the primary-service
  // radio (rendered below the cards) defaults to empty, so step2Ok stays
  // false and the button is disabled with no visible reason. Auto-picking
  // the first selection is a standard pattern; users can still change it
  // via the radios, and removing the current primary reassigns to the
  // first remaining selection.
  useEffect(() => {
    if (selectedCategoryIds.length === 0) {
      if (primaryCategoryId !== "") setPrimaryCategoryId("");
      return;
    }
    if (!primaryCategoryId || !selectedCategoryIds.includes(primaryCategoryId)) {
      setPrimaryCategoryId(selectedCategoryIds[0]);
    }
  }, [selectedCategoryIds, primaryCategoryId]);

  // Resolve selected categories with display names + root slugs (for
  // StepApplicationQuestions which keys answers by root-slug).
  const selectedCategoryRefs = useMemo(() => {
    return selectedCategoryIds
      .map((id) => {
        const cat = categories.find((c) => c.id === id);
        if (!cat) return null;
        const rootCat =
          categories.find((c) => c.id === cat.parent_id) ?? cat;
        return {
          slug: rootCat.slug,
          name: categoryLabel(rootCat, locale),
        };
      })
      .filter((x): x is { slug: string; name: string } => Boolean(x));
  }, [selectedCategoryIds, categories, locale]);

  // Deduplicate roots (single question set per root, even if multiple
  // sub-categories of the same root are picked).
  const dedupedCategoryRefs = useMemo(() => {
    const seen = new Set<string>();
    const out: { slug: string; name: string }[] = [];
    for (const r of selectedCategoryRefs) {
      if (seen.has(r.slug)) continue;
      seen.add(r.slug);
      out.push(r);
    }
    return out;
  }, [selectedCategoryRefs]);

  const reviewCategories = useMemo(() => {
    return selectedCategoryIds.map((id) => {
      const cat = categories.find((c) => c.id === id);
      return {
        slug: cat?.slug ?? id,
        name: cat ? categoryLabel(cat, locale) : id,
        isPrimary: primaryCategoryId === id,
      };
    });
  }, [selectedCategoryIds, categories, locale, primaryCategoryId]);

  const applicationAnswerCount = useMemo(() => {
    let count = 0;
    for (const slug of Object.keys(applicationAnswers)) {
      const map = applicationAnswers[slug];
      for (const k of Object.keys(map)) {
        const v = map[k];
        if (v === null || v === undefined) continue;
        if (typeof v === "string" && v.trim().length === 0) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        count += 1;
      }
    }
    return count;
  }, [applicationAnswers]);

  // Live (client-side) profile completion preview. The DB RPC is
  // canonical post-save; this is a UX hint only.
  const completionScore = useMemo(() => {
    let s = 0;
    if (businessName.trim()) s += 10;
    if (bio.trim().length >= 100) s += 10;
    if (phone.trim()) s += 5;
    if (city) s += 10;
    if (languages.length >= 2) s += 5;
    if (selectedCategoryIds.length > 0) s += 10;
    if (Number(experience) > 0) s += 5;
    if (Number(hourlyMin) > 0) s += 5;
    if (portfolioImages.length >= 3) s += 15;
    if (companyDocuments.length > 0) s += 10;
    if (introductionVideoUrl.trim()) s += 10;
    if (insuranceStatus && insuranceStatus !== "none") s += 5;
    return Math.min(100, s);
  }, [
    businessName,
    bio,
    phone,
    city,
    languages,
    selectedCategoryIds,
    experience,
    hourlyMin,
    portfolioImages,
    companyDocuments,
    introductionVideoUrl,
    insuranceStatus,
  ]);

  const missingFields = useMemo(() => {
    const out: string[] = [];
    if (bio.trim().length < 100)
      out.push(t("becomePro.completionGauge.missing.bio"));
    if (portfolioImages.length < 3)
      out.push(t("becomePro.completionGauge.missing.portfolio"));
    if (companyDocuments.length === 0)
      out.push(t("becomePro.completionGauge.missing.documents"));
    if (!introductionVideoUrl.trim())
      out.push(t("becomePro.completionGauge.missing.introVideo"));
    if (Number(hourlyMin) === 0)
      out.push(t("becomePro.completionGauge.missing.hourlyRate"));
    return out;
  }, [bio, portfolioImages, companyDocuments, introductionVideoUrl, hourlyMin, t]);

  // Persistence
  const snapshot: Snapshot = useMemo(
    () => ({
      businessName,
      bio,
      phone,
      city,
      languages,
      experience,
      hourlyMin,
      hourlyMax,
      serviceRadiusKm,
      insuranceStatus,
      introductionVideoUrl,
      selectedCategoryIds,
      primaryCategoryId,
      applicationAnswers,
      portfolioImages,
      pricing,
      companyDocuments,
      step,
    }),
    [
      businessName,
      bio,
      phone,
      city,
      languages,
      experience,
      hourlyMin,
      hourlyMax,
      serviceRadiusKm,
      insuranceStatus,
      introductionVideoUrl,
      selectedCategoryIds,
      primaryCategoryId,
      applicationAnswers,
      portfolioImages,
      pricing,
      companyDocuments,
      step,
    ],
  );

  const restore = useCallback((data: Snapshot) => {
    setBusinessName(data.businessName ?? "");
    setBio(data.bio ?? "");
    setPhone(data.phone ?? "");
    setCity(data.city ?? "");
    setLanguages(Array.isArray(data.languages) ? data.languages : []);
    setExperience(data.experience ?? "");
    setHourlyMin(data.hourlyMin ?? "");
    setHourlyMax(data.hourlyMax ?? "");
    setServiceRadiusKm(typeof data.serviceRadiusKm === "number" ? data.serviceRadiusKm : 25);
    setInsuranceStatus(data.insuranceStatus ?? "none");
    setIntroductionVideoUrl(data.introductionVideoUrl ?? "");
    setSelectedCategoryIds(
      Array.isArray(data.selectedCategoryIds) ? data.selectedCategoryIds : [],
    );
    setPrimaryCategoryId(data.primaryCategoryId ?? "");
    setApplicationAnswers(data.applicationAnswers ?? {});
    setPortfolioImages(
      Array.isArray(data.portfolioImages) ? data.portfolioImages : [],
    );
    setPricing(
      data.pricing ?? { type: "hourly", baseRate: "", currency: "EUR" },
    );
    setCompanyDocuments(
      Array.isArray(data.companyDocuments) ? data.companyDocuments : [],
    );
    if (typeof data.step === "number" && data.step >= 0 && data.step < STEPS.length) {
      setStep(data.step);
    }
  }, []);

  const { restored, clearDraft } = useFormPersistence({
    key: `pro-onboarding:${userId}`,
    enabled: true,
    snapshot,
    restore,
  });

  const [draftBannerVisible, setDraftBannerVisible] = useState(false);
  useEffect(() => {
    if (restored) setDraftBannerVisible(true);
  }, [restored]);

  // Validation gate per step
  const applicationValidateRef = useRef<(() => boolean) | null>(null);

  // Avatar is no longer part of the step-0 gate (G-FUNNEL): it is optional.
  const step1Ok =
    businessName.trim().length > 0 && phone.trim().length > 0 && Boolean(city);
  const step2Ok = selectedCategoryIds.length > 0 && Boolean(primaryCategoryId);
  const step4Ok = pricing.baseRate.trim().length > 0 && Number(pricing.baseRate) > 0;

  // Reason the "Next" button is disabled for the current step (shown inline
  // so the user knows what is missing instead of facing a dead grey button).
  const nextDisabledReason = useMemo(() => {
    if (step === 0 && !step1Ok) return t("pro.wizard.nextHint.step0");
    if (step === 1 && !step2Ok) return t("pro.wizard.nextHint.step1");
    if (step === 3 && !step4Ok) return t("pro.wizard.nextHint.step3");
    return null;
  }, [step, step1Ok, step2Ok, step4Ok, t]);

  function tryAdvance() {
    if (step === 0 && !step1Ok) return;
    if (step === 1 && !step2Ok) return;
    if (step === 2) {
      const pass = applicationValidateRef.current?.() ?? true;
      if (!pass) return;
    }
    if (step === 3 && !step4Ok) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  function handleSubmit() {
    const fd = new FormData();
    fd.set("businessName", businessName);
    fd.set("bio", bio);
    fd.set("phone", phone);
    fd.set("city", city);
    fd.set("yearsExperience", experience);
    fd.set("hourlyRateMin", hourlyMin);
    fd.set("hourlyRateMax", hourlyMax);
    fd.set("serviceRadiusKm", String(serviceRadiusKm));
    fd.set("insuranceStatus", insuranceStatus);
    fd.set("introductionVideoUrl", introductionVideoUrl.trim());
    languages.forEach((l) => fd.append("languages", l));
    selectedCategoryIds.forEach((id) => fd.append("categoryIds", id));
    fd.set("primaryCategoryId", primaryCategoryId);
    fd.set("applicationAnswers", JSON.stringify(applicationAnswers));
    fd.set("portfolioImages", JSON.stringify(portfolioImages));
    fd.set("pricingModel", JSON.stringify(pricing));
    fd.set("companyDocuments", JSON.stringify(companyDocuments));

    startTransition(async () => {
      const result = await submitProfessionalApplication(submitState, fd);
      setSubmitState(result);
      if (result.success) {
        // Supply-side conversion (G-ADS): pro application submitted. Fired only
        // on server-confirmed success, mirroring customer_job_posted on the
        // demand side. Powers pro-acquisition Search/Demand Gen optimization.
        trackEventWithMeta("pro_signup", {
          provider_id: userId,
          job_category: primaryCategoryId || undefined,
          event_category: "pro_funnel",
        });
        clearDraft();
        // Re-render the server page → it now finds the new profile and shows
        // the persistent application-status surface (not an ephemeral card).
        router.refresh();
      } else if (result.error) {
        // Long form: pull the error (and the submit button) into view so the
        // user actually sees why nothing happened.
        requestAnimationFrame(() => {
          submitErrorRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        });
      }
    });
  }

  const stepTransition = { duration: isNarrow ? 0.15 : 0.25 };
  const progressFillDuration = isNarrow ? 0.25 : 0.4;

  if (submitState.success) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto flex min-h-[40vh] max-w-2xl flex-col items-center justify-center px-4 text-center sm:px-6 lg:px-8"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-500/10">
          <CheckCircle className="h-8 w-8 text-teal-500" />
        </div>
        <h2 className="mt-6 text-2xl font-semibold text-gray-900 dark:text-white">
          {t("becomePro.success.title")}
        </h2>
        <p className="mt-2 max-w-md text-gray-500 dark:text-white/50">
          {t("becomePro.success.message")}
        </p>
      </motion.div>
    );
  }

  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-gray-200/80 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.04] dark:shadow-none md:p-10">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
            {t("pro.wizard.title")}
          </h1>
          <p className="mt-2 text-gray-500 dark:text-white/50">
            {t("pro.wizard.subtitle")}
          </p>
        </div>

        {draftBannerVisible && (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-3 text-sm text-teal-700 dark:text-teal-300">
            <span>{t("becomePro.draftRestoredBanner")}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  clearDraft();
                  setDraftBannerVisible(false);
                  setStep(0);
                  setBusinessName("");
                  setBio("");
                  setPhone("");
                  setCity("");
                  setLanguages([]);
                  setExperience("");
                  setHourlyMin("");
                  setHourlyMax("");
                  setServiceRadiusKm(25);
                  setInsuranceStatus("none");
                  setIntroductionVideoUrl("");
                  setSelectedCategoryIds([]);
                  setPrimaryCategoryId("");
                  setApplicationAnswers({});
                  setPortfolioImages([]);
                  setPricing({ type: "hourly", baseRate: "", currency: "EUR" });
                  setCompanyDocuments([]);
                }}
                className="rounded-lg px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-500/15 dark:text-teal-300"
              >
                {t("becomePro.startFresh")}
              </button>
              <button
                type="button"
                onClick={() => setDraftBannerVisible(false)}
                className="rounded-full p-1 text-teal-700 hover:bg-teal-500/15 dark:text-teal-300"
                aria-label={t("becomePro.dismiss")}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        )}

        <div className="mb-10 flex items-center gap-1.5 px-0.5 sm:gap-2 md:px-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = i <= step;
            return (
              <div key={s.key} className="flex flex-1 items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors",
                    active
                      ? "border-teal-500 bg-gradient-to-br from-teal-400 to-teal-600 text-white shadow-md shadow-teal-500/25"
                      : "border-gray-200 dark:border-white/10 text-gray-400 dark:text-white/30",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                {i < STEPS.length - 1 && (
                  <div className="h-1 flex-1 rounded-full bg-gray-100 dark:bg-white/5 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-teal-500 to-teal-400"
                      initial={false}
                      animate={{ width: i < step ? "100%" : "0%" }}
                      transition={{ duration: progressFillDuration }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={stepTransition}
          >
            {step === 0 && (
              <StepPersonalInfo
                businessName={businessName}
                setBusinessName={setBusinessName}
                bio={bio}
                setBio={setBio}
                phone={phone}
                setPhone={setPhone}
                city={city}
                setCity={setCity}
                languages={languages}
                toggleLanguage={toggleLanguage}
                experience={experience}
                setExperience={setExperience}
                hourlyMin={hourlyMin}
                setHourlyMin={setHourlyMin}
                hourlyMax={hourlyMax}
                setHourlyMax={setHourlyMax}
                serviceRadiusKm={serviceRadiusKm}
                setServiceRadiusKm={setServiceRadiusKm}
                insuranceStatus={insuranceStatus}
                setInsuranceStatus={setInsuranceStatus}
                introductionVideoUrl={introductionVideoUrl}
                setIntroductionVideoUrl={setIntroductionVideoUrl}
                userEmail={userEmail}
                displayName={displayName}
                avatarUrl={avatarUrl}
                onAvatarUrlChange={setAvatarUrl}
                t={t}
              />
            )}

            {step === 1 && (
              <StepServiceAreas
                parents={parents}
                childrenOf={childrenOf}
                allCategories={categories}
                selectedCategoryIds={selectedCategoryIds}
                toggleCategory={toggleCategory}
                primaryCategoryId={primaryCategoryId}
                setPrimaryCategoryId={setPrimaryCategoryId}
                expandedParent={expandedParent}
                setExpandedParent={setExpandedParent}
                locale={locale}
                t={t}
              />
            )}

            {step === 2 && (
              <StepApplicationQuestions
                categories={dedupedCategoryRefs}
                answers={applicationAnswers}
                setAnswers={setApplicationAnswers}
                locale={locale}
                t={(k) => t(k)}
                validateRef={applicationValidateRef}
              />
            )}

            {step === 3 && (
              <StepPortfolio
                userId={userId}
                portfolioImages={portfolioImages}
                setPortfolioImages={setPortfolioImages}
                pricing={pricing}
                setPricing={setPricing}
                t={(k) => t(k)}
              />
            )}

            {step === 4 && (
              <StepDocuments
                userId={userId}
                documents={companyDocuments}
                setDocuments={setCompanyDocuments}
                t={(k) => t(k)}
              />
            )}

            {step === 5 && (
              <StepReview
                businessName={businessName}
                bio={bio}
                city={city}
                languages={languages}
                experience={experience}
                selectedCategories={reviewCategories}
                applicationAnswerCount={applicationAnswerCount}
                portfolioCount={portfolioImages.length}
                documentsCount={companyDocuments.length}
                pricingType={pricing.type}
                pricingBaseRate={pricing.baseRate}
                completionScore={completionScore}
                missingFields={missingFields}
                t={(k) => t(k)}
              />
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-8">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-medium transition-all sm:w-auto",
              step === 0
                ? "hidden"
                : "text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/5",
            )}
          >
            <ChevronLeft className="h-4 w-4" />
            {t("pro.wizard.back")}
          </button>

          {!isLastStep ? (
            <button
              type="button"
              onClick={tryAdvance}
              disabled={
                (step === 0 && !step1Ok) ||
                (step === 1 && !step2Ok) ||
                (step === 3 && !step4Ok)
              }
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all sm:w-auto",
                "hover:from-teal-600 hover:to-teal-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {t("pro.wizard.next")}
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={isPending}
              onClick={handleSubmit}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all sm:w-auto",
                "hover:from-teal-600 hover:to-teal-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("becomePro.submit")
              )}
            </button>
          )}
          </div>

          {!isLastStep && nextDisabledReason && (
            <p className="mt-3 text-center text-xs font-medium text-amber-700 dark:text-amber-400 sm:text-right">
              {nextDisabledReason}
            </p>
          )}

          {isLastStep && submitState.error && (
            <div
              ref={submitErrorRef}
              className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{submitState.error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
