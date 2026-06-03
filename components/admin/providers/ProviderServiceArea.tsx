"use client";

import { GLATKO_CITIES } from "@/lib/glatko/cities";

interface Props {
  cityDisplay: string;
  onCityDisplayChange: (v: string) => void;
  locationCity: string;
  onLocationCityChange: (v: string) => void;
  serviceRadiusKm: number;
  onServiceRadiusChange: (v: number) => void;
  disabled?: boolean;
}

// Single source of truth (lib/glatko/cities.ts) — all 25 municipalities, as
// quick-select shortcuts. The free-text city-display + slug inputs below stay,
// so admins can still enter any settlement not in the list.
const COMMON_CITIES = GLATKO_CITIES.map((c) => ({
  display: c.name,
  slug: c.slug,
}));

export function ProviderServiceArea({
  cityDisplay,
  onCityDisplayChange,
  locationCity,
  onLocationCityChange,
  serviceRadiusKm,
  onServiceRadiusChange,
  disabled,
}: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-600 dark:text-white/60">
          Şehir (gösterilen ad)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={cityDisplay}
            onChange={(e) => onCityDisplayChange(e.target.value)}
            disabled={disabled}
            placeholder="Herceg Novi"
            className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
          />
        </div>
        <div className="flex flex-wrap gap-1 pt-1">
          {COMMON_CITIES.map((c) => (
            <button
              type="button"
              key={c.slug}
              disabled={disabled}
              onClick={() => {
                onCityDisplayChange(c.display);
                onLocationCityChange(c.slug);
              }}
              className="rounded-full border border-gray-200 px-2 py-0.5 text-[11px] text-gray-600 hover:border-teal-500/30 hover:text-teal-700 dark:border-white/[0.1] dark:text-white/60"
            >
              {c.display}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-600 dark:text-white/60">
          location_city slug
        </label>
        <input
          type="text"
          value={locationCity}
          onChange={(e) => onLocationCityChange(e.target.value.toLowerCase())}
          disabled={disabled}
          placeholder="herceg-novi"
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 font-mono text-sm dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
        />
        <p className="text-[11px] text-gray-500 dark:text-white/40">
          lowercase + hyphenated; otomatik doluyor şehir butonuyla
        </p>
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <label className="flex items-center justify-between text-xs font-medium text-gray-600 dark:text-white/60">
          Hizmet alanı yarıçapı
          <span className="font-mono text-sm text-teal-700 dark:text-teal-300">
            {serviceRadiusKm} km
          </span>
        </label>
        <input
          type="range"
          min={5}
          max={500}
          step={5}
          value={serviceRadiusKm}
          onChange={(e) => onServiceRadiusChange(Number(e.target.value))}
          disabled={disabled}
          className="w-full accent-teal-500"
        />
        <div className="flex justify-between text-[11px] text-gray-400 dark:text-white/30">
          <span>5 km</span>
          <span>200 km (CG genel)</span>
          <span>500 km</span>
        </div>
      </div>
    </div>
  );
}
