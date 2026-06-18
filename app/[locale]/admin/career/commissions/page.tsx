import Link from "next/link";
import { setRequestLocale } from "next-intl/server";

import { createAdminClient } from "@/supabase/server";

/**
 * Spec 28 — Owner Commission / Fee Ledger (`/admin/career/commissions`).
 *
 * The owner's read-only Phase-0 fee ledger: one row per
 * career.commission_records entry, showing the commission / full-service path,
 * amount + currency, invoice reference, paid status (derived from paid_at), and
 * the placement → guarantee linkage. Lives under /admin (allowlist-gated,
 * noindex — inherited from app/[locale]/admin/layout.tsx); EXEMPT from
 * CAREER_VERTICAL_ENABLED (admins manage pre-launch — never import the flag),
 * mirroring the sibling unlocks/requisitions consoles.
 *
 * Mirrors app/[locale]/admin/reviews/page.tsx: a force-dynamic async server
 * component that awaits params + searchParams.status, calls ONE
 * createAdminClient() data fn (career_admin_list_commissions via .rpc — the
 * career schema is not exposed to PostgREST, so reads go through the SECURITY
 * DEFINER, service_role-only RPC), maps the JSON into a typed
 * AdminCommissionRow[], and renders the read-only client list.
 *
 * R1/R8 #2: owner-only surface reading ALL placements' fees by design — no
 * p_employer scoping, no cross-employer denial (admin layout email allowlist +
 * service_role-only EXECUTE are the two-layer defense). R7: commission rows are
 * employer-side revenue only — the commission_records table has no worker
 * column, so no worker identity or worker-side fee ever appears here.
 */

// R5/R11: reads the admin session + a per-request ?status filter, so the owner
// console must never be statically cached.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
  searchParams: Promise<{ status?: string }> | { status?: string };
};

/**
 * One commission row as projected by the career_admin_list_commissions RPC
 * (migration 076 §11). The shipped RPC selects the bare commission_records
 * columns only (id, placementId, path, amount, currency, invoiceId, paidAt,
 * createdAt); the placement → guarantee linkage fields are typed here as
 * optional + nullable so the surface renders "—" today and stays
 * forward-compatible when the RPC is extended with the placement left-join.
 * `paidStatus` is DERIVED in TS from `paidAt` (no ?status arg on the RPC).
 */
export interface AdminCommissionRow {
  id: string;
  placement_id: string | null;
  path: string | null;
  amount: number | null;
  currency: string | null;
  invoice_id: string | null;
  paid_at: string | null;
  created_at: string;
  paid_status: "paid" | "unpaid";
  // Placement → guarantee linkage (null until the RPC is extended).
  placed_at: string | null;
  guarantee_until: string | null;
  placement_status: string | null;
  worker_label: string | null;
}

export default async function AdminCareerCommissionsPage({
  params,
  searchParams,
}: Props) {
  const { locale } = await Promise.resolve(params);
  setRequestLocale(locale);
  const { status } = await Promise.resolve(searchParams);
  const filter =
    status === "paid" || status === "unpaid" ? status : "all";

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("career_admin_list_commissions");
  if (error) {
    // Mirror reviews: log + fall through to an empty list, never crash.
    console.error("[GLATKO:admin] career commissions fetch failed:", error);
  }

  const raw = (data ?? []) as Array<{
    id: string;
    placementId: string | null;
    path: string | null;
    amount: number | string | null;
    currency: string | null;
    invoiceId: string | null;
    paidAt: string | null;
    createdAt: string;
    // Optional linkage fields — present only once the RPC is extended.
    placedAt?: string | null;
    guaranteeUntil?: string | null;
    placementStatus?: string | null;
    workerLabel?: string | null;
  }>;

  const allRows: AdminCommissionRow[] = raw.map((r) => {
    // amount can arrive as a numeric string from the jsonb; coerce safely and
    // never Intl-format null (the column is nullable pre-invoicing).
    const amountNum =
      r.amount == null || r.amount === ""
        ? null
        : typeof r.amount === "number"
          ? r.amount
          : Number.isNaN(Number(r.amount))
            ? null
            : Number(r.amount);
    return {
      id: r.id,
      placement_id: r.placementId ?? null,
      path: r.path ?? null,
      amount: amountNum,
      currency: r.currency ?? null,
      invoice_id: r.invoiceId ?? null,
      paid_at: r.paidAt ?? null,
      created_at: r.createdAt,
      // Any non-null paidAt = paid (don't compare to now — clock skew safe).
      paid_status: r.paidAt != null ? "paid" : "unpaid",
      placed_at: r.placedAt ?? null,
      guarantee_until: r.guaranteeUntil ?? null,
      placement_status: r.placementStatus ?? null,
      worker_label: r.workerLabel ?? null,
    };
  });

  // No ?status arg on the RPC — derive the paid/unpaid filter in TS.
  const rows =
    filter === "all"
      ? allRows
      : allRows.filter((r) => r.paid_status === filter);

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-gray-900 dark:text-white">
        Komisyon defteri
      </h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-white/40">
        {rows.length} kayıt
      </p>

      {/* Paid/unpaid filter — derived in TS (no ?status arg on the RPC).
          TR-hardcoded chrome by admin-i18n policy (TODO i18n-b4). */}
      <div className="mt-4 flex flex-wrap gap-2">
        {COMMISSION_FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/${locale}/admin/career/commissions?status=${f.value}`}
            className={
              filter === f.value
                ? "rounded-full bg-brandCareer px-4 py-1.5 text-xs font-medium text-white transition-colors"
                : "rounded-full bg-gray-100 px-4 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200 dark:bg-white/[0.06] dark:text-white/60"
            }
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="mt-10 py-12 text-center text-sm text-gray-500 dark:text-white/40">
          Bu filtrede kayıt yok
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-200/80 dark:border-white/[0.08]">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200/80 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-white/[0.08] dark:text-white/40">
                <th className="px-4 py-3">Yöntem</th>
                <th className="px-4 py-3">Tutar</th>
                <th className="px-4 py-3">Fatura</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Tarih</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-gray-100 last:border-0 dark:border-white/[0.04]"
                >
                  <td className="px-4 py-3 text-gray-900 dark:text-white">
                    {r.path === "full_service" ? "Tam hizmet" : "Komisyon"}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-neutral-300">
                    {r.amount == null
                      ? "—"
                      : `${new Intl.NumberFormat("tr").format(r.amount)}${
                          r.currency ? ` ${r.currency}` : ""
                        }`}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-white/40">
                    {r.invoice_id ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        r.paid_status === "paid"
                          ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : "rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-white/60"
                      }
                    >
                      {r.paid_status === "paid" ? "Ödendi" : "Bekliyor"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-white/40">
                    {new Date(r.created_at).toLocaleDateString("tr", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Paid/unpaid filter pills — TR-hardcoded chrome (admin-i18n policy).
const COMMISSION_FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Tümü" },
  { value: "unpaid", label: "Bekleyen" },
  { value: "paid", label: "Ödenen" },
];
