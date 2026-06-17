"use server";

import {
  resolveCareerRole,
  type CareerRole,
} from "@/lib/kariyer/queries";
import { createClient } from "@/supabase/server";

/**
 * Career login role resolver (spec 22) — client-callable server action.
 *
 * `CareerLoginForm` imports this canonical `resolveCareerRoleAction`. The action
 * lives in `lib/actions` (not colocated under the flag-gated `/career/(gated)/login`
 * route) so a shared client component can import it without depending on an app
 * route module, and so there is exactly ONE implementation of the role-routing
 * logic.
 *
 * Why a server action and not a client query (BUILD-RULES R1): the `career`
 * schema is NOT exposed on PostgREST, so the role lookup runs through a
 * SECURITY DEFINER RPC as service_role with an explicit `p_user_id`. Identity is
 * derived HERE from `auth.getUser()` (the trusted session cookie), NEVER from a
 * client-supplied uid. Only the role string ("worker" | "employer" | "none")
 * crosses back to the browser — no career rows or PII. A globally-authed user
 * with no career profile resolves to "none" (the form then shows the register
 * banner; we never auto-create a profile on login).
 *
 * R7: the worker is NEVER charged — this action returns only a role string and
 * touches no fee/price/payment surface.
 */
export async function resolveCareerRoleAction(): Promise<CareerRole> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return "none";

  return resolveCareerRole(user.id);
}
