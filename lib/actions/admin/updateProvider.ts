"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin/audit";
import {
  adminProviderEditSchema,
  type AdminProviderEditPayload,
} from "@/lib/validations/admin/provider";
import { glatkoCaptureException } from "@/lib/sentry/glatko-capture";

interface UpdateProviderResult {
  ok: boolean;
  error?: string;
  code?: string;
  providerId?: string;
}

async function requireAdmin(): Promise<
  | { ok: true; userId: string; email: string }
  | { ok: false; error: string }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { ok: false, error: "Unauthorized" };
  if (!isAdminEmail(user.email)) return { ok: false, error: "Forbidden" };
  return { ok: true, userId: user.id, email: user.email };
}

/**
 * Sprint B2 — admin provider EDIT. Mirrors createProviderAction
 * (lib/actions/admin/createProvider.ts) but targets the
 * glatko_admin_update_provider RPC (migration 051) for a sparse UPDATE.
 *
 * The RPC merges by jsonb key-existence: an absent key keeps the column,
 * an explicit `null` clears it. So we strip `undefined` from the payload
 * (Zod's representation of "not provided") but DELIBERATELY keep `null`
 * (the admin's intent to clear). `mode` + `provider_id` are control fields,
 * never forwarded into the column payload.
 */
export async function updateProviderAction(
  rawInput: unknown,
): Promise<UpdateProviderResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = adminProviderEditSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
      code: "VALIDATION",
    };
  }
  const input: AdminProviderEditPayload = parsed.data;

  // Build the JSONB column payload: drop control fields + drop `undefined`
  // (absent → sparse no-op) but keep `null` (explicit clear).
  const { mode: _mode, provider_id, ...editable } = input;
  void _mode;
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(editable)) {
    if (value !== undefined) payload[key] = value;
  }
  const changedFields = Object.keys(payload);

  const admin = createAdminClient();
  const { data: rpcResult, error: rpcErr } = await admin.rpc(
    "glatko_admin_update_provider",
    { p_provider_id: provider_id, p_payload: payload },
  );

  if (rpcErr) {
    glatkoCaptureException(rpcErr, {
      module: "admin-update-provider",
      providerId: provider_id,
    });
    return { ok: false, error: rpcErr.message, code: "RPC_FAILED" };
  }

  const result = rpcResult as {
    success?: boolean;
    slug?: string | null;
  } | null;

  // Audit log (best-effort — never blocks the success path).
  await logAdminAction({
    actionType: "pro_update_admin",
    targetTable: "glatko_professional_profiles",
    targetId: provider_id,
    payload: { changedFields },
    reason: "Admin edited provider profile",
  });

  // Cache revalidation — mirrors createProviderAction's 4 surfaces.
  revalidatePath(`/[locale]/admin/professionals`, "page");
  revalidatePath(`/[locale]/admin/professionals/${provider_id}`, "page");
  revalidatePath(`/[locale]/admin/users`, "page");
  if (result?.slug) {
    revalidatePath(`/[locale]/pros/${result.slug}`, "page");
  }

  return { ok: true, providerId: provider_id };
}
