/**
 * Faz 3-A — localized status label resolver for the `status_change` {{1}}.
 *
 * The 3 status_change call sites (expireRequests cron, startJob/completeJob
 * actions) tag their notification data with `statusCode`. Faz 3-B fills the
 * WhatsApp/Viber/SMS template variable {{1}} with the localized label.
 *
 * PURE (no IO) so it stays unit-testable: Faz 3-B loads the dictionary in its
 * server context — `statusLabelFromDict(code, (await getDictionary(locale)).status)`
 * — and passes the `status` namespace here. Labels are NOT invented; they reuse
 * the app's existing `status` dictionary (9 langs), the same source as the in-app
 * status badges. Wired but NOT yet called by external-dispatch (Faz 3-B does that).
 */

/** statusCode values emitted by the status_change call sites. */
export type StatusChangeCode = "started" | "completed" | "expired";

/** statusCode → existing `status` dictionary key (no new translation strings). */
const STATUS_DICT_KEY: Record<
  StatusChangeCode,
  "inProgress" | "completed" | "expired"
> = {
  started: "inProgress",
  completed: "completed",
  expired: "expired",
};

/** Narrow guard so callers can validate untrusted data.statusCode values. */
export function isStatusChangeCode(value: unknown): value is StatusChangeCode {
  return value === "started" || value === "completed" || value === "expired";
}

/**
 * Resolve the localized status label from a dictionary `status` namespace
 * (e.g. "In Progress" / "Devam Ediyor" / "قيد التنفيذ"). Falls back to the
 * inProgress label, then the raw code — never throws.
 */
export function statusLabelFromDict(
  code: StatusChangeCode,
  statusNamespace: Record<string, string> | null | undefined,
): string {
  const s = statusNamespace ?? {};
  return s[STATUS_DICT_KEY[code]] ?? s.inProgress ?? code;
}
