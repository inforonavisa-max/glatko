import { setRequestLocale } from "next-intl/server";

import { createAdminClient } from "@/supabase/server";
import { AdminCareerEmployersList } from "@/components/admin/AdminCareerEmployersList";

// R5/R11 (spec 30): reads the admin session + a per-request ?tier filter, so the
// owner console must never be statically cached.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
  searchParams: Promise<{ tier?: string }> | { tier?: string };
};

export interface AdminEmployerRow {
  id: string;
  company: string | null;
  tier: string;
  verified: boolean;
  created_at: string;
  requisition_count: number | null;
}

/**
 * Career C0 — owner (RoNa Legal) console listing EVERY employer account across
 * all tiers (verified or not), driving two independent actions per row: verify
 * (boolean toggle) and set tier (Free / Verified / Premium) — spec 30. Mirrors
 * app/[locale]/admin/reviews/page.tsx: the admin layout gates by email allowlist;
 * the service-role client reads ALL rows through the career_admin_list_employers
 * RPC (the career schema is not exposed to PostgREST, so reads go through the
 * SECURITY DEFINER RPC). The list is PII-LIGHT — company name + tier + verified +
 * requisition count only; contact_enc is NEVER decrypted for a list view (R1 / R7).
 */
export default async function AdminCareerEmployersPage({
  params,
  searchParams,
}: Props) {
  const { locale } = await Promise.resolve(params);
  setRequestLocale(locale);
  const { tier } = await Promise.resolve(searchParams);
  const filter = tier ?? "all";

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("career_admin_list_employers", {
    p_tier: filter === "all" ? null : filter,
  });
  if (error) {
    // Mirror reviews: log + fall through to an empty list, never crash.
    console.error("[GLATKO:admin] career employers fetch failed:", error);
  }

  const raw = (data ?? []) as Array<{
    id: string;
    company: string | null;
    tier: string;
    verified: boolean;
    createdAt: string;
    requisitionCount: number | null;
  }>;

  const rows: AdminEmployerRow[] = raw.map((r) => ({
    id: r.id,
    company: r.company ?? null,
    tier: r.tier,
    verified: r.verified,
    created_at: r.createdAt,
    requisition_count: r.requisitionCount ?? null,
  }));

  return (
    <AdminCareerEmployersList rows={rows} filter={filter} locale={locale} />
  );
}
