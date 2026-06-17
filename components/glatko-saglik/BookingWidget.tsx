"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import type {
  DaySlots,
  HealthBookingLocation,
  HealthBookingService,
} from "@/lib/saglik/queries";
import { intlLocale } from "@/lib/saglik/intl";

/**
 * Glatko Sağlık — H4 profil rezervasyon takvimi (Client Component).
 *
 * Sunucu (uzman sayfası) provider id + id'li hizmet/lokasyon listesini verir; bu
 * widget /api/health/slots'tan seçili hizmet+lokasyon+hafta için günlük slotları
 * çeker ve üç durumu (loading/error/ready) yönetir. Slot SEÇİMİ yapılır ama randevu
 * OLUŞTURULMAZ ve hold ALINMAZ — gerçek rezervasyon akışı H5'te bağlanacak; seçim
 * burada `selectedSlotIso` + `selectedServiceId` olarak tutulur (CTA disabled hook).
 *
 * Demir Kural 7: tüm takvim aritmetiği Europe/Podgorica yerel takvim günleri
 * üzerinden, tz-güvenli (Date.UTC + saf gün ekleme). brandHealth (sky) yalnız
 * ikon/zaman-chip/rozet aksanı; CTA HER ZAMAN teal (§1.5).
 */

const PODGORICA_TZ = "Europe/Podgorica";
const MS_PER_DAY = 86_400_000;
const DAYS_IN_WEEK = 7;

type FetchState =
  | { status: "loading"; days: DaySlots[] }
  | { status: "ready"; days: DaySlots[] }
  | { status: "error"; days: DaySlots[] };

type SlotsResponse = { days: DaySlots[] };

type BookingWidgetProps = {
  slug: string;
  providerId: string;
  services: HealthBookingService[];
  locations: HealthBookingLocation[];
  locale: string;
  /**
   * H9 reschedule reuse: when set, a successful hold calls this instead of routing
   * to the new-booking page (the reschedule flow takes over from here). The widget
   * stays the single slot-picker; only the post-hold destination differs.
   */
  onHoldCreated?: (holdId: string) => void;
  /** H9: hide the service/location pickers (reschedule is locked to the original). */
  lockSelectors?: boolean;
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Bugünün Europe/Podgorica yerel takvim tarihi "YYYY-MM-DD". */
function localTodayPodgorica(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PODGORICA_TZ }).format(
    new Date(),
  );
}

/** "YYYY-MM-DD" + n gün — saf takvim aritmetiği (UTC üzerinden, tz-güvenli). */
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + n * MS_PER_DAY);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(
    dt.getUTCDate(),
  )}`;
}

/** Bir UTC ISO instant'ının Europe/Podgorica yerel takvim günü "YYYY-MM-DD". */
function localDateOfIso(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PODGORICA_TZ }).format(
    new Date(iso),
  );
}

export function BookingWidget({
  providerId,
  services,
  locations,
  locale,
  onHoldCreated,
  lockSelectors = false,
}: BookingWidgetProps) {
  const t = useTranslations("healthVertical");
  const searchParams = useSearchParams();
  const router = useRouter();
  const [reserving, setReserving] = useState(false);
  const [reserveError, setReserveError] = useState<string | null>(null);

  // A11y: after a 409 "just taken" refresh clears the selection, move focus back
  // into the slot grid so a keyboard/SR user is not stranded (the selected button
  // they pressed is gone). `refocusSlots` is armed by the 409 branch and consumed
  // by an effect once the refreshed grid has rendered.
  const slotGridRef = useRef<HTMLDivElement>(null);
  const [refocusSlots, setRefocusSlots] = useState(false);

  // Varsayılan hizmet = ilk (sunucu en kısayı başa koyar), varsayılan lokasyon = ilk.
  const [selectedServiceId, setSelectedServiceId] = useState<string>(
    services[0]?.id ?? "",
  );
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    locations[0]?.id ?? "",
  );
  const [weekOffset, setWeekOffset] = useState<number>(0);

  const today = useMemo(() => localTodayPodgorica(), []);
  const weekDates = useMemo<string[]>(() => {
    const start = addDays(today, weekOffset * DAYS_IN_WEEK);
    return Array.from({ length: DAYS_IN_WEEK }, (_, i) => addDays(start, i));
  }, [today, weekOffset]);

  const [selectedDate, setSelectedDate] = useState<string>(weekDates[0]);
  const [selectedSlotIso, setSelectedSlotIso] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>({
    status: "loading",
    days: [],
  });

  // Hafta değişince seçili gün geçerli pencerede değilse haftanın ilk gününe çek.
  useEffect(() => {
    setSelectedDate((prev) => (weekDates.includes(prev) ? prev : weekDates[0]));
  }, [weekDates]);

  // Deep-link ön-seçim: ?slot=<ISO startUtc> → ilgili yerel günü+slotu seç.
  // (Slot mevcut fetch penceresinde olmasa bile selectedSlotIso set edilir; günü
  // yüklendiğinde otomatik highlight olur.)
  useEffect(() => {
    const slotParam = searchParams.get("slot");
    if (!slotParam) return;
    const ms = Date.parse(slotParam);
    if (!Number.isFinite(ms)) return;
    setSelectedSlotIso(slotParam);
    setSelectedDate(localDateOfIso(slotParam));
    // Yalnız ilk mount'ta okunur; sonraki state değişimleri tetiklemesin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // İptal-edilebilir fetch sayacı (yarıştan kazanan en son istek).
  const fetchSeq = useRef(0);

  const runFetch = useCallback(
    (signal: AbortSignal) => {
      if (!selectedServiceId || !selectedLocationId) {
        setFetchState({ status: "ready", days: [] });
        return;
      }
      const seq = ++fetchSeq.current;
      setFetchState((prev) => ({ status: "loading", days: prev.days }));
      const params = new URLSearchParams({
        providerId,
        serviceId: selectedServiceId,
        locationId: selectedLocationId,
        from: weekDates[0],
        to: weekDates[DAYS_IN_WEEK - 1],
      });
      fetch(`/api/health/slots?${params.toString()}`, { signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`slots ${res.status}`);
          return (await res.json()) as SlotsResponse;
        })
        .then((json) => {
          if (signal.aborted || seq !== fetchSeq.current) return;
          setFetchState({ status: "ready", days: json.days });
        })
        .catch((err: unknown) => {
          if (signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
            return; // iptal edilen istek — yok say
          }
          if (seq !== fetchSeq.current) return;
          setFetchState((prev) => ({ status: "error", days: prev.days }));
        });
    },
    [providerId, selectedServiceId, selectedLocationId, weekDates],
  );

  // Mount + (hizmet/lokasyon/hafta) değişiminde slotları çek (eskileri iptal et).
  const [retryNonce, setRetryNonce] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    runFetch(controller.signal);
    return () => controller.abort();
  }, [runFetch, retryNonce]);

  // A11y: once a 409-triggered refresh has finished (fetchState ready) move focus
  // to the first slot button in the refreshed grid, then disarm.
  useEffect(() => {
    if (!refocusSlots || fetchState.status !== "ready") return;
    const firstSlot = slotGridRef.current?.querySelector<HTMLButtonElement>('button[role="radio"]');
    firstSlot?.focus();
    setRefocusSlots(false);
  }, [refocusSlots, fetchState.status]);

  const days = fetchState.days;
  const selectedDay = useMemo<DaySlots | undefined>(
    () => days.find((dd) => dd.date === selectedDate),
    [days, selectedDate],
  );
  const firstDayWithSlots = useMemo<DaySlots | undefined>(
    () => days.find((dd) => dd.slots.length > 0),
    [days],
  );
  const selectedSlot = useMemo(() => {
    if (!selectedSlotIso) return null;
    for (const dd of days) {
      const found = dd.slots.find((s) => s.startUtc === selectedSlotIso);
      if (found) return found;
    }
    return null;
  }, [days, selectedSlotIso]);

  // ── Intl formatlayıcılar (i18n key DEĞİL — locale + Europe/Podgorica) ──────
  // App locale'i Intl'in tanıdığı BCP-47'ye çevir (me/sr → Latin Sırpça; aksi
  // halde me→İngilizce, sr→Kiril fallback olur — bkz. lib/saglik/intl.ts).
  const il = intlLocale(locale);
  const weekdayFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(il, {
        timeZone: PODGORICA_TZ,
        weekday: "short",
      }),
    [il],
  );
  const dayNumFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(il, {
        timeZone: PODGORICA_TZ,
        day: "numeric",
      }),
    [il],
  );
  const selectionFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(il, {
        timeZone: PODGORICA_TZ,
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    [il],
  );

  // "YYYY-MM-DD" yerel gününü öğle instant'ı ile formatla (gün/weekday etiketi).
  const labelForDate = useCallback((dateStr: string) => {
    const noonUtc = new Date(`${dateStr}T12:00:00Z`);
    return { weekday: weekdayFmt.format(noonUtc), day: dayNumFmt.format(noonUtc) };
  }, [weekdayFmt, dayNumFmt]);

  const handleSelectService = useCallback((id: string) => {
    setSelectedServiceId(id);
    setSelectedSlotIso(null);
  }, []);
  const handleSelectLocation = useCallback((id: string) => {
    setSelectedLocationId(id);
    setSelectedSlotIso(null);
  }, []);

  // "Randevu Al" → 5dk hold oluştur → booking sayfasına git. SLOT_TAKEN/SLOT_HELD
  // (409) → "az önce alındı" + slotları yenile. (Gerçek rezervasyon H5b.)
  const reserve = useCallback(async () => {
    if (!selectedSlot || !selectedServiceId || !selectedLocationId) return;
    const svc = services.find((s) => s.id === selectedServiceId);
    if (!svc) return;
    const slotEnd = new Date(
      new Date(selectedSlot.startUtc).getTime() + svc.durationMin * 60_000,
    ).toISOString();
    setReserveError(null);
    setReserving(true);
    try {
      const res = await fetch("/api/health/holds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          serviceId: selectedServiceId,
          locationId: selectedLocationId,
          slotStart: selectedSlot.startUtc,
          slotEnd,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { holdId: string };
        // H9 reschedule: hand the hold to the parent flow instead of the new-booking page.
        if (onHoldCreated) {
          onHoldCreated(data.holdId);
          return;
        }
        router.push({ pathname: "/health/randevu/[holdId]", params: { holdId: data.holdId } });
        return;
      }
      if (res.status === 409) {
        setReserveError(t("booking.holdTaken"));
        setSelectedSlotIso(null);
        setRefocusSlots(true); // a11y: refocus the grid once the refresh renders
        setRetryNonce((n) => n + 1); // availability'yi tazele
      } else {
        setReserveError(t("booking.holdFailed"));
      }
    } catch {
      setReserveError(t("booking.holdFailed"));
    } finally {
      setReserving(false);
    }
  }, [selectedSlot, selectedServiceId, selectedLocationId, services, providerId, router, t, onHoldCreated]);

  return (
    <div className="lg:sticky lg:top-24 rounded-2xl border border-gray-200 bg-white p-5 shadow-premium-sm dark:border-white/10 dark:bg-white/5">
      {/* Header */}
      <div className="flex items-center gap-2 text-gray-900 dark:text-white">
        <CalendarClock className="h-5 w-5 text-brandHealth" />
        <span className="text-sm font-semibold">{t("booking.title")}</span>
      </div>

      {fetchState.status === "error" ? (
        <div className="mt-5 text-center">
          <p className="text-sm text-gray-600 dark:text-white/70">
            {t("booking.error")}
          </p>
          <button
            type="button"
            onClick={() => setRetryNonce((n) => n + 1)}
            className="mt-3 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2 text-sm font-semibold text-white"
          >
            {t("booking.retry")}
          </button>
        </div>
      ) : (
        <>
          {/* Service selector (>1) — hidden when locked to the original (reschedule). */}
          {!lockSelectors && services.length > 1 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
                {t("booking.serviceLabel")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {services.map((svc) => {
                  const active = svc.id === selectedServiceId;
                  return (
                    <button
                      key={svc.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => handleSelectService(svc.id)}
                      className={
                        active
                          ? "rounded-lg border border-brandHealth bg-brandHealth-50 px-3 py-1.5 text-xs font-medium text-brandHealth-700 dark:border-brandHealth/40 dark:bg-brandHealth/15 dark:text-brandHealth"
                          : "rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:border-white/20"
                      }
                    >
                      {svc.name}
                      <span className="ml-1 text-gray-400 dark:text-white/40">
                        · {svc.durationMin} {t("directory.minutesShort")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Location selector (>1) — hidden when locked to the original (reschedule). */}
          {!lockSelectors && locations.length > 1 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
                {t("booking.locationLabel")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {locations.map((loc) => {
                  const active = loc.id === selectedLocationId;
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => handleSelectLocation(loc.id)}
                      className={
                        active
                          ? "rounded-lg border border-brandHealth bg-brandHealth-50 px-3 py-1.5 text-xs font-medium text-brandHealth-700 dark:border-brandHealth/40 dark:bg-brandHealth/15 dark:text-brandHealth"
                          : "rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:border-white/20"
                      }
                    >
                      {loc.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 7-day strip */}
          <div className="mt-4 flex items-center gap-1.5">
            <button
              type="button"
              aria-label={t("booking.prevWeek")}
              disabled={weekOffset === 0}
              onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
              className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-white/60 dark:hover:bg-white/10"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div
              role="radiogroup"
              aria-label={t("booking.dayGroupLabel")}
              className="grid flex-1 grid-cols-7 gap-1"
            >
              {weekDates.map((dateStr) => {
                const { weekday, day } = labelForDate(dateStr);
                const active = dateStr === selectedDate;
                const isToday = weekOffset === 0 && dateStr === weekDates[0];
                return (
                  <button
                    key={dateStr}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={`${weekday} ${day}`}
                    onClick={() => setSelectedDate(dateStr)}
                    className={
                      "flex flex-col items-center rounded-lg py-1.5 text-center transition-colors " +
                      (active
                        ? "bg-brandHealth-700 text-white"
                        : "text-gray-600 hover:bg-gray-100 dark:text-white/70 dark:hover:bg-white/10")
                    }
                  >
                    <span className="text-[10px] uppercase opacity-70">
                      {weekday}
                    </span>
                    <span
                      className={
                        "text-sm font-semibold " +
                        (isToday && !active ? "text-brandHealth-700 dark:text-brandHealth" : "")
                      }
                    >
                      {day}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              aria-label={t("booking.nextWeek")}
              onClick={() => setWeekOffset((w) => w + 1)}
              className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:text-white/60 dark:hover:bg-white/10"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Slot grid / states */}
          <div className="mt-4 min-h-[3rem]">
            {fetchState.status === "loading" ? (
              <div className="flex flex-wrap gap-2" aria-hidden="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-8 w-16 animate-pulse rounded-lg bg-gray-100 dark:bg-white/10"
                  />
                ))}
              </div>
            ) : selectedDay && selectedDay.slots.length > 0 ? (
              <div
                ref={slotGridRef}
                role="radiogroup"
                aria-label={t("booking.slotGroupLabel")}
                className="flex flex-wrap gap-2"
              >
                {selectedDay.slots.map((slot) => {
                  const active = slot.startUtc === selectedSlotIso;
                  return (
                    <button
                      key={slot.startUtc}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSelectedSlotIso(slot.startUtc)}
                      className={
                        "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors " +
                        (active
                          ? "bg-brandHealth-700 text-white"
                          : "bg-brandHealth-50 text-brandHealth-700 hover:bg-brandHealth-100 dark:bg-brandHealth/15 dark:text-brandHealth dark:hover:bg-brandHealth/25")
                      }
                    >
                      {slot.localTime}
                    </button>
                  );
                })}
              </div>
            ) : firstDayWithSlots ? (
              <div className="text-sm text-gray-500 dark:text-white/50">
                <p>{t("booking.noSlotsDay")}</p>
                <button
                  type="button"
                  onClick={() => setSelectedDate(firstDayWithSlots.date)}
                  className="mt-2 font-medium text-teal-600 hover:underline dark:text-teal-400"
                >
                  {t("booking.nextAvailableDay")}
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-white/50">
                {t("booking.noSlotsWeek")}
              </p>
            )}
          </div>

          {/* Selection footer + H5 CTA hook */}
          {selectedSlot && (
            <div className="mt-4 border-t border-gray-100 pt-4 dark:border-white/5">
              <p className="text-xs text-gray-500 dark:text-white/50">
                {t("booking.selectedLabel")}
              </p>
              <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">
                {selectionFmt.format(new Date(selectedSlot.startUtc))}
              </p>
              <button
                type="button"
                onClick={reserve}
                disabled={reserving}
                aria-describedby={reserveError ? "bw-reserve-error" : undefined}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40 disabled:opacity-60"
              >
                {reserving && <Loader2 className="h-4 w-4 animate-spin" />}
                {reserving ? t("booking.reserving") : t("booking.reserve")}
              </button>
              {reserveError && (
                <p id="bw-reserve-error" role="alert" aria-live="assertive" className="mt-2 text-sm text-red-600 dark:text-red-300">
                  {reserveError}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
