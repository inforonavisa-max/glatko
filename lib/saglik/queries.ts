import "server-only";

import { createAdminClient } from "@/supabase/server";
import type { Locale } from "@/i18n/routing";
import {
  generateAvailability,
  flattenNextSlots,
  DEFAULT_TIME_ZONE,
  type AvailabilityInputs,
  type DaySlots,
  type SlotInfo,
} from "@/lib/saglik/availability";

/**
 * Glatko Sağlık — server-only data-access layer for the public directory (H2).
 *
 * ARCHITECTURE (MASTER_PLAN v1.6, Rohat 16.06): the `health` schema is NOT
 * exposed to PostgREST, so supabase-js cannot read health.* directly — not even
 * with the service-role key. Instead, three SECURITY DEFINER read-RPCs live in
 * the PUBLIC schema (migration 068); they read health.* as the definer and
 * return ONLY published+approved providers (the publish filter lives inside the
 * RPC, so unpublished/unverified data can never leak to any caller).
 *
 * This module is `server-only`: importing it from a Client Component is a build
 * error, so the service-role key can never reach the browser bundle. We use the
 * cookie-free admin client (createAdminClient) so the reads stay ISR-compatible
 * (the cookie-based server client throws during static generation). All reads go
 * through here — pages never call supabase.from()/rpc() for health data directly.
 */

export type HealthSpecialty = {
  slug: string;
  name: string;
  icon: string | null;
};

export type HealthProviderLocationSummary = {
  city: string;
  address: string;
  label: string;
};

export type HealthProviderCard = {
  slug: string;
  fullName: string;
  title: string | null;
  photoUrl: string | null;
  providerType: string;
  verified: boolean;
  languages: string[];
  specialtyName: string;
  location: HealthProviderLocationSummary | null;
};

export type HealthProviderLocation = {
  label: string;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
};

export type HealthProviderService = {
  name: string;
  durationMin: number;
  priceEur: number | null;
  mode: "in_person" | "video" | "home_visit";
};

export type HealthProviderProfile = {
  slug: string;
  fullName: string;
  title: string | null;
  photoUrl: string | null;
  providerType: string;
  verified: boolean;
  bio: string | null;
  languages: string[];
  specialties: Array<{ slug: string; name: string }>;
  locations: HealthProviderLocation[];
  services: HealthProviderService[];
};

// Error handling splits the three UI states cleanly: a genuine RPC failure
// THROWS (caught by the route-group error.tsx → designed error screen), while
// an empty array / null means "no rows" (the page renders its empty state, or
// notFound() for a missing provider). The pages never see a silent [] that
// actually hid an outage.

/** Active specialties (home cards + chips), names already localized by the RPC. */
export async function listSpecialties(locale: Locale): Promise<HealthSpecialty[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_list_specialties", {
    p_locale: locale,
  });
  if (error) {
    throw new Error(`health_list_specialties failed: ${error.message}`);
  }
  return (data as HealthSpecialty[] | null) ?? [];
}

/**
 * One published+approved provider profile, or null when not found (→ the page
 * calls notFound()). A genuine RPC failure throws (→ error.tsx) rather than
 * masquerading as a 404.
 */
export async function getProvider(
  slug: string,
  locale: Locale,
): Promise<HealthProviderProfile | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_get_provider", {
    p_slug: slug,
    p_locale: locale,
  });
  if (error) {
    throw new Error(`health_get_provider failed: ${error.message}`);
  }
  return (data as HealthProviderProfile | null) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// H4 — Availability (slot motoru) okuma katmanı.
//
// Slot mantığı saf fonksiyonda (lib/saglik/availability.ts). Buradaki server-only
// fonksiyonlar public read-RPC'lerden (069) ham girdiyi çeker, saf motoru çalıştırır
// ve DaySlots döndürür. PII gelmez (RPC yalnız dolu/boş zaman aralığı döner).
//
// Pencere stratejisi (boundary güvenli): motorun iterasyonu yerel takvim günleridir;
// from/to'yu öğle (T12:00Z) instant'ları ile veririz (±2h offset'te asla gün sınırını
// aşmaz). RPC çakışma penceresi (busy/holds) bilerek ±1 gün geniş → iterasyon günlerinin
// TÜM randevu/hold'ları çekilir; motor fazlasını yok sayar.
// ─────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

export type HealthBookingService = {
  id: string;
  name: string;
  durationMin: number;
  priceEur: number | null;
  mode: "in_person" | "video" | "home_visit";
};

export type HealthBookingLocation = {
  id: string;
  label: string;
  city: string;
};

export type HealthBookingOptions = {
  providerId: string;
  services: HealthBookingService[];
  locations: HealthBookingLocation[];
};

export type { DaySlots, SlotInfo } from "@/lib/saglik/availability";

/** Bugünün yerel (render TZ) tarihi "YYYY-MM-DD". */
function localToday(now: Date): string {
  // en-CA → ISO YYYY-MM-DD; render TZ Europe/Podgorica.
  return new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TIME_ZONE }).format(now);
}

/** "YYYY-MM-DD" + n gün (saf takvim aritmetiği, UTC üzerinden güvenli). */
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + n * MS_PER_DAY);
  const p = (x: number) => (x < 10 ? `0${x}` : String(x));
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

/** Yerel gün etiketi → motor (öğle) ve RPC (±1 gün geniş) instant'ları. */
function windowInstants(fromDate: string, toDate: string) {
  const engineFrom = new Date(`${fromDate}T12:00:00Z`);
  const engineTo = new Date(`${toDate}T12:00:00Z`);
  return {
    engineFrom,
    engineTo,
    rpcFrom: new Date(engineFrom.getTime() - MS_PER_DAY),
    rpcTo: new Date(engineTo.getTime() + MS_PER_DAY),
  };
}

/** Profil takvim widget'ı bootstrap'ı (provider id + id'li hizmetler/lokasyonlar). */
export async function getBookingOptions(
  slug: string,
  locale: Locale,
): Promise<HealthBookingOptions | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_get_booking_options", {
    p_slug: slug,
    p_locale: locale,
  });
  if (error) {
    throw new Error(`health_get_booking_options failed: ${error.message}`);
  }
  return (data as HealthBookingOptions | null) ?? null;
}

/**
 * Bir provider+hizmet+lokasyon için [fromDate, toDate] (dahil, yerel) penceresinde
 * günlük müsait slotlar. RPC NULL (yayında değil / hizmet geçersiz) → boş gün listesi.
 */
export async function getProviderAvailability(args: {
  providerId: string;
  serviceId: string;
  locationId: string;
  fromDate: string;
  toDate: string;
  now?: Date;
}): Promise<DaySlots[]> {
  const supabase = createAdminClient();
  const { engineFrom, engineTo, rpcFrom, rpcTo } = windowInstants(args.fromDate, args.toDate);
  const { data, error } = await supabase.rpc("health_get_availability_inputs", {
    p_provider_id: args.providerId,
    p_service_id: args.serviceId,
    p_location_id: args.locationId,
    p_from: rpcFrom.toISOString(),
    p_to: rpcTo.toISOString(),
  });
  if (error) {
    throw new Error(`health_get_availability_inputs failed: ${error.message}`);
  }
  if (!data) return [];
  return generateAvailability(data as AvailabilityInputs, {
    from: engineFrom,
    to: engineTo,
    now: args.now ?? new Date(),
    timeZone: DEFAULT_TIME_ZONE,
  });
}

type BulkAvailabilityRow = AvailabilityInputs & {
  providerSlug: string;
  primaryServiceDurationMin: number | null;
};

/**
 * Liste kartları için TEK çağrıda (N+1 değil) bir uzmanlıktaki tüm yayınlı provider'ların
 * "sonraki müsait slotları". Bulk read-RPC + provider başına saf motor; sonuç slug→slot[].
 * `lookaheadDays` (vars. 14) içinde provider başına en çok `perProvider` (vars. 3) slot.
 */
export async function getNextSlotsBySpecialty(
  specialtySlug: string,
  opts?: { now?: Date; lookaheadDays?: number; perProvider?: number },
): Promise<Record<string, Array<SlotInfo & { date: string }>>> {
  const now = opts?.now ?? new Date();
  const lookahead = opts?.lookaheadDays ?? 14;
  const perProvider = opts?.perProvider ?? 3;
  const fromDate = localToday(now);
  const toDate = addDays(fromDate, lookahead);
  const { engineFrom, engineTo, rpcFrom, rpcTo } = windowInstants(fromDate, toDate);

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("health_get_availability_inputs_by_specialty", {
    p_specialty_slug: specialtySlug,
    p_from: rpcFrom.toISOString(),
    p_to: rpcTo.toISOString(),
  });
  if (error) {
    throw new Error(`health_get_availability_inputs_by_specialty failed: ${error.message}`);
  }

  const rows = (data as BulkAvailabilityRow[] | null) ?? [];
  const result: Record<string, Array<SlotInfo & { date: string }>> = {};
  for (const row of rows) {
    if (row.primaryServiceDurationMin == null) {
      result[row.providerSlug] = [];
      continue;
    }
    const days = generateAvailability(
      {
        serviceDurationMin: row.primaryServiceDurationMin,
        settings: row.settings,
        schedules: row.schedules,
        overrides: row.overrides,
        busy: row.busy,
        holds: row.holds,
      },
      { from: engineFrom, to: engineTo, now, timeZone: DEFAULT_TIME_ZONE },
    );
    result[row.providerSlug] = flattenNextSlots(days, perProvider);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// H3 — Arama + filtre + geo okuma katmanı.
//
// searchProviders() TEK filtreli read-RPC'yi (074 health_search_providers) çağırır:
// specialty + city + langs + mode + geo (lat/lng/radius). RPC PII döndürmez; kart
// + (geo verilirse) distanceKm. "Bu hafta müsait" filtresi RPC'DE DEĞİL — slot
// motoru (069) tek-kaynak kalsın diye TS'te cross-ref edilir (getNextSlotDates...).
// 068/069 ile aynı sözleşme: gerçek RPC hatası ATAR (→ error.tsx), boş [] = boş-durum.
// Cookie-free admin client → ISR-safe (H2 dersi).
// ─────────────────────────────────────────────────────────────────────────────

import { type HealthFilters } from "@/lib/saglik/filters";
import { getCityNameBySlug } from "@/lib/glatko/cities";

/** Kart + opsiyonel mesafe (geo araması). 068 kartının üst kümesi. */
export type HealthSearchCard = HealthProviderCard & {
  distanceKm?: number;
};

/**
 * Filtreli dizin araması. city/langs/mode/near → RPC argümanları; specialty rota
 * segmentinden gelir. avail ('bu hafta') burada UYGULANMAZ (sayfa katmanı slot
 * cross-ref'i ile süzer). RPC hatası atar; veri yoksa [] (boş-durum).
 */
export async function searchProviders(
  specialtySlug: string,
  locale: Locale,
  filters: HealthFilters,
): Promise<HealthSearchCard[]> {
  const supabase = createAdminClient();
  const near = filters.near;
  const { data, error } = await supabase.rpc("health_search_providers", {
    p_specialty_slug: specialtySlug,
    p_locale: locale,
    // RPC city ILIKE'ı şehir ADI bekler (lokasyon.city serbest metin, ad olarak
    // saklı); filters.city SSOT slug'ı → ada çevir.
    p_city: filters.city ? (getCityNameBySlug(filters.city) ?? null) : null,
    p_langs: filters.langs.length > 0 ? filters.langs : null,
    p_mode: filters.mode,
    p_lat: near?.lat ?? null,
    p_lng: near?.lng ?? null,
    p_radius_m: near ? near.radiusKm * 1000 : null,
  });
  if (error) {
    throw new Error(`health_search_providers failed: ${error.message}`);
  }
  return (data as HealthSearchCard[] | null) ?? [];
}

/**
 * "Bu hafta müsait" cross-ref'i için slug → slot tarihleri ("YYYY-MM-DD").
 * getNextSlotsBySpecialty (069) üzerine ince sarıcı: slot listesinden benzersiz
 * tarihleri çıkarır (lookahead 7 gün; bu-hafta penceresi). Availability outage'ı
 * sayfayı düşürmesin diye çağıran try/catch ile sarmalı (mevcut [specialty] deseni).
 */
export async function getNextSlotDatesBySpecialty(
  specialtySlug: string,
  opts?: { now?: Date },
): Promise<Record<string, string[]>> {
  const byProvider = await getNextSlotsBySpecialty(specialtySlug, {
    now: opts?.now,
    lookaheadDays: 7,
    perProvider: 8,
  });
  const out: Record<string, string[]> = {};
  for (const [slug, slots] of Object.entries(byProvider)) {
    out[slug] = Array.from(new Set(slots.map((s) => s.date)));
  }
  return out;
}
