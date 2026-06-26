import { createClient } from "@/supabase/server";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { LeadsList } from "@/components/glatko/pro/LeadsList";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
};

export default async function ProLeadsPage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  setRequestLocale(locale);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login?redirect=/pro/dashboard/leads`);

  // G-REQ-2 incoming leads — algorithm-matched notifications. Only rows
  // where notified_at is set; wait-list (notified_at NULL) are hidden
  // until cron flips them.
  const { data: notifications, error } = await supabase
    .from("glatko_request_notifications")
    .select(
      `
      id,
      request_id,
      match_score,
      match_rank,
      is_primary,
      notified_at,
      viewed_at,
      quote_id,
      glatko_request_quotes (
        id,
        price_amount,
        price_currency,
        status,
        submitted_at
      )
      `,
    )
    .eq("professional_id", user.id)
    .not("notified_at", "is", null)
    .order("notified_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[GLATKO:leads] notifications fetch failed:", error);
  }

  // PII lockdown (087): request details come from the auth.uid()-scoped
  // glatko_matched_request view (PII-free besides the job address). The base-table
  // embed no longer works (pros lost direct SELECT on glatko_service_requests).
  // Fetch matched requests + category labels, then attach under the same
  // `glatko_service_requests` key LeadsList already reads.
  const leadRequestIds = Array.from(
    new Set(
      (notifications ?? []).map((n) => n.request_id as string).filter(Boolean),
    ),
  );
  const requestById: Record<string, Record<string, unknown>> = {};
  if (leadRequestIds.length > 0) {
    const { data: reqRows } = await supabase
      .from("glatko_matched_request")
      .select(
        "id, title, description, category_id, municipality, budget_min, budget_max, preferred_date_start, preferred_date_end, urgency, status, created_at",
      )
      .in("id", leadRequestIds);
    const catIds = Array.from(
      new Set(
        (reqRows ?? []).map((r) => r.category_id as string).filter(Boolean),
      ),
    );
    const categoryById: Record<string, { slug: string; name: unknown }> = {};
    if (catIds.length > 0) {
      const { data: cats } = await supabase
        .from("glatko_service_categories")
        .select("id, slug, name")
        .in("id", catIds);
      for (const c of cats ?? []) {
        categoryById[c.id as string] = { slug: c.slug as string, name: c.name };
      }
    }
    for (const r of reqRows ?? []) {
      requestById[r.id as string] = {
        ...r,
        glatko_service_categories: categoryById[r.category_id as string] ?? null,
      };
    }
  }

  const leads = (notifications ?? [])
    .map((n) => ({
      ...n,
      glatko_service_requests: requestById[n.request_id as string] ?? null,
    }))
    .filter((n) => n.glatko_service_requests);

  // Map (request_id → thread + pro_unread_count) so the lead card can
  // show "View thread" with an unread badge when a chat already exists.
  const requestIds = (notifications ?? [])
    .map((n) => n.request_id as string)
    .filter(Boolean);

  const threadByRequestId: Record<
    string,
    { thread_id: string; pro_unread_count: number }
  > = {};
  if (requestIds.length > 0) {
    const { data: threads } = await supabase
      .from("glatko_message_threads")
      .select("id, request_id, pro_unread_count")
      .eq("professional_id", user.id)
      .in("request_id", requestIds);
    for (const t of threads ?? []) {
      threadByRequestId[t.request_id as string] = {
        thread_id: t.id as string,
        pro_unread_count: (t.pro_unread_count as number) ?? 0,
      };
    }
  }

  return (
    <LeadsList
      leads={JSON.parse(JSON.stringify(leads))}
      threadByRequestId={threadByRequestId}
      locale={locale}
      proId={user.id}
    />
  );
}
