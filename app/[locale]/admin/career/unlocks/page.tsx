import { setRequestLocale } from "next-intl/server";

import { createAdminClient } from "@/supabase/server";
import { AdminUnlocksList } from "@/components/admin/AdminUnlocksList";

/**
 * Spec 27 — Owner Unlock Approval Gate (`/admin/career/unlocks`).
 *
 * THE monetization gate console: the owner approves an employer's interest,
 * triggers the fee-invoice stub (inside the approve RPC), and marks-paid to flip
 * a worker's dossier to unlocked. Lives under /admin (allowlist-gated, noindex
 * — inherited from app/[locale]/admin/layout.tsx); EXEMPT from
 * CAREER_VERTICAL_ENABLED (admins manage pre-launch — never import the flag).
 *
 * Mirrors app/[locale]/admin/{requests,reviews}/page.tsx: a force-dynamic async
 * server component that awaits params + searchParams.status, calls ONE
 * createAdminClient() data fn (career_admin_list_unlocks via .rpc), and renders
 * the client list. PII-light (R7/R8 #9): worker CODE + employer company only —
 * never a name/phone/email/passport or any signed document URL.
 */

// Live owner action queue — never ISR-cache (R5/R11).
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
  searchParams: Promise<{ status?: string }> | { status?: string };
};

/**
 * One unlock row as the list RPC returns it (career_admin_list_unlocks).
 * `paymentStatus` mirrors the career.unlock_payment_status enum.
 */
export interface AdminUnlockRow {
  id: string;
  requisitionId: string | null;
  workerCode: string;
  employerCompany: string;
  interestAt: string;
  ownerApproved: boolean;
  paymentStatus: "unpaid" | "invoiced" | "paid";
  feeInvoiceId: string | null;
  unlockedAt: string | null;
}

// Status filter pills map to the p_status arg: unpaid = interest queue,
// invoiced = awaiting payment, paid = unlocked, "all" = null (Tümü). Default
// filter = the action queue (unpaid / interest).
const PAYMENT_STATUSES = ["unpaid", "invoiced", "paid"] as const;
type PaymentStatusArg = (typeof PAYMENT_STATUSES)[number];

export default async function AdminCareerUnlocksPage({
  params,
  searchParams,
}: Props) {
  const { locale } = await Promise.resolve(params);
  setRequestLocale(locale);
  const { status } = await Promise.resolve(searchParams);

  const filter =
    status && (PAYMENT_STATUSES as readonly string[]).includes(status)
      ? status
      : status === "all"
        ? "all"
        : "unpaid";

  // p_status = null for "all", else the enum value.
  const pStatus: PaymentStatusArg | null =
    filter === "all" ? null : (filter as PaymentStatusArg);

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("career_admin_list_unlocks", {
    p_status: pStatus,
  });
  if (error) {
    console.error("[GLATKO:admin] career unlocks fetch failed:", error);
  }

  const rows = (data as AdminUnlockRow[] | null) ?? [];

  if (error) {
    return (
      <div>
        <h1 className="font-serif text-2xl font-bold text-gray-900 dark:text-white md:text-3xl">
          Açılım Onayları
        </h1>
        <div className="mt-2 h-0.5 w-12 rounded-full bg-gradient-to-r from-amber-500 to-amber-600" />
        <div className="mt-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-300">
          Açılımlar yüklenemedi: {error.message}
        </div>
      </div>
    );
  }

  return <AdminUnlocksList rows={rows} filter={filter} locale={locale} />;
}
