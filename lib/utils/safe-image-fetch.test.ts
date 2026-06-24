import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isAllowedImageHost,
  sniffRasterType,
  safeFetchImage,
} from "./safe-image-fetch";

// Real magic-byte prefixes (padded so length checks pass).
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);
const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
// A forged payload: looks like SVG/HTML, NOT a raster image.
const SVG = new Uint8Array(
  [..."<svg xmlns=\"http://www.w3.org/2000/svg\"><script/>"].map((c) =>
    c.charCodeAt(0),
  ),
);

/** Minimal Response-like stub (headers keyed case-insensitively). */
function mockRes(opts: {
  status?: number;
  type?: string | null;
  length?: number | null;
  location?: string | null;
  body?: Uint8Array;
}) {
  const {
    status = 200,
    type = null,
    length = null,
    location = null,
    body = PNG,
  } = opts;
  const headers: Record<string, string> = {};
  if (type) headers["content-type"] = type;
  if (length != null) headers["content-length"] = String(length);
  if (location) headers["location"] = location;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    arrayBuffer: async () =>
      body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  };
}

describe("isAllowedImageHost", () => {
  it("accepts Google user-content hosts", () => {
    expect(isAllowedImageHost("lh3.googleusercontent.com")).toBe(true);
    expect(isAllowedImageHost("lh4.googleusercontent.com")).toBe(true);
    expect(isAllowedImageHost("googleusercontent.com")).toBe(true);
    expect(isAllowedImageHost("LH3.GoogleUserContent.com")).toBe(true);
  });
  it("rejects internal / cloud-metadata / look-alike hosts", () => {
    expect(isAllowedImageHost("169.254.169.254")).toBe(false);
    expect(isAllowedImageHost("metadata.google.internal")).toBe(false);
    expect(isAllowedImageHost("localhost")).toBe(false);
    expect(isAllowedImageHost("evil.com")).toBe(false);
    // suffix look-alikes
    expect(isAllowedImageHost("evilgoogleusercontent.com")).toBe(false);
    expect(isAllowedImageHost("googleusercontent.com.evil.com")).toBe(false);
  });
});

describe("sniffRasterType — magic bytes, not the header", () => {
  it("recognises PNG / JPEG / WebP", () => {
    expect(sniffRasterType(PNG.buffer)).toBe("image/png");
    expect(sniffRasterType(JPEG.buffer)).toBe("image/jpeg");
    expect(sniffRasterType(WEBP.buffer)).toBe("image/webp");
  });
  it("rejects SVG / HTML / empty / random", () => {
    expect(sniffRasterType(SVG.buffer)).toBeNull();
    expect(sniffRasterType(new Uint8Array([0x00, 0x01, 0x02, 0x03]).buffer)).toBeNull();
    expect(sniffRasterType(new Uint8Array([]).buffer)).toBeNull();
    // GIF is a raster but intentionally NOT allowed
    expect(
      sniffRasterType(new Uint8Array([0x47, 0x49, 0x46, 0x38]).buffer),
    ).toBeNull();
  });
});

describe("safeFetchImage — SSRF guards", () => {
  const realFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("fetches an allowlisted https image (manual redirect mode)", async () => {
    fetchMock.mockResolvedValue(mockRes({ type: "image/jpeg", body: JPEG }));
    const out = await safeFetchImage(
      "https://lh3.googleusercontent.com/a/pic=s96",
    );
    expect(out).not.toBeNull();
    expect(out?.contentType).toBe("image/jpeg");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });

  it("never issues a request to a non-allowlisted host (cloud metadata)", async () => {
    const out = await safeFetchImage("https://169.254.169.254/latest/meta-data/");
    expect(out).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-https even on an allowlisted host (no request issued)", async () => {
    const out = await safeFetchImage("http://lh3.googleusercontent.com/a/pic");
    expect(out).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does NOT follow a redirect to a non-allowlisted host", async () => {
    fetchMock.mockImplementation(async (u: string) => {
      const url = String(u);
      if (url.startsWith("https://lh3.googleusercontent.com")) {
        return mockRes({ status: 302, location: "https://169.254.169.254/" });
      }
      // If the guard were broken and this ran, it'd hand back an "image".
      return mockRes({ type: "image/jpeg", body: JPEG });
    });
    const out = await safeFetchImage("https://lh3.googleusercontent.com/a/pic");
    expect(out).toBeNull();
    // Only the first (allowlisted) hop was requested; the evil target never was.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).includes("169.254")),
    ).toBe(false);
  });

  it("follows a redirect between two allowlisted hosts", async () => {
    fetchMock.mockImplementation(async (u: string) => {
      const url = String(u);
      if (url.startsWith("https://lh3.googleusercontent.com")) {
        return mockRes({
          status: 301,
          location: "https://lh4.googleusercontent.com/a/pic",
        });
      }
      return mockRes({ type: "image/png", body: PNG });
    });
    const out = await safeFetchImage("https://lh3.googleusercontent.com/a/pic");
    expect(out?.contentType).toBe("image/png");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects non-raster content types (html, svg) at the header", async () => {
    fetchMock.mockResolvedValue(mockRes({ type: "text/html" }));
    expect(
      await safeFetchImage("https://lh3.googleusercontent.com/x"),
    ).toBeNull();

    fetchMock.mockResolvedValue(mockRes({ type: "image/svg+xml" }));
    expect(
      await safeFetchImage("https://lh3.googleusercontent.com/y"),
    ).toBeNull();
  });

  it("rejects a forged image/* header whose BYTES are not a raster (anti stored-XSS)", async () => {
    // Header lies: claims image/png, body is actually SVG/script.
    fetchMock.mockResolvedValue(mockRes({ type: "image/png", body: SVG }));
    const out = await safeFetchImage("https://lh3.googleusercontent.com/evil");
    expect(out).toBeNull();
  });

  it("trusts the sniffed type over a mismatched header", async () => {
    // Header says jpeg, bytes are actually PNG → store as png.
    fetchMock.mockResolvedValue(mockRes({ type: "image/jpeg", body: PNG }));
    const out = await safeFetchImage("https://lh3.googleusercontent.com/z");
    expect(out?.contentType).toBe("image/png");
  });

  it("rejects oversized images (content-length cap)", async () => {
    fetchMock.mockResolvedValue(
      mockRes({ type: "image/jpeg", length: 6 * 1024 * 1024, body: JPEG }),
    );
    expect(
      await safeFetchImage("https://lh3.googleusercontent.com/big"),
    ).toBeNull();
  });

  it("rejects a redirect loop that exceeds the hop cap", async () => {
    fetchMock.mockResolvedValue(
      mockRes({ status: 302, location: "https://lh3.googleusercontent.com/loop" }),
    );
    const out = await safeFetchImage("https://lh3.googleusercontent.com/loop");
    expect(out).toBeNull();
  });
});
