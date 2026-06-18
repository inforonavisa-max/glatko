import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { createClient } from "@/supabase/server";
import { isCareerVerticalEnabled } from "@/lib/kariyer/flags";
import { resolveCareerRole } from "@/lib/kariyer/queries";
import { CareerLoginForm } from "@/components/glatko-kariyer/CareerLoginForm";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
};

// R11 — reads auth.getUser() to resolve the signed-in user's career role and
// server-redirect to the matching dashboard, so the render is per-session and
// must NEVER be cached. No generateStaticParams. (The pool/dashboard surfaces are
// force-dynamic for the same auth-read reason.)
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  // noindex is inherited from app/[locale]/career/layout.tsx — do NOT add
  // buildAlternates/indexable metadata to this gated subtree (IMPL-CONTRACT).
  return { title: t("careerVertical.login.seoTitle") };
}

/**
 * Career login server wrapper (Spec 22) — reuses the GLOBAL Supabase auth (no new
 * auth backend); its only novel job is role-routing. The global `/login` page
 * `router.push("/")` unconditionally; THIS surface must not — on a present
 * session it resolves the user's career role and `redirect()`s to the matching
 * dashboard. Because the `career` schema is off PostgREST, the role lookup is a
 * SERVER read (SECURITY DEFINER RPC keyed by the verified uid, R1); the client
 * never sees career rows.
 *
 * - Flag OFF → notFound() (defense-in-depth behind the middleware quarantine and
 *   the (gated) layout's own notFound(); real HTTP 404 per BUILD-RULES R8 #8).
 * - No session → render <CareerLoginForm /> (the unauthenticated case).
 * - Session + role `employer` → /career/employer/dashboard.
 * - Session + role `worker`  → /career/worker/dashboard.
 * - Session + role `none` (authed globally but never joined İş & Kariyer) →
 *   render <CareerLoginForm />; the form surfaces the register banner rather than
 *   auto-creating a profile (an explicit, consented step — never on login).
 *
 * Identity comes from `auth.getUser()` (the verified uid), NEVER the request.
 * R7: the worker is never charged — there is no fee/payment UI on either path.
 */
export default async function CareerLoginPage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const l = locale as Locale;

  // Defense-in-depth behind the middleware guard + the (gated) layout: a request
  // that ever reaches this route while the flag is off still 404s here.
  if (!isCareerVerticalEnabled()) notFound();

  // Identity from the trusted session — NEVER the request (R1). Anon → render the
  // login form; an authed worker/employer gets a server redirect to their
  // dashboard before any form flashes (Spec 22 §already-authed).
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const role = await resolveCareerRole(user.id);
    if (role === "employer") {
      redirect({ href: "/career/employer/dashboard", locale: l });
    }
    if (role === "worker") {
      redirect({ href: "/career/worker/dashboard", locale: l });
    }
    // role `none` — signed in but never joined İş & Kariyer. Fall through to the
    // form, which offers the register paths (no auto-create on login).
  }

  return <CareerLoginForm />;
}
