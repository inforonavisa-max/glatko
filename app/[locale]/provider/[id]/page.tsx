import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { createClient } from "@/supabase/server";

/**
 * Legacy UUID provider route → redirect to the canonical /pros/[slug] surface.
 * (G-PROVIDER-ROUTE-CLEANUP, 2026-06-07)
 *
 * Providers now live at /pros/<slug>. This route used to render a full
 * (duplicate) profile by UUID; it now just redirects old/indexed
 * `/provider/<uuid>` URLs onto the slug URL so users never hit a stale path
 * and Google consolidates signals (the /pros/[slug] page's canonical already
 * points at the slug URL). The root P0 fix (search→404) was the glatko_search
 * RPC returning the UUID in `slug`; this redirect is the back-compat cleanup.
 *
 * Uses next-intl's locale-aware `redirect` (from @/i18n/navigation) rather
 * than next/navigation's raw redirect, which does not issue the HTTP redirect
 * correctly inside the [locale] segment here.
 */
type PageProps = {
  params: Promise<{ locale: string; id: string }> | { locale: string; id: string };
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProviderIdRedirect({ params }: PageProps) {
  const { locale, id } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  // [id] catches anything; bail on non-UUIDs before querying a uuid column.
  if (!UUID_RE.test(id)) notFound();

  const supabase = createClient();
  const { data } = await supabase
    .from("glatko_public_professionals")
    .select("slug")
    .eq("id", id)
    .maybeSingle();

  if (!data?.slug) notFound();

  redirect({
    href: { pathname: "/pros/[slug]", params: { slug: data.slug } },
    locale,
  });
}
