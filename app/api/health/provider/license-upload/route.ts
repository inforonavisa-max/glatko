import { NextResponse } from "next/server";

import { createAdminClient, createClient } from "@/supabase/server";
import { isHealthVerticalEnabled } from "@/lib/saglik/flags";
import { buildLicensePath } from "@/lib/saglik/provider-validation";

/**
 * Glatko Sağlık — H7a provider license signed-upload endpoint.
 *
 * Mirrors app/api/admin/upload-signed-url/route.ts, but OWNER-SCOPED instead of
 * admin-scoped: the logged-in provider uploads their OWN license to the PRIVATE
 * health-licenses bucket. The object path is FORCED to `${user.id}/<file>` so the
 * bucket RLS ("health_licenses owner manage", (foldername)[1]==auth.uid()) permits
 * the write — the provider IS the owner. We never accept a client-supplied
 * target_user_id, and we never call getPublicUrl (the bucket is private; the file
 * is downloaded only by the H8 admin via a short-lived service-role signed URL).
 *
 * NEVER log the path/filename to Sentry — it's tied to a licensed professional's
 * identity document. The returned `path` is persisted by the client via the
 * setLicense server action (stored in health.providers.license_file_path), never
 * exposed in any public read-RPC (068).
 */

const BUCKET = "health-licenses";

interface RequestBody {
  filename?: string;
}

export async function POST(req: Request) {
  // ── Flag guard (404 when the vertical is off) ──────────────────────
  if (!isHealthVerticalEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ── Auth gate — the verified identity owns the upload folder ───────
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse + validate input ─────────────────────────────────────────
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const built = buildLicensePath(user.id, (body.filename ?? "").trim());
  if (!built.ok) {
    return NextResponse.json(
      { error: built.reason === "bad_ext" ? "file_type_not_allowed" : "filename_required" },
      { status: 400 },
    );
  }

  // ── Mint signed upload URL (service-role; owner path) ──────────────
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(built.path, { upsert: true });

  if (error || !data) {
    return NextResponse.json(
      { error: "could_not_create_signed_url" },
      { status: 500 },
    );
  }

  // No publicUrl — the bucket is private by design.
  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    path: built.path,
  });
}
