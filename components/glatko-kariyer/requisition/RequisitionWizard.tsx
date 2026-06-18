"use client";

import {
  useState,
  useCallback,
  useMemo,
  useTransition,
  useEffect,
  Suspense,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  Briefcase,
  ClipboardCheck,
  FileText,
  Coins,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Check,
  Plus,
  Trash2,
  X,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormPersistence } from "@/lib/hooks/useFormPersistence";
import type { Locale } from "@/i18n/routing";

/**
 * Glatko Kariyer — Requisition Wizard (Spec 14).
 *
 * MIRRORS components/glatko/request-service/RequestServiceWizard.tsx's skeleton:
 * `"use client"` + outer `Suspense`, a `useState` step index + `direction`
 * (1 / -1), `framer-motion` `AnimatePresence mode="wait" initial={false}` with
 * the `x: direction*40 → 0 → direction*-40` slide, the `STEPS[]` icon/key array
 * driving the step-indicator rail, `goNext`/`goBack`, a per-step `canAdvance()`
 * gate, `useTransition` submit, and an `isNarrow` matchMedia reduced-motion
 * duration. Like the mirror it lives in one file: parent wizard + one `Step*`
 * per step + a `RequisitionConfirmation` success screen (analog of
 * `RequestConfirmation`).
 *
 * DIFFERENCES from the mirror (Spec 14 §"Difference from the mirror"):
 *  - 5 steps, not 4: roles → requirements → terms → servicePath → review. The
 *    review step is its own step and holds the Submit button (the health wizard
 *    folds review into step 4).
 *  - No anonymous flow: the employer is always authed (gated route). Draft
 *    persistence is STILL required but keyed PER-EMPLOYER so a shared browser
 *    can't cross-contaminate drafts.
 *  - POSTs JSON to /api/career/requisitions (not a server action). The employer
 *    id is derived server-side from the cookie session (R1) — NEVER in the body.
 *
 * Accent = amber / brandCareer wherever health uses teal (IMPL-CONTRACT). The
 * primary CTA / Submit use the amber gradient (from-amber-500 to-amber-600);
 * accent TEXT uses brandCareer-700 (DEFAULT amber-600 is below AA for text).
 * Tailwind needs static class literals, so the amber ramp is written out.
 *
 * R7: this is the EMPLOYER's surface — the ONLY money-adjacent control is the
 * employer's commission-vs-full-service path choice (step 4). No worker-side
 * fee / price / payment field exists anywhere in this wizard.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Props — the server page (force-dynamic, R11) resolves identity and the seeded
// sector list, then passes them down. NO client-side DB read inside the wizard.
// ─────────────────────────────────────────────────────────────────────────────

/** A localized trade option under a sector (label already resolved by the page). */
export type RequisitionTrade = {
  slug: string;
  name: string;
};

/** Seeded sector + its trade list (9-locale labels), composed by the server page. */
export type RequisitionSector = {
  slug: string;
  name: string;
  trades: RequisitionTrade[];
};

interface Props {
  /** Seeded sectors with their trade options (labels localized by the page). */
  sectors: RequisitionSector[];
  /**
   * The authed employer's user id. Used ONLY to key the per-employer draft and
   * to know we are authed — the route re-reads cookies for authorization, so
   * this is purely UX state and is NEVER sent in the POST body (R1).
   */
  employerId: string;
}

const STEPS = [
  { icon: Briefcase, key: "roles" },
  { icon: ClipboardCheck, key: "requirements" },
  { icon: FileText, key: "terms" },
  { icon: Coins, key: "servicePath" },
  { icon: CheckCircle2, key: "review" },
] as const;

const EXPERIENCE_OPTIONS = ["lt1", "1to3", "3to5", "5to10", "gt10"] as const;
const TIER_OPTIONS = ["entry", "skilled", "experienced", "expert"] as const;
const CURRENCY_OPTIONS = ["EUR", "USD"] as const;

type ServicePath = "commission" | "full_service";

/** A single role row in StepRoles — role/trade slug + headcount (positive int). */
type RoleRow = {
  trade: string;
  headcount: string;
};

const emptyRoleRow = (): RoleRow => ({ trade: "", headcount: "1" });

// ─────────────────────────────────────────────────────────────────────────────
// Inner wizard (rendered inside the outer Suspense).
// ─────────────────────────────────────────────────────────────────────────────
function RequisitionWizardInner({ sectors, employerId }: Props) {
  const t = useTranslations("careerVertical.employer.requisitionWizard");
  const tc = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();

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

  // Step 1 — sector + roles.
  const [sectorSlug, setSectorSlug] = useState("");
  const [roleRows, setRoleRows] = useState<RoleRow[]>([emptyRoleRow()]);

  // Step 2 — requirements (all optional).
  const [experience, setExperience] = useState("");
  const [minTier, setMinTier] = useState("");
  const [certifications, setCertifications] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);

  // Step 3 — terms.
  const [wageMin, setWageMin] = useState("");
  const [wageMax, setWageMax] = useState("");
  const [currency, setCurrency] = useState<string>("EUR");
  const [hours, setHours] = useState("");
  const [accommodation, setAccommodation] = useState<boolean>(false);
  const [accommodationNote, setAccommodationNote] = useState("");
  const [duration, setDuration] = useState("");
  const [startDate, setStartDate] = useState("");

  // Step 4 — service path.
  const [servicePath, setServicePath] = useState<ServicePath | "">("");

  // Step 5 — review.
  const [note, setNote] = useState("");

  // ── Draft persistence (long-form requirement, Spec 14). Keyed per-employer so
  //    a shared browser cannot cross-contaminate drafts. Always enabled (authed).
  const draftSnapshot = useMemo(
    () => ({
      sectorSlug,
      roleRows,
      experience,
      minTier,
      certifications,
      languages,
      wageMin,
      wageMax,
      currency,
      hours,
      accommodation,
      accommodationNote,
      duration,
      startDate,
      servicePath,
      note,
    }),
    [
      sectorSlug,
      roleRows,
      experience,
      minTier,
      certifications,
      languages,
      wageMin,
      wageMax,
      currency,
      hours,
      accommodation,
      accommodationNote,
      duration,
      startDate,
      servicePath,
      note,
    ],
  );

  type DraftShape = typeof draftSnapshot;

  const restoreDraft = useCallback((s: DraftShape) => {
    if (s.sectorSlug) setSectorSlug(s.sectorSlug);
    if (Array.isArray(s.roleRows) && s.roleRows.length > 0) setRoleRows(s.roleRows);
    if (s.experience) setExperience(s.experience);
    if (s.minTier) setMinTier(s.minTier);
    if (Array.isArray(s.certifications)) setCertifications(s.certifications);
    if (Array.isArray(s.languages)) setLanguages(s.languages);
    if (s.wageMin) setWageMin(s.wageMin);
    if (s.wageMax) setWageMax(s.wageMax);
    if (s.currency) setCurrency(s.currency);
    if (s.hours) setHours(s.hours);
    if (typeof s.accommodation === "boolean") setAccommodation(s.accommodation);
    if (s.accommodationNote) setAccommodationNote(s.accommodationNote);
    if (s.duration) setDuration(s.duration);
    if (s.startDate) setStartDate(s.startDate);
    if (s.servicePath === "commission" || s.servicePath === "full_service") {
      setServicePath(s.servicePath);
    }
    if (s.note) setNote(s.note);
  }, []);

  const { clearDraft, restored: draftRestored } = useFormPersistence<DraftShape>({
    // Per-employer key (Spec 14 §"Draft persistence") — never a shared bucket.
    key: `requisition-v1:${employerId}`,
    enabled: true,
    snapshot: draftSnapshot,
    restore: restoreDraft,
  });

  const [draftBannerDismissed, setDraftBannerDismissed] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [requisitionId, setRequisitionId] = useState<string | null>(null);

  const selectedSector = useMemo(
    () => sectors.find((s) => s.slug === sectorSlug) ?? null,
    [sectors, sectorSlug],
  );

  // A role row is complete when it has a trade and a headcount that is a
  // positive integer (Spec 14 edge cases — sanitize to positive ints).
  const isRoleRowValid = useCallback((row: RoleRow): boolean => {
    if (!row.trade) return false;
    const n = Number(row.headcount);
    return Number.isInteger(n) && n >= 1;
  }, []);

  const validRoleRows = useMemo(
    () => roleRows.filter(isRoleRowValid),
    [roleRows, isRoleRowValid],
  );

  // Terms validity (Spec 14): wage min/max present, min ≤ max, start date valid.
  const wageMinNum = Number(wageMin);
  const wageMaxNum = Number(wageMax);
  const wagePresent =
    wageMin.trim() !== "" &&
    wageMax.trim() !== "" &&
    Number.isFinite(wageMinNum) &&
    Number.isFinite(wageMaxNum);
  const wageOrderOk = wagePresent && wageMinNum <= wageMaxNum;
  const startDateOk = startDate.trim() !== "";

  const canAdvance = useCallback((): boolean => {
    if (step === 0) return !!sectorSlug && validRoleRows.length > 0;
    if (step === 1) return true; // requirements are intentionally optional
    if (step === 2) return wagePresent && wageOrderOk && startDateOk;
    if (step === 3) return servicePath !== "";
    return true; // review
  }, [
    step,
    sectorSlug,
    validRoleRows.length,
    wagePresent,
    wageOrderOk,
    startDateOk,
    servicePath,
  ]);

  const goNext = () => {
    setError("");
    // Surface step-3 ordering failures inline rather than hiding behind a
    // server reject (mirror the mirror's goNext validate gate).
    if (step === 2 && wagePresent && !wageOrderOk) {
      setError(t("errors.wageOrder"));
      return;
    }
    if (!canAdvance()) return;
    setDirection(1);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setError("");
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  };

  // Review "Edit" affordance — jump back to a section's step.
  const editStep = (target: number) => {
    setError("");
    setDirection(target < step ? -1 : 1);
    setStep(target);
  };

  const resetWizard = () => {
    setStep(0);
    setDirection(1);
    setSectorSlug("");
    setRoleRows([emptyRoleRow()]);
    setExperience("");
    setMinTier("");
    setCertifications([]);
    setLanguages([]);
    setWageMin("");
    setWageMax("");
    setCurrency("EUR");
    setHours("");
    setAccommodation(false);
    setAccommodationNote("");
    setDuration("");
    setStartDate("");
    setServicePath("");
    setNote("");
    setError("");
    setSubmitted(false);
    setRequisitionId(null);
    clearDraft();
    setDraftBannerDismissed(false);
  };

  const handleSubmit = () => {
    setError("");
    // Defense-in-depth client validation before any POST (Spec 14): the server
    // re-validates, but surface obvious failures inline first.
    if (!sectorSlug || validRoleRows.length === 0) {
      setError(t("errors.validation"));
      setStep(0);
      return;
    }
    if (!wagePresent || !wageOrderOk) {
      setError(t("errors.wageOrder"));
      setStep(2);
      return;
    }
    if (!startDateOk) {
      setError(t("errors.startDate"));
      setStep(2);
      return;
    }
    if (servicePath === "") {
      setError(t("errors.validation"));
      setStep(3);
      return;
    }

    // roles map (trade → headcount). Last write wins on duplicate trade.
    const roles: Record<string, number> = {};
    for (const row of validRoleRows) {
      roles[row.trade] = Number(row.headcount);
    }

    const payload = {
      sector: sectorSlug,
      roles,
      requirements: {
        experience: experience || null,
        minTier: minTier || null,
        certifications,
        languages,
      },
      terms: {
        wageMin: wageMinNum,
        wageMax: wageMaxNum,
        currency,
        hours: hours || null,
        accommodation,
        accommodationNote: accommodation ? accommodationNote || null : null,
        duration: duration || null,
        startDate,
      },
      service_path: servicePath,
      note: note || null,
      locale,
    };

    startTransition(async () => {
      try {
        const res = await fetch("/api/career/requisitions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.status === 401) {
          // Session expired mid-form — the draft is persisted, so the employer
          // returns to a restored wizard after re-auth (Spec 14 edge cases).
          router.push("/career/login");
          return;
        }
        if (res.status === 403) {
          setError(t("errors.forbidden"));
          return;
        }

        const data = (await res.json().catch(() => null)) as
          | { ok?: boolean; requisitionId?: string; code?: string }
          | null;

        if (!res.ok || !data?.ok || !data.requisitionId) {
          setError(t("errors.generic"));
          return;
        }

        // Primary employer conversion event — requisition submitted. Fired only
        // on server-confirmed success, before the UI flips (mirror the mirror's
        // customer_job_posted). `career_requisition_submitted` is not part of the
        // typed GlatkoEventName union, so we push to GA4 directly (SSR-guarded).
        if (typeof window !== "undefined" && typeof window.gtag === "function") {
          window.gtag("event", "career_requisition_submitted", {
            requisition_id: data.requisitionId,
          });
        }

        setRequisitionId(data.requisitionId);
        setSubmitted(true);
        clearDraft();
      } catch {
        // Network throw / 503 — generic retry message (Spec 14 edge cases).
        setError(t("errors.network"));
      }
    });
  };

  if (submitted && requisitionId) {
    return (
      <RequisitionConfirmation
        requisitionId={requisitionId}
        sectorLabel={selectedSector?.name ?? ""}
        roleCount={validRoleRows.length}
        servicePathLabel={
          servicePath
            ? tc(`careerVertical.employer.servicePath.${servicePath}`)
            : ""
        }
        onCreateAnother={resetWizard}
      />
    );
  }

  const dur = isNarrow ? 0.15 : 0.25;
  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="mx-auto max-w-3xl">
      {draftRestored && !draftBannerDismissed ? (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-brandCareer/20 bg-brandCareer-50/70 px-4 py-3 text-sm text-brandCareer-700 dark:border-brandCareer/30 dark:bg-brandCareer/10 dark:text-amber-200">
          <span>{t("draftRestored")}</span>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => {
                resetWizard();
              }}
              className="font-medium underline underline-offset-2 hover:text-brandCareer-700 dark:hover:text-amber-100"
            >
              {t("startFresh")}
            </button>
            <button
              type="button"
              onClick={() => setDraftBannerDismissed(true)}
              className="rounded-md p-1 text-brandCareer-700/70 transition hover:bg-brandCareer/15 hover:text-brandCareer-700 dark:text-amber-200/70 dark:hover:text-amber-100"
              aria-label={tc("common.close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="mb-10 text-center">
        <h1 className="font-serif text-3xl font-semibold text-gray-900 dark:text-white">
          {t("title")}
        </h1>
        <div className="mx-auto mt-3 h-0.5 w-12 rounded-full bg-gradient-to-r from-brandCareer to-transparent" />
        <p className="mt-3 text-sm text-gray-500 dark:text-white/50">
          {t("subtitle")}
        </p>
      </div>

      {/* ── Step indicator rail ── */}
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
                  isPast &&
                    "bg-gradient-to-br from-amber-500 to-amber-600 shadow-md shadow-amber-500/25",
                  isCurrent &&
                    "bg-gradient-to-br from-amber-500 to-amber-600 shadow-lg shadow-amber-500/30 ring-4 ring-amber-500/20",
                  isFuture && "border-2 border-gray-200 dark:border-white/[0.12]",
                )}
              >
                {isPast ? (
                  <Check className="h-4 w-4 text-white" strokeWidth={3} />
                ) : (
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      isCurrent ? "text-white" : "text-gray-400 dark:text-white/40",
                    )}
                  />
                )}
              </motion.div>
              {i < STEPS.length - 1 && (
                <div className="mx-1 h-0.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06] sm:mx-2">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400"
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

      {/* ── Glassmorphism card ── */}
      <div className="rounded-3xl border border-gray-200/60 bg-white/80 p-6 shadow-xl backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03] dark:shadow-none md:p-10">
        {error && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
          >
            {error}
          </motion.div>
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
              <StepRoles
                sectors={sectors}
                sectorSlug={sectorSlug}
                setSectorSlug={(slug) => {
                  setSectorSlug(slug);
                  // Switching sector orphans the role trades — reset rows.
                  setRoleRows([emptyRoleRow()]);
                }}
                selectedSector={selectedSector}
                roleRows={roleRows}
                setRoleRows={setRoleRows}
                isRoleRowValid={isRoleRowValid}
                t={t}
              />
            )}
            {step === 1 && (
              <StepRequirements
                experience={experience}
                setExperience={setExperience}
                minTier={minTier}
                setMinTier={setMinTier}
                certifications={certifications}
                setCertifications={setCertifications}
                languages={languages}
                setLanguages={setLanguages}
                t={t}
                tc={tc}
              />
            )}
            {step === 2 && (
              <StepTerms
                wageMin={wageMin}
                setWageMin={setWageMin}
                wageMax={wageMax}
                setWageMax={setWageMax}
                currency={currency}
                setCurrency={setCurrency}
                hours={hours}
                setHours={setHours}
                accommodation={accommodation}
                setAccommodation={setAccommodation}
                accommodationNote={accommodationNote}
                setAccommodationNote={setAccommodationNote}
                duration={duration}
                setDuration={setDuration}
                startDate={startDate}
                setStartDate={setStartDate}
                wageOrderOk={wageOrderOk}
                wagePresent={wagePresent}
                t={t}
              />
            )}
            {step === 3 && (
              <StepServicePath
                servicePath={servicePath}
                setServicePath={setServicePath}
                t={t}
              />
            )}
            {step === 4 && (
              <StepReview
                sectorLabel={selectedSector?.name ?? ""}
                roleRows={validRoleRows}
                tradeLabel={(slug) =>
                  selectedSector?.trades.find((tr) => tr.slug === slug)?.name ?? slug
                }
                experience={experience}
                minTier={minTier}
                certifications={certifications}
                languages={languages}
                wageMin={wageMin}
                wageMax={wageMax}
                currency={currency}
                hours={hours}
                accommodation={accommodation}
                accommodationNote={accommodationNote}
                duration={duration}
                startDate={startDate}
                servicePath={servicePath}
                note={note}
                setNote={setNote}
                onEdit={editStep}
                t={t}
                tc={tc}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* ── Navigation row ── */}
        <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 0}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-medium transition-all sm:w-auto",
              step === 0
                ? "hidden"
                : "border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:text-white/60 dark:hover:bg-white/[0.04]",
            )}
          >
            <ChevronLeft className="h-4 w-4" />
            {t("back")}
          </button>

          {!isLastStep ? (
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={goNext}
              disabled={!canAdvance()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 transition-all hover:shadow-xl hover:shadow-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {t("next")}
              <ChevronRight className="h-4 w-4" />
            </motion.button>
          ) : (
            <motion.button
              whileHover={{
                scale: 1.01,
                boxShadow: "0 0 30px rgba(245,158,11,0.25)",
              }}
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 transition-all disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("submitting")}
                </>
              ) : (
                t("submit")
              )}
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared input styling (amber focus rings — Spec 14 §"Amber accent usage").
// ─────────────────────────────────────────────────────────────────────────────
const FIELD_CLASS =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-colors focus:border-brandCareer focus:ring-2 focus:ring-brandCareer/20 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white";
const LABEL_CLASS =
  "mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/70";

// Loose translation-function signature (mirror's idiom) — accepts both the
// namespace-scoped `t` and the root `tc`, plus dynamic/template keys. next-intl
// typed-message key enforcement is not enabled in this project.
type StepT = (key: string) => string;

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Sector + roles.
// ─────────────────────────────────────────────────────────────────────────────
function StepRoles({
  sectors,
  sectorSlug,
  setSectorSlug,
  selectedSector,
  roleRows,
  setRoleRows,
  isRoleRowValid,
  t,
}: {
  sectors: RequisitionSector[];
  sectorSlug: string;
  setSectorSlug: (slug: string) => void;
  selectedSector: RequisitionSector | null;
  roleRows: RoleRow[];
  setRoleRows: React.Dispatch<React.SetStateAction<RoleRow[]>>;
  isRoleRowValid: (row: RoleRow) => boolean;
  t: StepT;
}) {
  const trades = selectedSector?.trades ?? [];

  const updateRow = (index: number, patch: Partial<RoleRow>) => {
    setRoleRows((rows) =>
      rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  };

  const addRow = () => setRoleRows((rows) => [...rows, emptyRoleRow()]);

  const removeRow = (index: number) =>
    setRoleRows((rows) =>
      rows.length === 1 ? rows : rows.filter((_, i) => i !== index),
    );

  // Sanitize headcount to positive integers client-side (Spec 14 edge cases).
  const onHeadcountChange = (index: number, raw: string) => {
    const digits = raw.replace(/[^\d]/g, "");
    updateRow(index, { headcount: digits });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-xl font-semibold text-gray-900 dark:text-white">
          {t("steps.rolesStep.title")}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-white/50">
          {t("steps.rolesStep.subtitle")}
        </p>
      </div>

      <div>
        <label htmlFor="req-sector" className={LABEL_CLASS}>
          {t("steps.rolesStep.sectorLabel")}
        </label>
        <select
          id="req-sector"
          value={sectorSlug}
          onChange={(e) => setSectorSlug(e.target.value)}
          className={FIELD_CLASS}
        >
          <option value="">{t("steps.rolesStep.sectorPlaceholder")}</option>
          {sectors.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        <span className={LABEL_CLASS}>{t("steps.rolesStep.roleLabel")}</span>
        {roleRows.map((row, i) => {
          const valid = isRoleRowValid(row);
          return (
            <div
              key={i}
              className={cn(
                "flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-end",
                valid
                  ? "border-brandCareer/30 bg-brandCareer-50/30 dark:border-brandCareer/20 dark:bg-brandCareer/5"
                  : "border-gray-200 dark:border-white/[0.08]",
              )}
            >
              <div className="flex-1">
                <label
                  htmlFor={`req-role-${i}`}
                  className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-white/50"
                >
                  {t("steps.rolesStep.roleLabel")}
                </label>
                <select
                  id={`req-role-${i}`}
                  value={row.trade}
                  onChange={(e) => updateRow(i, { trade: e.target.value })}
                  disabled={!sectorSlug}
                  className={cn(FIELD_CLASS, "disabled:opacity-50")}
                >
                  <option value="">{t("steps.rolesStep.rolePlaceholder")}</option>
                  {trades.map((tr) => (
                    <option key={tr.slug} value={tr.slug}>
                      {tr.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-full sm:w-32">
                <label
                  htmlFor={`req-headcount-${i}`}
                  className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-white/50"
                >
                  {t("steps.rolesStep.headcountLabel")}
                </label>
                <input
                  id={`req-headcount-${i}`}
                  type="text"
                  inputMode="numeric"
                  value={row.headcount}
                  onChange={(e) => onHeadcountChange(i, e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
              <button
                type="button"
                onClick={() => removeRow(i)}
                disabled={roleRows.length === 1}
                aria-label={t("steps.rolesStep.removeRole")}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-400 transition-colors hover:border-red-200 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.08] dark:text-white/40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-2 rounded-xl border border-dashed border-brandCareer/40 px-4 py-2.5 text-sm font-medium text-brandCareer-700 transition-colors hover:bg-brandCareer-50/40 dark:text-amber-300 dark:hover:bg-brandCareer/10"
        >
          <Plus className="h-4 w-4" />
          {t("steps.rolesStep.addRole")}
        </button>

        {sectorSlug && roleRows.every((r) => !isRoleRowValid(r)) ? (
          <p className="text-xs text-gray-500 dark:text-white/40">
            {t("steps.rolesStep.emptyHint")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Requirements (all optional → always advanceable).
// ─────────────────────────────────────────────────────────────────────────────
function StepRequirements({
  experience,
  setExperience,
  minTier,
  setMinTier,
  certifications,
  setCertifications,
  languages,
  setLanguages,
  t,
  tc,
}: {
  experience: string;
  setExperience: (v: string) => void;
  minTier: string;
  setMinTier: (v: string) => void;
  certifications: string[];
  setCertifications: React.Dispatch<React.SetStateAction<string[]>>;
  languages: string[];
  setLanguages: React.Dispatch<React.SetStateAction<string[]>>;
  t: StepT;
  tc: StepT;
}) {
  const [certInput, setCertInput] = useState("");
  const [langInput, setLangInput] = useState("");

  const addCert = () => {
    const v = certInput.trim();
    if (v && !certifications.includes(v)) setCertifications((c) => [...c, v]);
    setCertInput("");
  };
  const addLang = () => {
    const v = langInput.trim();
    if (v && !languages.includes(v)) setLanguages((l) => [...l, v]);
    setLangInput("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-xl font-semibold text-gray-900 dark:text-white">
          {t("steps.requirementsStep.title")}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-white/50">
          {t("steps.requirementsStep.subtitleOptional")}
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="req-experience" className={LABEL_CLASS}>
            {t("steps.requirementsStep.experienceLabel")}
          </label>
          <select
            id="req-experience"
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            className={FIELD_CLASS}
          >
            <option value="">{t("steps.requirementsStep.anyOption")}</option>
            {EXPERIENCE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {tc(`careerVertical.pool.experienceBand.${o}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="req-tier" className={LABEL_CLASS}>
            {t("steps.requirementsStep.tierLabel")}
          </label>
          <select
            id="req-tier"
            value={minTier}
            onChange={(e) => setMinTier(e.target.value)}
            className={FIELD_CLASS}
          >
            <option value="">{t("steps.requirementsStep.anyOption")}</option>
            {TIER_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {tc(`careerVertical.pool.skillTier.${o}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ChipField
        label={t("steps.requirementsStep.certificationsLabel")}
        placeholder={t("steps.requirementsStep.certPlaceholder")}
        addLabel={t("steps.requirementsStep.addCertification")}
        value={certInput}
        setValue={setCertInput}
        onAdd={addCert}
        chips={certifications}
        onRemove={(v) =>
          setCertifications((c) => c.filter((x) => x !== v))
        }
      />

      <ChipField
        label={t("steps.requirementsStep.languagesLabel")}
        placeholder={t("steps.requirementsStep.langPlaceholder")}
        addLabel={t("steps.requirementsStep.addLanguage")}
        value={langInput}
        setValue={setLangInput}
        onAdd={addLang}
        chips={languages}
        onRemove={(v) => setLanguages((l) => l.filter((x) => x !== v))}
      />
    </div>
  );
}

// Reusable add-chip multiselect (free-text — certs/languages curation hints).
function ChipField({
  label,
  placeholder,
  addLabel,
  value,
  setValue,
  onAdd,
  chips,
  onRemove,
}: {
  label: string;
  placeholder: string;
  addLabel: string;
  value: string;
  setValue: (v: string) => void;
  onAdd: () => void;
  chips: string[];
  onRemove: (v: string) => void;
}) {
  return (
    <div>
      <span className={LABEL_CLASS}>{label}</span>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          className={FIELD_CLASS}
        />
        <button
          type="button"
          onClick={onAdd}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-brandCareer/40 px-4 text-sm font-medium text-brandCareer-700 transition-colors hover:bg-brandCareer-50/40 dark:text-amber-300 dark:hover:bg-brandCareer/10"
        >
          <Plus className="h-4 w-4" />
          {addLabel}
        </button>
      </div>
      {chips.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1.5 rounded-full bg-brandCareer-50 px-3 py-1 text-xs font-medium text-brandCareer-700 dark:bg-brandCareer/10 dark:text-amber-200"
            >
              {c}
              <button
                type="button"
                onClick={() => onRemove(c)}
                aria-label={c}
                className="text-brandCareer-700/60 transition-colors hover:text-brandCareer-700 dark:text-amber-200/60 dark:hover:text-amber-100"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Terms (MNE mediation-law disclosure; wage range is REQUIRED).
// ─────────────────────────────────────────────────────────────────────────────
function StepTerms({
  wageMin,
  setWageMin,
  wageMax,
  setWageMax,
  currency,
  setCurrency,
  hours,
  setHours,
  accommodation,
  setAccommodation,
  accommodationNote,
  setAccommodationNote,
  duration,
  setDuration,
  startDate,
  setStartDate,
  wageOrderOk,
  wagePresent,
  t,
}: {
  wageMin: string;
  setWageMin: (v: string) => void;
  wageMax: string;
  setWageMax: (v: string) => void;
  currency: string;
  setCurrency: (v: string) => void;
  hours: string;
  setHours: (v: string) => void;
  accommodation: boolean;
  setAccommodation: (v: boolean) => void;
  accommodationNote: string;
  setAccommodationNote: (v: string) => void;
  duration: string;
  setDuration: (v: string) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  wageOrderOk: boolean;
  wagePresent: boolean;
  t: StepT;
}) {
  const sanitizeAmount = (raw: string) => raw.replace(/[^\d]/g, "");
  const wageInvalid = wagePresent && !wageOrderOk;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-xl font-semibold text-gray-900 dark:text-white">
          {t("steps.termsStep.title")}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-white/50">
          {t("steps.termsStep.subtitle")}
        </p>
      </div>

      <div>
        <span className={LABEL_CLASS}>{t("steps.termsStep.wageRangeLabel")}</span>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label
              htmlFor="req-wage-min"
              className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-white/50"
            >
              {t("steps.termsStep.wageMinLabel")}
            </label>
            <input
              id="req-wage-min"
              type="text"
              inputMode="numeric"
              value={wageMin}
              placeholder={t("steps.termsStep.wagePlaceholderMin")}
              onChange={(e) => setWageMin(sanitizeAmount(e.target.value))}
              className={FIELD_CLASS}
            />
          </div>
          <div>
            <label
              htmlFor="req-wage-max"
              className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-white/50"
            >
              {t("steps.termsStep.wageMaxLabel")}
            </label>
            <input
              id="req-wage-max"
              type="text"
              inputMode="numeric"
              value={wageMax}
              placeholder={t("steps.termsStep.wagePlaceholderMax")}
              onChange={(e) => setWageMax(sanitizeAmount(e.target.value))}
              className={FIELD_CLASS}
            />
          </div>
          <div>
            <label
              htmlFor="req-currency"
              className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-white/50"
            >
              {t("steps.termsStep.currencyLabel")}
            </label>
            <select
              id="req-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={FIELD_CLASS}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        {wageInvalid ? (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            {t("errors.wageOrder")}
          </p>
        ) : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="req-hours" className={LABEL_CLASS}>
            {t("steps.termsStep.hoursLabel")}
          </label>
          <input
            id="req-hours"
            type="text"
            value={hours}
            placeholder={t("steps.termsStep.hoursPlaceholder")}
            onChange={(e) => setHours(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label htmlFor="req-duration" className={LABEL_CLASS}>
            {t("steps.termsStep.durationLabel")}
          </label>
          <input
            id="req-duration"
            type="text"
            value={duration}
            placeholder={t("steps.termsStep.durationPlaceholder")}
            onChange={(e) => setDuration(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
      </div>

      <div>
        <label htmlFor="req-start" className={LABEL_CLASS}>
          {t("steps.termsStep.startDateLabel")}
        </label>
        <input
          id="req-start"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className={cn(FIELD_CLASS, "sm:max-w-xs")}
        />
      </div>

      <div>
        <span className={LABEL_CLASS}>
          {t("steps.termsStep.accommodationLabelQ")}
        </span>
        <div className="flex gap-3">
          {[
            { value: true, label: t("steps.termsStep.accommodationYes") },
            { value: false, label: t("steps.termsStep.accommodationNo") },
          ].map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => setAccommodation(opt.value)}
              className={cn(
                "flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-all",
                accommodation === opt.value
                  ? "border-brandCareer bg-brandCareer-50/40 text-brandCareer-700 ring-2 ring-brandCareer/20 dark:bg-brandCareer/10 dark:text-amber-200"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:text-white/60 dark:hover:bg-white/[0.04]",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {accommodation ? (
          <div className="mt-3">
            <label htmlFor="req-accommodation-note" className={LABEL_CLASS}>
              {t("steps.termsStep.accommodationNoteLabel")}
            </label>
            <input
              id="req-accommodation-note"
              type="text"
              value={accommodationNote}
              placeholder={t("steps.termsStep.accommodationNotePlaceholder")}
              onChange={(e) => setAccommodationNote(e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
        ) : null}
      </div>

      <p className="rounded-xl border border-gray-200/70 bg-gray-50/70 px-4 py-3 text-xs text-gray-500 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-white/40">
        {t("steps.termsStep.legalNote")}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Service path (R7: the ONLY money-adjacent UI, employer-side).
// ─────────────────────────────────────────────────────────────────────────────
function StepServicePath({
  servicePath,
  setServicePath,
  t,
}: {
  servicePath: ServicePath | "";
  setServicePath: (v: ServicePath) => void;
  t: StepT;
}) {
  const cards: {
    value: ServicePath;
    label: string;
    body: string;
    tag: string;
  }[] = [
    {
      value: "commission",
      label: t("steps.serviceStep.commissionLabel"),
      body: t("steps.serviceStep.commissionBody"),
      tag: t("steps.serviceStep.commissionTag"),
    },
    {
      value: "full_service",
      label: t("steps.serviceStep.fullServiceLabel"),
      body: t("steps.serviceStep.fullServiceBody"),
      tag: t("steps.serviceStep.fullServiceTag"),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-xl font-semibold text-gray-900 dark:text-white">
          {t("steps.serviceStep.title")}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-white/50">
          {t("steps.serviceStep.subtitle")}
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label={t("steps.serviceStep.title")}
        className="grid gap-4 sm:grid-cols-2"
      >
        {cards.map((c) => {
          const selected = servicePath === c.value;
          return (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setServicePath(c.value)}
              className={cn(
                "flex flex-col items-start gap-3 rounded-2xl border p-5 text-left transition-all",
                selected
                  ? "border-brandCareer bg-brandCareer-50/40 ring-2 ring-brandCareer/20 dark:bg-brandCareer/10"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/60 dark:border-white/[0.08] dark:hover:border-white/20 dark:hover:bg-white/[0.04]",
              )}
            >
              <div className="flex w-full items-center justify-between gap-3">
                <span className="font-semibold text-gray-900 dark:text-white">
                  {c.label}
                </span>
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    selected
                      ? "border-brandCareer bg-brandCareer text-white"
                      : "border-gray-300 dark:border-white/20",
                  )}
                >
                  {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-white/50">{c.body}</p>
              <span className="rounded-full bg-brandCareer-50 px-2.5 py-0.5 text-[11px] font-medium text-brandCareer-700 dark:bg-brandCareer/10 dark:text-amber-200">
                {c.tag}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — Review (read-only recap + per-section Edit + optional note + Submit).
// ─────────────────────────────────────────────────────────────────────────────
function StepReview({
  sectorLabel,
  roleRows,
  tradeLabel,
  experience,
  minTier,
  certifications,
  languages,
  wageMin,
  wageMax,
  currency,
  hours,
  accommodation,
  accommodationNote,
  duration,
  startDate,
  servicePath,
  note,
  setNote,
  onEdit,
  t,
  tc,
}: {
  sectorLabel: string;
  roleRows: RoleRow[];
  tradeLabel: (slug: string) => string;
  experience: string;
  minTier: string;
  certifications: string[];
  languages: string[];
  wageMin: string;
  wageMax: string;
  currency: string;
  hours: string;
  accommodation: boolean;
  accommodationNote: string;
  duration: string;
  startDate: string;
  servicePath: ServicePath | "";
  note: string;
  setNote: (v: string) => void;
  onEdit: (step: number) => void;
  t: StepT;
  tc: StepT;
}) {
  const none = t("none");
  const wageDisplay =
    wageMin && wageMax ? `${wageMin} – ${wageMax} ${currency}` : none;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-xl font-semibold text-gray-900 dark:text-white">
          {t("steps.reviewStep.title")}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-white/50">
          {t("steps.reviewStep.subtitle")}
        </p>
      </div>

      {/* Roles section */}
      <ReviewSection
        title={t("steps.reviewStep.rolesSection")}
        onEdit={() => onEdit(0)}
        editLabel={t("edit")}
      >
        <dl className="space-y-1.5 text-sm">
          <ReviewRow label={t("steps.rolesStep.sectorLabel")} value={sectorLabel || none} />
          <div>
            <dt className="text-gray-500 dark:text-white/50">
              {t("steps.rolesStep.roleLabel")}
            </dt>
            <dd className="mt-1 flex flex-wrap gap-2">
              {roleRows.length > 0
                ? roleRows.map((r) => (
                    <span
                      key={r.trade}
                      className="inline-flex items-center gap-1.5 rounded-full bg-brandCareer-50 px-3 py-1 text-xs font-medium text-brandCareer-700 dark:bg-brandCareer/10 dark:text-amber-200"
                    >
                      {tradeLabel(r.trade)} × {r.headcount}
                    </span>
                  ))
                : none}
            </dd>
          </div>
        </dl>
      </ReviewSection>

      {/* Requirements section */}
      <ReviewSection
        title={t("steps.reviewStep.requirementsSection")}
        onEdit={() => onEdit(1)}
        editLabel={t("edit")}
      >
        <dl className="space-y-1.5 text-sm">
          <ReviewRow
            label={t("steps.requirementsStep.experienceLabel")}
            value={
              experience
                ? tc(`careerVertical.pool.experienceBand.${experience}`)
                : t("anyOption")
            }
          />
          <ReviewRow
            label={t("steps.requirementsStep.tierLabel")}
            value={minTier ? tc(`careerVertical.pool.skillTier.${minTier}`) : t("anyOption")}
          />
          <ReviewRow
            label={t("steps.requirementsStep.certificationsLabel")}
            value={certifications.length > 0 ? certifications.join(", ") : t("anyOption")}
          />
          <ReviewRow
            label={t("steps.requirementsStep.languagesLabel")}
            value={languages.length > 0 ? languages.join(", ") : t("anyOption")}
          />
        </dl>
      </ReviewSection>

      {/* Terms section */}
      <ReviewSection
        title={t("steps.reviewStep.termsSection")}
        onEdit={() => onEdit(2)}
        editLabel={t("edit")}
      >
        <dl className="space-y-1.5 text-sm">
          <ReviewRow label={t("steps.termsStep.wageRangeLabel")} value={wageDisplay} />
          <ReviewRow label={t("steps.termsStep.hoursLabel")} value={hours || none} />
          <ReviewRow
            label={t("steps.termsStep.accommodationLabel")}
            value={
              accommodation
                ? accommodationNote
                  ? `${t("steps.termsStep.accommodationYes")} — ${accommodationNote}`
                  : t("steps.termsStep.accommodationYes")
                : t("steps.termsStep.accommodationNo")
            }
          />
          <ReviewRow label={t("steps.termsStep.durationLabel")} value={duration || none} />
          <ReviewRow label={t("steps.termsStep.startDateLabel")} value={startDate || none} />
        </dl>
      </ReviewSection>

      {/* Service path section */}
      <ReviewSection
        title={t("steps.reviewStep.serviceSection")}
        onEdit={() => onEdit(3)}
        editLabel={t("edit")}
      >
        <p className="text-sm text-gray-700 dark:text-white/70">
          {servicePath
            ? tc(`careerVertical.employer.servicePath.${servicePath}`)
            : none}
        </p>
      </ReviewSection>

      {/* Optional note to RoNa */}
      <div>
        <label htmlFor="req-note" className={LABEL_CLASS}>
          {t("steps.reviewStep.noteLabel")}
        </label>
        <textarea
          id="req-note"
          rows={3}
          value={note}
          placeholder={t("steps.reviewStep.notePlaceholder")}
          onChange={(e) => setNote(e.target.value)}
          className={cn(FIELD_CLASS, "resize-none")}
        />
      </div>
    </div>
  );
}

function ReviewSection({
  title,
  onEdit,
  editLabel,
  children,
}: {
  title: string;
  onEdit: () => void;
  editLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200/70 bg-gray-50/40 p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {title}
        </h3>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-brandCareer-700 transition-colors hover:text-brandCareer dark:text-amber-300 dark:hover:text-amber-200"
        >
          <Pencil className="h-3.5 w-3.5" />
          {editLabel}
        </button>
      </div>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-gray-500 dark:text-white/50">{label}</dt>
      <dd className="font-medium text-gray-900 dark:text-white">{value}</dd>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Success screen (analog of RequestConfirmation) — amber success panel.
// ─────────────────────────────────────────────────────────────────────────────
function RequisitionConfirmation({
  requisitionId,
  sectorLabel,
  roleCount,
  servicePathLabel,
  onCreateAnother,
}: {
  requisitionId: string;
  sectorLabel: string;
  roleCount: number;
  servicePathLabel: string;
  onCreateAnother: () => void;
}) {
  const t = useTranslations("careerVertical.employer.requisitionWizard");

  return (
    <div className="mx-auto max-w-3xl">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-3xl border border-brandCareer/20 bg-brandCareer-50/60 p-8 text-center shadow-xl dark:border-brandCareer/20 dark:bg-brandCareer/10 dark:shadow-none md:p-12"
      >
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-amber-600 shadow-lg shadow-amber-500/30">
          <CheckCircle2 className="h-7 w-7 text-white" />
        </div>
        <h2 className="font-serif text-2xl font-semibold text-brandCareer-700 dark:text-amber-200">
          {t("successTitle")}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-600 dark:text-white/60">
          {t("successBody")}
        </p>

        {(sectorLabel || roleCount > 0 || servicePathLabel) && (
          <dl className="mx-auto mt-6 max-w-sm space-y-2 rounded-2xl border border-brandCareer/15 bg-white/70 px-5 py-4 text-left text-sm dark:border-white/[0.06] dark:bg-white/[0.04]">
            {sectorLabel ? (
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500 dark:text-white/50">
                  {t("steps.rolesStep.sectorLabel")}
                </dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {sectorLabel}
                </dd>
              </div>
            ) : null}
            {roleCount > 0 ? (
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500 dark:text-white/50">
                  {t("steps.rolesStep.roleLabel")}
                </dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {roleCount}
                </dd>
              </div>
            ) : null}
            {servicePathLabel ? (
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500 dark:text-white/50">
                  {t("steps.reviewStep.serviceSection")}
                </dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {servicePathLabel}
                </dd>
              </div>
            ) : null}
          </dl>
        )}

        <div className="mt-7 flex flex-col-reverse items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onCreateAnother}
            className="w-full rounded-xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-white/[0.08] dark:text-white/60 dark:hover:bg-white/[0.04] sm:w-auto"
          >
            {t("createAnother")}
          </button>
          {/* Typed Link to the requisition detail (registered gated route). */}
          <Link
            href={{
              pathname: "/career/employer/dashboard/requisitions/[id]",
              params: { id: requisitionId },
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 transition-all hover:shadow-xl hover:shadow-amber-500/30 sm:w-auto"
          >
            {t("viewRequisition")}
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public export — outer Suspense (amber-swapped fallback, mirror the mirror).
// ─────────────────────────────────────────────────────────────────────────────
export function RequisitionWizard({ sectors, employerId }: Props) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brandCareer" />
        </div>
      }
    >
      <RequisitionWizardInner sectors={sectors} employerId={employerId} />
    </Suspense>
  );
}
