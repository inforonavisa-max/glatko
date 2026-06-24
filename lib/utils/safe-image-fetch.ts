import "server-only";

/**
 * SSRF-hardened image fetch for adopting an OAuth provider avatar.
 *
 * Even though the caller now reads the picture URL from the provider-written
 * `auth.identities.identity_data` (not user-writable `user_metadata`), this
 * adds defense-in-depth so a server-side fetch can never be pointed at an
 * internal / cloud-metadata endpoint:
 *   - https only,
 *   - host must be on the Google user-content allowlist,
 *   - redirects are followed MANUALLY and every hop is re-validated against the
 *     allowlist (a redirect to a non-allowlisted host is never followed),
 *   - the response must be a real raster image type (jpeg/png/webp — svg is
 *     rejected to avoid stored-XSS in the public bucket),
 *   - a size cap and a short timeout.
 *
 * Returns null on any violation or failure (caller treats null as "skip").
 */

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 5000;

/** Allowlist: Google profile pictures are served from *.googleusercontent.com. */
export function isAllowedImageHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "googleusercontent.com" || h.endsWith(".googleusercontent.com");
}

export type SafeImage = { bytes: ArrayBuffer; contentType: string };

export async function safeFetchImage(
  initialUrl: string,
): Promise<SafeImage | null> {
  let url = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    // Validate the target BEFORE issuing any request — this is what stops a
    // crafted (or redirected) URL from ever reaching an internal host.
    if (parsed.protocol !== "https:") return null;
    if (!isAllowedImageHost(parsed.hostname)) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(parsed.toString(), {
        redirect: "manual",
        signal: controller.signal,
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }

    // Manual redirect: re-loop and re-validate the next hop's host.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return null;
      try {
        url = new URL(loc, parsed).toString();
      } catch {
        return null;
      }
      continue;
    }

    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!ALLOWED_TYPES.includes(contentType)) return null;

    const lenHeader = res.headers.get("content-length");
    if (lenHeader && Number(lenHeader) > MAX_BYTES) return null;

    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null;

    return { bytes, contentType };
  }

  // Too many redirects.
  return null;
}
