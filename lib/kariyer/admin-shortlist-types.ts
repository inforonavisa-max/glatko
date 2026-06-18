// ─────────────────────────────────────────────────────────────────────────────
// Spec 26 — shared admin shortlist-builder row/data types.
//
// The shortlists page (server) reads these via createAdminClient() → SECURITY
// DEFINER career_admin_* RPCs and hands them to the AdminShortlistBuilder
// ("use client") component. Both the page and the component need the same
// shapes, so they live here in lib (a small shared type module) rather than
// being exported from a route page — there is NO requisitions/[id] route; these
// types are NOT tied to any page.
//
// R-gate discipline (R1/R7): the builder renders ONLY anonymized attributes +
// the worker CODE — never name/phone/email/passport, and no worker-side fee.
// So these row types intentionally project the anonymized columns only, even
// though career_admin_search_workers (076 §1) also returns decrypted PII.
// ─────────────────────────────────────────────────────────────────────────────

/** One requisition header as projected for the shortlist builder. */
export interface AdminShortlistRequisition {
  id: string;
  status: string;
  sectorLabel: string | null;
  role: string | null;
  headcount: number | null;
  servicePath: string;
  requirementsSummary: string | null;
  createdAt: string;
}

/**
 * One item already on a requisition's (un-presented) shortlist — anonymized
 * attributes + the worker CODE + curation stage. `isShowcased` flags a worker
 * who was added but is no longer showcased (the employer read silently drops
 * them — surfaced as a warning in the builder).
 */
export interface AdminShortlistItemRow {
  itemId: string;
  workerCode: string;
  stage: string;
  readinessScore: number | null;
  isShowcased: boolean;
  role: string | null;
  trade: string | null;
  skillTier: string | null;
  experienceBand: string | null;
  region: string | null;
}

/**
 * career_admin_get_shortlist projection: the requisition header, the shortlist
 * id (null until the first add lazily creates it), the presented flag, and the
 * current items.
 */
export interface AdminShortlistData {
  requisition: AdminShortlistRequisition;
  shortlistId: string | null;
  presentedToEmployer: boolean;
  items: AdminShortlistItemRow[];
}

/**
 * One candidate from career_admin_search_workers (076 §1), projected to the
 * anonymized subset the Add panel renders (never the decrypted PII the RPC also
 * returns).
 */
export interface AdminCandidateRow {
  workerCode: string;
  verificationStatus: string | null;
  readinessScore: number | null;
  role: string | null;
  trade: string | null;
  skillTier: string | null;
  experienceBand: string | null;
  region: string | null;
}
