import { setRequestLocale } from "next-intl/server";

import { createAdminClient } from "@/supabase/server";
import { CareerComplianceView } from "@/components/admin/career/CareerComplianceView";

/**
 * Spec 31 — Compliance / Documents (`/admin/career/compliance`).
 *
 * A READ-ONLY PDPA/GDPR audit window: three surfaces in one page — (1) consent
 * log, (2) retention timers, (3) document access audit trail — switched via
 * ?tab=consents|retention|access. NO mutations in Phase-0 (no consent edits, no
 * purge button); it is a viewer, not a control panel.
 *
 * Lives under /admin (allowlist-gated + noindex — inherited from
 * app/[locale]/admin/layout.tsx); EXEMPT from CAREER_VERTICAL_ENABLED (admins
 * manage the vertical pre-launch — the flag is NEVER imported here), mirroring the
 * sibling requisitions/unlocks/commissions consoles.
 *
 * Mirrors app/[locale]/admin/reviews/page.tsx: a force-dynamic async server
 * component that awaits params + searchParams, runs count-limited service-role
 * reads via createAdminClient(), maps rows to the typed Row interfaces exported
 * below, and renders the read-only client list island.
 *
 * DATA ACCESS / R8 #6 (Spec 31 GAP): `career.consents`, `career.worker_documents`
 * (retention cols) and `career.document_access_log` are DENY-ALL base tables in a
 * schema that is NOT exposed to PostgREST — only the service-role admin client
 * (BYPASSRLS) or a SECURITY DEFINER admin RPC can read them. Migration 076 ships a
 * per-worker `career_admin_compliance(p_worker_id)` but NO global list-RPC for
 * these three audit sources yet. So each tab attempts its reachable read and, on
 * the GAP (source not yet reachable / errors), degrades to `rows = [] / data ?? []`
 * and renders the designed empty state — never a 500 white screen for the owner
 * (identical degradation to app/[locale]/admin/career/page.tsx). When the global
 * admin read-RPCs land (R15 — no prod apply without explicit go), only these
 * helpers change; the view contract stays the same.
 *
 * R6/R7/R8 #9: this is the most sensitive admin surface. It NEVER selects
 * storage_path / watermarked_variant_path / any _enc PII column, and never
 * resolves a worker's name/phone/email — only the anonymized worker CODE, the
 * employer CODE/id, categories, states, dates and already-hashed values.
 */

// R5/R11: reads the admin session + a per-request ?tab filter, so the owner
// console must never be statically cached (live audit reads, never ISR).
export const dynamic = "force-dynamic";

export type ComplianceTab = "consents" | "retention" | "access";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
  searchParams: Promise<{ tab?: string }> | { tab?: string };
};

/** Consent log row — worker CODE + purpose + granted/revoked state + dates. */
export interface CareerConsentRow {
  id: string;
  worker_code: string | null;
  purpose: string | null;
  granted: boolean;
  granted_at: string | null;
  revoked_at: string | null;
}

/**
 * Retention timer row — worker CODE + document category/visibility/consent +
 * retention-until (the view derives days-remaining client-side). NEVER carries
 * storage_path / watermarked_variant_path (R6).
 */
export interface CareerRetentionRow {
  id: string;
  worker_code: string | null;
  category: string | null;
  visibility: string | null;
  consent_status: string | null;
  retention_until: string | null;
}

/** Access audit row — already-anonymized, append-only forensic columns. */
export interface CareerAccessRow {
  id: string;
  document_id: string | null;
  worker_code: string | null;
  accessed_by: string | null;
  reveal_unlock_id: string | null;
  accessed_at: string | null;
  ip_hash: string | null;
}

function asTab(value: string | undefined): ComplianceTab {
  return value === "retention" || value === "access" ? value : "consents";
}

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Consent log — newest-first, .limit(100). Joins the worker's anonymized CODE so
 * no UUID/name leaks. Degrades to [] on the GAP (no global read path yet).
 */
async function readConsents(admin: AdminClient): Promise<CareerConsentRow[]> {
  const { data, error } = await admin
    .schema("career")
    .from("consents")
    .select(
      "id, purpose, granted, granted_at, revoked_at, worker_profiles ( worker_code )",
    )
    .order("granted_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[GLATKO:admin] career compliance consents read failed:", error);
  }
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    purpose: string | null;
    granted: boolean | null;
    granted_at: string | null;
    revoked_at: string | null;
    worker_profiles: { worker_code: string | null } | null;
  }>;
  return rows.map((r) => ({
    id: String(r.id),
    worker_code: r.worker_profiles?.worker_code ?? null,
    purpose: r.purpose ?? null,
    granted: r.granted ?? false,
    granted_at: r.granted_at ?? null,
    revoked_at: r.revoked_at ?? null,
  }));
}

/**
 * Retention timers — selects ONLY the retention/visibility/category/consent
 * columns (never storage_path / watermarked_variant_path — R6 edge case).
 * Newest-first by retention_until, .limit(100). Degrades to [] on the GAP.
 */
async function readRetention(admin: AdminClient): Promise<CareerRetentionRow[]> {
  const { data, error } = await admin
    .schema("career")
    .from("worker_documents")
    .select(
      "id, category, visibility, consent_status, retention_until, worker_profiles ( worker_code )",
    )
    .order("retention_until", { ascending: false, nullsFirst: false })
    .limit(100);
  if (error) {
    console.error("[GLATKO:admin] career compliance retention read failed:", error);
  }
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    category: string | null;
    visibility: string | null;
    consent_status: string | null;
    retention_until: string | null;
    worker_profiles: { worker_code: string | null } | null;
  }>;
  return rows.map((r) => ({
    id: String(r.id),
    worker_code: r.worker_profiles?.worker_code ?? null,
    category: r.category ?? null,
    visibility: r.visibility ?? null,
    consent_status: r.consent_status ?? null,
    retention_until: r.retention_until ?? null,
  }));
}

/**
 * Access audit trail — every gated-original signed-URL issuance (R6 write path).
 * Already-anonymized append-only rows; ip_hash is hashed in the table. Joins the
 * worker CODE through worker_documents. Newest-first, .limit(100). Degrades to [].
 */
async function readAccess(admin: AdminClient): Promise<CareerAccessRow[]> {
  const { data, error } = await admin
    .schema("career")
    .from("document_access_log")
    .select(
      "id, document_id, accessed_by, reveal_unlock_id, accessed_at, ip_hash, worker_documents ( worker_profiles ( worker_code ) )",
    )
    .order("accessed_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[GLATKO:admin] career compliance access read failed:", error);
  }
  const rows = (data ?? []) as unknown as Array<{
    id: string | number;
    document_id: string | null;
    accessed_by: string | null;
    reveal_unlock_id: string | null;
    accessed_at: string | null;
    ip_hash: string | null;
    worker_documents: {
      worker_profiles: { worker_code: string | null } | null;
    } | null;
  }>;
  return rows.map((r) => ({
    id: String(r.id),
    document_id: r.document_id ?? null,
    worker_code: r.worker_documents?.worker_profiles?.worker_code ?? null,
    accessed_by: r.accessed_by ?? null,
    reveal_unlock_id: r.reveal_unlock_id ?? null,
    accessed_at: r.accessed_at ?? null,
    ip_hash: r.ip_hash ?? null,
  }));
}

export default async function AdminCareerCompliancePage({
  params,
  searchParams,
}: Props) {
  const { locale } = await Promise.resolve(params);
  setRequestLocale(locale);
  const { tab: tabParam } = await Promise.resolve(searchParams);
  const tab = asTab(tabParam);

  const admin = createAdminClient();

  // Read ONLY the active tab's source (avoid pulling all three every render).
  const consents = tab === "consents" ? await readConsents(admin) : [];
  const retention = tab === "retention" ? await readRetention(admin) : [];
  const access = tab === "access" ? await readAccess(admin) : [];

  return (
    <CareerComplianceView
      tab={tab}
      consents={consents}
      retention={retention}
      access={access}
      locale={locale}
    />
  );
}
