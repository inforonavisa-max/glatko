import { NextResponse } from "next/server";
import { geocodeCity } from "@/lib/saglik/geocode";
import { isHealthVerticalEnabled } from "@/lib/saglik/flags";

// Server-side geocode shell for the FilterBar "near me" free-text path. Keeps
// the Mapbox token off the client. Node runtime (geocode.ts is server-only +
// uses unstable_cache); dynamic because it reads the query string.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_Q_LEN = 80;

/**
 * GET /api/health/geocode?q=<free text> → { lat, lng } | null.
 *
 * Thin HTTP shell over lib/saglik/geocode (two-layer cache + graceful fallback +
 * 80% quota tripwire). NEVER throws to the client: any failure (token absent,
 * Mapbox down, zero results) returns { result: null } with 200 so the FilterBar
 * cleanly falls back to the GLATKO_CITIES dropdown. Flag-guarded (404 when off).
 */
export async function GET(request: Request) {
  if (!isHealthVerticalEnabled()) {
    return new NextResponse(null, { status: 404 });
  }

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q === "" || q.length > MAX_Q_LEN) {
    return NextResponse.json({ result: null }, { status: 400 });
  }

  const point = await geocodeCity(q); // returns null on any failure (never throws)
  if (!point) {
    return NextResponse.json({ result: null });
  }
  // Cache window keyed by source so CDN behavior reflects Mapbox load: deterministic
  // GLATKO_CITIES hits (zero Mapbox usage, stable) get a long immutable cache; live
  // Mapbox hits get a short 5-min shared cache. Both are public + safe to share.
  const cacheControl =
    point.source === "cities"
      ? "public, max-age=86400, immutable"
      : "public, max-age=300";
  return NextResponse.json(
    { lat: point.lat, lng: point.lng, source: point.source },
    { headers: { "Cache-Control": cacheControl } },
  );
}
