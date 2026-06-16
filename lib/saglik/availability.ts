import "server-only";

/**
 * Glatko Sağlık — H4 availability engine (MASTER_PLAN §3 "H4", §2.x).
 *
 * PURE + TEST-EDİLEBİLİR: bu modül DB istemcisi TUTMAZ. DB'den okunan ham girdiyi
 * (schedules / overrides / settings / confirmed appointments / aktif slot_holds)
 * `AvailabilityInputs` olarak parametre alır ve müsait slot listesi üretir. Tüm
 * I/O `lib/saglik/queries.ts` (public read-RPC 069) + `/api/health/slots` katmanında;
 * burada yalnız saf hesap → `availability.test.ts` ile izole test edilir.
 *
 * (`import "server-only"` spec gereği korunur; vitest bunu boş bir stub'a alias'lar —
 * bkz. `vitest.config.ts`. Marker yalnız üretim bundle'ında istemciye sızmayı engeller;
 * fonksiyonun kendisinde sır/secret yoktur.)
 *
 * ZAMAN: tüm hesap UTC `Date` (TIMESTAMPTZ) üzerinden. Yerel duvar-saati ↔ UTC çevrimi
 * platformun IANA tz veritabanı ile `Intl.DateTimeFormat` üzerinden yapılır (offset
 * matematiği EL-YAPIMI DEĞİL). DST geçişleri doğru: ileri-saat (spring-forward) kayıp
 * saat üretmez (var olmayan duvar-saati atlanır); geri-saat (fall-back) tekrar eden
 * saati çift saymaz (grid duvar-saatinde üretildiği için her etiket tek instant'a maplenir).
 * cal.diy (MIT) algoritması referans alınmıştır; kod Supabase-native yazılmıştır.
 */

/** Render saat dilimi (Demir Kural 7). Çıktı saatleri bu dilime göre etiketlenir. */
export const DEFAULT_TIME_ZONE = "Europe/Podgorica";

export interface AvailabilityScheduleRow {
  /** 0 = Pazartesi (Monday) … 6 = Pazar (Sunday) — DB konvansiyonu (schema §2). */
  weekday: number;
  /** "HH:MM" veya "HH:MM:SS" (yerel duvar-saati). */
  startTime: string;
  endTime: string;
  /** "YYYY-MM-DD" veya null (sınırsız). */
  validFrom: string | null;
  validUntil: string | null;
}

export interface AvailabilityOverrideRow {
  /** "YYYY-MM-DD" (yerel takvim günü). */
  date: string;
  startTime: string | null;
  endTime: string | null;
  kind: "holiday" | "break" | "extra";
}

export interface AvailabilitySettings {
  bufferMin: number;
  minNoticeMin: number;
  horizonDays: number;
  /** null = günlük limit yok. */
  dailyCap: number | null;
  slotGridMin: number;
}

/** Dolu zaman aralığı (confirmed randevu ya da aktif hold) — ISO UTC string'ler. */
export interface BusyRange {
  start: string;
  end: string;
}

export interface AvailabilityInputs {
  serviceDurationMin: number;
  settings: AvailabilitySettings;
  schedules: AvailabilityScheduleRow[];
  overrides: AvailabilityOverrideRow[];
  busy: BusyRange[];
  holds: BusyRange[];
}

export interface SlotInfo {
  /** Randevu başlangıcı, ISO UTC. */
  startUtc: string;
  /** Randevu bitişi (start + duration), ISO UTC. */
  endUtc: string;
  /** Yerel duvar-saati etiketi "HH:MM" (24s, render TZ). UI locale formatını uygular. */
  localTime: string;
}

export interface DaySlots {
  /** "YYYY-MM-DD" (yerel). */
  date: string;
  slots: SlotInfo[];
}

export interface GenerateOptions {
  /** Pencere başı (UTC instant). */
  from: Date;
  /** Pencere sonu (UTC instant). */
  to: Date;
  /** Şimdi (min_notice / horizon / daily_cap referansı). */
  now: Date;
  timeZone?: string;
}

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 86_400_000;

// ─────────────────────────────────────────────────────────────────────────────
// Zaman dilimi yardımcıları (Intl tabanlı — platformun IANA db'si).
// ─────────────────────────────────────────────────────────────────────────────

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function zonedFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    fmtCache.set(timeZone, f);
  }
  return f;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Bir UTC instant'ının verilen tz'deki duvar-saati parçaları. */
function getZonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = zonedFormatter(timeZone).formatToParts(instant);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  let hour = Number(map.hour);
  if (hour === 24) hour = 0; // bazı ICU sürümleri gece yarısını "24" verir
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** instant anındaki tz offset'i (ms): (duvar-saati UTC sayılırsa) − instant. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const p = getZonedParts(instant, timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - instant.getTime();
}

/**
 * Yerel duvar-saatini (y,m,d,h,mi; render TZ) UTC `Date`'e çevirir.
 * Var olmayan duvar-saati (DST spring-forward boşluğu) için `null` döner.
 * Belirsiz duvar-saati (DST fall-back) için tek, deterministik instant döner.
 */
function zonedWallToUtc(
  y: number,
  m: number,
  d: number,
  h: number,
  mi: number,
  timeZone: string,
): Date | null {
  const asUTC = Date.UTC(y, m - 1, d, h, mi, 0);
  const off1 = tzOffsetMs(new Date(asUTC), timeZone);
  let utc = asUTC - off1;
  const off2 = tzOffsetMs(new Date(utc), timeZone);
  if (off2 !== off1) utc = asUTC - off2;
  // Doğrula: bu instant istenen duvar-saatine geri maplenıyor mu?
  const back = getZonedParts(new Date(utc), timeZone);
  if (back.year !== y || back.month !== m || back.day !== d || back.hour !== h || back.minute !== mi) {
    return null; // var olmayan yerel saat (kayıp saat)
  }
  return new Date(utc);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** instant → "YYYY-MM-DD" (yerel takvim günü). */
function formatLocalDate(instant: Date, timeZone: string): string {
  const p = getZonedParts(instant, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** [from,to] aralığındaki yerel takvim günleri (dahil). */
function localDateRange(from: Date, to: Date, timeZone: string): string[] {
  const start = formatLocalDate(from, timeZone);
  const end = formatLocalDate(to, timeZone);
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  let cur = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);
  const out: string[] = [];
  // Pure takvim günleri: UTC'de +1 gün eklemek tz'den bağımsız güvenli.
  while (cur <= endMs) {
    const dt = new Date(cur);
    out.push(`${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`);
    cur += MS_PER_DAY;
  }
  return out;
}

/** "HH:MM[:SS]" → gün içi dakika (saniye yok sayılır). */
function hmToMinutes(t: string): number {
  const [hh, mm] = t.split(":");
  return Number(hh) * 60 + Number(mm);
}

// ─────────────────────────────────────────────────────────────────────────────
// Aralık cebiri (gün-içi dakika; yarı-açık [start,end)).
// ─────────────────────────────────────────────────────────────────────────────

type Interval = [number, number];

function mergeIntervals(ivs: Interval[]): Interval[] {
  if (ivs.length === 0) return [];
  const sorted = [...ivs].filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  const out: Interval[] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) {
      last[1] = Math.max(last[1], e);
    } else {
      out.push([s, e]);
    }
  }
  return out;
}

/** working aralıklarından [bs,be) molasını çıkarır (gerekirse böler). */
function subtractInterval(working: Interval[], cut: Interval): Interval[] {
  const [cs, ce] = cut;
  if (ce <= cs) return working;
  const out: Interval[] = [];
  for (const [s, e] of working) {
    if (ce <= s || cs >= e) {
      out.push([s, e]); // örtüşme yok
      continue;
    }
    if (cs > s) out.push([s, Math.min(cs, e)]); // sol parça
    if (ce < e) out.push([Math.max(ce, s), e]); // sağ parça
  }
  return out.filter(([s, e]) => e > s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ana motor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §2.x sırasıyla: schedules + overrides → günlük çalışma aralıkları; grid'de aday
 * slot başlangıçları; confirmed appointments + aktif holds (buffer ile genişletilmiş)
 * ile çakışanları çıkar; min_notice / horizon / daily_cap uygula; UTC hesapla,
 * render TZ etiketle. Çıktı: yerel tarih başına gruplu müsait slotlar.
 */
export function generateAvailability(
  inputs: AvailabilityInputs,
  opts: GenerateOptions,
): DaySlots[] {
  const tz = opts.timeZone ?? DEFAULT_TIME_ZONE;
  const duration = inputs.serviceDurationMin;
  const days: DaySlots[] = [];
  const dateList = localDateRange(opts.from, opts.to, tz);
  if (!duration || duration <= 0) {
    return dateList.map((date) => ({ date, slots: [] }));
  }

  const s = inputs.settings;
  const grid = s.slotGridMin > 0 ? s.slotGridMin : 15;
  const durationMs = duration * MS_PER_MIN;
  const bufferMs = Math.max(0, s.bufferMin) * MS_PER_MIN;
  const earliestMs = opts.now.getTime() + Math.max(0, s.minNoticeMin) * MS_PER_MIN;
  const horizonMs = opts.now.getTime() + Math.max(0, s.horizonDays) * MS_PER_DAY;

  // Dolu aralıklar: confirmed appointments + aktif holds, her iki yana buffer eklenmiş.
  // (Bir aday slot ile mevcut randevu/hold arasında ≥ buffer boşluk şartı → yarı-açık
  // overlap testi.)
  const blocked: Interval[] = [];
  for (const r of [...inputs.busy, ...inputs.holds]) {
    const bs = Date.parse(r.start);
    const be = Date.parse(r.end);
    if (Number.isFinite(bs) && Number.isFinite(be)) blocked.push([bs - bufferMs, be + bufferMs]);
  }

  // Override'ları yerel güne göre indeksle.
  const holidays = new Set<string>();
  const breaksByDate = new Map<string, Interval[]>();
  const extrasByDate = new Map<string, Interval[]>();
  for (const o of inputs.overrides) {
    if (o.kind === "holiday") {
      holidays.add(o.date);
    } else if (o.startTime && o.endTime) {
      const iv: Interval = [hmToMinutes(o.startTime), hmToMinutes(o.endTime)];
      const target = o.kind === "break" ? breaksByDate : extrasByDate;
      const arr = target.get(o.date);
      if (arr) arr.push(iv);
      else target.set(o.date, [iv]);
    }
  }

  // Schedule'ları db-weekday'e göre indeksle.
  const schedByWeekday = new Map<number, AvailabilityScheduleRow[]>();
  for (const row of inputs.schedules) {
    const arr = schedByWeekday.get(row.weekday);
    if (arr) arr.push(row);
    else schedByWeekday.set(row.weekday, [row]);
  }

  // daily_cap: yerel gün başına confirmed randevu sayısı.
  const confirmedPerDay = new Map<string, number>();
  if (s.dailyCap != null) {
    for (const r of inputs.busy) {
      const t = Date.parse(r.start);
      if (!Number.isFinite(t)) continue;
      const dk = formatLocalDate(new Date(t), tz);
      confirmedPerDay.set(dk, (confirmedPerDay.get(dk) ?? 0) + 1);
    }
  }

  for (const dateStr of dateList) {
    // holiday → o gün hiç slot yok.
    if (holidays.has(dateStr)) {
      days.push({ date: dateStr, slots: [] });
      continue;
    }
    // daily_cap dolu → o günün kalan (tüm) slotları çıkar.
    if (s.dailyCap != null && (confirmedPerDay.get(dateStr) ?? 0) >= s.dailyCap) {
      days.push({ date: dateStr, slots: [] });
      continue;
    }

    const [y, m, d] = dateStr.split("-").map(Number);
    // dateStr saf takvim günü → JS weekday'i UTC'den al; DB konvansiyonuna çevir (0=Pzt).
    const jsWeekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Pazar
    const dbWeekday = (jsWeekday + 6) % 7; // 0=Pazartesi

    const base: Interval[] = [];
    for (const row of schedByWeekday.get(dbWeekday) ?? []) {
      if (row.validFrom && dateStr < row.validFrom) continue;
      if (row.validUntil && dateStr > row.validUntil) continue;
      base.push([hmToMinutes(row.startTime), hmToMinutes(row.endTime)]);
    }
    // extra → çalışma aralığı ekle.
    for (const iv of extrasByDate.get(dateStr) ?? []) base.push(iv);

    let working = mergeIntervals(base);
    // break → çalışma aralığını böl.
    for (const br of breaksByDate.get(dateStr) ?? []) working = subtractInterval(working, br);

    const slots: SlotInfo[] = [];
    const seen = new Set<string>();
    for (const [wStart, wEnd] of working) {
      // grid: aralık başından başla, slotGridMin adımla; randevu [t, t+duration] ⊆ aralık.
      for (let t = wStart; t + duration <= wEnd; t += grid) {
        const hh = Math.floor(t / 60);
        const mm = t % 60;
        const startUtc = zonedWallToUtc(y, m, d, hh, mm, tz);
        if (!startUtc) continue; // DST kayıp saat
        const startMs = startUtc.getTime();
        if (startMs < earliestMs) continue; // min_notice
        if (startMs > horizonMs) continue; // horizon
        const endMs = startMs + durationMs;

        let conflict = false;
        for (const [bs, be] of blocked) {
          if (startMs < be && endMs > bs) {
            conflict = true; // confirmed appointment / aktif hold ile çakışma
            break;
          }
        }
        if (conflict) continue;

        const iso = startUtc.toISOString();
        if (seen.has(iso)) continue; // lokasyonlar arası örtüşen aralık → tek say
        seen.add(iso);
        slots.push({
          startUtc: iso,
          endUtc: new Date(endMs).toISOString(),
          localTime: `${pad2(hh)}:${pad2(mm)}`,
        });
      }
    }
    slots.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
    days.push({ date: dateStr, slots });
  }

  return days;
}

/** İlk N müsait slotu gün sınırı gözetmeden düzleştirir (liste kartı chip'leri). */
export function flattenNextSlots(
  days: DaySlots[],
  limit: number,
): Array<SlotInfo & { date: string }> {
  const out: Array<SlotInfo & { date: string }> = [];
  for (const day of days) {
    for (const slot of day.slots) {
      out.push({ ...slot, date: day.date });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** İlk slotu olan gün (boş-durum "sonraki müsait güne kaydır" önerisi için). */
export function firstDayWithSlots(days: DaySlots[]): DaySlots | null {
  return days.find((d) => d.slots.length > 0) ?? null;
}
