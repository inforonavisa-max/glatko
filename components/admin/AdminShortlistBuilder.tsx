"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  Search,
  Send,
  Trash2,
} from "lucide-react";

import {
  addShortlistItem,
  removeShortlistItem,
  publishShortlist,
} from "@/app/[locale]/admin/career/shortlists/actions";
import type {
  AdminShortlistData,
  AdminShortlistItemRow,
  AdminCandidateRow,
} from "@/lib/kariyer/admin-shortlist-types";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Spec 26 — AdminShortlistBuilder (owner/RoNa-Legal console).
//
// Mirrors components/admin/AdminReviewsList.tsx: a "use client" list with
// per-row action buttons calling server actions in useTransition, with
// pendingId/error local state. The page (shortlists/page.tsx) reads via
// createAdminClient() → SECURITY DEFINER RPCs and passes the data in.
//
// Admin chrome is TR-hardcoded by policy (admin-i18n deferred, TODO i18n-b4).
// These are NOT routed through the careerVertical.* dictionary (that covers only
// the public/employer/worker surfaces).
//
// Accent = amber / brandCareer (swaps health's teal). R-gate discipline: this
// surface renders ZERO PII — only anonymized attributes + the worker CODE —
// even though career_admin_search_workers returns decrypted fields. R7: no
// worker-side fee/price anywhere on this surface.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  /** Requisition header + current (un-presented) shortlist + shortlist id. */
  data: AdminShortlistData;
  /** Anonymized candidate-search results for the Add panel. */
  candidates: AdminCandidateRow[];
  /** Current search query (worker code / role / trade / region), echoed back. */
  query: string;
  /** Current verification filter value ("all" = no filter). */
  verification: string;
  locale: string;
}

// Verification filter pills (curation, not unlock) — TR-hardcoded chrome.
const VERIFICATION_FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Tümü" },
  { value: "pending", label: "Beklemede" },
  { value: "id_verified", label: "Kimlik" },
  { value: "skills_verified", label: "Beceri" },
  { value: "documents_verified", label: "Belge" },
  { value: "interview_passed", label: "Mülakat" },
];

// Requisition status pills — neutral grays + one amber for the owner-action
// status (mirrors AdminCareerRequisitionsList). Past shortlist_ready locks the
// builder read-only.
const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  submitted: {
    label: "Alındı",
    cls: "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-white/60",
  },
  under_curation: {
    label: "İncelemede",
    cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  shortlist_ready: {
    label: "Aday Hazır",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  interest_expressed: {
    label: "İlgi Bildirildi",
    cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  approved: {
    label: "Onaylandı",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  placed: {
    label: "Yerleşti",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  in_guarantee: {
    label: "Garantide",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
};

// Statuses at/after which the whole builder is read-only (shortlist already
// consumed downstream — Spec 26 §"Locked / already-published").
const LOCKED_STATUSES = new Set<string>([
  "interest_expressed",
  "approved",
  "placed",
  "in_guarantee",
]);

function readinessCls(score: number | null): string {
  if (score == null)
    return "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-white/50";
  if (score >= 70)
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (score >= 40)
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-white/50";
}

export function AdminShortlistBuilder({
  data,
  candidates,
  query,
  verification,
  locale,
}: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const { requisition, shortlistId, presentedToEmployer, items } = data;
  const status = requisition.status;
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.submitted;
  const readOnly = LOCKED_STATUSES.has(status);
  const itemCount = items.length;

  // worker codes already on the shortlist → disable Add in the search panel.
  const onShortlist = new Set(
    items.map((it: AdminShortlistItemRow) => it.workerCode),
  );

  // Publish: blocked when empty, when read-only, or when no shortlist exists yet
  // (lazily created on first add — the page re-reads its id afterward).
  const canPublish = !readOnly && itemCount > 0 && shortlistId != null;

  const add = (workerCode: string) => {
    if (readOnly) return;
    setPendingId(`add:${workerCode}`);
    setError(null);
    startTransition(async () => {
      const result = await addShortlistItem(requisition.id, workerCode, "sourced");
      if (!result.success) setError(result.error ?? "İşlem başarısız");
      setPendingId(null);
    });
  };

  const remove = (itemId: string) => {
    if (readOnly) return;
    setPendingId(`item:${itemId}`);
    setError(null);
    startTransition(async () => {
      const result = await removeShortlistItem(itemId, requisition.id);
      if (!result.success) setError(result.error ?? "İşlem başarısız");
      setPendingId(null);
    });
  };

  const publish = () => {
    if (!canPublish || shortlistId == null) return;
    setPendingId("publish");
    setError(null);
    startTransition(async () => {
      const result = await publishShortlist(shortlistId, requisition.id);
      if (!result.success) setError(result.error ?? "İşlem başarısız");
      setPendingId(null);
    });
  };

  return (
    <div>
      {/* Back link to the requisitions list. */}
      <Link
        href={`/${locale}/admin/career/requisitions`}
        className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-white/50 dark:hover:text-white/80"
      >
        ← Talepler
      </Link>

      <h1 className="mt-2 font-serif text-2xl font-bold text-gray-900 dark:text-white">
        Aday listesi
      </h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-white/40">
        Anonim adayları küratörle ve işverene sun.
      </p>

      {error && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* ── 1) Requisition summary card (read-only) ───────────────────────── */}
      <section className="mt-6 rounded-2xl border border-gray-200/80 bg-white/80 p-5 dark:border-white/[0.08] dark:bg-white/[0.04]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium text-gray-900 dark:text-white">
              {requisition.sectorLabel ?? "—"}
            </span>
            <span className="text-sm text-gray-500 dark:text-white/40">
              {requisition.role ?? "—"}
              {requisition.headcount ? ` ×${requisition.headcount}` : ""}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                badge.cls,
              )}
            >
              {badge.label}
            </span>
            <span className="rounded-full bg-brandCareer-50 px-2 py-0.5 text-[11px] font-semibold text-brandCareer-700 dark:bg-amber-500/15 dark:text-amber-300">
              {requisition.servicePath === "full_service"
                ? "Tam hizmet"
                : "Komisyon"}
            </span>
          </div>
          <span className="text-xs text-gray-500 dark:text-white/40">
            {new Date(requisition.createdAt).toLocaleDateString("tr", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
        {requisition.requirementsSummary && (
          <p className="mt-3 text-sm text-gray-700 dark:text-neutral-300">
            {requisition.requirementsSummary}
          </p>
        )}
      </section>

      {/* ── 2) Current shortlist (builder body) ───────────────────────────── */}
      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-serif text-lg font-semibold text-gray-900 dark:text-white">
              Aday listesi ({itemCount})
            </h2>
            {presentedToEmployer && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-brandCareer-700 dark:bg-amber-500/15 dark:text-amber-300">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Yayınlandı
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={publish}
            disabled={!canPublish || pendingId === "publish"}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brandCareer px-4 py-2 text-xs font-semibold text-white transition hover:bg-brandCareer-700 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
            {pendingId === "publish"
              ? "İşleniyor…"
              : presentedToEmployer
                ? "Yeniden yayınla"
                : "Yayınla"}
          </button>
        </div>

        {/* Re-publish hint: changed after a publish (re-publish is idempotent). */}
        {presentedToEmployer && !readOnly && (
          <p className="mt-2 text-xs text-gray-500 dark:text-white/40">
            Değişiklikler işverene yansıması için yeniden yayınlanmalı.
          </p>
        )}
        {readOnly && (
          <p className="mt-2 text-xs text-gray-500 dark:text-white/40">
            Talep süreci ilerledi — liste salt-okunur.
          </p>
        )}

        {itemCount === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-200/80 py-12 text-center text-sm text-gray-500 dark:border-white/[0.08] dark:text-white/40">
            Bu talebe henüz aday eklenmedi
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {items.map((it: AdminShortlistItemRow) => (
              <ShortlistItemCard
                key={it.itemId}
                item={it}
                pending={pendingId === `item:${it.itemId}`}
                readOnly={readOnly}
                onRemove={() => remove(it.itemId)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── 3) Add candidates panel ───────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="font-serif text-lg font-semibold text-gray-900 dark:text-white">
          Aday ekle
        </h2>

        {/* Search submits via GET → the server page re-reads search_workers with
            the new ?q / ?verification (mirrors reviews' filter <Link>s — no
            client-side fetch). */}
        <form
          method="get"
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <div className="relative flex-1 min-w-[200px]">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-white/40"
              aria-hidden
            />
            <input
              type="text"
              name="q"
              defaultValue={query}
              placeholder="Çalışan kodu / rol / meslek / bölge"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/30"
            />
          </div>
          {/* Preserve the active verification filter across searches. */}
          {verification !== "all" && (
            <input type="hidden" name="verification" value={verification} />
          )}
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 px-4 py-2 text-xs font-semibold text-brandCareer-700 transition hover:bg-brandCareer-50 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/10"
          >
            <Search className="h-3.5 w-3.5" aria-hidden />
            Ara
          </button>
        </form>

        {/* Verification filter pills — preserve the current ?q. */}
        <div className="mt-3 flex flex-wrap gap-2">
          {VERIFICATION_FILTERS.map((f) => {
            const params = new URLSearchParams();
            if (query) params.set("q", query);
            if (f.value !== "all") params.set("verification", f.value);
            const qs = params.toString();
            return (
              <Link
                key={f.value}
                href={`/${locale}/admin/career/requisitions/${requisition.id}${
                  qs ? `?${qs}` : ""
                }`}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
                  verification === f.value
                    ? "bg-brandCareer text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-white/60",
                )}
              >
                {f.label}
              </Link>
            );
          })}
        </div>

        {candidates.length === 0 ? (
          <div className="mt-6 py-10 text-center text-sm text-gray-500 dark:text-white/40">
            Aday bulunamadı
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {candidates.map((c) => {
              const already = onShortlist.has(c.workerCode);
              return (
                <CandidateRow
                  key={c.workerCode}
                  candidate={c}
                  already={already}
                  disabled={readOnly}
                  pending={pendingId === `add:${c.workerCode}`}
                  onAdd={() => add(c.workerCode)}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Current-shortlist card — anonymized attributes + worker code + stage + Remove.
// Shows a warning marker when the worker is no longer showcased (the employer
// read silently drops it — Spec 26 §"Worker un-showcased after adding").
// ─────────────────────────────────────────────────────────────────────────────
function ShortlistItemCard({
  item,
  pending,
  readOnly,
  onRemove,
}: {
  item: AdminShortlistItemRow;
  pending: boolean;
  readOnly: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {/* R-gate: worker CODE only — never a name/phone/email/passport. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
              {item.workerCode}
            </span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-white/10 dark:text-white/60">
              {item.stage}
            </span>
            {item.readinessScore != null && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  readinessCls(item.readinessScore),
                )}
              >
                {item.readinessScore}
              </span>
            )}
            {!item.isShowcased && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                Vitrinde değil
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-white/40">
            {[item.role, item.trade, item.skillTier, item.experienceBand, item.region]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>

        <button
          type="button"
          onClick={onRemove}
          disabled={pending || readOnly}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          {pending ? "İşleniyor…" : "Kaldır"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidate-search row — anonymized fields + worker code only. Add button is
// amber-outline; disabled (→ "Eklendi") when the worker is already on the list.
// ─────────────────────────────────────────────────────────────────────────────
function CandidateRow({
  candidate,
  already,
  disabled,
  pending,
  onAdd,
}: {
  candidate: AdminCandidateRow;
  already: boolean;
  disabled: boolean;
  pending: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
              {candidate.workerCode}
            </span>
            {candidate.verificationStatus && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-white/10 dark:text-white/60">
                {candidate.verificationStatus}
              </span>
            )}
            {candidate.readinessScore != null && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  readinessCls(candidate.readinessScore),
                )}
              >
                {candidate.readinessScore}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-white/40">
            {[
              candidate.role,
              candidate.trade,
              candidate.skillTier,
              candidate.experienceBand,
              candidate.region,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>

        <button
          type="button"
          onClick={onAdd}
          disabled={already || disabled || pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-brandCareer-700 transition hover:bg-brandCareer-50 disabled:opacity-50 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/10"
        >
          {already ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Eklendi
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {pending ? "İşleniyor…" : "Ekle"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
