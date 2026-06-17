"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type {
  CareerConsentRow,
  CareerRetentionRow,
  CareerAccessRow,
  ComplianceTab,
} from "@/app/[locale]/admin/career/compliance/page";

interface Props {
  tab: ComplianceTab;
  consents: CareerConsentRow[];
  retention: CareerRetentionRow[];
  access: CareerAccessRow[];
  locale: string;
}

/**
 * Spec 31 — Compliance / Documents viewer (READ-ONLY).
 *
 * Mirrors components/admin/AdminReviewsList.tsx (filter-pill row + tinted
 * STATUS_BADGE map + a rows table) but is a pure VIEWER: Phase-0 has NO action
 * buttons, so the useTransition / server-action wiring is dropped entirely.
 *
 * Admin chrome is TR-hardcoded by policy (admin i18n deferred, TODO i18n-b4);
 * these strings are NOT routed through the careerVertical.* dictionary.
 *
 * R6/R7/R8 #9 — this is the most sensitive admin surface. It renders worker /
 * employer CODES, document categories, states, dates, and already-hashed values
 * ONLY: never a name/phone/email/passport, a storage_path, or a signed URL, and
 * there is NO "view document" affordance here (that path is the unlock-center
 * signer in Spec 16, which writes the access-log rows this page merely displays).
 */

// Three tabs, switched via ?tab=. Active pill is amber (career accent); the spec
// pins it to bg-amber-600 (where /admin/reviews uses teal).
const TABS: Array<{ value: ComplianceTab; label: string }> = [
  { value: "consents", label: "Onam Kaydı" },
  { value: "retention", label: "Saklama Süreleri" },
  { value: "access", label: "Erişim Denetimi" },
];

// Tinted-chip vocabulary with 1:1 dark parity (mirror AdminReviewsList's
// STATUS_BADGE). Unknown states fall back to a neutral gray chip — never crash.
const STATE_BADGE: Record<string, { label: string; cls: string }> = {
  granted: {
    label: "Verildi",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  pending: {
    label: "Beklemede",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  revoked: {
    label: "Geri çekildi",
    cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
};

const NEUTRAL_CHIP =
  "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-white/60";

const VISIBILITY_LABEL: Record<string, string> = {
  internal_only: "Yalnızca dahili",
  gated: "Kapılı",
  public_anonymized: "Anonim — herkese açık",
};

function fmtDate(value: string | null, locale: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(value: string | null, locale: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(locale);
}

// First 8 chars of a uuid/bigint id for the forensic columns; null → "—".
function shortId(value: string | null): string {
  if (!value) return "—";
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

function StateBadge({ status }: { status: string | null }) {
  const cfg = (status && STATE_BADGE[status]) || {
    label: status ?? "—",
    cls: NEUTRAL_CHIP,
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
        cfg.cls,
      )}
    >
      {cfg.label}
    </span>
  );
}

/**
 * Days-remaining chip — amber is the warning signal (wayfinding/warning only,
 * never neutral data). Derived CLIENT-SIDE from retention_until vs now:
 *   • already past → red "Süresi doldu — temizlenmeli"
 *   • ≤30 days     → amber "{n} gün kaldı"
 *   • plenty / no timer set (null) → neutral gray "—"
 * A null retention_until renders neutral, never a NaN/crash.
 */
function RetentionChip({ retentionUntil }: { retentionUntil: string | null }) {
  if (!retentionUntil) {
    return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", NEUTRAL_CHIP)}>—</span>;
  }
  const until = new Date(retentionUntil);
  if (Number.isNaN(until.getTime())) {
    return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", NEUTRAL_CHIP)}>—</span>;
  }
  const days = Math.ceil((until.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
        Süresi doldu — temizlenmeli
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        {days} gün kaldı
      </span>
    );
  }
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", NEUTRAL_CHIP)}>
      {days} gün
    </span>
  );
}

const TH =
  "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40";
const TD = "px-3 py-2.5 align-top text-sm text-gray-700 dark:text-neutral-300";
const EMPTY = "mt-10 py-12 text-center text-sm text-gray-500 dark:text-white/40";

export function CareerComplianceView({
  tab,
  consents,
  retention,
  access,
  locale,
}: Props) {
  const count =
    tab === "consents"
      ? consents.length
      : tab === "retention"
        ? retention.length
        : access.length;

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-gray-900 dark:text-white">
        Uyum &amp; Belgeler
      </h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-white/40">
        Onam kaydı, saklama süreleri, belge erişim denetimi (salt-okunur)
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/${locale}/admin/career/compliance?tab=${t.value}`}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
              tab === t.value
                ? "bg-amber-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-white/60",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <p className="mt-4 text-xs text-gray-500 dark:text-white/40">
        {count} kayıt
        {count >= 100 ? " · son 100 kayıt" : ""}
      </p>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-200/80 bg-white/80 dark:border-white/[0.08] dark:bg-white/[0.04]">
        {tab === "consents" && <ConsentsTable rows={consents} locale={locale} />}
        {tab === "retention" && (
          <RetentionTable rows={retention} locale={locale} />
        )}
        {tab === "access" && <AccessTable rows={access} locale={locale} />}
      </div>
    </div>
  );
}

function ConsentsTable({
  rows,
  locale,
}: {
  rows: CareerConsentRow[];
  locale: string;
}) {
  if (rows.length === 0) {
    return <div className={EMPTY}>Henüz onam kaydı yok</div>;
  }
  return (
    <table className="min-w-full border-collapse text-left">
      <thead className="border-b border-gray-200/80 bg-gray-50/80 dark:border-white/[0.08] dark:bg-white/[0.02]">
        <tr>
          <th className={TH}>İşçi Kodu</th>
          <th className={TH}>Amaç</th>
          <th className={TH}>Durum</th>
          <th className={TH}>Verildi</th>
          <th className={TH}>Geri çekildi</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
        {rows.map((r) => (
          <tr key={r.id}>
            <td className={cn(TD, "font-mono text-gray-900 dark:text-white")}>
              {r.worker_code ?? "—"}
            </td>
            <td className={TD}>{r.purpose ?? "—"}</td>
            <td className={TD}>
              <StateBadge status={r.granted ? "granted" : "revoked"} />
            </td>
            <td className={TD}>{fmtDate(r.granted_at, locale)}</td>
            <td className={TD}>{fmtDate(r.revoked_at, locale)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RetentionTable({
  rows,
  locale,
}: {
  rows: CareerRetentionRow[];
  locale: string;
}) {
  if (rows.length === 0) {
    return <div className={EMPTY}>Saklama süreli belge yok</div>;
  }
  return (
    <table className="min-w-full border-collapse text-left">
      <thead className="border-b border-gray-200/80 bg-gray-50/80 dark:border-white/[0.08] dark:bg-white/[0.02]">
        <tr>
          <th className={TH}>İşçi Kodu</th>
          <th className={TH}>Kategori</th>
          <th className={TH}>Görünürlük</th>
          <th className={TH}>Onam</th>
          <th className={TH}>Saklama bitişi</th>
          <th className={TH}>Kalan</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
        {rows.map((r) => (
          <tr key={r.id}>
            <td className={cn(TD, "font-mono text-gray-900 dark:text-white")}>
              {r.worker_code ?? "—"}
            </td>
            <td className={TD}>{r.category ?? "—"}</td>
            <td className={TD}>
              {r.visibility
                ? VISIBILITY_LABEL[r.visibility] ?? r.visibility
                : "—"}
            </td>
            <td className={TD}>
              <StateBadge status={r.consent_status} />
            </td>
            <td className={TD}>{fmtDate(r.retention_until, locale)}</td>
            <td className={TD}>
              <RetentionChip retentionUntil={r.retention_until} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AccessTable({
  rows,
  locale,
}: {
  rows: CareerAccessRow[];
  locale: string;
}) {
  if (rows.length === 0) {
    return <div className={EMPTY}>Henüz erişim kaydı yok</div>;
  }
  return (
    <table className="min-w-full border-collapse text-left">
      <thead className="border-b border-gray-200/80 bg-gray-50/80 dark:border-white/[0.08] dark:bg-white/[0.02]">
        <tr>
          <th className={TH}>Belge</th>
          <th className={TH}>İşçi Kodu</th>
          <th className={TH}>Erişen</th>
          <th className={TH}>Açılım</th>
          <th className={TH}>Zaman</th>
          <th className={TH}>IP (hash)</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
        {rows.map((r) => (
          <tr key={r.id}>
            <td className={cn(TD, "font-mono")}>{shortId(r.document_id)}</td>
            <td className={cn(TD, "font-mono text-gray-900 dark:text-white")}>
              {r.worker_code ?? "—"}
            </td>
            <td className={cn(TD, "font-mono")}>{shortId(r.accessed_by)}</td>
            <td className={cn(TD, "font-mono")}>
              {shortId(r.reveal_unlock_id)}
            </td>
            <td className={TD}>{fmtDateTime(r.accessed_at, locale)}</td>
            <td className={cn(TD, "font-mono text-xs text-gray-400 dark:text-white/30")}>
              {r.ip_hash ? shortId(r.ip_hash) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
