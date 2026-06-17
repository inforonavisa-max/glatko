import "server-only";

import { createAdminClient } from "@/supabase/server";

/**
 * Glatko Kariyer — server-only WRITE data-access (Group B). MIRRORS
 * lib/saglik/booking.ts: the `career` schema is NOT exposed to PostgREST, so even
 * the service-role client cannot `.from('career.*')` — every write goes through a
 * PUBLIC-schema SECURITY DEFINER RPC (migration 075), called with createAdminClient().
 *
 * RULE R1: NO auth.uid() inside any RPC — identity is derived in the route/action
 * layer (auth.getUser()) and PASSED DOWN as p_*_user_id; ownership is re-verified
 * inside each RPC (career.owns_employer / re-checked user_id).
 *
 * RULE R3: career_express_interest verifies the requisition is owned by the caller
 * AND the worker_code resolves to an is_showcased=true worker, else RAISE NOT_OWNED
 * / WORKER_NOT_FOUND.
 *
 * RULE R7 (ILO Employer Pays + MNE €500–20 000 fine): NO fee/price/payment arg on
 * any worker-side write. Payment state lives only on the employer side.
 *
 * RPC-raised business errors surface as PostgREST errors whose message CONTAINS the
 * raised code (e.g. "CONSENT_REQUIRED"); parseCareerError maps them to a stable
 * union. The CODES array is kept in LOCKSTEP with the RAISE codes in 075.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Stable error codes — LOCKSTEP with the RAISE codes in migration 075. Adding a
// new RAISE in the SQL MUST add it here (and vice-versa); the parser matches by
// substring so message framing changes don't break the mapping.
//   SECTOR_INVALID · CONSENT_REQUIRED · NOT_OWNED · GATE_LOCKED · WORKER_NOT_FOUND ·
//   ALREADY_EXISTS · PII_KEY_MISSING (infra).
// ─────────────────────────────────────────────────────────────────────────────
export type CareerWriteErrorCode =
  | "SECTOR_INVALID"
  | "CONSENT_REQUIRED"
  | "NOT_OWNED"
  | "GATE_LOCKED"
  | "WORKER_NOT_FOUND"
  | "ALREADY_EXISTS"
  | "PII_KEY_MISSING"
  | "ERROR";

const CAREER_WRITE_ERROR_CODES: CareerWriteErrorCode[] = [
  "SECTOR_INVALID",
  "CONSENT_REQUIRED",
  "NOT_OWNED",
  "GATE_LOCKED",
  "WORKER_NOT_FOUND",
  "ALREADY_EXISTS",
  "PII_KEY_MISSING",
];

function parseCareerError(message: string): CareerWriteErrorCode {
  const hit = CAREER_WRITE_ERROR_CODES.find((c) => message.includes(c));
  return hit ?? "ERROR";
}

// Discriminated-union result helpers. Every write returns {ok:true,...} on success
// or {ok:false, code} on a known RAISE — the route layer never sees a raw throw.
export type CreateWorkerProfileResult =
  | { ok: true; workerId: string; workerCode: string }
  | { ok: false; code: CareerWriteErrorCode };

export type CreateEmployerAccountResult =
  | { ok: true; employerId: string }
  | { ok: false; code: CareerWriteErrorCode };

export type CreateRequisitionResult =
  | { ok: true; requisitionId: string }
  | { ok: false; code: CareerWriteErrorCode };

export type AddDocumentResult =
  | { ok: true; documentId: string }
  | { ok: false; code: CareerWriteErrorCode };

export type ExpressInterestResult =
  | { ok: true; unlockId: string; created: boolean }
  | { ok: false; code: CareerWriteErrorCode };

export type JoinWaitlistResult =
  | { ok: true; id: string }
  | { ok: false; code: CareerWriteErrorCode };

// ─────────────────────────────────────────────────────────────────────────────
// 1) Create worker profile (multi-step builder commit). RULE R7: NO fee arg.
//    Requires explicit consent (RAISE CONSENT_REQUIRED). The RPC encrypts PII and
//    generates the worker_code; we never see plaintext PII back.
// ─────────────────────────────────────────────────────────────────────────────
export async function createWorkerProfile(args: {
  userId: string;
  fullName: string | null;
  dob: string | null;
  exactCountry: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  passportNo: string | null;
  role: string | null;
  trade: string | null;
  tier: string | null;
  experience: string | null;
  region: string | null;
  age: string | null;
  languages: string[];
  skills: string[];
  consent: boolean;
}): Promise<CreateWorkerProfileResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("career_create_worker_profile", {
    p_user_id: args.userId,
    p_full_name: args.fullName,
    p_dob: args.dob,
    p_exact_country: args.exactCountry,
    p_phone: args.phone,
    p_email: args.email,
    p_address: args.address,
    p_passport_no: args.passportNo,
    p_role: args.role,
    p_trade: args.trade,
    p_tier: args.tier,
    p_experience: args.experience,
    p_region: args.region,
    p_age: args.age,
    p_languages: args.languages,
    p_skills: args.skills,
    p_consent: args.consent,
  });
  if (error) {
    return { ok: false, code: parseCareerError(error.message) };
  }
  const d = data as { workerId: string; workerCode: string };
  return { ok: true, workerId: d.workerId, workerCode: d.workerCode };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Create employer account. Contact encrypted by the RPC. One account per user
//    (RAISE ALREADY_EXISTS); blank company → SECTOR_INVALID (reused stable code).
// ─────────────────────────────────────────────────────────────────────────────
export async function createEmployerAccount(args: {
  userId: string;
  company: string;
  contact: string | null;
}): Promise<CreateEmployerAccountResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("career_create_employer_account", {
    p_user_id: args.userId,
    p_company: args.company,
    p_contact: args.contact,
  });
  if (error) {
    return { ok: false, code: parseCareerError(error.message) };
  }
  const d = data as { employerId: string };
  return { ok: true, employerId: d.employerId };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) Create requisition. RULE R1/R3: the RPC re-verifies the caller owns the
//    employer account (else NOT_OWNED) and validates the sector slug (SECTOR_INVALID).
// ─────────────────────────────────────────────────────────────────────────────
export async function createRequisition(args: {
  employerUserId: string;
  sector: string | null;
  rolesJsonb: unknown;
  requirements: unknown;
  termsJsonb: unknown;
  servicePath: "commission" | "full_service";
}): Promise<CreateRequisitionResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("career_create_requisition", {
    p_employer_user_id: args.employerUserId,
    p_sector: args.sector,
    p_roles_jsonb: args.rolesJsonb,
    p_requirements: args.requirements,
    p_terms_jsonb: args.termsJsonb,
    p_service_path: args.servicePath,
  });
  if (error) {
    return { ok: false, code: parseCareerError(error.message) };
  }
  const d = data as { requisitionId: string };
  return { ok: true, requisitionId: d.requisitionId };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) Add a worker document. RULE R1: the RPC resolves the worker via p_user_id
//    (RAISE WORKER_NOT_FOUND if none). storage_path is persisted; visibility is the
//    single source of truth. PATH not URL (storage layer signs on demand).
// ─────────────────────────────────────────────────────────────────────────────
export async function addDocument(args: {
  userId: string;
  category: string;
  storagePath: string;
  visibility: "public_anonymized" | "gated" | "internal_only";
  consent: boolean;
}): Promise<AddDocumentResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("career_add_document", {
    p_user_id: args.userId,
    p_category: args.category,
    p_storage_path: args.storagePath,
    p_visibility: args.visibility,
    p_consent: args.consent,
  });
  if (error) {
    return { ok: false, code: parseCareerError(error.message) };
  }
  const d = data as { documentId: string };
  return { ok: true, documentId: d.documentId };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) Express interest (+ add-to-requisition — RULE R10: there is no separate
//    add-to-requisition route; pass requisitionId here). RULE R3: the RPC verifies
//    the requisition is owned by the caller AND the worker_code is showcased, else
//    NOT_OWNED / WORKER_NOT_FOUND. Inserts a reveal_unlocks gate row in state
//    'interest' (owner_approved=false) — NO identity revealed. Idempotent.
//
//    The owner-notification trigger is the CALLER's responsibility (RULE R10):
//    /api/career/interest calls dispatchInterestNotice() after a successful create.
// ─────────────────────────────────────────────────────────────────────────────
export async function expressInterest(args: {
  employerUserId: string;
  workerCode: string;
  requisitionId: string;
}): Promise<ExpressInterestResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("career_express_interest", {
    p_employer_user_id: args.employerUserId,
    p_worker_code: args.workerCode,
    p_requisition_id: args.requisitionId,
  });
  if (error) {
    return { ok: false, code: parseCareerError(error.message) };
  }
  const d = data as { unlockId: string; created: boolean };
  return { ok: true, unlockId: d.unlockId, created: d.created };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6) Waitlist join — idempotent upsert on email_hash (PII encrypted by the RPC).
//    Blank email → CONSENT_REQUIRED (reused stable code, per 075).
// ─────────────────────────────────────────────────────────────────────────────
export async function joinWaitlist(args: {
  audience: "employer" | "worker";
  email: string;
  name: string | null;
  phone: string | null;
  sector: string | null;
  region: string | null;
}): Promise<JoinWaitlistResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("career_waitlist_join", {
    p_audience: args.audience,
    p_email: args.email,
    p_name: args.name,
    p_phone: args.phone,
    p_sector: args.sector,
    p_region: args.region,
  });
  if (error) {
    return { ok: false, code: parseCareerError(error.message) };
  }
  const d = data as { id: string };
  return { ok: true, id: d.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7) dispatchInterestNotice — RULE R10 owner-notify. career_express_interest has
//    no human trigger; the approval gate needs one. This is BEST-EFFORT and NEVER
//    THROWS (mirrors health's dispatch posture): the interest row is already
//    committed, so a failed notification must not surface as a request error or
//    roll anything back. The caller (/api/career/interest) awaits it but ignores
//    the result. PII-free: only the anonymized worker_code + requisition id are
//    sent (the owner looks the rest up in the admin console — symmetric gate).
// ─────────────────────────────────────────────────────────────────────────────
export async function dispatchInterestNotice(args: {
  unlockId: string;
  workerCode: string;
  requisitionId: string;
  /** Optional employer company label for the owner's at-a-glance context. */
  employerCompany?: string | null;
}): Promise<void> {
  try {
    // Lazy import so the email stack is never pulled into a bundle that only
    // needs the writes, and so a missing Resend config can't break the writes.
    const { sendEmail } = await import("@/lib/email/send-email");
    const { getAdminUrl } = await import("@/lib/admin/config");
    const { default: React } = await import("react");

    const OWNER_RECIPIENTS = ["info@glatko.app", "info@ronalegal.com"] as const;
    const adminUrl = getAdminUrl("/career/unlocks");
    const company = args.employerCompany?.trim() || "An employer";

    const subject = `Glatko Kariyer — new interest on ${args.workerCode}`;
    const bodyLines = [
      `${company} expressed interest in worker ${args.workerCode}.`,
      ``,
      `Requisition: ${args.requisitionId}`,
      `Unlock (gate) row: ${args.unlockId}`,
      ``,
      `Review and approve/deny in the admin console:`,
      adminUrl,
    ];
    const text = bodyLines.join("\n");

    await Promise.all(
      OWNER_RECIPIENTS.map(async (to) => {
        try {
          await sendEmail({
            to,
            subject,
            // Minimal inline element — no dedicated template needed for an
            // internal ops alert; the plain-text body is the payload that matters.
            react: React.createElement(
              "div",
              null,
              ...bodyLines.map((line, i) =>
                React.createElement("p", { key: i }, line || " "),
              ),
            ),
            text,
            tags: [{ name: "category", value: "career-interest" }],
          });
        } catch (err) {
          console.warn(
            "[career-dispatch] owner notice send failed (ignored)",
            err instanceof Error ? err.message : err,
          );
        }
      }),
    );
  } catch (err) {
    // Never throw — the interest row is already committed.
    console.warn(
      "[career-dispatch] dispatchInterestNotice failed (ignored)",
      err instanceof Error ? err.message : err,
    );
  }
}
