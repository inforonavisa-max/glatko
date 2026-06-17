import "server-only";

import { createAdminClient } from "@/supabase/server";

/**
 * Glatko Kariyer — server-only data-access layer for the İş & Kariyer vertical
 * (Group B reads). MIRRORS lib/saglik/queries.ts exactly; amber-600 is the only
 * cosmetic difference at the UI layer — the data layer is structurally identical.
 *
 * ARCHITECTURE (BUILD-RULES + career-vertical-plan-v1.md PART 3): the `career`
 * schema is NOT exposed to PostgREST, so supabase-js cannot read career.* directly
 * — not even with the service-role key. Instead, SECURITY DEFINER read-RPCs live
 * in the PUBLIC schema (migration 074); they read career.* as the definer
 * (postgres) and project ONLY public-safe columns over the showcase VIEW. THE GATE
 * = the VIEW's SELECT column list + each RPC's SQL body. A single RPC selecting a
 * private column leaks identity with every RLS policy still green — so this module
 * NEVER calls `.from('career.*')`; every read goes through a `career_*` RPC.
 *
 * RULE R1: every career RPC runs via createAdminClient() (service_role) where
 * auth.uid() is NULL. Identity is derived in the route/action layer
 * (auth.getUser()) and PASSED DOWN as an explicit p_*_user_id arg; the RPC
 * re-verifies ownership. Passing employer B's uid returns ZERO rows.
 *
 * This module is `server-only`: importing it from a Client Component is a build
 * error, so the service-role key can never reach the browser bundle. We use the
 * cookie-free admin client (createAdminClient) so static marketing reads (sectors)
 * stay ISR-compatible.
 *
 * Error handling mirrors health: a genuine RPC failure THROWS (caught by the
 * route-group error.tsx), while an empty array / null means "no rows" (the page
 * renders its empty state, or notFound() for a missing worker). Pages never see a
 * silent [] that actually hid an outage.
 */

import type { Locale } from "@/i18n/routing";

// ─────────────────────────────────────────────────────────────────────────────
// Return types — the EXACT public-safe shape each RPC projects (074). NO _enc /
// _hash / private field is ever present on these types (it is never selected).
// ─────────────────────────────────────────────────────────────────────────────

/** Sector facet (sectors hub + filter rail), name already localized by the RPC. */
export type CareerSector = {
  slug: string;
  name: string | null;
};

/** Anonymized pool card — worker_code is the ONLY identifier, never a name. */
export type ShowcaseWorkerCard = {
  workerCode: string;
  role: string | null;
  trade: string | null;
  skillTier: string | null;
  experienceBand: string | null;
  region: string | null;
  ageBand: string | null;
  languages: string[];
  skills: string[];
  readinessScore: number | null;
  verificationStatus: string | null;
};

/** Anonymized worker detail (pool/[workerCode]) — same public-safe set as the card. */
export type ShowcaseWorkerProfile = ShowcaseWorkerCard;

/** Worker's OWN profile read (dashboard/profile). PII-free (no _enc round-trip). */
export type WorkerProfile = ShowcaseWorkerCard & {
  isShowcased: boolean;
  createdAt: string;
};

/** Per-document visibility + consent metadata for /career/worker/documents. */
export type WorkerDocument = {
  id: string;
  category: string;
  visibility: "public_anonymized" | "gated" | "internal_only";
  consentStatus: "pending" | "granted" | "revoked";
  consentAt: string | null;
  retentionUntil: string | null;
  watermarkedVariantPath: string | null;
  createdAt: string;
};

/** Worker dashboard status signal — counts only, NO employer identity (symmetric gate). */
export type WorkerStatus = {
  workerCode: string;
  verificationStatus: string;
  isShowcased: boolean;
  readinessScore: number | null;
  interestCount: number;
  approvedCount: number;
  placedCount: number;
};

/** Employer requisition summary (dashboard list + detail header). */
export type RequisitionSummary = {
  id: string;
  sector: string | null;
  rolesJsonb: unknown;
  requirements: unknown;
  termsJsonb: unknown;
  servicePath: "commission" | "full_service";
  status: string;
  createdAt: string;
};

/** Anonymized shortlist card presented inside a requisition (presented_to_employer only). */
export type RequisitionShortlistCard = {
  workerCode: string;
  role: string | null;
  trade: string | null;
  skillTier: string | null;
  experienceBand: string | null;
  region: string | null;
  readinessScore: number | null;
  stage: string;
};

/** Requisition detail = the summary plus its presented anonymized shortlist. */
export type RequisitionDetail = RequisitionSummary & {
  shortlist: RequisitionShortlistCard[];
};

/** Employer unlock/reveal row — worker stays anonymized (workerCode only). */
export type EmployerUnlock = {
  id: string;
  requisitionId: string;
  workerCode: string;
  interestAt: string;
  ownerApproved: boolean;
  paymentStatus: "unpaid" | "invoiced" | "paid";
  unlockedAt: string | null;
};

/** Role the route layer uses to pick nav/dashboard. */
export type CareerRole = "employer" | "worker" | "none";

// Filter inputs for the talent-pool browse (all optional; NULL = no filter).
export type ShowcaseFilters = {
  sector?: string | null;
  trade?: string | null;
  tier?: string | null;
  experience?: string | null;
  region?: string | null;
  age?: string | null;
  languages?: string[] | null;
  minReadiness?: number | null;
  limit?: number | null;
  offset?: number | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// 1) Sectors (sectors hub + filter facets). name_jsonb → locale, by the RPC.
// ─────────────────────────────────────────────────────────────────────────────
export async function listSectors(locale: Locale): Promise<CareerSector[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("career_list_sectors", {
    p_locale: locale,
  });
  if (error) {
    throw new Error(`career_list_sectors failed: ${error.message}`);
  }
  return (data as CareerSector[] | null) ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Talent pool browse — reads the VIEW ONLY via the RPC. Server-side pagination
//    (RULE R12: this is a page-route surface; pagination + no bulk export are the
//    structural throttle). All filters optional.
// ─────────────────────────────────────────────────────────────────────────────
export async function getShowcaseWorkers(
  filters: ShowcaseFilters = {},
): Promise<ShowcaseWorkerCard[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("career_browse_showcase", {
    p_sector: filters.sector ?? null,
    p_trade: filters.trade ?? null,
    p_tier: filters.tier ?? null,
    p_experience: filters.experience ?? null,
    p_region: filters.region ?? null,
    p_age: filters.age ?? null,
    p_languages: filters.languages ?? null,
    p_min_readiness: filters.minReadiness ?? null,
    p_limit: filters.limit ?? null,
    p_offset: filters.offset ?? null,
  });
  if (error) {
    throw new Error(`career_browse_showcase failed: ${error.message}`);
  }
  return (data as ShowcaseWorkerCard[] | null) ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) Single anonymized worker detail by code. null = not found / not showcased
//    (→ the page calls notFound()); a genuine RPC failure throws (→ error.tsx).
// ─────────────────────────────────────────────────────────────────────────────
export async function getShowcaseWorker(
  workerCode: string,
): Promise<ShowcaseWorkerProfile | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("career_get_showcase_worker", {
    p_worker_code: workerCode,
  });
  if (error) {
    throw new Error(`career_get_showcase_worker failed: ${error.message}`);
  }
  return (data as ShowcaseWorkerProfile | null) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) Worker reads OWN profile. RULE R1: scoped + re-verified by p_user_id.
//    Returns the public-safe block only (no _enc PII round-trip). null = no row.
// ─────────────────────────────────────────────────────────────────────────────
export async function getWorkerProfile(userId: string): Promise<WorkerProfile | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("career_get_worker_profile", {
    p_user_id: userId,
  });
  if (error) {
    throw new Error(`career_get_worker_profile failed: ${error.message}`);
  }
  return (data as WorkerProfile | null) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) Worker reads OWN documents (visibility + consent state, never raw bytes).
//    RULE R1: scoped by p_user_id.
// ─────────────────────────────────────────────────────────────────────────────
export async function getWorkerDocuments(userId: string): Promise<WorkerDocument[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("career_get_worker_documents", {
    p_user_id: userId,
  });
  if (error) {
    throw new Error(`career_get_worker_documents failed: ${error.message}`);
  }
  return (data as WorkerDocument[] | null) ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// 6) Worker status summary (dashboard signal). PII-free; counts only — never
//    exposes employer identity (symmetric gate). RULE R1: scoped by p_user_id.
// ─────────────────────────────────────────────────────────────────────────────
export async function getWorkerStatus(userId: string): Promise<WorkerStatus | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("career_get_worker_status", {
    p_user_id: userId,
  });
  if (error) {
    throw new Error(`career_get_worker_status failed: ${error.message}`);
  }
  return (data as WorkerStatus | null) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7) Employer requisitions list. RULE R1 + R8 #2: ownership re-verified via
//    career.owns_employer — passing employer B's uid returns ZERO rows.
// ─────────────────────────────────────────────────────────────────────────────
export async function getEmployerRequisitions(
  userId: string,
): Promise<RequisitionSummary[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("career_employer_requisitions", {
    p_employer_user_id: userId,
  });
  if (error) {
    throw new Error(`career_employer_requisitions failed: ${error.message}`);
  }
  return (data as RequisitionSummary[] | null) ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// 8) Single employer requisition + its PRESENTED anonymized shortlist. RULE R1:
//    ownership re-verified — a foreign uid returns null (→ notFound()).
// ─────────────────────────────────────────────────────────────────────────────
export async function getEmployerRequisition(
  id: string,
  userId: string,
): Promise<RequisitionDetail | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("career_employer_requisition", {
    p_id: id,
    p_employer_user_id: userId,
  });
  if (error) {
    throw new Error(`career_employer_requisition failed: ${error.message}`);
  }
  return (data as RequisitionDetail | null) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9) Employer unlock/reveal center — interest + approval + payment state. RULE R1
//    + R8 #2: ownership re-verified. Worker stays anonymized (workerCode only).
// ─────────────────────────────────────────────────────────────────────────────
export async function getEmployerUnlocks(userId: string): Promise<EmployerUnlock[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("career_employer_unlocks", {
    p_employer_user_id: userId,
  });
  if (error) {
    throw new Error(`career_employer_unlocks failed: ${error.message}`);
  }
  return (data as EmployerUnlock[] | null) ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// 10) Role resolver — route layer asks "worker / employer / neither?" to pick the
//     right nav/dashboard. RULE R1: explicit p_user_id.
// ─────────────────────────────────────────────────────────────────────────────
export async function resolveCareerRole(userId: string): Promise<CareerRole> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("career_resolve_role", {
    p_user_id: userId,
  });
  if (error) {
    throw new Error(`career_resolve_role failed: ${error.message}`);
  }
  const role = data as string | null;
  return role === "employer" || role === "worker" ? role : "none";
}
