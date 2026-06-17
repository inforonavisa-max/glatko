"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import {
  Camera,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Loader2,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  Video,
  Wrench,
  X,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { useFormPersistence } from "@/lib/hooks/useFormPersistence";
import { CAREER_ROUTES } from "@/lib/kariyer/config";
import type { CareerSector } from "@/lib/kariyer/queries";
import { ProfileCompletionGauge } from "@/components/glatko/pro-dashboard/ProfileCompletionGauge";

/**
 * Glatko Kariyer — Spec 19 Worker Profile Wizard (client, multi-step).
 *
 * Supply-side profile builder: a logged-in worker turns their account into a
 * `career_worker_profiles` row + linked docs/consents. Mirrors the structure of
 * `components/glatko/become-a-pro/BecomeAProWizard.tsx` 1:1 — `useState` step
 * index, framer-motion `AnimatePresence mode="wait"` slide, the `STEPS[]`
 * icon/key rail, per-step `step{n}Ok` gate + `tryAdvance()`, `useTransition`
 * submit, `isNarrow` matchMedia, smooth scroll-to-top on step change, and the
 * `useFormPersistence` draft-restore banner — swapping the become-a-pro teal for
 * the career amber accent (`brandCareer`).
 *
 * R7 — the worker is NEVER charged: there is ZERO fee/price/payment field, copy,
 * or CTA anywhere in this wizard.
 * R1 — identity (the worker user id) is derived server-side; the client never
 * sends it. The POST body carries only profile content; the route re-derives the
 * worker from `auth.getUser()` and the RPC re-verifies ownership.
 * R4 (anonymization) — exact country/age are PRIVATE; only a region/age-band is
 * shown publicly. The basics step makes that explicit; no name/contact is ever
 * implied on the public card.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Steps — 6 collection steps + a dedicated Review (matches the mirror 1:1).
// ─────────────────────────────────────────────────────────────────────────────
const STEPS = [
  { icon: ShieldCheck, key: "account" },
  { icon: User, key: "basics" },
  { icon: Wrench, key: "skills" },
  { icon: GraduationCap, key: "certifications" },
  { icon: Camera, key: "documents" },
  { icon: Video, key: "video" },
  { icon: Sparkles, key: "review" },
] as const;

// Per-trade skill taxonomy is seeded (migration 078). Until the seeded list is
// wired through props it falls back to this small structured set so the picker
// is never empty (R9). Keys resolve under `careerVertical.worker.skills.*`.
const FALLBACK_SKILLS = [
  "teamwork",
  "communication",
  "safety",
  "tools",
  "quality",
  "punctuality",
] as const;

const LANGUAGE_KEYS = ["en", "sr", "ru", "ar", "tr", "de", "uk", "it"] as const;

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brandCareer focus:outline-none focus:ring-2 focus:ring-brandCareer/20 dark:border-white/10 dark:bg-white/5 dark:text-white";
const labelClass =
  "mb-1.5 block text-xs font-medium text-gray-700 dark:text-white/70";

// ─────────────────────────────────────────────────────────────────────────────
// Repeatable-row shapes (work history, certifications) + upload references.
// ─────────────────────────────────────────────────────────────────────────────
type WorkHistoryEntry = {
  id: string;
  employerType: string;
  region: string;
  years: string;
  role: string;
};

type CertEntry = {
  id: string;
  title: string;
  issuer: string;
  year: string;
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface Props {
  /** Worker user id — used ONLY as the per-worker draft key (R1: never POSTed). */
  userId: string;
  /** Prefill (display only). */
  userEmail: string;
  displayName: string | null;
  /** Seeded trade/role list (career.sectors, 9-locale `name`) — never empty (R9). */
  sectors: CareerSector[];
}

interface Snapshot {
  consentGranted: boolean;
  trade: string;
  experienceYears: string;
  country: string;
  age: string;
  languages: string[];
  skills: string[];
  workHistory: WorkHistoryEntry[];
  certs: CertEntry[];
  videoUrl: string;
  step: number;
}

/** Discriminated result the worker-profile route returns (mirror health write idiom). */
type SubmitResult =
  | { ok: true }
  | { ok: false; code: string };

export function WorkerProfileWizard({
  userId,
  userEmail,
  displayName,
  sectors,
}: Props) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const [step, setStep] = useState(0);

  // Smooth scroll-to-top on each step change (skip the first render). Mirror.
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

  // Step 1 — account & consent
  const [consentGranted, setConsentGranted] = useState(false);

  // Step 2 — basics (country/age are PRIVATE; only region/age-band shows publicly)
  const [trade, setTrade] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [country, setCountry] = useState("");
  const [age, setAge] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);

  // Step 3 — structured skills + redacted work history
  const [skills, setSkills] = useState<string[]>([]);
  const [workHistory, setWorkHistory] = useState<WorkHistoryEntry[]>([]);

  // Step 4 — certifications / education (all optional)
  const [certs, setCerts] = useState<CertEntry[]>([]);

  // Step 6 — optional intro video (URL or handoff upload)
  const [videoUrl, setVideoUrl] = useState("");

  // Submit / state
  const [isPending, startTransition] = useTransition();
  const [submitState, setSubmitState] = useState<{
    success: boolean;
    error?: string;
  }>({ success: false });

  // ── Helpers ────────────────────────────────────────────────────────────────
  const sectorLabel = useCallback(
    (s: CareerSector) => s.name ?? s.slug,
    [],
  );

  const toggleLanguage = (lang: string) =>
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );

  const toggleSkill = (skill: string) =>
    setSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    );

  // Edge case: changing the trade invalidates the prior trade's skill selection
  // (don't silently keep orphaned skills). Reset skills when the trade changes.
  function changeTrade(next: string) {
    if (next === trade) return;
    setTrade(next);
    setSkills([]);
  }

  // Work-history repeatable builder
  function addHistory() {
    setWorkHistory((prev) => [
      ...prev,
      { id: newId(), employerType: "", region: "", years: "", role: "" },
    ]);
  }
  function updateHistory(id: string, patch: Partial<WorkHistoryEntry>) {
    setWorkHistory((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }
  function removeHistory(id: string) {
    setWorkHistory((prev) => prev.filter((r) => r.id !== id));
  }

  // Certifications repeatable builder
  function addCert() {
    setCerts((prev) => [
      ...prev,
      { id: newId(), title: "", issuer: "", year: "" },
    ]);
  }
  function updateCert(id: string, patch: Partial<CertEntry>) {
    setCerts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function removeCert(id: string) {
    setCerts((prev) => prev.filter((c) => c.id !== id));
  }

  // ── Live (client-side) completion preview. The DB RPC is canonical post-save
  // (readiness composite: completeness + verified docs + language level +
  // deployment readiness); this gauge is a UX hint only. ───────────────────────
  const completionScore = useMemo(() => {
    let s = 0;
    if (consentGranted) s += 10;
    if (trade) s += 15;
    if (Number(experienceYears) > 0) s += 10;
    if (country) s += 5;
    if (languages.length >= 2) s += 10;
    if (skills.length >= 1) s += 15;
    if (workHistory.length >= 1) s += 10;
    if (certs.length >= 1) s += 10;
    if (videoUrl.trim()) s += 15;
    return Math.min(100, s);
  }, [
    consentGranted,
    trade,
    experienceYears,
    country,
    languages,
    skills,
    workHistory,
    certs,
    videoUrl,
  ]);

  const missingFields = useMemo(() => {
    const out: string[] = [];
    if (languages.length < 2)
      out.push(t("careerVertical.worker.profileWizard.missing.languages"));
    if (skills.length < 1)
      out.push(t("careerVertical.worker.profileWizard.missing.skills"));
    if (workHistory.length < 1)
      out.push(t("careerVertical.worker.profileWizard.missing.workHistory"));
    if (certs.length < 1)
      out.push(t("careerVertical.worker.profileWizard.missing.certifications"));
    if (!videoUrl.trim())
      out.push(t("careerVertical.worker.profileWizard.missing.video"));
    return out;
  }, [languages, skills, workHistory, certs, videoUrl, t]);

  // ── Persistence (per-worker key so a shared browser can't cross-contaminate).
  // Persist upload *references*/text, never raw files. ─────────────────────────
  const snapshot: Snapshot = useMemo(
    () => ({
      consentGranted,
      trade,
      experienceYears,
      country,
      age,
      languages,
      skills,
      workHistory,
      certs,
      videoUrl,
      step,
    }),
    [
      consentGranted,
      trade,
      experienceYears,
      country,
      age,
      languages,
      skills,
      workHistory,
      certs,
      videoUrl,
      step,
    ],
  );

  const restore = useCallback((data: Snapshot) => {
    setConsentGranted(Boolean(data.consentGranted));
    setTrade(data.trade ?? "");
    setExperienceYears(data.experienceYears ?? "");
    setCountry(data.country ?? "");
    setAge(data.age ?? "");
    setLanguages(Array.isArray(data.languages) ? data.languages : []);
    setSkills(Array.isArray(data.skills) ? data.skills : []);
    setWorkHistory(Array.isArray(data.workHistory) ? data.workHistory : []);
    setCerts(Array.isArray(data.certs) ? data.certs : []);
    setVideoUrl(data.videoUrl ?? "");
    if (
      typeof data.step === "number" &&
      data.step >= 0 &&
      data.step < STEPS.length
    ) {
      setStep(data.step);
    }
  }, []);

  const { restored, clearDraft } = useFormPersistence({
    key: `career-worker-profile-v1:${userId}`,
    enabled: true,
    snapshot,
    restore,
  });

  const [draftBannerVisible, setDraftBannerVisible] = useState(false);
  useEffect(() => {
    if (restored) setDraftBannerVisible(true);
  }, [restored]);

  function resetAll() {
    setStep(0);
    setConsentGranted(false);
    setTrade("");
    setExperienceYears("");
    setCountry("");
    setAge("");
    setLanguages([]);
    setSkills([]);
    setWorkHistory([]);
    setCerts([]);
    setVideoUrl("");
  }

  // ── Per-step validation gates (R: refuse to advance on failure) ──────────────
  const step1Ok = consentGranted;
  const step2Ok = trade.trim().length > 0 && Number(experienceYears) > 0;
  const step3Ok = skills.length >= 1;
  // step4 (certs), step5 (docs handoff), step6 (video) are all optional → true.

  function gateFor(s: number): boolean {
    if (s === 0) return step1Ok;
    if (s === 1) return step2Ok;
    if (s === 2) return step3Ok;
    return true;
  }

  function tryAdvance() {
    if (!gateFor(step)) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  // ── Submit — POST JSON to the worker-profile route (mirror health write idiom).
  // R1: the worker user id is NOT in the body; the route derives it from the
  // session and the RPC re-verifies ownership. R7: no money field anywhere. ─────
  function handleSubmit() {
    setSubmitState({ success: false });
    startTransition(async () => {
      try {
        const res = await fetch("/api/career/worker/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            consent: consentGranted,
            trade,
            experienceYears,
            country,
            age,
            languages,
            skills,
            workHistory: workHistory.map((w) => ({
              employerType: w.employerType,
              region: w.region,
              years: w.years,
              role: w.role,
            })),
            certifications: certs.map((c) => ({
              title: c.title,
              issuer: c.issuer,
              year: c.year,
            })),
            videoUrl: videoUrl.trim(),
            locale,
          }),
        });

        if (res.status === 401) {
          // Session expired mid-form — the draft is persisted; route to login so
          // the worker returns to a restored wizard.
          window.location.assign(`/${locale}${CAREER_ROUTES.login}`);
          return;
        }

        const payload = (await res
          .json()
          .catch(() => ({}))) as Partial<SubmitResult>;

        if (!res.ok || payload.ok !== true) {
          const code =
            payload && "code" in payload && payload.code
              ? payload.code
              : "ERROR";
          setSubmitState({ success: false, error: mapErrorCode(code) });
          return;
        }

        clearDraft();
        setSubmitState({ success: true });
      } catch {
        setSubmitState({
          success: false,
          error: mapErrorCode("ERROR"),
        });
      }
    });
  }

  // Map the route's discriminated error codes → a localized, PII-free message.
  // Errors stay red (never amber-tint danger).
  function mapErrorCode(code: string): string {
    switch (code) {
      case "CONSENT_REQUIRED":
        return t("careerVertical.worker.profileWizard.errors.consentRequired");
      case "NOT_OWNED":
        return t("careerVertical.worker.profileWizard.errors.notOwned");
      case "SECTOR_INVALID":
        return t("careerVertical.worker.profileWizard.errors.sectorInvalid");
      default:
        return t("careerVertical.worker.profileWizard.errors.generic");
    }
  }

  const stepTransition = { duration: isNarrow ? 0.15 : 0.25 };
  const progressFillDuration = isNarrow ? 0.25 : 0.4;

  // ── Success — replace the wizard with the inline amber success panel. ────────
  if (submitState.success) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto flex min-h-[40vh] max-w-2xl flex-col items-center justify-center px-4 text-center sm:px-6 lg:px-8"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brandCareer-50 dark:bg-brandCareer/15">
          <CheckCircle className="h-8 w-8 text-brandCareer-700 dark:text-brandCareer" />
        </div>
        <h2 className="mt-6 text-2xl font-semibold text-gray-900 dark:text-white">
          {t("careerVertical.worker.profileWizard.success.title")}
        </h2>
        <p className="mt-2 max-w-md text-gray-500 dark:text-white/50">
          {t("careerVertical.worker.profileWizard.success.message")}
        </p>
        <p className="mt-1 text-sm text-gray-400 dark:text-white/40">
          {t("careerVertical.worker.profileWizard.success.notify")}
        </p>
        <Link
          href={CAREER_ROUTES.workerDashboard}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-600 hover:to-amber-700"
        >
          {t("careerVertical.worker.profileWizard.success.toDashboard")}
        </Link>
      </motion.div>
    );
  }

  const isLastStep = step === STEPS.length - 1;
  const nextDisabled = !gateFor(step);

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-gray-200/80 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.04] dark:shadow-none md:p-10">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
            {t("careerVertical.worker.profileWizard.title")}
          </h1>
          <p className="mt-2 text-gray-500 dark:text-white/50">
            {t("careerVertical.worker.profileWizard.subtitle")}
          </p>
        </div>

        {/* Draft-restored banner — amber-tinted (not teal). */}
        {draftBannerVisible && (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-brandCareer/30 bg-brandCareer-50 px-4 py-3 text-sm text-brandCareer-700 dark:bg-brandCareer/10 dark:text-brandCareer">
            <span>
              {t("careerVertical.worker.profileWizard.draftRestored")}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  clearDraft();
                  setDraftBannerVisible(false);
                  resetAll();
                }}
                className="rounded-lg px-2 py-1 text-xs font-medium text-brandCareer-700 hover:bg-brandCareer/15 dark:text-brandCareer"
              >
                {t("careerVertical.worker.profileWizard.startFresh")}
              </button>
              <button
                type="button"
                onClick={() => setDraftBannerVisible(false)}
                className="rounded-full p-1 text-brandCareer-700 hover:bg-brandCareer/15 dark:text-brandCareer"
                aria-label={t("careerVertical.worker.profileWizard.dismiss")}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        )}

        {/* Step-indicator rail (amber active/past circles + animated connectors). */}
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
                      ? "border-amber-500 bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-md shadow-amber-500/25"
                      : "border-gray-200 text-gray-400 dark:border-white/10 dark:text-white/30",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                {i < STEPS.length - 1 && (
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400"
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

        {/* Error line — red, role="alert", never amber-tint danger. */}
        {submitState.error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
          >
            {submitState.error}
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={stepTransition}
          >
            {step === 0 && (
              <StepAccountConsent
                userEmail={userEmail}
                displayName={displayName}
                consentGranted={consentGranted}
                setConsentGranted={setConsentGranted}
                t={t}
              />
            )}

            {step === 1 && (
              <StepBasics
                sectors={sectors}
                sectorLabel={sectorLabel}
                trade={trade}
                onTradeChange={changeTrade}
                experienceYears={experienceYears}
                setExperienceYears={setExperienceYears}
                country={country}
                setCountry={setCountry}
                age={age}
                setAge={setAge}
                languages={languages}
                toggleLanguage={toggleLanguage}
                t={t}
              />
            )}

            {step === 2 && (
              <StepSkills
                trade={trade}
                skills={skills}
                toggleSkill={toggleSkill}
                workHistory={workHistory}
                addHistory={addHistory}
                updateHistory={updateHistory}
                removeHistory={removeHistory}
                t={t}
              />
            )}

            {step === 3 && (
              <StepCertsEducation
                certs={certs}
                addCert={addCert}
                updateCert={updateCert}
                removeCert={removeCert}
                t={t}
              />
            )}

            {step === 4 && <StepPhotosDocs t={t} />}

            {step === 5 && (
              <StepVideo videoUrl={videoUrl} setVideoUrl={setVideoUrl} t={t} />
            )}

            {step === 6 && (
              <StepReview
                sectors={sectors}
                sectorLabel={sectorLabel}
                trade={trade}
                experienceYears={experienceYears}
                country={country}
                age={age}
                languages={languages}
                skills={skills}
                workHistoryCount={workHistory.length}
                certsCount={certs.length}
                videoUrl={videoUrl}
                completionScore={completionScore}
                missingFields={missingFields}
                onEdit={setStep}
                t={t}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Back / Next nav row. Back hidden on step 0; Next amber; last = Submit. */}
        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-medium transition-all sm:w-auto",
              step === 0
                ? "hidden"
                : "text-gray-600 hover:bg-gray-100 dark:text-white/60 dark:hover:bg-white/5",
            )}
          >
            <ChevronLeft className="h-4 w-4" />
            {t("careerVertical.worker.profileWizard.back")}
          </button>

          {!isLastStep ? (
            <button
              type="button"
              onClick={tryAdvance}
              disabled={nextDisabled}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 transition-all sm:w-auto",
                "hover:from-amber-600 hover:to-amber-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {t("careerVertical.worker.profileWizard.next")}
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={isPending}
              onClick={handleSubmit}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 transition-all sm:w-auto",
                "hover:from-amber-600 hover:to-amber-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("careerVertical.worker.profileWizard.submit")
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared `t` type — the un-namespaced translator from useTranslations(). Each
// Step* takes full dotted keys (mirror BecomeAProWizard's `t` threading).
// ─────────────────────────────────────────────────────────────────────────────
type T = ReturnType<typeof useTranslations>;

// ── Step 1 — Account & consent ───────────────────────────────────────────────
function StepAccountConsent({
  userEmail,
  displayName,
  consentGranted,
  setConsentGranted,
  t,
}: {
  userEmail: string;
  displayName: string | null;
  consentGranted: boolean;
  setConsentGranted: (v: boolean) => void;
  t: T;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
          {t("careerVertical.worker.profileWizard.steps.account.title")}
        </h2>
        <p className="text-sm text-gray-500 dark:text-white/50">
          {t("careerVertical.worker.profileWizard.steps.account.subtitle")}
        </p>
      </div>

      {/* Logged-in identity (prefill, display only — never POSTed). */}
      <div className="rounded-2xl border border-gray-200/80 bg-gray-50/40 p-4 text-sm dark:border-white/[0.08] dark:bg-white/[0.02]">
        <p className="font-medium text-gray-900 dark:text-white">
          {displayName?.trim() || userEmail}
        </p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-white/45">
          {userEmail}
        </p>
      </div>

      {/* Explicit, purpose-bound, revocable consent for special-category data. */}
      <label className="flex items-start gap-3 rounded-2xl border border-brandCareer/30 bg-brandCareer-50/60 p-4 text-sm text-gray-700 dark:border-brandCareer/30 dark:bg-brandCareer/10 dark:text-white/80">
        <input
          type="checkbox"
          checked={consentGranted}
          onChange={(e) => setConsentGranted(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brandCareer focus:ring-brandCareer/20 dark:border-white/20 dark:bg-white/5"
        />
        <span>
          {t("careerVertical.worker.profileWizard.steps.account.consentLabel")}{" "}
          <Link
            href="/privacy"
            className="font-medium text-brandCareer-700 underline hover:text-brandCareer dark:text-brandCareer"
          >
            {t("careerVertical.worker.profileWizard.steps.account.consentLink")}
          </Link>
        </span>
      </label>

      <p className="text-xs text-gray-400 dark:text-white/35">
        {t("careerVertical.worker.profileWizard.steps.account.consentNote")}
      </p>
    </div>
  );
}

// ── Step 2 — Basics (role/trade, experience, region/country, languages, age) ──
function StepBasics({
  sectors,
  sectorLabel,
  trade,
  onTradeChange,
  experienceYears,
  setExperienceYears,
  country,
  setCountry,
  age,
  setAge,
  languages,
  toggleLanguage,
  t,
}: {
  sectors: CareerSector[];
  sectorLabel: (s: CareerSector) => string;
  trade: string;
  onTradeChange: (v: string) => void;
  experienceYears: string;
  setExperienceYears: (v: string) => void;
  country: string;
  setCountry: (v: string) => void;
  age: string;
  setAge: (v: string) => void;
  languages: string[];
  toggleLanguage: (lang: string) => void;
  t: T;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
          {t("careerVertical.worker.profileWizard.steps.basics.title")}
        </h2>
        <p className="text-sm text-gray-500 dark:text-white/50">
          {t("careerVertical.worker.profileWizard.steps.basics.subtitle")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={labelClass}>
            {t("careerVertical.worker.profileWizard.steps.basics.roleLabel")} *
          </span>
          <select
            value={trade}
            onChange={(e) => onTradeChange(e.target.value)}
            className={inputClass}
          >
            <option value="" disabled>
              {t("careerVertical.worker.profileWizard.steps.basics.rolePlaceholder")}
            </option>
            {sectors.map((s) => (
              <option key={s.slug} value={s.slug}>
                {sectorLabel(s)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClass}>
            {t("careerVertical.worker.profileWizard.steps.basics.yearsLabel")} *
          </span>
          <input
            type="number"
            min={0}
            max={60}
            inputMode="numeric"
            value={experienceYears}
            onChange={(e) => setExperienceYears(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className={labelClass}>
            {t("careerVertical.worker.profileWizard.steps.basics.ageLabel")}
          </span>
          <input
            type="number"
            min={16}
            max={80}
            inputMode="numeric"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block sm:col-span-2">
          <span className={labelClass}>
            {t("careerVertical.worker.profileWizard.steps.basics.regionLabel")}
          </span>
          <input
            type="text"
            maxLength={80}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      {/* Privacy note: exact country/age are PRIVATE; only region/band is public. */}
      <p className="rounded-xl border border-brandCareer/20 bg-brandCareer-50/60 px-4 py-3 text-xs text-brandCareer-700 dark:bg-brandCareer/10 dark:text-brandCareer">
        {t("careerVertical.worker.profileWizard.steps.basics.privacyNote")}
      </p>

      {/* Languages multi-select chips */}
      <div>
        <span className={labelClass}>
          {t("careerVertical.worker.profileWizard.steps.basics.languagesLabel")}
        </span>
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_KEYS.map((lang) => {
            const active = languages.includes(lang);
            return (
              <button
                key={lang}
                type="button"
                aria-pressed={active}
                onClick={() => toggleLanguage(lang)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium uppercase transition-colors",
                  active
                    ? "border-brandCareer bg-brandCareer-50 text-brandCareer-700 ring-1 ring-brandCareer/20 dark:border-brandCareer dark:bg-brandCareer/15 dark:text-brandCareer"
                    : "border-gray-200 bg-white text-gray-600 hover:border-brandCareer/40 dark:border-white/10 dark:bg-white/5 dark:text-white/60",
                )}
              >
                {lang}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Step 3 — Structured skills + redacted work history ───────────────────────
function StepSkills({
  trade,
  skills,
  toggleSkill,
  workHistory,
  addHistory,
  updateHistory,
  removeHistory,
  t,
}: {
  trade: string;
  skills: string[];
  toggleSkill: (s: string) => void;
  workHistory: WorkHistoryEntry[];
  addHistory: () => void;
  updateHistory: (id: string, patch: Partial<WorkHistoryEntry>) => void;
  removeHistory: (id: string) => void;
  t: T;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
          {t("careerVertical.worker.profileWizard.steps.skills.title")}
        </h2>
        <p className="text-sm text-gray-500 dark:text-white/50">
          {t("careerVertical.worker.profileWizard.steps.skills.subtitle")}
        </p>
      </div>

      {/* Structured per-trade skill checklist (chips). Empty until a trade is set. */}
      <div>
        <span className={labelClass}>
          {t("careerVertical.worker.profileWizard.steps.skills.skillsLabel")} *
        </span>
        {trade ? (
          <div className="flex flex-wrap gap-2">
            {FALLBACK_SKILLS.map((skill) => {
              const active = skills.includes(skill);
              return (
                <button
                  key={skill}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleSkill(skill)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-brandCareer bg-brandCareer-50/40 text-brandCareer-700 ring-1 ring-brandCareer/20 dark:border-brandCareer dark:bg-brandCareer/15 dark:text-brandCareer"
                      : "border-gray-200 bg-white text-gray-600 hover:border-brandCareer/40 dark:border-white/10 dark:bg-white/5 dark:text-white/60",
                  )}
                >
                  {t(`careerVertical.worker.profileWizard.skills.${skill}`)}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50/40 px-4 py-3 text-center text-xs text-gray-500 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-white/45">
            {t("careerVertical.worker.profileWizard.steps.skills.pickTradeFirst")}
          </p>
        )}
      </div>

      {/* Redacted work-history builder (e.g. "Hospitality employer · UAE · 3 yrs"). */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className={cn(labelClass, "mb-0")}>
            {t("careerVertical.worker.profileWizard.steps.skills.historyLabel")}
          </span>
          <button
            type="button"
            onClick={addHistory}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brandCareer-700 hover:bg-brandCareer/10 dark:text-brandCareer"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {t("careerVertical.worker.profileWizard.steps.skills.addHistory")}
          </button>
        </div>

        {workHistory.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50/40 px-4 py-3 text-center text-xs text-gray-500 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-white/45">
            {t("careerVertical.worker.profileWizard.steps.skills.historyEmpty")}
          </p>
        ) : (
          <ul className="space-y-3">
            {workHistory.map((row) => (
              <li
                key={row.id}
                className="rounded-2xl border border-gray-200/80 bg-white/60 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    value={row.employerType}
                    onChange={(e) =>
                      updateHistory(row.id, { employerType: e.target.value })
                    }
                    placeholder={t(
                      "careerVertical.worker.profileWizard.steps.skills.employerTypePlaceholder",
                    )}
                    maxLength={80}
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={row.region}
                    onChange={(e) =>
                      updateHistory(row.id, { region: e.target.value })
                    }
                    placeholder={t(
                      "careerVertical.worker.profileWizard.steps.skills.historyRegionPlaceholder",
                    )}
                    maxLength={80}
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={row.role}
                    onChange={(e) =>
                      updateHistory(row.id, { role: e.target.value })
                    }
                    placeholder={t(
                      "careerVertical.worker.profileWizard.steps.skills.historyRolePlaceholder",
                    )}
                    maxLength={80}
                    className={inputClass}
                  />
                  <input
                    type="number"
                    min={0}
                    max={60}
                    inputMode="numeric"
                    value={row.years}
                    onChange={(e) =>
                      updateHistory(row.id, { years: e.target.value })
                    }
                    placeholder={t(
                      "careerVertical.worker.profileWizard.steps.skills.historyYearsPlaceholder",
                    )}
                    className={inputClass}
                  />
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeHistory(row.id)}
                    aria-label={t(
                      "careerVertical.worker.profileWizard.steps.skills.removeHistory",
                    )}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-white/45"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    {t("careerVertical.worker.profileWizard.steps.skills.removeHistory")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Step 4 — Certifications / education (all optional) ───────────────────────
function StepCertsEducation({
  certs,
  addCert,
  updateCert,
  removeCert,
  t,
}: {
  certs: CertEntry[];
  addCert: () => void;
  updateCert: (id: string, patch: Partial<CertEntry>) => void;
  removeCert: (id: string) => void;
  t: T;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
          {t("careerVertical.worker.profileWizard.steps.certifications.title")}
        </h2>
        <p className="text-sm text-gray-500 dark:text-white/50">
          {t("careerVertical.worker.profileWizard.steps.certifications.subtitle")}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 dark:text-white/35">
          {t("careerVertical.worker.profileWizard.steps.certifications.factPublicNote")}
        </span>
        <button
          type="button"
          onClick={addCert}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brandCareer-700 hover:bg-brandCareer/10 dark:text-brandCareer"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {t("careerVertical.worker.profileWizard.steps.certifications.addCertification")}
        </button>
      </div>

      {certs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50/40 px-4 py-3 text-center text-xs text-gray-500 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-white/45">
          {t("careerVertical.worker.profileWizard.steps.certifications.empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {certs.map((row) => (
            <li
              key={row.id}
              className="rounded-2xl border border-gray-200/80 bg-white/60 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]"
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  type="text"
                  value={row.title}
                  onChange={(e) => updateCert(row.id, { title: e.target.value })}
                  placeholder={t(
                    "careerVertical.worker.profileWizard.steps.certifications.titlePlaceholder",
                  )}
                  maxLength={120}
                  className={cn(inputClass, "sm:col-span-2")}
                />
                <input
                  type="number"
                  inputMode="numeric"
                  value={row.year}
                  onChange={(e) => updateCert(row.id, { year: e.target.value })}
                  placeholder={t(
                    "careerVertical.worker.profileWizard.steps.certifications.yearPlaceholder",
                  )}
                  className={inputClass}
                />
                <input
                  type="text"
                  value={row.issuer}
                  onChange={(e) => updateCert(row.id, { issuer: e.target.value })}
                  placeholder={t(
                    "careerVertical.worker.profileWizard.steps.certifications.issuerPlaceholder",
                  )}
                  maxLength={120}
                  className={cn(inputClass, "sm:col-span-3")}
                />
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => removeCert(row.id)}
                  aria-label={t(
                    "careerVertical.worker.profileWizard.steps.certifications.remove",
                  )}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-white/45"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  {t("careerVertical.worker.profileWizard.steps.certifications.remove")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Step 5 — Photo & document HANDOFF (NOT the full upload center) ────────────
// Collects nothing destructively here; the full per-document consent management
// lives on the dedicated Document & Photo Upload Center (Spec 18). Link to it.
function StepPhotosDocs({ t }: { t: T }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
          {t("careerVertical.worker.profileWizard.steps.documents.title")}
        </h2>
        <p className="text-sm text-gray-500 dark:text-white/50">
          {t("careerVertical.worker.profileWizard.steps.documents.subtitle")}
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200/80 bg-gray-50/40 p-5 dark:border-white/[0.08] dark:bg-white/[0.02]">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brandCareer-50 dark:bg-brandCareer/15">
            <Camera className="h-5 w-5 text-brandCareer-700 dark:text-brandCareer" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {t("careerVertical.worker.profileWizard.steps.documents.handoffTitle")}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-white/50">
              {t("careerVertical.worker.profileWizard.steps.documents.handoffBody")}
            </p>
          </div>
        </div>

        <Link
          href={CAREER_ROUTES.workerDocuments}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brandCareer px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brandCareer/25 transition-colors hover:bg-brandCareer-700"
        >
          {t("careerVertical.worker.profileWizard.steps.documents.openCenter")}
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      <p className="text-xs text-gray-400 dark:text-white/35">
        {t("careerVertical.worker.profileWizard.steps.documents.optionalNote")}
      </p>
    </div>
  );
}

// ── Step 6 — Optional intro video ────────────────────────────────────────────
function StepVideo({
  videoUrl,
  setVideoUrl,
  t,
}: {
  videoUrl: string;
  setVideoUrl: (v: string) => void;
  t: T;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
          {t("careerVertical.worker.profileWizard.steps.video.title")}
        </h2>
        <p className="text-sm text-gray-500 dark:text-white/50">
          {t("careerVertical.worker.profileWizard.steps.video.subtitle")}
        </p>
      </div>

      <label className="block">
        <span className={labelClass}>
          {t("careerVertical.worker.profileWizard.steps.video.urlLabel")}
        </span>
        <input
          type="url"
          inputMode="url"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://"
          maxLength={500}
          className={inputClass}
        />
      </label>

      {/* Which clip is public vs gated — label it explicitly (PART 4). */}
      <p className="rounded-xl border border-brandCareer/20 bg-brandCareer-50/60 px-4 py-3 text-xs text-brandCareer-700 dark:bg-brandCareer/10 dark:text-brandCareer">
        {t("careerVertical.worker.profileWizard.steps.video.visibilityNote")}
      </p>
    </div>
  );
}

// ── Step 7 — Review (read-only summary + readiness gauge; holds Submit) ───────
function StepReview({
  sectors,
  sectorLabel,
  trade,
  experienceYears,
  country,
  age,
  languages,
  skills,
  workHistoryCount,
  certsCount,
  videoUrl,
  completionScore,
  missingFields,
  onEdit,
  t,
}: {
  sectors: CareerSector[];
  sectorLabel: (s: CareerSector) => string;
  trade: string;
  experienceYears: string;
  country: string;
  age: string;
  languages: string[];
  skills: string[];
  workHistoryCount: number;
  certsCount: number;
  videoUrl: string;
  completionScore: number;
  missingFields: string[];
  onEdit: (step: number) => void;
  t: T;
}) {
  const notSet = t("careerVertical.worker.profileWizard.review.notSet");
  const tradeName =
    sectors.find((s) => s.slug === trade) != null
      ? sectorLabel(sectors.find((s) => s.slug === trade)!)
      : notSet;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
          {t("careerVertical.worker.profileWizard.review.title")}
        </h2>
        <p className="text-sm text-gray-500 dark:text-white/50">
          {t("careerVertical.worker.profileWizard.review.subtitle")}
        </p>
      </div>

      {/* Readiness/completeness meter — amber gauge (self-completable part only). */}
      <ProfileCompletionGauge score={completionScore} missing={missingFields} />

      <div className="grid gap-4 sm:grid-cols-2">
        <SummaryCard
          icon={User}
          title={t("careerVertical.worker.profileWizard.steps.basics.title")}
          onEdit={() => onEdit(1)}
          editLabel={t("careerVertical.worker.profileWizard.review.edit")}
          rows={[
            {
              label: t("careerVertical.worker.profileWizard.steps.basics.roleLabel"),
              value: tradeName,
            },
            {
              label: t("careerVertical.worker.profileWizard.steps.basics.yearsLabel"),
              value: experienceYears || notSet,
            },
            {
              label: t("careerVertical.worker.profileWizard.review.regionPrivate"),
              value: country || notSet,
            },
            {
              label: t("careerVertical.worker.profileWizard.review.agePrivate"),
              value: age || notSet,
            },
            {
              label: t("careerVertical.worker.profileWizard.steps.basics.languagesLabel"),
              value:
                languages.length > 0
                  ? languages.map((l) => l.toUpperCase()).join(", ")
                  : notSet,
            },
          ]}
        />

        <SummaryCard
          icon={Wrench}
          title={t("careerVertical.worker.profileWizard.steps.skills.title")}
          onEdit={() => onEdit(2)}
          editLabel={t("careerVertical.worker.profileWizard.review.edit")}
          rows={[
            {
              label: t("careerVertical.worker.profileWizard.steps.skills.skillsLabel"),
              value: String(skills.length),
            },
            {
              label: t("careerVertical.worker.profileWizard.steps.skills.historyLabel"),
              value: String(workHistoryCount),
            },
          ]}
        />

        <SummaryCard
          icon={GraduationCap}
          title={t("careerVertical.worker.profileWizard.steps.certifications.title")}
          onEdit={() => onEdit(3)}
          editLabel={t("careerVertical.worker.profileWizard.review.edit")}
          rows={[
            {
              label: t("careerVertical.worker.profileWizard.review.certsCount"),
              value: String(certsCount),
            },
          ]}
        />

        <SummaryCard
          icon={Video}
          title={t("careerVertical.worker.profileWizard.steps.video.title")}
          onEdit={() => onEdit(5)}
          editLabel={t("careerVertical.worker.profileWizard.review.edit")}
          rows={[
            {
              label: t("careerVertical.worker.profileWizard.steps.video.urlLabel"),
              value: videoUrl.trim()
                ? t("careerVertical.worker.profileWizard.review.provided")
                : notSet,
            },
          ]}
        />
      </div>

      {/* Moderation/anonymization notice — amber. */}
      <div className="rounded-xl border border-brandCareer/20 bg-brandCareer-50/60 px-4 py-3 text-sm text-brandCareer-700 dark:bg-brandCareer/10 dark:text-brandCareer">
        {t("careerVertical.worker.profileWizard.review.moderationNotice")}
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  title,
  rows,
  onEdit,
  editLabel,
}: {
  icon: typeof User;
  title: string;
  rows: Array<{ label: string; value: string }>;
  onEdit: () => void;
  editLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100/80 bg-white/40 p-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon
            className="h-4 w-4 text-brandCareer-700 dark:text-brandCareer"
            aria-hidden
          />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg px-2 py-1 text-xs font-medium text-brandCareer-700 hover:bg-brandCareer/10 dark:text-brandCareer"
        >
          {editLabel}
        </button>
      </div>
      <dl className="space-y-1.5 text-xs">
        {rows.length === 0 ? (
          <div className="text-gray-400 dark:text-white/30">—</div>
        ) : (
          rows.map((r, i) => (
            <div key={`${r.label}-${i}`} className="flex justify-between gap-2">
              <dt className="text-gray-500 dark:text-white/45">{r.label}</dt>
              <dd className="truncate text-end text-gray-900 dark:text-white">
                {r.value}
              </dd>
            </div>
          ))
        )}
      </dl>
    </div>
  );
}
