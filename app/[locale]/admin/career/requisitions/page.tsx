import { setRequestLocale } from "next-intl/server";

import { createAdminClient } from "@/supabase/server";
import { AdminCareerRequisitionsList } from "@/components/admin/AdminCareerRequisitionsList";

// R5/R11 (spec 24): reads the admin session + a per-request ?status filter, so the
// owner console must never be statically cached.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
  searchParams: Promise<{ status?: string }> | { status?: string };
};

export interface AdminRequisitionRow {
  id: string;
  employer_company: string | null;
  sector_label: string | null;
  role: string | null;
  headcount: number;
  service_path: string;
  status: string;
  created_at: string;
  shortlist_count: number;
}

/**
 * Career C0 — owner (RoNa Legal) console listing EVERY requisition across all
 * employers and all statuses, driving each forward through the lifecycle via a
 * state-guarded set-status action (spec 24). Mirrors app/[locale]/admin/reviews/
 * page.tsx: the admin layout gates by email allowlist; the service-role client
 * reads ALL rows through the career_admin_list_requisitions RPC (the career schema
 * is not exposed to PostgREST, so reads go through the SECURITY DEFINER RPC). An
 * UN-anonymized employer company name is fine here — this is the owner console — but
 * there is NO worker identity on this surface (R1 / R7).
 */
export default async function AdminCareerRequisitionsPage({
  params,
  searchParams,
}: Props) {
  const { locale } = await Promise.resolve(params);
  setRequestLocale(locale);
  const { status } = await Promise.resolve(searchParams);
  const filter = status ?? "all";

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("career_admin_list_requisitions", {
    p_status: filter === "all" ? null : filter,
  });
  if (error) {
    // Mirror reviews: log + fall through to an empty list, never crash.
    console.error("[GLATKO:admin] career requisitions fetch failed:", error);
  }

  const raw = (data ?? []) as Array<{
    id: string;
    employerCompany: string | null;
    sectorLabel: string | null;
    role: string | null;
    headcount: number | null;
    servicePath: string;
    status: string;
    createdAt: string;
    shortlistCount: number | null;
  }>;

  const rows: AdminRequisitionRow[] = raw.map((r) => ({
    id: r.id,
    employer_company: r.employerCompany ?? null,
    sector_label: r.sectorLabel ?? null,
    role: r.role ?? null,
    headcount: r.headcount ?? 0,
    service_path: r.servicePath,
    status: r.status,
    created_at: r.createdAt,
    shortlist_count: r.shortlistCount ?? 0,
  }));

  return (
    <AdminCareerRequisitionsList rows={rows} filter={filter} locale={locale} />
  );
}
