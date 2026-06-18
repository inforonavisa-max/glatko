"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Check } from "lucide-react";

import { createManualBooking } from "@/app/[locale]/health-pro/actions";
import { manualBookSchema } from "@/lib/saglik/provider-validation";
import { intlLocale } from "@/lib/saglik/intl";
import type { Locale } from "@/i18n/routing";
import type {
  ManualServiceOption,
  ManualLocationOption,
} from "@/components/glatko-saglik/ProviderDashboardSummary";

/**
 * Glatko Sağlık — H7b manual booking (phone-in patient; NO OTP — the provider is the
 * trusted actor). Picks service + location + day, fetches FREE slots from the same
 * /api/health/slots the patient BookingWidget uses (single source of truth for
 * availability), then takes name + phone (+ optional email/note). Client zod
 * (manualBookSchema) gates before the server action; SLOT_TAKEN / validation errors
 * render inline. Mobile-first stacked layout.
 */

type SlotInfo = { startUtc: string; endUtc: string; localTime: string };
type DaySlots = { date: string; slots: SlotInfo[] };

const MS_PER_DAY = 86_400_000;

function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Podgorica" }).format(new Date());
}
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + n * MS_PER_DAY);
  const p = (x: number) => (x < 10 ? `0${x}` : String(x));
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

export function ProviderManualBookForm({
  locale,
  providerId,
  services,
  locations,
  onBooked,
}: {
  locale: Locale;
  providerId: string;
  services: ManualServiceOption[];
  locations: ManualLocationOption[];
  onBooked?: () => void;
}) {
  const t = useTranslations("healthVertical");
  const m = (k: string) => t(`pro.manual.${k}`);
  const [pending, startTransition] = useTransition();

  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [date, setDate] = useState(todayLocal());
  const [days, setDays] = useState<DaySlots[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotStart, setSlotStart] = useState<string | null>(null);

  const [patientName, setPatientName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const service = services.find((s) => s.id === serviceId);

  // Fetch free slots for the chosen service+location+date from the SAME availability
  // endpoint patients book through (so the provider can only pick a truly-open slot).
  useEffect(() => {
    if (!serviceId || !locationId || !date) {
      setDays([]);
      return;
    }
    const controller = new AbortController();
    setLoadingSlots(true);
    setSlotStart(null);
    const params = new URLSearchParams({
      providerId,
      serviceId,
      locationId,
      from: date,
      to: date,
    });
    fetch(`/api/health/slots?${params.toString()}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("slots"))))
      .then((d: { days?: DaySlots[] }) => setDays(d.days ?? []))
      .catch((e) => {
        if (e?.name !== "AbortError") setDays([]);
      })
      .finally(() => setLoadingSlots(false));
    return () => controller.abort();
  }, [providerId, serviceId, locationId, date]);

  const slots = days.find((d) => d.date === date)?.slots ?? [];

  function submit() {
    setError(null);
    setDone(false);
    if (!slotStart || !service) {
      setError(m("noSlot"));
      return;
    }
    const slot = slots.find((s) => s.startUtc === slotStart);
    if (!slot) {
      setError(m("noSlot"));
      return;
    }
    const payload = {
      serviceId,
      locationId,
      slotStart: slot.startUtc,
      slotEnd: slot.endUtc,
      patientName,
      phone,
      email: email.trim() === "" ? null : email.trim(),
      note: note.trim() === "" ? null : note.trim(),
    };
    const parsed = manualBookSchema.safeParse(payload);
    if (!parsed.success) {
      setError(m("invalid"));
      return;
    }
    startTransition(async () => {
      const res = await createManualBooking(locale, parsed.data);
      if (!res.ok) {
        if (res.error === "SLOT_TAKEN") setError(m("slotTaken"));
        else if (res.error === "PATIENT_INPUT_INVALID") setError(m("badPhone"));
        else if (res.error === "VALIDATION") setError(m("invalid"));
        else setError(m("bookError"));
        return;
      }
      setDone(true);
      setPatientName("");
      setPhone("");
      setEmail("");
      setNote("");
      setSlotStart(null);
      onBooked?.();
    });
  }

  const fieldCls =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brandHealth focus:outline-none focus:ring-1 focus:ring-brandHealth dark:border-white/10 dark:bg-white/5 dark:text-white";
  const labelCls = "block text-sm font-medium text-gray-700 dark:text-white/70";

  const dayLabel = (d: string) =>
    new Intl.DateTimeFormat(intlLocale(locale), {
      timeZone: "Europe/Podgorica",
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(`${d}T12:00:00Z`));

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{m("title")}</h3>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-white/40">{m("subtitle")}</p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="mb-service">
            {m("service")}
          </label>
          <select
            id="mb-service"
            className={fieldCls + " mt-1"}
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.durationMin} {m("min")})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="mb-location">
            {m("location")}
          </label>
          <select
            id="mb-location"
            className={fieldCls + " mt-1"}
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.label} — {loc.city}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <label className={labelCls} htmlFor="mb-date">
          {m("date")}
        </label>
        <input
          id="mb-date"
          type="date"
          min={todayLocal()}
          max={addDays(todayLocal(), 180)}
          className={fieldCls + " mt-1"}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div className="mt-3">
        <span className={labelCls}>{m("slot")}</span>
        {loadingSlots ? (
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-gray-400 dark:text-white/30">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {m("loadingSlots")}
          </p>
        ) : slots.length === 0 ? (
          <p className="mt-1 text-xs text-gray-400 dark:text-white/30">{m("noSlots")}</p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-2">
            {slots.map((s) => (
              <button
                key={s.startUtc}
                type="button"
                onClick={() => setSlotStart(s.startUtc)}
                aria-pressed={slotStart === s.startUtc}
                className={
                  slotStart === s.startUtc
                    ? "rounded-lg bg-brandHealth-600 px-3 py-1.5 text-xs font-semibold text-white"
                    : "rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-brandHealth-300 dark:border-white/10 dark:text-white/70"
                }
              >
                {s.localTime}
              </button>
            ))}
          </div>
        )}
        {slotStart && (
          <p className="mt-1 text-xs text-brandHealth-700 dark:text-brandHealth">
            {dayLabel(date)} ·{" "}
            {slots.find((s) => s.startUtc === slotStart)?.localTime}
          </p>
        )}
      </div>

      <div className="mt-4 space-y-3 border-t border-gray-100 pt-4 dark:border-white/10">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="mb-name">
              {m("patientName")}
            </label>
            <input
              id="mb-name"
              type="text"
              maxLength={120}
              className={fieldCls + " mt-1"}
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="mb-phone">
              {m("phone")}
            </label>
            <input
              id="mb-phone"
              type="tel"
              inputMode="tel"
              maxLength={32}
              placeholder="+382…"
              className={fieldCls + " mt-1"}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="mb-email">
              {m("email")}
            </label>
            <input
              id="mb-email"
              type="email"
              maxLength={320}
              placeholder={m("optional")}
              className={fieldCls + " mt-1"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="mb-note">
              {m("note")}
            </label>
            <input
              id="mb-note"
              type="text"
              maxLength={500}
              placeholder={m("optional")}
              className={fieldCls + " mt-1"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      {done && !error && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-brandHealth-700 dark:text-brandHealth">
          <Check className="h-4 w-4" aria-hidden /> {m("booked")}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending || !slotStart}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-brandHealth-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brandHealth-700 disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {m("book")}
      </button>
    </div>
  );
}
