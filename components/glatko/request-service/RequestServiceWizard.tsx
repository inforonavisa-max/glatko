"use client";

import {
  useState,
  useCallback,
  useMemo,
  useTransition,
  useEffect,
  useRef,
  Suspense,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import {
  Layers,
  FileText,
  MapPin,
  Camera,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Check,
  ClipboardList,
  Star,
  X,
} from "lucide-react";
import { createClient } from "@/supabase/browser";
import { submitServiceRequest } from "@/app/[locale]/request-service/actions";
import { cn } from "@/lib/utils";
import { trackEventWithMeta } from "@/lib/analytics/track";
import { urgencyToStep3Key } from "@/lib/utils/urgencyI18n";
import { useFormPersistence } from "@/lib/hooks/useFormPersistence";
import { StepCategory } from "./StepCategory";
import { StepDetails } from "./StepDetails";
import { StepLocation } from "./StepLocation";
import { StepPhotos } from "./StepPhotos";
import { RequestConfirmation } from "./RequestConfirmation";
import type { ServiceCategory } from "@/types/glatko";
import type { Locale } from "@/i18n/routing";

interface Props {
  categories: ServiceCategory[];
  /**
   * Auth user id from the server page. `null` triggers the anonymous
   * flow: required email, localStorage draft persistence, and a different
   * submit-screen helper hint. The server action re-reads cookies for
   * authorization, so this is purely UX state.
   */
  userId: string | null;
}

const STEPS = [
  { icon: Layers, key: "category" },
  { icon: FileText, key: "details" },
  { icon: MapPin, key: "location" },
  { icon: Camera, key: "photos" },
] as const;

type PreferredProSummary = {
  id: string;
  business_name: string | null;
  avg_rating: number;
  total_reviews: number;
  categories: string[];
};

function RequestServiceWizardInner({ categories, userId }: Props) {
  const isAnonymous = !userId;
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const searchParams = useSearchParams();
  const preferredProId = searchParams.get("pro");
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const [selectedMainId, setSelectedMainId] = useState("");
  const [selectedSubId, setSelectedSubId] = useState("");
  const [details, setDetails] = useState<Record<string, unknown>>({});

  const [municipality, setMunicipality] = useState("");
  const [address, setAddress] = useState("");
  const [marina, setMarina] = useState("");
  const [urgency, setUrgency] = useState("flexible");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  const [photos, setPhotos] = useState<string[]>([]);
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [showBudget, setShowBudget] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // G-REQ-1: validateRef lets the DB-driven StepDetails own its
  // per-question validation. Parent calls .current?.() on advance.
  const detailsValidateRef = useRef<(() => boolean) | null>(null);

  // G-REQ-1 Faz 5: localStorage draft persistence (anonymous users only).
  // We snapshot every wizard state slice into a single shape so the hook
  // can serialize/restore atomically. Login users get nothing — their
  // server-side request history is the source of truth.
  const draftSnapshot = useMemo(
    () => ({
      selectedMainId,
      selectedSubId,
      details,
      municipality,
      address,
      marina,
      urgency,
      dateStart,
      dateEnd,
      photos,
      budgetMin,
      budgetMax,
      showBudget,
      phone,
      email,
      title,
      description,
    }),
    [
      selectedMainId,
      selectedSubId,
      details,
      municipality,
      address,
      marina,
      urgency,
      dateStart,
      dateEnd,
      photos,
      budgetMin,
      budgetMax,
      showBudget,
      phone,
      email,
      title,
      description,
    ],
  );

  type DraftShape = typeof draftSnapshot;

  const restoreDraft = useCallback((s: DraftShape) => {
    if (s.selectedMainId) setSelectedMainId(s.selectedMainId);
    if (s.selectedSubId) setSelectedSubId(s.selectedSubId);
    if (s.details) setDetails(s.details);
    if (s.municipality) setMunicipality(s.municipality);
    if (s.address) setAddress(s.address);
    if (s.marina) setMarina(s.marina);
    if (s.urgency) setUrgency(s.urgency);
    if (s.dateStart) setDateStart(s.dateStart);
    if (s.dateEnd) setDateEnd(s.dateEnd);
    if (s.photos) setPhotos(s.photos);
    if (s.budgetMin) setBudgetMin(s.budgetMin);
    if (s.budgetMax) setBudgetMax(s.budgetMax);
    if (typeof s.showBudget === "boolean") setShowBudget(s.showBudget);
    if (s.phone) setPhone(s.phone);
    if (s.email) setEmail(s.email);
    if (s.title) setTitle(s.title);
    if (s.description) setDescription(s.description);
  }, []);

  const { clearDraft, restored: draftRestored } = useFormPersistence<DraftShape>({
    key: "wizard-v1",
    enabled: isAnonymous,
    snapshot: draftSnapshot,
    restore: restoreDraft,
  });

  const [draftBannerDismissed, setDraftBannerDismissed] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [summaryData, setSummaryData] = useState<{
    category: string;
    city: string;
    urgency: string;
    budget?: string;
  } | null>(null);

  const [preferredPro, setPreferredPro] = useState<PreferredProSummary | null>(
    null
  );
  const [preferredProLoading, setPreferredProLoading] = useState(false);
  const [preferredProError, setPreferredProError] = useState(false);

  useEffect(() => {
    if (!preferredProId) {
      setPreferredPro(null);
      setPreferredProLoading(false);
      setPreferredProError(false);
      return;
    }

    let cancelled = false;
    setPreferredProLoading(true);
    setPreferredProError(false);

    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("glatko_professional_profiles")
        .select(
          `
          id,
          business_name,
          avg_rating,
          total_reviews,
          is_active,
          is_verified,
          services:glatko_pro_services(
            category:glatko_service_categories(name)
          )
        `
        )
        .eq("id", preferredProId)
        .eq("is_active", true)
        .maybeSingle();

      if (cancelled) return;
      setPreferredProLoading(false);

      if (error || !data) {
        setPreferredPro(null);
        setPreferredProError(true);
        return;
      }

      const svc = data.services as
        | { category?: { name?: Record<string, string> } | null }[]
        | null;
      const catLabels: string[] = [];
      for (const s of svc || []) {
        const n = s.category?.name;
        if (n && typeof n === "object") {
          const label =
            n[locale] ?? n.en ?? Object.values(n).find((v) => typeof v === "string");
          if (label) catLabels.push(String(label));
        }
      }
      const uniqueCats = Array.from(new Set(catLabels));

      setPreferredPro({
        id: data.id as string,
        business_name: data.business_name as string | null,
        avg_rating: Number(data.avg_rating) || 0,
        total_reviews: Number(data.total_reviews) || 0,
        categories: uniqueCats,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [preferredProId, locale]);

  const clearPreferredProfessional = useCallback(() => {
    setPreferredPro(null);
    setPreferredProError(false);
    router.replace("/request-service");
  }, [router]);

  const parents = categories.filter((c) => !c.parent_id);

  const selectedParent = parents.find((p) => p.id === selectedMainId);
  const parentSlug = selectedParent?.slug ?? "";

  const allChildren = categories.filter((c) => c.parent_id !== null);
  const selectedSub = allChildren.find((c) => c.id === selectedSubId);
  const selectedSubSlug = selectedSub?.slug ?? "";

  const isBoat = parentSlug === "boat-services";

  const catName = useCallback(
    (cat: ServiceCategory) => cat.name[locale] ?? cat.name.en ?? cat.slug,
    [locale]
  );

  const autoTitle =
    selectedSub && municipality
      ? `${catName(selectedSub)} - ${municipality}`
      : "";

  useEffect(() => {
    if (autoTitle && !title) setTitle(autoTitle);
  }, [autoTitle, title]);

  const canAdvance = (): boolean => {
    if (step === 0) return !!selectedSubId;
    if (step === 1) return true;
    if (step === 2) return !!municipality;
    return true;
  };

  const goNext = () => {
    // Step 1 (details) is DB-driven; defer to its own validate() before
    // advancing so missing required answers surface inline rather than
    // hiding behind a server-side reject.
    if (step === 1 && detailsValidateRef.current) {
      if (!detailsValidateRef.current()) return;
    }
    setDirection(1);
    setStep((s) => s + 1);
  };

  const goBack = () => {
    setDirection(-1);
    setStep((s) => s - 1);
  };

  const handleSubmit = () => {
    setError("");
    // G-REQ-1 anonim flow: email is required so the admin moderation
    // queue (and approve/reject mailers) have a way to reach the user.
    if (isAnonymous) {
      const trimmed = email.trim();
      if (!trimmed) {
        setError(t("request.anonymous.emailRequired"));
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        setError(t("request.anonymous.emailInvalid"));
        return;
      }
    }
    const fd = new FormData();
    fd.set("categoryId", selectedSubId);
    fd.set("title", title || autoTitle);
    fd.set("description", description);
    fd.set("details", JSON.stringify(details));
    fd.set("municipality", municipality);
    fd.set("address", address);
    if (showBudget && budgetMin) fd.set("budgetMin", budgetMin);
    if (showBudget && budgetMax) fd.set("budgetMax", budgetMax);
    fd.set("urgency", urgency);
    if (dateStart) fd.set("dateStart", dateStart);
    if (dateEnd) fd.set("dateEnd", dateEnd);
    fd.set("photos", JSON.stringify(photos));
    fd.set("phone", phone);
    fd.set("email", email);
    fd.set("locale", locale);
    fd.set("summaryLocale", locale);
    if (preferredPro?.id) {
      fd.set("preferredProfessionalId", preferredPro.id);
    }

    startTransition(async () => {
      const result = await submitServiceRequest(fd);
      if (result.success) {
        // G-ADS-3: primary customer conversion event — job posted.
        // Fired only on server-confirmed success, before UI state flips.
        trackEventWithMeta("customer_job_posted", {
          job_id: result.requestId,
          job_category: result.categoryLabel ?? undefined,
        });
        const categoryDisplay =
          (result.categoryLabel && result.categoryLabel.trim()) ||
          (selectedSub ? catName(selectedSub) : "") ||
          t("request.confirmation.categoryUnknown");
        setSummaryData({
          category: categoryDisplay,
          city: municipality,
          urgency: t(`request.step3.urgency.${urgencyToStep3Key(urgency)}`),
          budget:
            showBudget && budgetMin
              ? `${budgetMin}${budgetMax ? ` - ${budgetMax}` : "+"} EUR`
              : undefined,
        });
        setSubmitted(true);
        clearDraft();
      } else {
        setError(result.error ?? t("request.error.generic"));
      }
    });
  };

  const resetWizard = () => {
    setStep(0);
    setDirection(1);
    setSelectedMainId("");
    setSelectedSubId("");
    setDetails({});
    setMunicipality("");
    setAddress("");
    setMarina("");
    setUrgency("flexible");
    setDateStart("");
    setDateEnd("");
    setPhotos([]);
    setBudgetMin("");
    setBudgetMax("");
    setShowBudget(false);
    setPhone("");
    setEmail("");
    setTitle("");
    setDescription("");
    setError("");
    setSubmitted(false);
    setSummaryData(null);
    clearDraft();
    setDraftBannerDismissed(false);
    router.replace("/request-service");
  };

  if (submitted && summaryData) {
    return (
      <RequestConfirmation
        requestSummary={summaryData}
        onCreateAnother={resetWizard}
        t={t}
      />
    );
  }

  const dur = isNarrow ? 0.15 : 0.25;

  return (
    <div className="mx-auto max-w-3xl">
      {draftRestored && !draftBannerDismissed ? (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-teal-500/20 bg-teal-500/10 px-4 py-3 text-sm text-teal-800 dark:border-teal-500/30 dark:bg-teal-500/15 dark:text-teal-200">
          <span>{t("request.draftRestored")}</span>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => {
                clearDraft();
                if (typeof window !== "undefined") window.location.reload();
              }}
              className="font-medium underline underline-offset-2 hover:text-teal-700 dark:hover:text-teal-100"
            >
              {t("request.startFresh")}
            </button>
            <button
              type="button"
              onClick={() => setDraftBannerDismissed(true)}
              className="rounded-md p-1 text-teal-700/70 transition hover:bg-teal-500/15 hover:text-teal-900 dark:text-teal-200/70 dark:hover:text-teal-100"
              aria-label={t("common.close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="mb-10 text-center">
        <h1 className="font-serif text-3xl font-semibold text-gray-900 dark:text-white">
          {t("request.wizard.title")}
        </h1>
        <div className="mx-auto mt-3 h-0.5 w-12 rounded-full bg-gradient-to-r from-teal-500 to-transparent" />
        <p className="mt-3 text-sm text-gray-500 dark:text-white/50">
          {t("request.wizard.subtitle")}
        </p>
      </div>

      {/* ── Step indicator — adapted from kit pricing.tsx card header pattern ── */}
      <div className="mb-8 flex items-center justify-center gap-0 px-2 sm:px-8">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isPast = i < step;
          const isCurrent = i === step;
          const isFuture = i > step;
          return (
            <div key={s.key} className="flex flex-1 items-center">
              <motion.div
                initial={false}
                animate={{
                  scale: isCurrent ? 1 : 0.95,
                  opacity: isFuture ? 0.5 : 1,
                }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className={cn(
                  "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-300",
                  isPast && "bg-gradient-to-br from-teal-500 to-teal-600 shadow-md shadow-teal-500/25",
                  isCurrent && "bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg shadow-teal-500/30 ring-4 ring-teal-500/20",
                  isFuture && "border-2 border-gray-200 dark:border-white/[0.12]"
                )}
              >
                {isPast ? (
                  <Check className="h-4 w-4 text-white" strokeWidth={3} />
                ) : (
                  <Icon className={cn("h-4 w-4", isCurrent ? "text-white" : "text-gray-400 dark:text-white/40")} />
                )}
              </motion.div>
              {i < STEPS.length - 1 && (
                <div className="mx-1 h-0.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06] sm:mx-2">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-teal-500 to-teal-400"
                    initial={false}
                    animate={{ width: i < step ? "100%" : "0%" }}
                    transition={{ duration: isNarrow ? 0.25 : 0.4 }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Glassmorphism container — adapted from kit pricing.tsx Card + D1 login card ── */}
      <div className="rounded-3xl border border-gray-200/60 bg-white/80 p-6 shadow-xl backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03] dark:shadow-none md:p-10">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
          >
            {error}
          </motion.div>
        )}

        {step === 0 && preferredProId && (
          <div className="mb-6">
            {preferredProLoading && (
              <div className="flex items-center justify-center gap-3 rounded-2xl border border-gray-200/80 bg-white/60 px-4 py-8 dark:border-white/[0.08] dark:bg-white/[0.04]">
                <Loader2 className="h-5 w-5 animate-spin text-teal-500" />
                <span className="text-sm text-gray-600 dark:text-white/50">
                  {t("request.preferredPro.loading")}
                </span>
              </div>
            )}
            {!preferredProLoading && preferredProError && (
              <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-4 text-sm text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
                <p>{t("request.preferredPro.loadError")}</p>
                <button
                  type="button"
                  onClick={clearPreferredProfessional}
                  className="mt-3 text-xs font-medium text-teal-600 underline underline-offset-2 dark:text-teal-400"
                >
                  {t("request.preferredPro.change")}
                </button>
              </div>
            )}
            {!preferredProLoading && preferredPro && (
              <div className="rounded-2xl border border-teal-500/20 bg-gradient-to-br from-teal-500/10 to-transparent px-4 py-4 dark:border-teal-500/15 dark:from-teal-500/15">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/20 text-teal-700 dark:text-teal-300">
                      <ClipboardList className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {t("request.preferredPro.title", {
                          name:
                            preferredPro.business_name?.trim() ||
                            t("pro.profile.newPro"),
                        })}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-gray-600 dark:text-white/50">
                        <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                        {t("request.preferredPro.rating", {
                          rating: preferredPro.avg_rating.toFixed(1),
                          count: preferredPro.total_reviews,
                        })}
                      </p>
                      {preferredPro.categories.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {preferredPro.categories.slice(0, 6).map((c) => (
                            <span
                              key={c}
                              className="rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-medium text-teal-800 shadow-sm dark:bg-white/10 dark:text-teal-200"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={clearPreferredProfessional}
                    className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-white"
                    aria-label={t("request.preferredPro.change")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={clearPreferredProfessional}
                  className="mt-3 text-left text-xs font-medium text-teal-600 underline-offset-2 hover:underline dark:text-teal-400"
                >
                  {t("request.preferredPro.change")}
                </button>
              </div>
            )}
          </div>
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: direction * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -40 }}
            transition={{ duration: dur, ease: [0.25, 0.4, 0.25, 1] }}
          >
            {step === 0 && (
              <StepCategory
                selectedMainId={selectedMainId}
                setSelectedMainId={(id) => {
                  setSelectedMainId(id);
                  setSelectedSubId("");
                }}
                selectedSubId={selectedSubId}
                setSelectedSubId={setSelectedSubId}
                categories={categories}
                locale={locale}
                t={t}
              />
            )}
            {step === 1 && (
              <StepDetails
                details={details}
                setDetails={setDetails}
                selectedSubSlug={selectedSubSlug}
                locale={locale}
                t={t}
                validateRef={detailsValidateRef}
              />
            )}
            {step === 2 && (
              <StepLocation
                municipality={municipality}
                setMunicipality={setMunicipality}
                address={address}
                setAddress={setAddress}
                marina={marina}
                setMarina={setMarina}
                urgency={urgency}
                setUrgency={setUrgency}
                dateStart={dateStart}
                setDateStart={setDateStart}
                dateEnd={dateEnd}
                setDateEnd={setDateEnd}
                showMarina={isBoat}
                t={t}
              />
            )}
            {step === 3 && (
              <StepPhotos
                photos={photos}
                setPhotos={setPhotos}
                budgetMin={budgetMin}
                setBudgetMin={setBudgetMin}
                budgetMax={budgetMax}
                setBudgetMax={setBudgetMax}
                showBudget={showBudget}
                setShowBudget={setShowBudget}
                phone={phone}
                setPhone={setPhone}
                email={email}
                setEmail={setEmail}
                title={title}
                setTitle={setTitle}
                description={description}
                setDescription={setDescription}
                onSubmit={handleSubmit}
                isSubmitting={isPending}
                autoTitle={autoTitle}
                t={t}
                isAnonymous={isAnonymous}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* ── Navigation buttons — D1 login gradient button pattern ── */}
        <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 0}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-medium transition-all sm:w-auto",
              step === 0
                ? "hidden"
                : "border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:text-white/60 dark:hover:bg-white/[0.04]"
            )}
          >
            <ChevronLeft className="h-4 w-4" />
            {t("request.wizard.back")}
          </button>

          {step < 3 ? (
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={goNext}
              disabled={!canAdvance()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-xl hover:shadow-teal-500/30 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {t("request.wizard.next")}
              <ChevronRight className="h-4 w-4" />
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.01, boxShadow: "0 0 30px rgba(20,184,166,0.25)" }}
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={handleSubmit}
              disabled={isPending || !phone}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("request.wizard.submit")
              )}
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}

export function RequestServiceWizard({ categories, userId }: Props) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
        </div>
      }
    >
      <RequestServiceWizardInner categories={categories} userId={userId} />
    </Suspense>
  );
}
