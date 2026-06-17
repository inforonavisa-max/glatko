import "server-only";

import { createAdminClient } from "@/supabase/server";

/**
 * Glatko Kariyer — server-only storage layer for worker documents (Group B).
 *
 * Two PRIVATE buckets (migration 077), kept structurally separate so the bucket id
 * itself is a hard wall:
 *   * career-worker   — gated ORIGINALS (passport/ID, diplomas, un-blurred photos).
 *                       NEVER served pre-unlock. Signed ONLY after the gate
 *                       (gate.ts:assertRevealUnlocked) passes + an access-log row.
 *   * career-showcase — face-blurred + watermarked PUBLIC_ANONYMIZED variants.
 *                       Signed via signShowcaseVariant (RULE R6: only a path whose
 *                       worker_documents row has visibility='public_anonymized').
 *
 * All operations use the cookie-free service-role admin client over storage. We
 * persist the storage PATH (not a URL) on the worker_documents row (via
 * lib/kariyer/booking.ts:addDocument) — URLs are minted on demand, short-lived,
 * and never stored. This module never returns a permanent URL.
 *
 * Path layout (matches the 077 owner-manage RLS, foldername[1] = the user id):
 *   career-worker/{userId}/{category}/{ts}-{rand}.{ext}
 */

const WORKER_BUCKET = "career-worker";
const SHOWCASE_BUCKET = "career-showcase";

const DEFAULT_TTL_SECONDS = 60; // short-lived; PII originals must not linger.

const DOC_MAX_BYTES = 5 * 1024 * 1024; // matches 077 file_size_limit (5 MiB).
const DOC_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

function fileExt(mime: string, fallback: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "application/pdf") return "pdf";
  return fallback;
}

/**
 * Sign a GATED ORIGINAL (career-worker bucket) for short-lived access. This is the
 * RULE R6 gated-original path: the CALLER (/api/career/documents/sign) MUST have
 * already passed the gate via lib/kariyer/gate.ts:assertRevealUnlocked AND written
 * a career_document_access_log row. This function only mints the URL — it does NOT
 * re-check the gate (the route owns the gate + audit-log ordering). It refuses any
 * path outside the career-worker bucket as a defense-in-depth guard.
 */
export async function signWorkerDocument(
  path: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  if (!path || path.includes("..")) {
    throw new Error("Invalid storage path");
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(WORKER_BUCKET)
    .createSignedUrl(path, ttlSeconds);
  if (error || !data) {
    throw new Error(`career-worker sign failed: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}

/**
 * Sign a PUBLIC_ANONYMIZED showcase variant (career-showcase bucket) for short-lived
 * display on anonymized pool cards/detail.
 *
 * RULE R6: only sign a path whose worker_documents row has
 * visibility = 'public_anonymized'. The structural wall is the bucket itself —
 * blurred/watermarked variants live ONLY in career-showcase and gated originals
 * ONLY in career-worker — so this signer refuses any path outside career-showcase.
 * The CALLER must resolve `path` from a worker_documents row's
 * watermarkedVariantPath (visibility='public_anonymized'); never pass a raw
 * user-supplied path or a gated original's storage_path here.
 */
export async function signShowcaseVariant(
  path: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  if (!path || path.includes("..")) {
    throw new Error("Invalid storage path");
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(SHOWCASE_BUCKET)
    .createSignedUrl(path, ttlSeconds);
  if (error || !data) {
    throw new Error(`career-showcase sign failed: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}

/**
 * Upload a worker document ORIGINAL into the private career-worker bucket and
 * return the persisted PATH (never a URL — RULE: persist PATH not URL). The caller
 * then writes the worker_documents row via lib/kariyer/booking.ts:addDocument with
 * the returned path. Path is namespaced under {userId} to satisfy the 077
 * owner-manage RLS (foldername[1] = userId).
 */
export async function uploadWorkerDocumentPath(
  userId: string,
  category: string,
  file: File,
): Promise<string> {
  if (!DOC_TYPES.includes(file.type as (typeof DOC_TYPES)[number])) {
    throw new Error("Invalid document type (pdf/jpeg/png only)");
  }
  if (file.size > DOC_MAX_BYTES) {
    throw new Error("File too large (max 5MB)");
  }
  const supabase = createAdminClient();
  const ext = fileExt(file.type, "bin");
  const safeCategory = category.replace(/[^a-z0-9_-]/gi, "_").slice(0, 32) || "doc";
  const objectPath = `${userId}/${safeCategory}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;

  const { data, error } = await supabase.storage
    .from(WORKER_BUCKET)
    .upload(objectPath, file, { cacheControl: "3600", upsert: false });
  if (error || !data) {
    throw new Error(`career-worker upload failed: ${error?.message ?? "unknown"}`);
  }
  // Return the PATH only — the URL is minted on demand by signWorkerDocument.
  return data.path;
}
