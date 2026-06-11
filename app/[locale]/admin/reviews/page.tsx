import { setRequestLocale } from "next-intl/server";

import { createAdminClient } from "@/supabase/server";
import { AdminReviewsList } from "@/components/admin/AdminReviewsList";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
  searchParams: Promise<{ status?: string }> | { status?: string };
};

export interface AdminReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  customer_display_name: string | null;
  status: string;
  pro_response: string | null;
  created_at: string;
  professional_id: string;
  business_name: string | null;
  request_title: string | null;
}

/**
 * G-REVIEW-R1 (K2): review moderation — instantly-published reviews with
 * admin hide/restore. Same authorization model as /admin/requests: the
 * admin layout gates by email allowlist, the service-role client reads
 * all statuses (public RLS only exposes status='published').
 */
export default async function AdminReviewsPage({ params, searchParams }: Props) {
  const { locale } = await Promise.resolve(params);
  setRequestLocale(locale);
  const { status } = await Promise.resolve(searchParams);
  const filter = status ?? "all";

  const admin = createAdminClient();
  let query = admin
    .from("glatko_quote_reviews")
    .select(
      `
      id, rating, comment, customer_display_name, status, pro_response, created_at, professional_id,
      glatko_professional_profiles ( business_name ),
      glatko_service_requests ( title )
      `,
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (filter !== "all") query = query.eq("status", filter);

  const { data, error } = await query;
  if (error) {
    console.error("[GLATKO:admin] reviews fetch failed:", error);
  }

  const rows: AdminReviewRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    rating: r.rating as number,
    comment: (r.comment as string | null) ?? null,
    customer_display_name: (r.customer_display_name as string | null) ?? null,
    status: r.status as string,
    pro_response: (r.pro_response as string | null) ?? null,
    created_at: r.created_at as string,
    professional_id: r.professional_id as string,
    business_name:
      (r.glatko_professional_profiles as unknown as {
        business_name: string | null;
      } | null)?.business_name ?? null,
    request_title:
      (r.glatko_service_requests as unknown as { title: string | null } | null)
        ?.title ?? null,
  }));

  return <AdminReviewsList rows={rows} filter={filter} locale={locale} />;
}
