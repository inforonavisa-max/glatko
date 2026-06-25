import { redirect, notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/supabase/server";
import { CustomerQuotesView } from "@/components/glatko/customer/CustomerQuotesView";

type Props = {
  params:
    | Promise<{ locale: string; id: string }>
    | { locale: string; id: string };
};

export default async function CustomerRequestQuotesPage({ params }: Props) {
  const { locale, id } = await Promise.resolve(params);
  setRequestLocale(locale);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login?redirect=/my-requests/${id}`);

  const { data: request, error } = await supabase
    .from("glatko_service_requests")
    .select(
      `
      id,
      title,
      description,
      municipality,
      budget_min,
      budget_max,
      status,
      created_at,
      glatko_service_categories (
        slug,
        name
      ),
      glatko_request_quotes (
        id,
        price_amount,
        price_currency,
        pricing_model,
        message,
        submitted_at,
        status,
        glatko_professional_profiles (
          id,
          business_name,
          location_city,
          avg_rating,
          completed_jobs,
          is_founding_provider,
          founding_provider_number,
          verification_tier,
          languages
        )
      )
      `,
    )
    .eq("id", id)
    .eq("customer_id", user.id)
    .maybeSingle();

  if (error || !request) {
    notFound();
  }

  // avatar_url lives on `profiles`, not glatko_professional_profiles — pull it
  // in a second query keyed off the quote pro IDs. Disintermediation
  // (G-DISINT): phone is deliberately NOT fetched here — a quote is a
  // pre-acceptance offer, so the customer contacts the pro in-platform (the
  // message thread), never via an off-platform WhatsApp/Viber deep-link.
  type QuotePro = { id: string };
  type Quote = { glatko_professional_profiles: QuotePro | null };
  const quotes = ((request.glatko_request_quotes as unknown as Quote[]) ?? [])
    .map((q) => q.glatko_professional_profiles?.id)
    .filter((v): v is string => Boolean(v));

  const proExtras: Record<string, { avatar_url: string | null }> = {};
  if (quotes.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, avatar_url")
      .in("id", quotes);
    for (const p of profiles ?? []) {
      proExtras[p.id as string] = {
        avatar_url: (p.avatar_url as string | null) ?? null,
      };
    }
  }

  // First-notification timestamp drives the wait-list countdown.
  const { data: firstNotif } = await supabase
    .from("glatko_request_notifications")
    .select("notified_at")
    .eq("request_id", id)
    .eq("is_primary", true)
    .not("notified_at", "is", null)
    .order("notified_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const dispatchedAt = (firstNotif?.notified_at as string | null) ?? null;

  return (
    <CustomerQuotesView
      request={JSON.parse(JSON.stringify(request))}
      proExtras={proExtras}
      dispatchedAt={dispatchedAt}
      locale={locale}
    />
  );
}
