import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ locale: string; requestId: string }> | { locale: string; requestId: string };
};

// G-REVIEW-R0: the bid-era double-blind review flow is deactivated — the
// quote/messaging system (glatko_quote_reviews, ChatBox) is canonical. This
// route stays as a redirect so old links/notifications don't 404. The form
// components (components/glatko/review/*) and the DB table are intentionally
// kept; see migration 061 and PR for the consolidation decision.
export default async function ReviewPage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  redirect(`/${locale}/dashboard/requests`);
}
