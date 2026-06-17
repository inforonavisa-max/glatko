"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheck, Heart, Loader2, Lock, Send } from "lucide-react";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";

/**
 * Glatko Kariyer — express-interest CTA (Spec 09, the conversion event of the
 * vertical). Client island modeled on the `reserve` callback half of
 * components/glatko-saglik/BookingWidget.tsx: POST → branch on status → flip UI.
 * Unlike BookingWidget (manual `busy` state for a fetch sequence) this surface has
 * a single fire-and-forget POST, so it uses `useTransition` (Spec 09 §client island).
 *
 * Routing: `Link`/`useRouter` come from `@/i18n/navigation` (NOT next/navigation)
 * so the login redirect is locale-correct — exactly as the health components do.
 *
 * Toast: this surface deliberately uses `sonner` as the ONLY failure channel
 * (health renders inline <p role="alert">; the task contract picks toast here).
 * The <Toaster /> is mounted once near the gated-group root layout.
 *
 * Accent = amber / brandCareer (swaps health's teal). This is the ONE place a SOLID
 * amber button is correct — the conversion CTA, analogous to health's solid-teal CTA.
 *
 * IDENTITY FIREWALL (R1/R7): the POST body carries ONLY { workerCode, requisitionId? };
 * the employer is derived server-side from the cookie session, never the body. No
 * fee/price/payment copy appears — the worker is never charged.
 */

type ExpressInterestButtonProps = {
  /** Anonymized worker code (already validated server-side). */
  workerCode: string;
  /**
   * Optional requisition to fold the interest into (R10 — same endpoint, the id
   * rides in the body). When present the CTA reads "Talebe Ekle" (add-to-requisition).
   */
  requisitionId?: string;
  /** Viewer is a logged-in employer. When false the CTA routes to login instead of posting. */
  isEmployer: boolean;
  /** A reveal_unlocks row already exists for this employer+worker (server-provided). */
  alreadyExpressed: boolean;
  locale: string;
};

type InterestResponse = {
  ok?: boolean;
  status?: string;
  existing?: boolean;
  error?: string;
};

export function ExpressInterestButton({
  workerCode,
  requisitionId,
  isEmployer,
  alreadyExpressed,
}: ExpressInterestButtonProps) {
  const t = useTranslations("careerVertical.interest");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Server-provided already-expressed paints the success pill on first render; a
  // successful POST flips this on too (idempotent with the server state).
  const [expressed, setExpressed] = useState(alreadyExpressed);

  // ── locked / not-an-employer ──────────────────────────────────────────────
  // Anonymous viewers reach this state after the page rendered all anonymized
  // facts. Never a silent no-op: link to employer login (Spec 05/06 locked rule).
  if (!isEmployer) {
    return (
      <Link
        href={{ pathname: "/career/login" }}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-brandCareer/40 bg-brandCareer-50 px-4 py-3 text-sm font-semibold text-brandCareer-700 transition-colors hover:bg-white dark:border-brandCareer/30 dark:bg-brandCareer/15 dark:text-brandCareer dark:hover:bg-transparent"
      >
        <Lock className="h-4 w-4" />
        {t("loginRequired")}
      </Link>
    );
  }

  // ── success pill ──────────────────────────────────────────────────────────
  // Dossier stays LOCKED (owner_approved=false); this is NOT an unlock. Persists
  // across router.refresh() because the server re-reads reveal_unlocks state.
  if (expressed) {
    return (
      <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-brandCareer-50 px-4 py-3 text-sm font-semibold text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
        <BadgeCheck className="h-4 w-4 shrink-0" />
        <span>{t("sentPill")}</span>
      </div>
    );
  }

  const label = requisitionId ? t("addToRequisition") : t("expressInterest");

  // ── express interest → POST /api/career/interest ──────────────────────────
  // Body carries NO identity (employer derived from the cookie session server-side,
  // R1). 401 → route to login (defense in depth). Business codes map to toasts.
  const onClick = () => {
    if (isPending) return; // transition pending already guards double-submit
    startTransition(async () => {
      try {
        const res = await fetch("/api/career/interest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workerCode, requisitionId }),
        });

        if (res.status === 401) {
          router.push({ pathname: "/career/login" });
          return;
        }

        if (res.ok) {
          // Success → flip to the disabled "interest sent" pill AND refresh so the
          // server re-reads reveal_unlocks state (idempotent with `existing:true`).
          const data = (await res.json().catch(() => ({}))) as InterestResponse;
          setExpressed(true);
          if (!data.existing) toast.success(t("successToast"));
          router.refresh();
          return;
        }

        if (res.status === 403) {
          toast.error(t("errForbidden"));
          return;
        }
        if (res.status === 404 || res.status === 400) {
          toast.error(t("errNotFound"));
          return;
        }
        toast.error(t("errGeneric"));
      } catch {
        toast.error(t("errGeneric"));
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-brandCareer px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brandCareer/25 transition-all hover:shadow-brandCareer/40 disabled:opacity-60"
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : requisitionId ? (
        <Send className="h-4 w-4" />
      ) : (
        <Heart className="h-4 w-4" />
      )}
      {isPending ? t("sending") : label}
    </button>
  );
}
