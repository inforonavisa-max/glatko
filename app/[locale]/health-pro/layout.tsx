import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/supabase/server";
import { isHealthVerticalEnabled } from "@/lib/saglik/flags";

/**
 * Glatko Sağlık — provider tree (H7a) route-group layout.
 *
 * Three gates, in order:
 *   1. SEO quarantine: noindex (MASTER_PLAN Demir Kural 8) — the whole /saglik-pro
 *      subtree stays out of the index until the H11 launch PR reverses it.
 *   2. Flag guard (defense-in-depth behind middleware): with the vertical off
 *      (prod), notFound() → 404, mirroring app/[locale]/health/(gated)/layout.tsx.
 *   3. AUTH guard: the provider tree is logged-in-only (unlike the patient tree).
 *      No session → redirect to login with a return path. The verified user.id is
 *      what every page/action passes to the owner-checked write-RPCs.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SaglikProLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  if (!isHealthVerticalEnabled()) notFound();

  const { locale } = await params;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // No ?redirect= suffix: the login page does not honor it (it always lands on
    // "/"), and the /saglik-pro/* tree is a LOCALIZED pathname (en=/health-pro,
    // de=/gesundheit-pro, …) so a hardcoded tr segment would be the wrong path for
    // 8 of 9 locales the moment login ever started honoring it.
    redirect(`/${locale}/login`);
  }

  return children;
}
