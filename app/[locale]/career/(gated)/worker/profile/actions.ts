"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/supabase/server";
import { isCareerVerticalEnabled } from "@/lib/kariyer/flags";
import {
  createWorkerProfile,
  type CareerWriteErrorCode,
} from "@/lib/kariyer/booking";

/**
 * Spec 19 — WorkerProfileWizard commit.
 *
 * MIRRORS app/[locale]/messages/actions.ts (server-action shape: `"use server"`,
 * `auth.getUser()` gate, validate, write, `revalidatePath`, `{ success, error }`)
 * and the FormData-parsing idiom of app/[locale]/become-a-pro/actions.ts
 * (`submitProfessionalApplication`).
 *
 * R7 (ILO Employer Pays): the worker is NEVER charged. There is NO fee/price/
 * payment/commission field anywhere in this action — none is read, validated, or
 * written. Payment state lives only on the employer side.
 *
 * R1: the worker's identity is derived server-side from `auth.getUser()` and the
 * resolved `user.id` is the ONLY source of `p_user_id` — it is never read from the
 * request body. createWorkerProfile() forwards it to the migration-075 SECURITY
 * DEFINER RPC, which re-verifies ownership and encrypts PII (we never see plaintext
 * PII back — only `workerCode`).
 *
 * The career schema is NOT exposed to PostgREST, so the write goes through the
 * service-role RPC inside createWorkerProfile() (createAdminClient), not a direct
 * `.from('career.*')`.
 */

interface FormState {
  success: boolean;
  error?: string;
}

/** Map a known RPC RAISE code to a stable user-facing error string. */
function messageForCode(code: CareerWriteErrorCode): string {
  switch (code) {
    case "CONSENT_REQUIRED":
      return "Consent is required to submit your profile.";
    case "SECTOR_INVALID":
      return "Please pick a valid role and trade.";
    case "NOT_OWNED":
      return "Not authorized.";
    case "ALREADY_EXISTS":
      return "A profile already exists for this account.";
    case "PII_KEY_MISSING":
      return "We could not process your details right now. Please try again later.";
    case "GATE_LOCKED":
    case "WORKER_NOT_FOUND":
    case "ERROR":
    default:
      return "Could not save your profile. Please try again.";
  }
}

/** Read every value for `key` from FormData as a trimmed, de-duped string[]. */
function readStringArray(formData: FormData, key: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of formData.getAll(key)) {
    const s = String(v ?? "").trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/** Read a single trimmed field; "" → null (the RPC's nullable PII columns). */
function readOptional(formData: FormData, key: string): string | null {
  const s = String(formData.get(key) ?? "").trim();
  return s.length > 0 ? s : null;
}

/**
 * Commit the worker profile wizard. Returns `{ success, error }` (mirror idiom).
 * Validation is intentionally permissive — most fields are optional and feed the
 * readiness score; the hard gates are consent + a role/trade pair, matching the
 * wizard's `step1Ok`/`step2Ok` client gates (the RPC re-validates canonically).
 */
export async function saveWorkerProfile(
  formData: FormData,
): Promise<FormState> {
  // Flag-guard: the career vertical ships dark. A disabled flag means this
  // surface is middleware-quarantined (HTTP 404); a server action reaching here
  // with the flag off is treated as not-found-equivalent and refuses to write.
  if (!isCareerVerticalEnabled()) {
    return { success: false, error: "Not available" };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // R1: worker self. Identity comes from the session, never the body.
  if (!user) return { success: false, error: "Authentication required" };

  // Hard gates (mirror the wizard's required-step booleans).
  const consent = String(formData.get("consent") ?? "") === "true";
  if (!consent) {
    return { success: false, error: "Consent is required." };
  }

  const role = readOptional(formData, "role");
  const trade = readOptional(formData, "trade");
  if (!role || !trade) {
    return { success: false, error: "Please pick a role and trade." };
  }

  const languages = readStringArray(formData, "languages");
  const skills = readStringArray(formData, "skills");

  // Private PII (encrypted by the RPC; only a region/band is ever public — PART 4).
  // R7: no rate/fee/price/payment field is read here.
  const result = await createWorkerProfile({
    userId: user.id,
    fullName: readOptional(formData, "fullName"),
    dob: readOptional(formData, "dob"),
    exactCountry: readOptional(formData, "exactCountry"),
    phone: readOptional(formData, "phone"),
    // Prefer the session email; fall back to the submitted value only if the
    // session has none. The session is authoritative for identity (R1).
    email: user.email ?? readOptional(formData, "email"),
    address: readOptional(formData, "address"),
    passportNo: readOptional(formData, "passportNo"),
    role,
    trade,
    tier: readOptional(formData, "tier"),
    experience: readOptional(formData, "experience"),
    region: readOptional(formData, "region"),
    age: readOptional(formData, "age"),
    languages,
    skills,
    consent,
  });

  if (!result.ok) {
    return { success: false, error: messageForCode(result.code) };
  }

  // Refresh the worker's gated surfaces that read the profile.
  revalidatePath("/[locale]/career/(gated)/worker/profile", "page");
  revalidatePath("/[locale]/career/(gated)/worker/dashboard", "page");

  return { success: true };
}
