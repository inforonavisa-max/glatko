import { NextResponse } from "next/server";
import { createClient } from "@/supabase/server";
import { isCareerVerticalEnabled } from "@/lib/kariyer/flags";
import { uploadWorkerDocumentPath, signWorkerDocument } from "@/lib/kariyer/storage";
import { addDocument } from "@/lib/kariyer/booking";

// Service-role write path (the storage upload + RPC run as service_role via the
// admin client inside lib/kariyer/*), and it reads the cookie session for the
// worker identity — so it can never be statically cached. R5/R11.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Visibility = "public_anonymized" | "gated" | "internal_only";

// Canonical worker-document categories (Spec 20 §Layout — one section per
// category). The DB column is free-text, so this list is the single server-side
// allow-list; the WorkerDocumentsUploader client sends these exact slugs.
// `allowed` is the per-category visibility set (defense-in-depth, PART 6 §D):
//   * profile/work photos  → public_anonymized | gated | internal_only
//   * id/passport, insurance/medical → internal_only ONLY (special category —
//     can NEVER be public_anonymized; the UI disables that option, the API
//     rejects it).
//   * diplomas, skill certs, references → gated | internal_only (the FACT shows
//     publicly; the FILE unlocks after approval + payment) — not public_anonymized.
const CATEGORY_RULES: Record<string, { allowed: ReadonlySet<Visibility>; image: boolean }> = {
  profile_photo: {
    allowed: new Set<Visibility>(["public_anonymized", "gated", "internal_only"]),
    image: true,
  },
  work_photos: {
    allowed: new Set<Visibility>(["public_anonymized", "gated", "internal_only"]),
    image: true,
  },
  id_passport: {
    allowed: new Set<Visibility>(["internal_only"]),
    image: false,
  },
  diplomas: {
    allowed: new Set<Visibility>(["gated", "internal_only"]),
    image: false,
  },
  skill_certs: {
    allowed: new Set<Visibility>(["gated", "internal_only"]),
    image: false,
  },
  insurance_medical: {
    allowed: new Set<Visibility>(["internal_only"]),
    image: false,
  },
  references: {
    allowed: new Set<Visibility>(["gated", "internal_only"]),
    image: false,
  },
};

// File-type allow-lists. Photo categories accept images only; document
// categories accept PDF or image. Mirrors the storage layer's DOC_TYPES cap
// (lib/kariyer/storage.ts) — the storage upload re-validates type + 5 MiB size
// as a second wall (defense in depth).
const IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
const DOC_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

// Extension allow-lists, checked against the original filename so a spoofed mime
// can't slip a foreign extension through. Kept in lockstep with the mime sets.
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png"]);
const DOC_EXTS = new Set(["pdf", "jpg", "jpeg", "png"]);

const MAX_BYTES = 5 * 1024 * 1024; // 5 MiB — matches storage + migration 077.

function isVisibility(v: string): v is Visibility {
  return v === "public_anonymized" || v === "gated" || v === "internal_only";
}

function fileExtOf(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

export async function POST(request: Request) {
  // Flag OFF → real 404 (mirror holds route line 39; RULE R8 #8).
  if (!isCareerVerticalEnabled()) return new NextResponse(null, { status: 404 });

  // Auth — the worker identity comes from the session, NEVER the body (RULE R1).
  // The storage path is re-derived server-side from user.id (client never names
  // the path). No session → 401; the client routes to /career/login.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Multipart form: the bytes plus category + visibility + consent. No JSON body
  // here (unlike the other career routes) because a File is being transferred.
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const category = typeof form.get("category") === "string" ? (form.get("category") as string).trim() : "";
  const visibilityRaw =
    typeof form.get("visibility") === "string" ? (form.get("visibility") as string).trim() : "";
  // Consent toggle — the per-document PDPL affirmation (Spec 20). Only an explicit
  // "true" grants; anything else is treated as not-consented (pending).
  const consent = form.get("consent") === "true";
  const fileField = form.get("file");

  // Category must be one of the known seven (Spec 20 §Layout).
  const rule = CATEGORY_RULES[category];
  if (!rule) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  // Visibility must be a valid enum AND allowed for this category — special-category
  // docs (id/passport, insurance/medical) can NEVER be public_anonymized (PART 6 §D).
  if (!isVisibility(visibilityRaw) || !rule.allowed.has(visibilityRaw)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const visibility = visibilityRaw;

  // The file must be present and non-empty.
  if (!(fileField instanceof File) || fileField.size === 0) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const file = fileField;

  // Size cap (server-side; the storage layer re-checks). 413 = payload too large.
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  // Type + extension validation, scoped to the category (photos → images only).
  const allowedTypes = rule.image ? IMAGE_TYPES : DOC_TYPES;
  const allowedExts = rule.image ? IMAGE_EXTS : DOC_EXTS;
  const ext = fileExtOf(file.name);
  if (!allowedTypes.has(file.type) || !allowedExts.has(ext)) {
    return NextResponse.json({ error: "invalid_file_type" }, { status: 400 });
  }

  // Step 1 — upload the ORIGINAL into the private career-worker bucket. The path
  // is namespaced under the session user id by the storage layer (the client
  // never supplies a path). Returns the storage PATH, never a URL (RULE R6).
  let path: string;
  try {
    path = await uploadWorkerDocumentPath(user.id, category, file);
  } catch (e) {
    // No PII in logs — a filename may carry a name; log only the message.
    console.error(
      "[career-documents-upload] storage upload failed:",
      e instanceof Error ? e.message : "unknown",
    );
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  // Step 2 — write the worker_documents row via the SECURITY DEFINER RPC. R1:
  // the worker is resolved from p_user_id inside the RPC (never auth.uid()).
  // The chosen visibility + consent flag are the single source of truth for what
  // is exposed about this document.
  let result;
  try {
    result = await addDocument({
      userId: user.id,
      category,
      storagePath: path,
      visibility,
      consent,
    });
  } catch (e) {
    console.error(
      "[career-documents-upload] addDocument failed:",
      e instanceof Error ? e.message : "unknown",
    );
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  if (!result.ok) {
    // Business-code → HTTP mapping. WORKER_NOT_FOUND (no worker profile yet) → 404;
    // CONSENT_REQUIRED → 400; anything else → 400. The response NEVER carries the
    // path or any document/identity data — only a stable code (R7: no fee data).
    const status = result.code === "WORKER_NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: "upload_failed", code: result.code }, { status });
  }

  // Success — return the persisted PATH and a freshly-minted short-lived signed
  // READ URL so the client can render the just-added item without a second
  // round-trip to /api/career/documents/sign. The path is the worker's OWN
  // gated original (R6: a worker may always read their own original).
  let uploadUrl: string | null = null;
  try {
    uploadUrl = await signWorkerDocument(path);
  } catch {
    // Non-fatal: the row is committed; the client can re-sign via /sign on demand.
    uploadUrl = null;
  }

  return NextResponse.json({ ok: true, documentId: result.documentId, path, uploadUrl });
}
