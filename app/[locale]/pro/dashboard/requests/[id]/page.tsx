import { createClient } from "@/supabase/server";
import { redirect, notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getMatchedRequestForPro, getProfessionalProfile } from "@/lib/supabase/glatko.server";
import { ProRequestDetail } from "@/components/glatko/pro/ProRequestDetail";

type Props = {
  params: Promise<{ locale: string; id: string }> | { locale: string; id: string };
};

export default async function ProRequestDetailPage({ params }: Props) {
  const { locale, id } = await Promise.resolve(params);
  setRequestLocale(locale);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login?redirect=/pro/dashboard/requests/${id}`);

  const [request, profile] = await Promise.all([
    getMatchedRequestForPro(id),
    getProfessionalProfile(user.id),
  ]);

  if (!request) notFound();
  if (!profile || profile.verification_status !== "approved") {
    redirect(`/${locale}/pro/dashboard`);
  }

  // G-REVIEW-R1 (K4): bid intake is closed — this page is view-only;
  // quotes flow through /pro/dashboard/leads (match notifications).
  return (
    <ProRequestDetail
      request={JSON.parse(JSON.stringify(request))}
      locale={locale}
    />
  );
}
