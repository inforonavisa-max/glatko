import "server-only";
import { unstable_cache } from "next/cache";
import { GLATKO_CITIES, type GlatkoCity } from "@/lib/glatko/cities";
import { glatkoCaptureMessage } from "@/lib/sentry/glatko-capture";

/**
 * Glatko Sağlık — H3 "yakınımda" serbest-metin geocode yardımcısı (server-only).
 *
 * İKİ KATMAN + ZARAFETLİ FALLBACK (Demir Kural): bu fonksiyon ASLA atmaz;
 * her başarısızlık → null döner. Çağıran (FilterBar/route) null görünce
 * GLATKO_CITIES dropdown'una düşer; sayfa Mapbox olmadan da TAM çalışır.
 *
 *   L0  GLATKO_CITIES eşleşmesi — girdi bilinen bir şehir adı/slug'ıysa SIFIR
 *       Mapbox çağrısı (yaygın durum). Aksan-duyarsız normalize.
 *   L1  unstable_cache (revalidate 1 gün, tag 'mapbox-geocode', key=normalize(q))
 *       — tekrar eden sorgu Mapbox'ı yeniden vurmaz (liquidity.ts deseni).
 *   L2  fetch api.mapbox.com (country=ME, types=place,locality, limit=1,
 *       AbortController ~3s timeout) try/catch içinde. Token yok / non-200 /
 *       throw / timeout / sıfır sonuç → null.
 *
 * KOTA %80 TRIPWIRE: cold-start başına monoton sayaç; gerçek (cache-miss) Mapbox
 * çağrısı başına artar; MAPBOX_MONTHLY_FREE'nin %80'ini AŞINCA cold-start başına
 * BİR KEZ Sentry uyarısı (best-effort — serverless çok-instance olduğu için
 * otoriter değil; gerçek kota Mapbox dashboard'u + cache katmanıdır).
 *
 * Tarayıcı geolocation ('konumumu kullan' → lat/lng) HİÇ Mapbox gerektirmez —
 * koordinat doğrudan geo RPC'sine gider (reverseGeocode passthrough).
 */

export type GeoPoint = { lat: number; lng: number; source: "cities" | "mapbox" };

/** Aksan + boşluk + büyük/küçük harf normalize (cache key + şehir eşleşmesi). */
export function normalizeQuery(q: string): string {
  return q
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // aksanları sök (š→s, ž→z, ć→c …)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** L0 — GLATKO_CITIES içinde ad ya da slug eşleşmesi (aksan-duyarsız). */
export function matchCity(q: string): GlatkoCity | null {
  const n = normalizeQuery(q);
  if (n === "") return null;
  return (
    GLATKO_CITIES.find(
      (c) => normalizeQuery(c.name) === n || normalizeQuery(c.slug) === n,
    ) ?? null
  );
}

// ── Kota tripwire (cold-start lokal; best-effort) ─────────────────────────────
const QUOTA_ALARM_RATIO = 0.8;
let mapboxCallCount = 0;
let quotaAlarmFired = false;

/** Aylık ücretsiz kota eşiği — çağrı anında okunur (test edilebilir; varsayılan 100k). */
function monthlyFreeQuota(): number {
  return Number(process.env.MAPBOX_MONTHLY_FREE ?? "100000");
}

/** Gerçek (cache-miss) Mapbox çağrısında çağrılır; eşik aşılırsa bir kez Sentry. */
function recordMapboxCall(): void {
  mapboxCallCount += 1;
  const quota = monthlyFreeQuota();
  if (!quotaAlarmFired && quota > 0 && mapboxCallCount >= quota * QUOTA_ALARM_RATIO) {
    quotaAlarmFired = true;
    glatkoCaptureMessage(
      `Mapbox geocode quota tripwire: ${mapboxCallCount} calls this cold-start (>=80% of ${quota}). Check the Mapbox dashboard — this counter is best-effort (per-instance).`,
      "warning",
      { feature: "health-geocode", tripwire: "mapbox-quota-80" },
    );
  }
}

/** Test gözlemi için (vitest). Üretim mantığı buna dayanmaz. */
export function _geocodeCounters(): { calls: number; alarmFired: boolean } {
  return { calls: mapboxCallCount, alarmFired: quotaAlarmFired };
}

/** Test izolasyonu için sayaç sıfırlama (vitest). Üretim yolunda ÇAĞRILMAZ. */
export function _resetGeocodeCounters(): void {
  mapboxCallCount = 0;
  quotaAlarmFired = false;
}

const MAPBOX_TIMEOUT_MS = 3000;

/**
 * Sentinel thrown by fetchMapbox on a TRANSIENT failure (timeout / network /
 * non-2xx). unstable_cache memoizes resolved values but NOT thrown errors, so
 * throwing on transient failures keeps a one-off Mapbox outage OUT of the 24h
 * cache (cachedMapbox catches it → null to the caller, page still degrades).
 * A DEFINITIVE "no result" (200 with zero/invalid features) returns null and IS
 * cacheable — that answer is stable, caching it spares quota (the cache's job).
 */
class MapboxTransientError extends Error {}

/**
 * L2 — tek Mapbox geocode çağrısı.
 *   • token yok            → null (cacheable; deterministik "yapılandırılmamış")
 *   • 200 + sıfır/bozuk    → null (DEFINITIVE no-result; cacheable)
 *   • timeout/network/!ok  → THROW MapboxTransientError (cache'lenMEZ; bir-kerelik
 *                            kesinti 24h boyunca fallback'i zehirlemesin)
 */
async function fetchMapbox(query: string): Promise<GeoPoint | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token || token.trim() === "") return null; // token yok → fallback (cacheable)

  recordMapboxCall();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAPBOX_TIMEOUT_MS);
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
      `?country=ME&types=place,locality&limit=1&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new MapboxTransientError(`mapbox ${res.status}`); // transient → don't cache
    const json: unknown = await res.json();
    const center = extractCenter(json);
    // 200 ulaştı: sonuç ister var ister yok, bu KESİN bir yanıt → cache'lenebilir null.
    if (!center) return null;
    return { lat: center.lat, lng: center.lng, source: "mapbox" };
  } catch (err) {
    if (err instanceof MapboxTransientError) throw err; // cache'e null yazılmasın
    throw new MapboxTransientError("mapbox fetch failed"); // timeout/network/parse → transient
  } finally {
    clearTimeout(timer);
  }
}

/** Mapbox FeatureCollection'dan ilk feature'ın [lng,lat] center'ı (defansif). */
function extractCenter(json: unknown): { lat: number; lng: number } | null {
  if (typeof json !== "object" || json === null) return null;
  const features = (json as { features?: unknown }).features;
  if (!Array.isArray(features) || features.length === 0) return null;
  const first = features[0];
  if (typeof first !== "object" || first === null) return null;
  const center = (first as { center?: unknown }).center;
  if (!Array.isArray(center) || center.length < 2) return null;
  const [lng, lat] = center;
  if (typeof lng !== "number" || typeof lat !== "number") return null;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lat, lng };
}

/**
 * L1 — cache'li Mapbox sarıcı (key = normalize(query)). fetchMapbox transient
 * hatada ATAR → unstable_cache o değeri CACHE'LEMEZ (yalnız resolve'ları cache'ler)
 * ve re-throw eder; burada yakalanıp null'a çevrilir (zarafetli fallback, Demir
 * Kural — sayfa Mapbox kesintisinde de çalışır + kesinti 24h cache'i zehirlemez).
 * DEFINITIVE null (sonuç yok / token yok) ise atılmadığı için normal cache'lenir.
 */
async function cachedMapbox(query: string): Promise<GeoPoint | null> {
  const key = normalizeQuery(query);
  try {
    return await unstable_cache(
      () => fetchMapbox(query),
      ["health-mapbox-geocode", key],
      { revalidate: 86_400, tags: ["mapbox-geocode"] },
    )();
  } catch {
    return null; // transient outage → fallback, NOT cached
  }
}

/**
 * Serbest-metin → koordinat. L0 (cities) → L1/L2 (cache+Mapbox) → null.
 * null = "geocode edilemedi", çağıran şehir dropdown'una düşer.
 */
export async function geocodeCity(text: string): Promise<GeoPoint | null> {
  const trimmed = text.trim();
  if (trimmed === "") return null;

  // L0: bilinen şehir → Mapbox'a hiç gitme.
  const city = matchCity(trimmed);
  if (city) return { lat: city.lat, lng: city.lng, source: "cities" };

  // L1+L2: cache'li Mapbox (token yoksa içinde null'a düşer).
  return cachedMapbox(trimmed);
}

/**
 * Tarayıcı geolocation passthrough — koordinat zaten elde, Mapbox gereksiz.
 * Geçersiz/menzil-dışı koordinat → null (defansif).
 */
export function reverseGeocode(lat: number, lng: number): GeoPoint | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng, source: "cities" };
}
