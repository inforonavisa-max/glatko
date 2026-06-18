import { cn } from "@/lib/utils";

/**
 * Glatko Kariyer — requisition lifecycle status pill (Spec 12 §Status model).
 *
 * Tiny SYNC presentational server component: the caller derives the label (from
 * `careerVertical.employer.requisitionStatus.*`, 9 locales) and passes it in. No
 * health analog ships a pill set, so the visual models health's small badge
 * chips (rounded-full, tinted bg + text). The status→tone mapping is the
 * SURFACE's spine (Spec 12):
 *   submitted          → neutral gray
 *   under_curation     → amber-tinted   ("owner is working it")
 *   shortlist_ready    → amber solid-ish ("action available")
 *   interest_expressed → indigo-tinted  (employer acted, awaiting owner)
 *   approved           → green-tinted    (gate cleared / dossier released)
 *   placed             → green solid
 *   in_guarantee       → amber-tinted    (countdown affixed by the caller)
 *
 * Amber is WAYFINDING only — never paint a non-amber state amber. Any unknown /
 * future status string maps to the neutral tone (forward-compat, never crash on
 * an unmapped enum). Each tone carries its `dark:` parity variant 1:1.
 */

export type RequisitionStatusTone =
  | "neutral"
  | "amber"
  | "amberSolid"
  | "indigo"
  | "green"
  | "greenSolid";

/**
 * Map a raw `career.requisitions.status` string to a tone. Unrecognized values
 * fall through to "neutral" (Spec 12: never throw on an unmapped status).
 */
export function requisitionStatusTone(status: string): RequisitionStatusTone {
  switch (status) {
    case "submitted":
      return "neutral";
    case "under_curation":
      return "amber";
    case "shortlist_ready":
      return "amberSolid";
    case "interest_expressed":
      return "indigo";
    case "approved":
      return "green";
    case "placed":
      return "greenSolid";
    case "in_guarantee":
      return "amber";
    default:
      return "neutral";
  }
}

const TONE_CLASS: Record<RequisitionStatusTone, string> = {
  neutral:
    "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-white/60",
  amber:
    "bg-brandCareer-50 text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer",
  // Stronger amber = "action available" (Spec 12: shortlist ready).
  amberSolid:
    "bg-brandCareer/20 text-brandCareer-700 ring-1 ring-inset ring-brandCareer/30 dark:bg-brandCareer/25 dark:text-brandCareer",
  indigo:
    "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  green:
    "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  greenSolid:
    "bg-green-100 text-green-800 ring-1 ring-inset ring-green-600/20 dark:bg-green-500/20 dark:text-green-300",
};

export function RequisitionStatusPill({
  label,
  status,
  className,
}: {
  /** Localized label (caller resolves from requisitionStatus.* or a fallback). */
  label: string;
  /** Raw status string → tone. */
  status: string;
  /** Optional extra classes (e.g. the in-guarantee countdown caller adds none). */
  className?: string;
}) {
  const tone = requisitionStatusTone(status);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        TONE_CLASS[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
