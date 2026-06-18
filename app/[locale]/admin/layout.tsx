import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/supabase/server";
import { setRequestLocale } from "next-intl/server";
import { PageBackground } from "@/components/ui/PageBackground";
import { isAdminEmail } from "@/lib/admin";
import { isHealthVerticalEnabled } from "@/lib/saglik/flags";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }> | { locale: string };
};

export default async function AdminLayout({ children, params }: Props) {
  const { locale } = await Promise.resolve(params);
  setRequestLocale(locale);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login?redirect=/${locale}/admin`);
  }

  // Authenticated but not in the allowlist → 404. Hides the existence of
  // /admin from non-admin users (better than a redirect which they could
  // observe in network logs).
  if (!isAdminEmail(user.email)) {
    notFound();
  }

  return (
    <PageBackground opacity={0.06}>
      <div className="mx-auto max-w-7xl px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:gap-8">
          <AdminSidebar
            locale={locale}
            adminEmail={user.email ?? ""}
            healthEnabled={isHealthVerticalEnabled()}
          />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </PageBackground>
  );
}
