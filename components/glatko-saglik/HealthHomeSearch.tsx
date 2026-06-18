"use client";

import { useState, useTransition } from "react";
import { Stethoscope, MapPin, Search } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { getCityBySlug } from "@/lib/glatko/cities";

/**
 * H3 — wires the (previously inert) health home hero search to navigation. On
 * submit it routes to /health/[specialty] (or /health/[specialty]/[city] when a
 * city is chosen) — the directory page then owns filtering. Locale-aware
 * navigation via @/i18n/navigation. The specialty <select> + city <select> are
 * populated by the server page (options passed in) so this stays a thin client
 * shell; the source of truth (specialty/city lists) is server-rendered.
 */
export function HealthHomeSearch({
  specialties,
  cities,
  labels,
}: {
  specialties: Array<{ slug: string; name: string }>;
  cities: Array<{ slug: string; name: string }>;
  labels: {
    searchSpecialty: string;
    searchCity: string;
    searchCta: string;
    cityAll: string;
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [specialty, setSpecialty] = useState(specialties[0]?.slug ?? "");
  const [city, setCity] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!specialty) return;
    startTransition(() => {
      if (city && getCityBySlug(city)) {
        router.push({
          pathname: "/health/[specialty]/[city]",
          params: { specialty, city },
        });
      } else {
        router.push({
          pathname: "/health/[specialty]",
          params: { specialty },
        });
      }
    });
  };

  const fieldCls =
    "w-full rounded-xl border border-gray-200 bg-white py-3 pl-11 pr-4 text-sm text-gray-900 focus:border-brandHealth focus:outline-none focus:ring-1 focus:ring-brandHealth dark:border-white/10 dark:bg-white/5 dark:text-white";

  return (
    <form
      onSubmit={submit}
      className="mx-auto mt-10 flex max-w-2xl flex-col gap-3 sm:flex-row"
      aria-label={labels.searchCta}
    >
      <label className="relative flex-1">
        <Stethoscope className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <span className="sr-only">{labels.searchSpecialty}</span>
        <select
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          className={fieldCls}
          aria-label={labels.searchSpecialty}
        >
          {specialties.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="relative sm:w-48">
        <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <span className="sr-only">{labels.searchCity}</span>
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className={fieldCls}
          aria-label={labels.searchCity}
        >
          <option value="">{labels.cityAll}</option>
          {cities.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={isPending || !specialty}
        className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition hover:from-teal-600 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <Search className="h-4 w-4" />
        {labels.searchCta}
      </button>
    </form>
  );
}
