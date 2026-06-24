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
 *   - the DOWNLOADED BYTES are magic-byte verified (content-type is only the
 *     server's claim; a forged image/* header wrapping <svg>/HTML is rejected),
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

/**
 * Sniff the real image type from the leading magic bytes. Returns null for
 * anything that is not a PNG / JPEG / WebP raster — so SVG, HTML, or any other
 * payload smuggled behind a lying `image/*` content-type header is rejected
 * (content-type is the server's claim; the bytes are the truth).
 */
export function sniffRasterType(buf: ArrayBuffer): string | null {
  const b = new Uint8Array(buf);
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return "image/jpeg";
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
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

    // Cheap early reject on the server-DECLARED type before reading the body.
    const headerType = (res.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!ALLOWED_TYPES.includes(headerType)) return null;

    const lenHeader = res.headers.get("content-length");
    if (lenHeader && Number(lenHeader) > MAX_BYTES) return null;

    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null;

    // Authoritative check: verify the actual bytes are a real raster image.
    // The header could lie (image/png wrapping <svg>/HTML → stored-XSS); the
    // magic bytes can't. Store with the SNIFFED type, never the header's claim.
    const sniffedType = sniffRasterType(bytes);
    if (!sniffedType) return null;

    return { bytes, contentType: sniffedType };
  }

  // Too many redirects.
  return null;
}
