import "server-only";

import { createAdminClient } from "@/supabase/server";
import type { Locale } from "@/i18n/routing";

/**
 * Glatko Sağlık — server-only data-access layer for the public directory (H2).
 *
 * ARCHITECTURE (MASTER_PLAN v1.6, Rohat 16.06): the `health` schema is NOT
 * exposed to PostgREST, so supabase-js cannot read health.* directly — not even
 * with the service-role key. Instead, three SECURITY DEFINER read-RPCs live in
 * the PUBLIC schema (migration 068); they read health.* as the definer and
 * return ONLY published+approved providers (the publish filter lives inside the
 * RPC, so unpublished/unverified data can never leak to any caller).
 *
 * This module is `server-only`: importing it from a Client Component is a build
 * error, so the service-role key can never reach the browser bundle. We use the
 * cookie-free admin client (createAdminClient) so the reads stay ISR-compatible
 * (the cookie-based server client throws during static generation). All reads go
 * through here — pages never call supabase.from()/rpc() for health data directly.
 */

export type HealthSpecialty = {
  slug: string;
  name: string;
  icon: string | null;
};

export type HealthProviderLocationSummary = {
  city: string;
  address: string;
  label: string;
};

export type HealthProviderCard = {
  slug: string;
  fullName: string;
  title: string | null;
  photoUrl: string | null;
  providerType: string;
  verified: boolean;
  languages: string[];
  specialtyName: string;
  location: HealthProviderLocationSummary | null;
};

export type HealthProviderLocation = {
  label: string;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
};

export type HealthProviderService = {
  name: string;
  durationMin: number;
  priceEur: number | null;
  mode: "in_person" | "video" | "home_visit";
};

export type HealthProviderProfile = {
  slug: string;
  fullName: string;
  title: string | null;
  photoUrl: string | null;
  providerType: string;
  verified: boolean;
  bio: string | null;
  languages: string[];
  specialties: Array<{ slug: string; name: string }>;
  locations: HealthProviderLocation[];
  services: HealthProviderService[];
};

// Error handling splits the three UI states cleanly: a genuine RPC failure
// THROWS (caught by the route-group error.tsx → designed error screen), while
// an empty array / null means "no rows" (the page renders its empty state, or
// notFound() for a missing provider). The pages never see a silent [] that
// actually hid an outage.

/** Active specialties (home cards + chips), names already localized by the RPC. */
export async function listSpecialties(locale: Locale): Promise<HealthSpecialty[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_list_specialties", {
    p_locale: locale,
  });
  if (error) {
    throw new Error(`health_list_specialties failed: ${error.message}`);
  }
  return (data as HealthSpecialty[] | null) ?? [];
}

/** Published+approved providers for one specialty slug (directory list cards). */
export async function providersBySpecialty(
  specialtySlug: string,
  locale: Locale,
): Promise<HealthProviderCard[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_providers_by_specialty", {
    p_specialty_slug: specialtySlug,
    p_locale: locale,
  });
  if (error) {
    throw new Error(`health_providers_by_specialty failed: ${error.message}`);
  }
  return (data as HealthProviderCard[] | null) ?? [];
}

/**
 * One published+approved provider profile, or null when not found (→ the page
 * calls notFound()). A genuine RPC failure throws (→ error.tsx) rather than
 * masquerading as a 404.
 */
export async function getProvider(
  slug: string,
  locale: Locale,
): Promise<HealthProviderProfile | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_get_provider", {
    p_slug: slug,
    p_locale: locale,
  });
  if (error) {
    throw new Error(`health_get_provider failed: ${error.message}`);
  }
  return (data as HealthProviderProfile | null) ?? null;
}
