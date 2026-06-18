"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Lock,
  Users,
  SearchX,
  Loader2,
  Check,
  X,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  BadgeCheck,
} from "lucide-react";
import {
  setWorkerVerification,
  verifyWorkerDocument,
} from "@/app/[locale]/admin/career/curation/actions";
import type { CareerAdminWorkerRow } from "@/app/[locale]/admin/career/curation/page";
import { cn } from "@/lib/utils";

interface Props {
  rows: CareerAdminWorkerRow[];
  locale: string;
  /** Current search query (preserved across pagination/clear links). */
  q: string;
  /** Active verification filter ("" = Tümü). */
  verification: string;
  /** Server pagination cursor (R12 — server-paginated, no infinite scroll). */
  offset: number;
  limit: number;
  /** True when the RPC returned a full page (a next page may exist). */
  hasMore: boolean;
}

// ── Admin chrome is TR-hardcoded by policy (admin-i18n policy; NOT careerVertical.*).
// Only the verification-status labels are translated to TR inline here. ───────────
const VERIFICATION_STATUSES: Array<{ value: string; label: string }> = [
  { value: "pending", label: "Beklemede" },
  { value: "id_verified", label: "Kimlik" },
  { value: "skills_verified", label: "Beceri" },
  { value: "documents_verified", label: "Belge" },
  { value: "interview_passed", label: "Mülakat" },
  { value: "rejected", label: "Reddedilmiş" },
];

const CONSENT_LABEL: Record<string, string> = {
  granted: "Doğrulandı",
  pending: "Beklemede",
  revoked: "Reddedildi",
};

function readinessTone(score: number): string {
  // The meter fill is always amber (brandCareer) per spec; the numeric label
  // uses brandCareer-700 once there's a real score, muted at zero. The ramp is
  // 50 / DEFAULT / 700 only — invent no shades.
  return score > 0 ? "text-brandCareer-700" : "text-gray-500 dark:text-white/40";
}

/**
 * Spec 25 — Talent curation list (owner-only, un-anonymized). THE single surface
 * in the product that renders a worker's real name / phone / email / passport in
 * clear text. Lives under /admin (inherits the email-allowlist gate), exempt from
 * CAREER_VERTICAL_ENABLED — admins always see it. PII reaches this client island by
 * design (R8 #1/#3 boundary); never reuse this island or its props on any
 * employer/worker surface. R7: NO fee/price field is shown or edited here.
 *
 * Mirrors components/admin/AdminReviewsList.tsx (server rows in, useTransition +
 * router.refresh() out — server is authoritative, no optimistic PII mutation).
 */
export function AdminWorkerCurationList({
  rows,
  locale,
  q,
  verification,
  offset,
  limit,
  hasMore,
}: Props) {
  const router = useRouter();
  // Per-action busy keys so other cards stay interactive while one acts.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const dateFmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const runVerification = (workerId: string, status: string) => {
    const key = `v:${workerId}:${status}`;
    setPendingKey(key);
    setError(null);
    startTransition(async () => {
      const result = await setWorkerVerification(workerId, status);
      if (!result.success) setError(result.error ?? "İşlem başarısız");
      // Server is authoritative — re-read fresh (re-decrypted) data.
      router.refresh();
      setPendingKey(null);
    });
  };

  const runDocument = (docId: string, approve: boolean) => {
    const key = `d:${docId}:${approve ? "ok" : "no"}`;
    setPendingKey(key);
    setError(null);
    startTransition(async () => {
      const result = await verifyWorkerDocument(docId, approve);
      if (!result.success) setError(result.error ?? "İşlem başarısız");
      router.refresh();
      setPendingKey(null);
    });
  };

  // ── Empty states (mirror the providers empty block: centered icon + title in a
  //    dashed/translucent card). Distinguish "no results for this query" from
  //    "pool genuinely empty" — neither is an error. ──────────────────────────
  if (rows.length === 0) {
    const filtered = q.trim() !== "" || verification !== "";
    return (
      <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200/60 bg-white/70 px-6 py-16 text-center backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
        {filtered ? (
          <SearchX className="h-14 w-14 text-brandCareer/30" strokeWidth={1.5} />
        ) : (
          <Users className="h-14 w-14 text-brandCareer/30" strokeWidth={1.5} />
        )}
        <h2 className="mt-4 font-serif text-lg font-semibold text-gray-700 dark:text-white/70">
          {filtered ? "Bu aramada işçi yok" : "Henüz havuzda işçi yok"}
        </h2>
        {filtered && (
          <Link
            href={`/${locale}/admin/career/curation`}
            className="mt-3 text-sm font-medium text-brandCareer-700 hover:underline"
          >
            Filtreyi temizle
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {error && (
        <p
          className="text-sm text-red-600 dark:text-red-400"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </p>
      )}

      {rows.map((w) => {
        const score = w.readinessScore ?? 0;
        return (
          <div
            key={w.id}
            className="rounded-2xl border border-gray-200/80 bg-white/70 p-5 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.04]"
          >
            {/* ── Header line: code · role · trade · region · bands + showcase ── */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                  {w.workerCode}
                </span>
                <span className="text-sm text-gray-600 dark:text-white/60">
                  {[w.role, w.trade].filter(Boolean).join(" · ") || "—"}
                </span>
                {w.region && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-white/[0.06] dark:text-white/60">
                    {w.region}
                  </span>
                )}
                {w.experienceBand && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-white/[0.06] dark:text-white/60">
                    {w.experienceBand}
                  </span>
                )}
                {w.ageBand && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-white/[0.06] dark:text-white/60">
                    {w.ageBand}
                  </span>
                )}
              </div>
              {w.isShowcased && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brandCareer-50 px-2 py-0.5 text-[11px] font-semibold text-brandCareer-700">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  Vitrinde
                </span>
              )}
            </div>

            {/* ── Un-anonymized identity block — the whole reason this surface
                exists. Neutral (gray) confidential panel, NOT amber. dir="auto"
                so mixed-script (Arabic) names render correctly. ─────────────── */}
            <div
              className="mt-4 rounded-xl border border-gray-200/70 bg-gray-50/80 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]"
              dir="auto"
            >
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/40">
                <Lock className="h-3 w-3" />
                Yalnızca dahili — RoNa Legal
              </p>
              <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-gray-700 dark:text-neutral-300 sm:grid-cols-2">
                <div className="flex gap-2">
                  <dt className="text-gray-400 dark:text-white/40">Ad Soyad</dt>
                  <dd className="font-medium">{w.fullName ?? "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-gray-400 dark:text-white/40">Telefon</dt>
                  <dd className="font-medium">{w.phone ?? "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-gray-400 dark:text-white/40">E-posta</dt>
                  <dd className="font-medium">{w.email ?? "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-gray-400 dark:text-white/40">Ülke</dt>
                  <dd className="font-medium">{w.exactCountry ?? "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-gray-400 dark:text-white/40">D. Tarihi</dt>
                  <dd className="font-medium">{w.dob ?? "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-gray-400 dark:text-white/40">Pasaport</dt>
                  <dd className="font-medium">{w.passportNo ?? "—"}</dd>
                </div>
                {w.address && (
                  <div className="flex gap-2 sm:col-span-2">
                    <dt className="text-gray-400 dark:text-white/40">Adres</dt>
                    <dd className="font-medium">{w.address}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* ── Body: skills/cert chips + languages + readiness meter ─────── */}
            {(w.skills.length > 0 || w.languages.length > 0) && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {w.skills.map((s) => (
                  <span
                    key={`sk-${s}`}
                    className="rounded-md bg-brandCareer-50 px-2 py-0.5 text-[11px] font-medium text-brandCareer-700"
                  >
                    {s}
                  </span>
                ))}
                {w.languages.map((lang) => (
                  <span
                    key={`lg-${lang}`}
                    className="rounded-md border border-gray-200 px-2 py-0.5 text-[11px] text-gray-600 dark:border-white/[0.1] dark:text-white/60"
                  >
                    {lang}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-gray-600 dark:text-white/60">
                  Hazırlık
                </span>
                <span className={cn("font-semibold tabular-nums", readinessTone(score))}>
                  {score}/100
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-brandCareer"
                  style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
                />
              </div>
            </div>

            {/* ── Action cluster. Status region is aria-live so verification/doc
                changes after router.refresh() are announced. ──────────────── */}
            <div className="mt-5 border-t border-gray-100 pt-4 dark:border-white/[0.06]">
              <p
                className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/40"
                aria-live="polite"
              >
                Doğrulama: {labelForStatus(w.verificationStatus)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {VERIFICATION_STATUSES.map((s) => {
                  const selected = w.verificationStatus === s.value;
                  const isReject = s.value === "rejected";
                  const busy = pendingKey === `v:${w.id}:${s.value}`;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => runVerification(w.id, s.value)}
                      disabled={busy}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
                        selected && isReject
                          ? "border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400"
                          : selected
                            ? "border-brandCareer bg-brandCareer-50 text-brandCareer-700"
                            : isReject
                              ? "border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-700 dark:border-white/[0.1] dark:text-white/60"
                              : "border-gray-200 text-gray-600 hover:border-brandCareer/40 dark:border-white/[0.1] dark:text-white/60",
                      )}
                    >
                      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                      {s.label}
                    </button>
                  );
                })}
              </div>

              {/* ── Documents sub-list (per-card; optional manifest). Each row:
                  category + filename + consent state + Doğrula / Reddet. ───── */}
              {w.documents && w.documents.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {w.documents.map((doc) => {
                    const approveBusy = pendingKey === `d:${doc.id}:ok`;
                    const rejectBusy = pendingKey === `d:${doc.id}:no`;
                    return (
                      <li
                        key={doc.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200/70 bg-white/60 px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.02]"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-gray-800 dark:text-neutral-200">
                            {doc.category}
                          </p>
                          <p className="truncate text-[11px] text-gray-400 dark:text-white/40">
                            {doc.filename ?? "—"} ·{" "}
                            {CONSENT_LABEL[doc.consentStatus] ?? doc.consentStatus}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            type="button"
                            onClick={() => runDocument(doc.id, true)}
                            disabled={approveBusy}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-60",
                              doc.consentStatus === "granted"
                                ? "border-brandCareer bg-brandCareer-50 text-brandCareer-700"
                                : "border-gray-200 text-brandCareer-700 hover:border-brandCareer/40 dark:border-white/[0.1]",
                            )}
                          >
                            {approveBusy ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                            Doğrula
                          </button>
                          <button
                            type="button"
                            onClick={() => runDocument(doc.id, false)}
                            disabled={rejectBusy}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-60",
                              doc.consentStatus === "revoked"
                                ? "border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400"
                                : "border-gray-200 text-red-700 hover:border-red-300 dark:border-white/[0.1] dark:text-red-400",
                            )}
                          >
                            {rejectBusy ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <X className="h-3 w-3" />
                            )}
                            Reddet
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* ── Compliance link → Spec 23 consent + access log view. ────── */}
              <div className="mt-4">
                <Link
                  href={`/${locale}/admin/career/compliance/${w.id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brandCareer-700 hover:underline"
                >
                  Uyum/Belgeler
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            <p className="mt-3 text-[11px] text-gray-400 dark:text-white/40">
              {w.createdAt ? dateFmt(w.createdAt) : null}
            </p>
          </div>
        );
      })}

      {/* ── Pagination: prev/next carrying q / verification + offset (server-
          paginated; no infinite scroll, no bulk export — R12). ───────────── */}
      <nav className="flex items-center justify-between pt-2" aria-label="Sayfalama">
        {offset > 0 ? (
          <Link
            href={pageHref(locale, q, verification, Math.max(offset - limit, 0))}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-brandCareer/40 dark:border-white/[0.1] dark:text-white/60"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Önceki
          </Link>
        ) : (
          <span />
        )}
        {hasMore ? (
          <Link
            href={pageHref(locale, q, verification, offset + limit)}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-brandCareer/40 dark:border-white/[0.1] dark:text-white/60"
          >
            Sonraki
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}

function labelForStatus(status: string | null): string {
  return (
    VERIFICATION_STATUSES.find((s) => s.value === status)?.label ?? "—"
  );
}

function pageHref(
  locale: string,
  q: string,
  verification: string,
  offset: number,
): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (verification) params.set("verification", verification);
  if (offset > 0) params.set("offset", String(offset));
  const qs = params.toString();
  return `/${locale}/admin/career/curation${qs ? `?${qs}` : ""}`;
}
