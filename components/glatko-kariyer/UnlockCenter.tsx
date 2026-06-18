"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  BadgeCheck,
  Clock,
  FileText,
  Loader2,
  Lock,
  MapPin,
  Phone,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import type { EmployerUnlock } from "@/lib/kariyer/queries";
import { intlLocale } from "@/lib/kariyer/intl";

/**
 * Glatko Kariyer — Unlock / Reveal Center client island (Spec 16).
 *
 * MIRRORS the client idiom of components/glatko-saglik/BookingForm.tsx (POST →
 * branch on status → busy/error) and the `reserve` half of BookingWidget.tsx
 * (typed router, fetch with status branch). This is the TERMINAL surface of the
 * reveal flow — the only place an employer ever sees a worker's FULL dossier.
 *
 * Gate-state machine (PART 4 steps 1→4) derived per row from
 * (ownerApproved, paymentStatus, unlockedAt, available):
 *   1. interest   — ownerApproved=false                    → amber pill, no pay
 *   2. approved   — ownerApproved && paymentStatus!=='paid' → amber pill + Pay CTA
 *   3. paying     — isPending on the Pay action            → spinner, disabled
 *   4. unlocked   — paymentStatus==='paid' && unlockedAt   → GREEN pill + dossier
 *   5. locked/err — available=false / row error            → muted "unavailable"
 *
 * State is server-authoritative: after a successful pay we `router.refresh()`
 * and the card re-renders from FRESH server data into `unlocked` (the client
 * never fabricates the unlock locally — the gate is the RPC + signer, R6/R8 #1).
 *
 * Accent = amber / brandCareer (swaps health's teal/brandHealth). The Pay button
 * is the one solid amber CTA here (bg-brandCareer); the unlocked completion pill
 * is GREEN/success (completion, not a call-to-action). Worker is NEVER charged
 * (R7): every fee string is employer-direction only.
 *
 * Phase-0 STUB: Pay POSTs to /api/career/unlocks/pay (no real money). Real
 * escrow/PSP integration lands in Phase 2 (plan §Phase 2). Per-document signed
 * URLs are minted ON DEMAND via /api/career/documents/sign (R6) — never
 * pre-minted server-side into the payload, so each access stays short-lived and
 * is logged.
 */

/** A revealed document manifest entry — id + category + label, NO bytes/URL. */
export type UnlockDocument = {
  id: string;
  category: string;
  label: string;
};

/**
 * A fully-resolved unlock row the server page passes to this island. Extends the
 * always-safe anonymized {@link EmployerUnlock} with fields that are PRESENT
 * ONLY on the rows where they are gate-allowed (R8 #1):
 *  - `fee`      — for `approved`+ rows (employer-direction price summary).
 *  - identity   — `revealedName`/`revealedContact`/`revealedLocation` AND
 *                 `documents` — present ONLY on `unlocked` rows; the data layer
 *                 MUST NOT ship these for any non-unlocked row.
 *  - `available` — false when consent was revoked / the worker was de-showcased
 *                 after unlock (render the muted "no longer available" note).
 */
export type UnlockCenterRow = EmployerUnlock & {
  role: string | null;
  trade: string | null;
  available: boolean;
  fee: {
    amount: number;
    currency: string;
    pathLabel: string;
  } | null;
  revealedName: string | null;
  revealedContact: string | null;
  revealedLocation: string | null;
  documents: UnlockDocument[];
};

type UnlockCenterProps = {
  rows: UnlockCenterRow[];
  locale: string;
};

type GateState = "interest" | "approved" | "unlocked" | "unavailable";

function deriveState(row: UnlockCenterRow): GateState {
  if (!row.available) return "unavailable";
  if (row.paymentStatus === "paid" && row.unlockedAt != null) return "unlocked";
  if (row.ownerApproved) return "approved";
  return "interest";
}

export function UnlockCenter({ rows, locale }: UnlockCenterProps) {
  const t = useTranslations("careerVertical");
  const u = (k: string, values?: Record<string, string | number>) =>
    t(`employer.unlocks.${k}`, values);

  const dateFmt = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mt-8 space-y-4" aria-live="polite">
      {rows.map((row) => (
        <UnlockCard key={row.id} row={row} u={u} dateFmt={dateFmt} locale={locale} />
      ))}
    </div>
  );
}

function UnlockCard({
  row,
  u,
  dateFmt,
  locale,
}: {
  row: UnlockCenterRow;
  u: (k: string, values?: Record<string, string | number>) => string;
  dateFmt: Intl.DateTimeFormat;
  locale: string;
}) {
  const router = useRouter();
  const [isPaying, startPay] = useTransition();
  const state = deriveState(row);

  // ── Pay action (Phase-0 STUB) ──────────────────────────────────────────────
  // POSTs to the stub endpoint; the employer identity is derived server-side from
  // the cookie session (R1) — we only send the unlockId. On success the row is
  // re-read from the server (router.refresh) and re-renders into `unlocked`; the
  // client never flips the gate locally (defense in depth, R6/R8 #1).
  function pay() {
    startPay(async () => {
      try {
        const res = await fetch("/api/career/unlocks/pay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unlockId: row.id }),
        });
        if (res.ok) {
          toast.success(u("toast.paySuccess"));
          router.refresh();
          return;
        }
        // The button shouldn't render in an unapproved state, but the route never
        // trusts the client → NOT_APPROVED surfaces as a 409 toast, row unchanged.
        if (res.status === 409) {
          toast.error(u("toast.payNotApproved"));
          return;
        }
        toast.error(u("toast.payError"));
      } catch {
        toast.error(u("toast.payError"));
      }
    });
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-premium-sm dark:border-white/10 dark:bg-white/5">
      {/* Anonymized header — always safe to show (worker_code + role/trade). */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-base font-semibold text-gray-900 dark:text-white">
            {row.workerCode}
          </p>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-white/70">
            {[row.role, row.trade].filter(Boolean).join(" · ")}
          </p>
          {row.requisitionId && (
            <p className="mt-1 text-xs text-gray-400 dark:text-white/40">
              {u("requisitionRefLabel")}: {row.requisitionId}
            </p>
          )}
        </div>
        <StatePill state={state} u={u} />
      </div>

      {/* State-specific body. aria-live so a pending→approved→unlocked transition
          (after router.refresh) and pay-success/error are announced (Spec 16). */}
      <div
        className="mt-4 border-t border-gray-100 pt-4 dark:border-white/5"
        aria-live="polite"
        aria-label={u("statusRegionLabel")}
      >
        {state === "unavailable" && (
          <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-white/50">
            <Lock className="h-4 w-4 shrink-0" />
            {u("unavailableNote")}
          </p>
        )}

        {state === "interest" && (
          <p className="text-sm text-gray-600 dark:text-white/70">
            {u("interestBody")}
          </p>
        )}

        {state === "approved" && (
          <div className="space-y-4">
            {row.fee && (
              <div className="rounded-xl bg-brandCareer-50 p-4 dark:bg-brandCareer/10">
                <p className="text-xs font-semibold uppercase tracking-wider text-brandCareer-700 dark:text-brandCareer">
                  {u("feeSummary.title")}
                </p>
                <div className="mt-2 flex items-baseline justify-between text-sm">
                  <span className="text-gray-600 dark:text-white/70">
                    {u("feeSummary.amountLabel")}
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {new Intl.NumberFormat(intlLocale(locale), {
                      style: "currency",
                      currency: row.fee.currency,
                      maximumFractionDigits: 0,
                    }).format(row.fee.amount)}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between text-sm">
                  <span className="text-gray-600 dark:text-white/70">
                    {u("feeSummary.pathLabel")}
                  </span>
                  <span className="text-gray-900 dark:text-white">
                    {row.fee.pathLabel}
                  </span>
                </div>
              </div>
            )}

            {/* The one solid amber CTA on this surface (mirrors health's solid CTA
                geometry). useTransition pending guards a double-submit (Spec 16). */}
            <button
              type="button"
              onClick={pay}
              disabled={isPaying}
              aria-live="polite"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brandCareer px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 transition-all hover:shadow-amber-500/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPaying && <Loader2 className="h-4 w-4 animate-spin" />}
              {isPaying ? u("pay.processing") : u("pay.cta")}
            </button>
          </div>
        )}

        {state === "unlocked" && (
          <Dossier row={row} u={u} dateFmt={dateFmt} />
        )}
      </div>
    </section>
  );
}

function StatePill({
  state,
  u,
}: {
  state: GateState;
  u: (k: string, values?: Record<string, string | number>) => string;
}) {
  if (state === "unlocked") {
    // Completion → GREEN/success, NOT amber (completion is not a call-to-action).
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
        <BadgeCheck className="h-3.5 w-3.5" />
        {u("pill.unlocked")}
      </span>
    );
  }
  if (state === "unavailable") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500 dark:bg-white/10 dark:text-white/50">
        <Lock className="h-3.5 w-3.5" />
        {u("pill.interest")}
      </span>
    );
  }
  // interest + approved → amber wayfinding (brandCareer-50 / brandCareer-700).
  const label = state === "approved" ? u("pill.approved") : u("pill.interest");
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brandCareer-50 px-3 py-1 text-xs font-medium text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
      <Clock className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

/** Unlocked dossier (state 4 — the ONLY place identity appears). */
function Dossier({
  row,
  u,
  dateFmt,
}: {
  row: UnlockCenterRow;
  u: (k: string, values?: Record<string, string | number>) => string;
  dateFmt: Intl.DateTimeFormat;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {row.revealedName && (
          <p className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
            <User className="h-4 w-4 shrink-0 text-brandCareer-700 dark:text-brandCareer" />
            <span className="font-medium">{row.revealedName}</span>
          </p>
        )}
        {row.revealedContact && (
          <p className="flex items-center gap-2 text-sm text-gray-700 dark:text-white/80">
            <Phone className="h-4 w-4 shrink-0 text-brandCareer-700 dark:text-brandCareer" />
            <span>{row.revealedContact}</span>
          </p>
        )}
        {row.revealedLocation && (
          <p className="flex items-start gap-2 text-sm text-gray-700 dark:text-white/80">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brandCareer-700 dark:text-brandCareer" />
            <span>{row.revealedLocation}</span>
          </p>
        )}
        {row.unlockedAt && (
          <p className="text-xs text-gray-400 dark:text-white/40">
            {u("unlockedAtLabel")}: {dateFmt.format(new Date(row.unlockedAt))}
          </p>
        )}
      </div>

      {row.documents.length > 0 && (
        <div className="border-t border-gray-100 pt-4 dark:border-white/5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
            {u("dossier.documentsTitle")}
          </p>
          <ul className="mt-3 space-y-2">
            {row.documents.map((doc) => (
              <DocumentRow key={doc.id} unlockId={row.id} doc={doc} u={u} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Per-document signed-URL fetch ON DEMAND (R6): on click, POST to the signer
 * route → receive a short-lived URL → open it. The client never holds a
 * persistent URL; the signer re-checks the unlock gate + logs every issuance.
 * Per-row loading/error (role="alert" on failure) — a failed sign shows an
 * error, not a broken link.
 */
function DocumentRow({
  unlockId,
  doc,
  u,
}: {
  unlockId: string;
  doc: UnlockDocument;
  u: (k: string, values?: Record<string, string | number>) => string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function open() {
    setError(false);
    setLoading(true);
    try {
      const res = await fetch("/api/career/documents/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unlockId, documentId: doc.id }),
      });
      const payload = (await res.json().catch(() => ({}))) as { url?: string };
      if (res.ok && payload.url) {
        window.open(payload.url, "_blank", "noopener,noreferrer");
        return;
      }
      setError(true);
      toast.error(u("toast.signError"));
    } catch {
      setError(true);
      toast.error(u("toast.signError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-white/5">
      <span className="flex min-w-0 items-center gap-2 text-sm text-gray-700 dark:text-white/80">
        <FileText className="h-4 w-4 shrink-0 text-brandCareer-700 dark:text-brandCareer" />
        <span className="truncate">{doc.label}</span>
      </span>
      <div className="flex shrink-0 items-center gap-2">
        {error && (
          <span role="alert" className="text-xs text-red-600 dark:text-red-300">
            {u("doc.error")}
          </span>
        )}
        <button
          type="button"
          onClick={open}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brandCareer-700 hover:bg-brandCareer-50 disabled:opacity-60 dark:text-brandCareer dark:hover:bg-brandCareer/10"
        >
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {loading ? u("doc.opening") : u("doc.view")}
        </button>
      </div>
    </li>
  );
}
