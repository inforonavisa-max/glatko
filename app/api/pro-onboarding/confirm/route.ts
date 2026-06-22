import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/supabase/server";
import { isVoiceOnboardingEnabled } from "@/lib/pro-voice/flags";
import { getOwnedDraft, markDraftConfirmed } from "@/lib/pro-voice/drafts";
import { getRootCategories, resolveCategoryId } from "@/lib/pro-voice/categories";
import { translateMessage } from "@/lib/ai/translate-message";
import type { ConfirmEdits } from "@/lib/pro-voice/types";

// Service-role RPC (provider creation) + reads the cookie session — never
// cached. OTP must already have run (phone_verified gate below) per spec flow.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** kebab slug from any-language display name + a short suffix for uniqueness. */
function slugify(name: string): string {
  const map: Record<string, string> = {
    ç: "c", ğ: "g", ı: "i", ş: "s", ö: "o", ü: "u", İ: "i",
    đ: "dj", ž: "z", š: "s", č: "c", ć: "c",
  };
  const folded = name
    .toLowerCase()
    .replace(/[çğışöüİđžščć]/g, (c) => map[c] ?? c);
  const base =
    folded
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "pro";
  const rand = Math.random().toString(36).slice(2, 6);
  return `${base}-${rand}`;
}

function isEdits(v: unknown): v is ConfirmEdits {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.display_name === "string" &&
    typeof e.category_slug === "string" &&
    Array.isArray(e.sub_services) &&
    typeof e.bio === "string" &&
    Array.isArray(e.service_areas) &&
    (typeof e.experience_years === "number" || e.experience_years === null)
  );
}

export async function POST(request: Request) {
  if (!isVoiceOnboardingEnabled()) return new NextResponse(null, { status: 404 });

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { draftId?: unknown; edits?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const draftId = typeof body.draftId === "string" ? body.draftId : "";
  if (!draftId || !isEdits(body.edits)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const edits = body.edits;

  // Already a pro? Idempotent guard before any write.
  const { data: existingPro } = await supabase
    .from("glatko_professional_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (existingPro) {
    return NextResponse.json({ error: "already_pro" }, { status: 409 });
  }

  // OTP gate (spec: "OTP doğrula → aktif"). The review UI runs the EXISTING
  // phone verification (lib/actions/phone.ts) which writes profiles.phone_verified.
  // We require it server-side so an unverified phone can never reach creation.
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone, phone_verified, full_name, preferred_locale")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.phone_verified || !profile.phone) {
    return NextResponse.json({ error: "phone_not_verified" }, { status: 412 });
  }
  const verifiedPhone = profile.phone;

  // Load the owned, unexpired draft (service-role; ownership checked in code).
  const draft = await getOwnedDraft(draftId, user.id);
  if ("error" in draft) {
    const status = draft.error === "expired" ? 410 : 404;
    return NextResponse.json({ error: `draft_${draft.error}` }, { status });
  }

  // Resolve the (possibly edited) category slug → uuid. Outside taxonomy → 422.
  const roots = await getRootCategories();
  const categoryId = resolveCategoryId(roots, edits.category_slug);
  if (!categoryId) {
    return NextResponse.json({ error: "category_unresolved" }, { status: 422 });
  }

  // Bio → TR (default locale + admin/marketplace display). Graceful: if the
  // pipeline is down or the bio is already TR, keep the majstor's own text.
  let storedBio = edits.bio;
  try {
    const tr = await translateMessage(edits.bio, "tr");
    if (tr?.translatedContent) storedBio = tr.translatedContent;
  } catch {
    /* keep original bio — translation is best-effort */
  }

  const displayName = edits.display_name.trim() || profile.full_name || "Glatko Pro";
  const primaryArea = edits.service_areas[0] ?? "";

  const basePayload = {
    user_id: user.id,
    expected_email: "", // phone-OTP users may have NULL email; RPC tolerates ""
    full_name: displayName,
    business_name: displayName,
    phone: verifiedPhone,
    city_display: primaryArea,
    location_city: primaryArea,
    bio: storedBio,
    languages:
      draft.detected_language && /^[a-z]{2}$/.test(draft.detected_language)
        ? [draft.detected_language]
        : ["en"],
    years_experience:
      edits.experience_years != null ? String(edits.experience_years) : "",
    service_radius_km: "25",
    is_verified: false,
    is_active: true,
    verification_status: "pending",
    insurance_status: "none",
    portfolio_images: draft.photo_urls,
    preferred_locale: profile.preferred_locale ?? "",
    services: [{ category_id: categoryId, is_primary: true }],
  };

  const admin = createAdminClient();

  // One slug-collision retry: the RPC enforces slug uniqueness atomically.
  let lastCode = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const payload = { ...basePayload, slug: slugify(displayName) };
    const { data, error } = await admin.rpc("glatko_admin_create_provider", {
      payload,
    });
    if (error) {
      console.error("[GLATKO:voice] create RPC transport error:", error.message);
      return NextResponse.json({ error: "create_failed" }, { status: 500 });
    }
    const res = data as {
      success: boolean;
      code?: string;
      provider_id?: string;
      slug?: string;
    };
    if (res.success) {
      await markDraftConfirmed(draftId, verifiedPhone);
      return NextResponse.json({
        ok: true,
        providerId: res.provider_id,
        redirectUrl: "/pro/dashboard",
      });
    }
    lastCode = res.code ?? "unknown";
    if (lastCode === "DUPLICATE_PRO") {
      return NextResponse.json({ error: "already_pro" }, { status: 409 });
    }
    if (lastCode !== "DUPLICATE_SLUG") break; // only slug collisions are retryable
  }

  console.error("[GLATKO:voice] provider create failed, code:", lastCode);
  return NextResponse.json({ error: "create_failed" }, { status: 500 });
}
