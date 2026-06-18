import Link from "next/link";
import { setRequestLocale } from "next-intl/server";

import { createAdminClient } from "@/supabase/server";
import { AdminShortlistBuilder } from "@/components/admin/AdminShortlistBuilder";
import type {
  AdminShortlistData,
  AdminCandidateRow,
} from "@/lib/kariyer/admin-shortlist-types";

/**
 * Spec 26 — AdminShortlistBuilder host (`/admin/career/shortlists`).
 *
 * The owner/RoNa-Legal shortlist-curation surface. A requisition is selected via
 * `?requisitionId`; the page loads that requisition's un-presented shortlist
 * (item ids + shortlist id + presented_to_employer) plus an anonymized
 * candidate-search result set, then renders AdminShortlistBuilder. With no
 * `requisitionId` it renders a thin requisition picker that links into the
 * builder.
 *
 * Mirrors app/[locale]/admin/reviews/page.tsx: a force-dynamic async server
 * component that reads searchParams, calls createAdminClient() → SECURITY
 * DEFINER career_admin_* RPCs (the career schema is NOT PostgREST-exposed, so
 * every read goes through an RPC — never a base-table `.from('career.*')`), and
 * hands the projected rows to the client list/builder. The /admin layout gates
 * the human by email allowlist; the service-role client reads owner-console
 * state (two-layer defense, mirroring the other career_admin_* surfaces).
 *
 * R-gate discipline (R1/R7/R8): even though career_admin_search_workers returns
 * decrypted PII, this surface projects ONLY anonymized attributes + the worker
 * CODE into the builder — never a name/phone/email/passport. EXEMPT from
 * CAREER_VERTICAL_ENABLED (admins manage pre-launch — never import the flag).
 *
 * Admin chrome is TR-hardcoded by policy (admin i18n deferred, TODO i18n-b4) —
 * next-intl is not wired into this surface; reuse the AdminReviews string style.
 */

// R5/R11 (spec 24/26): reads the admin session (layout gate) + per-request
// ?requisitionId / ?q / ?verification, so the owner console is never ISR-cached.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
  searchParams:
    | Promise<{ requisitionId?: string; q?: string; verification?: string }>
    | { requisitionId?: string; q?: string; verification?: string };
};

// One requisition row as career_admin_list_requisitions (076) projects it —
// drives the no-selection picker. PII-light: UN-anonymized employer COMPANY is
// fine (owner console), NO worker identity.
interface RequisitionPickerRow {
  id: string;
  employerCompany: string | null;
  sectorLabel: string | null;
  role: string | null;
  headcount: number | null;
  servicePath: string;
  status: string;
  createdAt: string;
  shortlistCount: number | null;
}

// Verification filter values accepted by career_admin_search_workers — "all"
// maps to a null p_verification (no filter).
const VERIFICATION_VALUES = [
  "pending",
  "id_verified",
  "skills_verified",
  "documents_verified",
  "interview_passed",
] as const;

export default async function AdminCareerShortlistsPage({
  params,
  searchParams,
}: Props) {
  const { locale } = await Promise.resolve(params);
  setRequestLocale(locale);
  const sp = await Promise.resolve(searchParams);

  const requisitionId = sp.requisitionId?.trim() || null;
  const query = sp.q?.trim() ?? "";
  const verification =
    sp.verification && (VERIFICATION_VALUES as readonly string[]).includes(sp.verification)
      ? sp.verification
      : "all";

  const admin = createAdminClient();

  // ── No requisition selected → render the picker (list all requisitions). ──
  if (!requisitionId) {
    const { data, error } = await admin.rpc("career_admin_list_requisitions", {
      p_status: null,
    });
    if (error) {
      console.error("[GLATKO:admin] career shortlists list fetch failed:", error);
    }
    const requisitions = ((data as RequisitionPickerRow[] | null) ?? []);
    return (
      <ShortlistRequisitionPicker requisitions={requisitions} locale={locale} />
    );
  }

  // ── Requisition selected → load the un-presented shortlist + candidates. ──
  // career_admin_get_shortlist is the un-presented shortlist read the console
  // needs: it returns the requisition header, the shortlist id (or null until
  // the first add lazily creates it), presented_to_employer, and the items with
  // their ids + anonymized attributes (Spec 26 §"Missing admin shortlist-read
  // RPC" — 074/076 lack this; it lands in a follow-up migration mirroring 076's
  // SECURITY-DEFINER + service_role-only conventions, NEVER a base-table read).
  const [shortlistRes, candidatesRes] = await Promise.all([
    admin.rpc("career_admin_get_shortlist", { p_requisition_id: requisitionId }),
    admin.rpc("career_admin_search_workers", {
      p_q: query === "" ? null : query,
      p_verification: verification === "all" ? null : verification,
      p_limit: 25,
      p_offset: 0,
    }),
  ]);

  if (shortlistRes.error) {
    console.error(
      "[GLATKO:admin] career shortlist fetch failed:",
      shortlistRes.error,
    );
    return (
      <ShortlistLoadError
        message={shortlistRes.error.message}
        locale={locale}
      />
    );
  }

  const data = shortlistRes.data as AdminShortlistData | null;
  if (!data) {
    // Requisition not found (or deleted) — degrade to the picker, never crash.
    return <ShortlistNotFound locale={locale} />;
  }

  if (candidatesRes.error) {
    // Candidate search is non-fatal: the builder still renders with an empty
    // Add panel ("Aday bulunamadı"); the owner can re-search.
    console.error(
      "[GLATKO:admin] career candidate search failed:",
      candidatesRes.error,
    );
  }
  const candidates =
    (candidatesRes.data as AdminCandidateRow[] | null) ?? [];

  return (
    <AdminShortlistBuilder
      data={data}
      candidates={candidates}
      query={query}
      verification={verification}
      locale={locale}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// No-selection picker — a thin server-rendered requisition list. Each row links
// into the builder via ?requisitionId. TR-hardcoded chrome (admin-i18n policy).
// ─────────────────────────────────────────────────────────────────────────────
function ShortlistRequisitionPicker({
  requisitions,
  locale,
}: {
  requisitions: RequisitionPickerRow[];
  locale: string;
}) {
  return (
    <div>
      <Link
        href={`/${locale}/admin/career`}
        className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-white/50 dark:hover:text-white/80"
      >
        ← Kariyer
      </Link>

      <h1 className="mt-2 font-serif text-2xl font-bold text-gray-900 dark:text-white">
        Aday listeleri
      </h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-white/40">
        Küratörlemek için bir talep seçin.
      </p>

      {requisitions.length === 0 ? (
        <div className="mt-10 py-12 text-center text-sm text-gray-500 dark:text-white/40">
          Henüz talep yok
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {requisitions.map((r) => (
            <Link
              key={r.id}
              href={`/${locale}/admin/career/shortlists?requisitionId=${r.id}`}
              className="block rounded-2xl border border-gray-200/80 bg-white/80 p-5 transition hover:border-amber-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:border-amber-500/30"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {r.employerCompany ?? "—"}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-white/40">
                    {r.sectorLabel ?? "—"} · {r.role ?? "—"}
                    {r.headcount ? ` ×${r.headcount}` : ""}
                  </span>
                </div>
                <span className="text-xs text-gray-500 dark:text-white/40">
                  {new Date(r.createdAt).toLocaleDateString("tr", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-white/40">
                {r.servicePath === "full_service" ? "Tam hizmet" : "Komisyon"}
                {r.shortlistCount && r.shortlistCount > 0
                  ? ` · ${r.shortlistCount} aday sunuldu`
                  : ""}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Error states — single red line, mirroring AdminReviews/Unlocks error chrome.
// ─────────────────────────────────────────────────────────────────────────────
function ShortlistLoadError({
  message,
  locale,
}: {
  message: string;
  locale: string;
}) {
  return (
    <div>
      <Link
        href={`/${locale}/admin/career/shortlists`}
        className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-white/50 dark:hover:text-white/80"
      >
        ← Aday listeleri
      </Link>
      <h1 className="mt-2 font-serif text-2xl font-bold text-gray-900 dark:text-white">
        Aday listesi
      </h1>
      <div className="mt-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-300">
        Aday listesi yüklenemedi: {message}
      </div>
    </div>
  );
}

function ShortlistNotFound({ locale }: { locale: string }) {
  return (
    <div>
      <Link
        href={`/${locale}/admin/career/shortlists`}
        className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-white/50 dark:hover:text-white/80"
      >
        ← Aday listeleri
      </Link>
      <h1 className="mt-2 font-serif text-2xl font-bold text-gray-900 dark:text-white">
        Aday listesi
      </h1>
      <div className="mt-10 py-12 text-center text-sm text-gray-500 dark:text-white/40">
        Talep bulunamadı
      </div>
    </div>
  );
}
