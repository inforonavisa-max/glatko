export type NotificationLike = {
  type: string;
  data: Record<string, unknown> | null;
};

export function requestIdFromNotificationData(
  d: Record<string, unknown> | null | undefined,
): string {
  if (!d) return "";
  const a = d.requestId;
  const b = d.request_id;
  if (typeof a === "string" && a) return a;
  if (typeof b === "string" && b) return b;
  return "";
}

export function threadIdFromNotificationData(
  d: Record<string, unknown> | null | undefined,
): string {
  if (!d) return "";
  const a = d.threadId;
  const b = d.thread_id;
  if (typeof a === "string" && a) return a;
  if (typeof b === "string" && b) return b;
  return "";
}

/**
 * Discriminated href union compatible with next-intl `router.push` and
 * `<Link>` when pathnames are configured. Static routes are bare keys;
 * parametric routes get the `{ pathname, params }` object form.
 *
 * Callers using next-intl `router.push(...)` should cast through the
 * router's expected param type (next-intl's typed-routes wraps the
 * intersection with optional query/locale fields):
 *   router.push(getNotificationHref(n) as Parameters<typeof router.push>[0])
 */
export type NotificationHref =
  | "/dashboard/requests"
  | "/pro/dashboard"
  | "/pro/dashboard/bids"
  | "/pro/dashboard/profile"
  | "/pro/dashboard/requests"
  | "/notifications"
  | "/messages"
  | { pathname: "/dashboard/requests/[id]"; params: { id: string } }
  | { pathname: "/pro/dashboard/requests/[id]"; params: { id: string } }
  | { pathname: "/messages/[id]"; params: { id: string } }
  | { pathname: "/my-requests/[id]"; params: { id: string } };

/** Locale-prefixed paths for `useRouter` / `Link` from next-intl (no `/${locale}` prefix). */
export function getNotificationHref(n: NotificationLike): NotificationHref {
  const d = n.data ?? undefined;
  const req = requestIdFromNotificationData(d);

  switch (n.type) {
    case "new_bid":
    case "status_change":
      return req
        ? { pathname: "/dashboard/requests/[id]", params: { id: req } }
        : "/dashboard/requests";
    case "bid_accepted":
    case "bid_rejected":
      return "/pro/dashboard/bids";
    case "message":
      return "/messages";
    case "review":
      return "/pro/dashboard";
    case "verification_approved":
      return "/pro/dashboard";
    case "verification_rejected":
      return "/pro/dashboard/profile";
    case "new_request_match":
      return req
        ? { pathname: "/pro/dashboard/requests/[id]", params: { id: req } }
        : "/pro/dashboard/requests";
    case "new_quote":
      return req
        ? { pathname: "/my-requests/[id]", params: { id: req } }
        : "/notifications";
    case "thread_message": {
      const thread = threadIdFromNotificationData(d);
      return thread
        ? { pathname: "/messages/[id]", params: { id: thread } }
        : "/messages";
    }
    default:
      return "/notifications";
  }
}
