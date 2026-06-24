// lib/auth/redirect.ts
//
// Post-login redirect handling shared by the auth flows (email / phone / OAuth).
//
// Cold pro-acquisition traffic lands on /become-a-pro, hits the auth gate, and
// must return to the signup wizard after authenticating. The CTAs carry the
// destination as a `?redirect=` query param. This reads it SAFELY — internal
// paths only (single leading "/", no protocol-relative "//", length-capped) —
// matching the guard already used in app/auth/callback/route.ts, so the param
// can never be abused for an open redirect to an external origin.

/**
 * Single source of truth for "is this a safe internal redirect target?".
 *
 * Accepts only a single leading "/" path. Rejects protocol-relative "//…",
 * backslash-prefixed "/\…" (some browsers normalize "\" → "/", turning it into
 * a protocol-relative open redirect), and anything over 512 chars. Shared by
 * readPostLoginRedirect and the auth/callback + auth/confirm route handlers so
 * the open-redirect policy can never drift between them.
 */
export function isSafeInternalPath(raw: string | null | undefined): raw is string {
  return Boolean(
    raw &&
      raw.startsWith("/") &&
      !raw.startsWith("//") &&
      !raw.includes("\\") &&
      raw.length <= 512,
  );
}

/**
 * Read a safe internal post-login redirect target from the current URL's
 * `?redirect=` query param.
 *
 * Returns a path beginning with a single "/" (no protocol-relative "//", capped
 * at 512 chars) or null. Client-only — no-op (null) on the server. The returned
 * value is a next-intl pathname/path: pass it to the localized router so it
 * resolves in the visitor's current locale.
 */
export function readPostLoginRedirect(): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("redirect");
  return isSafeInternalPath(raw) ? raw : null;
}
