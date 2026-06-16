import { NextResponse } from "next/server";
import { getProviderAvailability, type DaySlots } from "@/lib/saglik/queries";
import { isHealthVerticalEnabled } from "@/lib/saglik/flags";

// Service-role read path + always-fresh availability (no static caching).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SPAN_DAYS = 31;
const DAY_MS = 86_400_000;

// Two-layer rule (a): short-lived in-memory cache to absorb duplicate reads.
const CACHE_TTL_MS = 45_000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; days: DaySlots[] }>();

/**
 * H4 availability (K2). Returns a provider's open appointment slots for a
 * local-date window. All DB + slot logic lives in lib/saglik/queries
 * (read-RPC over the un-exposed health schema via the service-role client);
 * this route is the thin HTTP shell: validate, flag-guard, cache, fall back.
 */
export async function GET(request: Request) {
  // Defense-in-depth: prod stays dark even if the route is reachable.
  if (!isHealthVerticalEnabled()) {
    return new NextResponse(null, { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const providerId = params.get("providerId") ?? "";
  const serviceId = params.get("serviceId") ?? "";
  const locationId = params.get("locationId") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  if (
    !UUID_RE.test(providerId) ||
    !UUID_RE.test(serviceId) ||
    !UUID_RE.test(locationId) ||
    !DATE_RE.test(from) ||
    !DATE_RE.test(to) ||
    to < from ||
    spanDays(from, to) > MAX_SPAN_DAYS
  ) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  const key = `${providerId}|${serviceId}|${locationId}|${from}|${to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(
      { days: hit.days },
      { headers: { "Cache-Control": "private, max-age=30" } },
    );
  }

  // Two-layer rule (b): graceful fallback — never leak the cause to clients.
  let days: DaySlots[];
  try {
    days = await getProviderAvailability({
      providerId,
      serviceId,
      locationId,
      fromDate: from,
      toDate: to,
    });
  } catch (e) {
    // No PII / no params in logs — keys identify a real provider+location.
    console.error("[health-slots] failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  if (cache.size > CACHE_MAX) cache.clear();
  cache.set(key, { at: Date.now(), days });

  return NextResponse.json(
    { days },
    { headers: { "Cache-Control": "private, max-age=30" } },
  );
}

// Inclusive-ish span between two YYYY-MM-DD calendar dates, in whole days.
function spanDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS;
}
