/**
 * Glatko Sağlık — H3 dizini arama/filtre SAF mantığı.
 *
 * Framework'siz, server-import'suz, `any`'siz. Bu dosya vitest'in ana yüzeyidir:
 *   • parseHealthFilters(searchParams) → tipli Filters (defansif doğrulama)
 *   • buildFilterQuery(filters)        → URLSearchParams (shareable link; round-trip)
 *   • applyClientFilters(providers, f) → istemci-tarafı daraltma (matris testi)
 *   • haversineKm(a, b)                → fallback mesafe (RPC geo'su düşerse)
 *   • isWithinThisWeek(...)            → "bu hafta müsait" pencere mantığı
 *   • coastalClusterFallback(citySlug) → K3 Budva/Tivat/Kotor → Podgorica önerisi
 *
 * NOT: city değeri GLATKO_CITIES'e (SSOT) göre doğrulanır; bilinmeyen şehir DÜŞER
 * (URL'den gelen garbage param sessizce yok sayılır). mode enum dışıysa düşer.
 * radius pozitif tamsayıya clamp'lenir (varsayılan/min/maks lib altında).
 */
import { GLATKO_CITIES, getCityBySlug, type GlatkoCity } from "@/lib/glatko/cities";

/** Hizmet modu — health.services.mode enum'unun birebir aynısı. */
export const HEALTH_MODES = ["in_person", "video", "home_visit"] as const;
export type HealthMode = (typeof HEALTH_MODES)[number];

/** "Bu hafta müsait" tek anahtarı (genişletilebilir; şimdilik 'week'). */
export const AVAIL_WEEK = "week" as const;

/** Yarıçap (km) sınırları — UI dropdown + URL param clamp. */
export const RADIUS_MIN_KM = 1;
export const RADIUS_MAX_KM = 50;
export const RADIUS_DEFAULT_KM = 10;
/** Sunulan yarıçap seçenekleri (km) — FilterBar dropdown'u bundan türer. */
export const RADIUS_OPTIONS_KM = [5, 10, 20, 50] as const;

/** Diller — provider.languages ile aynı küme (lowercase ISO-639-1). */
export const HEALTH_LANGUAGES = ["me", "sr", "en", "tr", "de", "ru", "uk", "it", "ar"] as const;

/**
 * Tipli filtre durumu. Tüm alanlar opsiyonel/boş → "filtre yok". `near` verildiğinde
 * lat/lng + radiusKm birlikte anlamlıdır (FilterBar geocode/geolocation ile doldurur).
 */
export type HealthFilters = {
  city: string | null; // GLATKO_CITIES slug (doğrulanmış) ya da null
  langs: string[]; // lowercase, dedupe, sıralı; boşsa filtre yok
  mode: HealthMode | null;
  avail: typeof AVAIL_WEEK | null; // "bu hafta müsait"
  near: { lat: number; lng: number; radiusKm: number } | null;
};

/** Boş/nötr filtre (test + varsayılan). */
export function emptyFilters(): HealthFilters {
  return { city: null, langs: [], mode: null, avail: null, near: null };
}

/**
 * searchParams benzeri bir okuyucu. URLSearchParams ve Next'in
 * `Record<string, string | string[] | undefined>` ham searchParams prop'unu da
 * kabul eder (her ikisi de string okumaya indirgenir). İlk değer kazanır.
 */
export type SearchParamsLike =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function readParam(sp: SearchParamsLike, key: string): string | null {
  if (sp instanceof URLSearchParams) {
    return sp.get(key);
  }
  const raw = sp[key];
  if (raw == null) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

function clampRadiusKm(raw: string | null): number {
  if (raw == null) return RADIUS_DEFAULT_KM;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return RADIUS_DEFAULT_KM;
  return Math.min(RADIUS_MAX_KM, Math.max(RADIUS_MIN_KM, Math.round(n)));
}

/** Geçerli enlem [-90,90] / boylam [-180,180] kontrolü (reverseGeocode ile aynı). */
function isValidLatLng(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function parseCoord(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function isHealthMode(v: string): v is HealthMode {
  return (HEALTH_MODES as readonly string[]).includes(v);
}

/**
 * Ham searchParams → tipli Filters. TAMAMEN defansif: tanınmayan şehir/mod/dil/koordinat
 * sessizce düşer (shareable link bayat/garbage param taşıyabilir; sayfa asla kırılmaz).
 * Boş/eksik param → nötr Filters. `lang` CSV'dir (split + lowercase + dedupe + sırala).
 * `near` yalnız geçerli lat+lng ikilisi verildiğinde set olur (radius clamp'li).
 */
export function parseHealthFilters(sp: SearchParamsLike): HealthFilters {
  // city — yalnız GLATKO_CITIES slug'ı (SSOT) kabul; aksi null.
  const cityRaw = readParam(sp, "city");
  const city = cityRaw && getCityBySlug(cityRaw) ? cityRaw : null;

  // langs — CSV; lowercase + trim + bilinen dil + dedupe + sırala (deterministik).
  const langsRaw = readParam(sp, "lang");
  const known = new Set<string>(HEALTH_LANGUAGES);
  const langs = langsRaw
    ? Array.from(
        new Set(
          langsRaw
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter((s) => known.has(s)),
        ),
      ).sort()
    : [];

  // mode — enum içindeyse al, değilse düş.
  const modeRaw = readParam(sp, "mode");
  const mode = modeRaw && isHealthMode(modeRaw) ? modeRaw : null;

  // avail — yalnız 'week'.
  const availRaw = readParam(sp, "avail");
  const avail = availRaw === AVAIL_WEEK ? AVAIL_WEEK : null;

  // near — lat+lng ikilisi. Geçerli + MENZİL-İÇİ koordinat ikilisi şart: bayat/garbage
  // link (?lat=999&lng=999) anlamsız mesafe üretmesin diye [-90,90]/[-180,180] dışı
  // koordinat sessizce düşer (reverseGeocode ile aynı sözleşme — defansif parse).
  const lat = parseCoord(readParam(sp, "lat"));
  const lng = parseCoord(readParam(sp, "lng"));
  const radiusKm = clampRadiusKm(readParam(sp, "r"));
  const near =
    lat != null && lng != null && isValidLatLng(lat, lng) ? { lat, lng, radiusKm } : null;

  return { city, langs, mode, avail, near };
}

/**
 * Filters → URLSearchParams (shareable). parse(buildFilterQuery(f)) round-trip'i
 * f'i korur (test idempotency). Boş/null alan param EKLEMEZ (temiz URL). `near`
 * lat/lng/r üçlüsünü yazar. Anahtar sırası deterministik (string karşılaştırma).
 */
export function buildFilterQuery(f: HealthFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.city) p.set("city", f.city);
  if (f.langs.length > 0) p.set("lang", [...f.langs].sort().join(","));
  if (f.mode) p.set("mode", f.mode);
  if (f.avail) p.set("avail", f.avail);
  if (f.near) {
    p.set("lat", String(f.near.lat));
    p.set("lng", String(f.near.lng));
    p.set("r", String(f.near.radiusKm));
  }
  return p;
}

/** Hiç aktif filtre var mı (empty-state "filtreleri temizle" CTA'sı bunu okur). */
export function hasActiveFilters(f: HealthFilters): boolean {
  return Boolean(f.city || f.langs.length > 0 || f.mode || f.avail || f.near);
}

// ─────────────────────────────────────────────────────────────────────────────
// Geo — haversine fallback + mesafe yardımcıları (saf; RPC geo'su düşerse veya
// istemci-tarafı sıralama gerektiğinde). RPC, prod'da PostGIS ST_DistanceSphere
// kullanır; bu haversine onunla ~aynı (küresel) sonucu verir (tolerans testi).
// ─────────────────────────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;

export type LatLng = { lat: number; lng: number };

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** İki nokta arası büyük-çember mesafe (km). Simetrik; aynı nokta → 0. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ─────────────────────────────────────────────────────────────────────────────
// K3 — Sahil kümesi (Budva/Tivat/Kotor) → Podgorica. Boş-durum "yakındaki şehirler"
// önerisinde + geo fallback'inde kullanılır. SAHTE şehir sayfası BASILMAZ; bu yalnız
// öneri/fallback mantığıdır. Sahil-dışı şehirler etkilenmez.
// ─────────────────────────────────────────────────────────────────────────────

/** K3 sahil kümesi şehir slug'ları. */
export const COASTAL_CLUSTER_SLUGS = ["budva", "tivat", "kotor"] as const;
const COASTAL_FALLBACK_SLUG = "podgorica";

/**
 * Sahil kümesi (Budva/Tivat/Kotor) için Podgorica fallback'i döner; aksi null.
 * Boş-durum "yakındaki şehirler" chip'leri bunu okur (K3).
 */
export function coastalClusterFallback(citySlug: string): string | null {
  return (COASTAL_CLUSTER_SLUGS as readonly string[]).includes(citySlug)
    ? COASTAL_FALLBACK_SLUG
    : null;
}

/**
 * Boş-durum için "yakındaki şehir" önerileri: verilen şehre en yakın N şehir
 * (haversine), kümeleme fallback'i en başa. Şehir yoksa en büyük merkezleri öner.
 */
export function nearbyCitySuggestions(citySlug: string | null, n = 3): GlatkoCity[] {
  if (!citySlug) {
    // Şehir filtresi yok → ilk N "popüler" merkez (SSOT sırası: Podgorica, Nikšić, ...).
    return GLATKO_CITIES.slice(0, n).map((c) => ({ ...c }));
  }
  const origin = getCityBySlug(citySlug);
  if (!origin) return GLATKO_CITIES.slice(0, n).map((c) => ({ ...c }));

  const fallback = coastalClusterFallback(citySlug);
  const ranked = GLATKO_CITIES.filter((c) => c.slug !== citySlug)
    .map((c) => ({ city: c, d: haversineKm(origin, c) }))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.city);

  if (fallback) {
    // Sahil kümesi → Podgorica önerisini en başa al (varsa, tekrarsız).
    const pod = ranked.find((c) => c.slug === fallback);
    const rest = ranked.filter((c) => c.slug !== fallback);
    return (pod ? [pod, ...rest] : rest).slice(0, n).map((c) => ({ ...c }));
  }
  return ranked.slice(0, n).map((c) => ({ ...c }));
}

// ─────────────────────────────────────────────────────────────────────────────
// "Bu hafta müsait" pencere mantığı (saf). Slot motoru (069/availability.ts)
// tek-kaynak kalsın diye burada YALNIZ pencere kararı verilir: provider'ın İLK
// slotu [bugün, +7 gün] (dahil, yerel takvim) içinde mi. Tarih karşılaştırması
// "YYYY-MM-DD" string'leri üzerinden (Europe/Podgorica gün sınırı; getNextSlots
// zaten yerel tarih üretir) — TZ aritmetiği gerekmeden leksikografik güvenli.
// ─────────────────────────────────────────────────────────────────────────────

/** "YYYY-MM-DD" + n gün (UTC üzerinden güvenli takvim aritmetiği). */
export function addDaysIso(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + n * 86_400_000);
  const p = (x: number) => (x < 10 ? `0${x}` : String(x));
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

/**
 * Bir provider'ın slotları "bu hafta" penceresinde mi (en az bir slot [todayIso,
 * todayIso+6] dahil). Boş slot listesi → false (slotu olmayan provider düşer).
 * `slotDates` = provider'ın slot tarihleri ("YYYY-MM-DD"); sıralı olması şart değil.
 */
export function isWithinThisWeek(slotDates: readonly string[], todayIso: string): boolean {
  if (slotDates.length === 0) return false;
  const endIso = addDaysIso(todayIso, 6); // 7-gün pencere: bugün + 6 (dahil)
  return slotDates.some((d) => d >= todayIso && d <= endIso);
}

// ─────────────────────────────────────────────────────────────────────────────
// İstemci-tarafı daraltma (matris testi). RPC zaten city/lang/mode/geo'yu uygular;
// bu fonksiyon AYNI semantiği saf TS'te yeniden kurar — (a) "bu hafta müsait"
// cross-ref'i RPC dışı olduğu için ve (b) testte tüm kombinasyonları DB'siz
// doğrulamak için. Sunucu yolu ile birebir tutarlı olmalı (DoD: filtre-kombinasyon
// doğruluğu).
// ─────────────────────────────────────────────────────────────────────────────

/** applyClientFilters girdisi — RPC kartının saf-test alt kümesi (PII yok). */
export type FilterableProvider = {
  slug: string;
  languages: string[];
  modes: HealthMode[]; // o provider'ın aktif hizmet modları
  citySlug: string | null; // birincil lokasyon şehri SSOT slug'ı (yoksa null)
  location: LatLng | null; // birincil lokasyon koordinatı (geo için)
};

export type ApplyOptions = {
  /** "bu hafta müsait" cross-ref'i: slug → slot tarihleri ("YYYY-MM-DD"). */
  nextSlotDates?: Record<string, readonly string[]>;
  /** Pencere referansı (yerel "YYYY-MM-DD"); avail filtresi için şart. */
  todayIso?: string;
};

/**
 * Filtreleri saf olarak uygular. near verildiğinde radius içi süzer + mesafe artan
 * sıralar. avail verildiğinde nextSlotDates+todayIso ile "bu hafta" cross-ref'i
 * uygular (ikisi de yoksa avail no-op → tüm sonuçlar kalır, sayfa "show all" degrade).
 */
export function applyClientFilters<T extends FilterableProvider>(
  providers: readonly T[],
  f: HealthFilters,
  opts: ApplyOptions = {},
): T[] {
  let out = providers.filter((p) => {
    if (f.city && p.citySlug !== f.city) return false;
    if (f.langs.length > 0) {
      // OR / overlap — provider must speak AT LEAST ONE selected language. This
      // mirrors the server RPC (074 `p.languages && p_langs`, PostgreSQL array
      // overlap), the live source of truth for the lang filter; the pure helper
      // must stay bitwise-consistent with it (DoD: filter-combination parity).
      const set = new Set(p.languages.map((l) => l.toLowerCase()));
      if (!f.langs.some((l) => set.has(l))) return false;
    }
    if (f.mode && !p.modes.includes(f.mode)) return false;
    if (f.near) {
      if (!p.location) return false;
      if (haversineKm(f.near, p.location) > f.near.radiusKm) return false;
    }
    if (f.avail === AVAIL_WEEK) {
      const dates = opts.nextSlotDates?.[p.slug];
      // Cross-ref verisi yoksa avail'i UYGULAMA (availability outage → degrade,
      // sayfa düşmesin). Veri varsa pencere dışı/boş provider düşer.
      if (dates !== undefined && opts.todayIso) {
        if (!isWithinThisWeek(dates, opts.todayIso)) return false;
      }
    }
    return true;
  });

  if (f.near) {
    const near = f.near;
    out = [...out].sort((a, b) => {
      const da = a.location ? haversineKm(near, a.location) : Infinity;
      const db = b.location ? haversineKm(near, b.location) : Infinity;
      return da - db;
    });
  }
  return out;
}
