"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Check, Plus, Trash2, MapPin, Stethoscope } from "lucide-react";

import {
  saveProfile,
  saveLocation,
  removeLocation,
  saveService,
  removeService,
} from "@/app/[locale]/saglik-pro/actions";
import {
  profileSchema,
  locationSchema,
  serviceSchema,
  PROVIDER_TYPES,
  SERVICE_MODES,
} from "@/lib/saglik/provider-validation";
import type {
  OwnProvider,
  OwnProviderLocation,
  OwnProviderService,
} from "@/lib/saglik/provider";
import type { HealthSpecialty } from "@/lib/saglik/queries";
import type { Locale } from "@/i18n/routing";
import { GLATKO_CITIES } from "@/lib/glatko/cities";

/**
 * Glatko Sağlık — post-onboarding profile/services/locations editor (H7a /profil).
 * Each section saves independently through the owner-checked actions. Mirrors the
 * wizard's step content but in a flat tabless layout. Mobile-first.
 */

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brandHealth focus:outline-none focus:ring-1 focus:ring-brandHealth dark:border-white/10 dark:bg-white/5 dark:text-white";
const labelCls = "block text-sm font-medium text-gray-700 dark:text-white/70";

export function ProviderProfileEditor({
  locale,
  specialties,
  initialDraft,
}: {
  locale: Locale;
  specialties: HealthSpecialty[];
  initialDraft: OwnProvider;
}) {
  const t = useTranslations("healthVertical");
  const p = (k: string) => t(`pro.profile.${k}`);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-2xl font-light tracking-tight text-gray-900 dark:text-white">
          {p("title")}
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-white/60">
          {p("statusLine").replace("{status}", t(`pro.status.${initialDraft.verificationStatus}`))}
        </p>
      </header>

      <ProfileSection locale={locale} specialties={specialties} draft={initialDraft} />
      <LocationsSection locale={locale} initial={initialDraft.locations} />
      <ServicesSection locale={locale} initial={initialDraft.services} />
    </div>
  );
}

// ── Profile fields ────────────────────────────────────────────────────────────

function ProfileSection({
  locale,
  specialties,
  draft,
}: {
  locale: Locale;
  specialties: HealthSpecialty[];
  draft: OwnProvider;
}) {
  const t = useTranslations("healthVertical");
  const p = (k: string) => t(`pro.profile.${k}`);
  const [pending, startTransition] = useTransition();

  const [providerType, setProviderType] = useState(draft.providerType);
  const [fullName, setFullName] = useState(draft.fullName);
  const [title, setTitle] = useState(draft.title ?? "");
  const [bio, setBio] = useState(draft.bio[locale] ?? "");
  const [languages, setLanguages] = useState((draft.languages ?? []).join(", "));
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>(
    draft.specialties.map((s) => s.slug),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggleSpecialty(slug: string) {
    setSaved(false);
    setSelectedSpecialties((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  function submit() {
    setError(null);
    setSaved(false);
    // Merge the single-locale bio edit back into the per-locale jsonb.
    const nextBio = { ...draft.bio };
    if (bio.trim()) nextBio[locale] = bio.trim();
    else delete nextBio[locale];
    const payload = {
      providerType,
      fullName,
      title: title.trim() || null,
      bio: nextBio,
      photoUrl: draft.photoUrl,
      languages: languages
        .split(/[,\n]/)
        .map((x) => x.trim())
        .filter(Boolean),
      specialtySlugs: selectedSpecialties,
    };
    const parsed = profileSchema.safeParse(payload);
    if (!parsed.success) {
      setError(p("invalid"));
      return;
    }
    startTransition(async () => {
      const res = await saveProfile(parsed.data);
      if (res.ok) setSaved(true);
      else setError(p("saveError"));
    });
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white/70 p-5 dark:border-white/10 dark:bg-white/5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
        <Stethoscope className="h-4 w-4 text-brandHealth" aria-hidden /> {p("sectionProfile")}
      </h2>
      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="ptype">
              {p("providerType")}
            </label>
            <select
              id="ptype"
              className={inputCls + " mt-1"}
              value={providerType}
              onChange={(e) => setProviderType(e.target.value as typeof providerType)}
            >
              {PROVIDER_TYPES.map((pt) => (
                <option key={pt} value={pt}>
                  {t(`pro.providerType.${pt}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="title">
              {p("titleField")}
            </label>
            <input
              id="title"
              className={inputCls + " mt-1"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={p("titlePlaceholder")}
            />
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="name">
            {p("fullName")}
          </label>
          <input
            id="name"
            className={inputCls + " mt-1"}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="bio">
            {p("bio").replace("{locale}", locale.toUpperCase())}
          </label>
          <textarea
            id="bio"
            rows={3}
            className={inputCls + " mt-1"}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="langs">
            {p("languages")}
          </label>
          <input
            id="langs"
            className={inputCls + " mt-1"}
            value={languages}
            onChange={(e) => setLanguages(e.target.value)}
            placeholder="en, sr, ru"
          />
        </div>
        <div>
          <span className={labelCls}>{p("specialties")}</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {specialties.map((sp) => {
              const active = selectedSpecialties.includes(sp.slug);
              return (
                <button
                  key={sp.slug}
                  type="button"
                  onClick={() => toggleSpecialty(sp.slug)}
                  className={
                    "rounded-full border px-3 py-1 text-xs font-medium transition " +
                    (active
                      ? "border-brandHealth bg-brandHealth-50 text-brandHealth-700 dark:border-brandHealth dark:bg-brandHealth/15 dark:text-brandHealth"
                      : "border-gray-200 text-gray-600 hover:border-gray-300 dark:border-white/10 dark:text-white/60")
                  }
                  aria-pressed={active}
                >
                  {sp.name}
                </button>
              );
            })}
          </div>
        </div>

        <SaveRow
          pending={pending}
          saved={saved}
          error={error}
          onSave={submit}
          savedLabel={p("saved")}
          saveLabel={p("save")}
        />
      </div>
    </section>
  );
}

// ── Locations ───────────────────────────────────────────────────────────────

function LocationsSection({
  locale: _locale,
  initial,
}: {
  locale: Locale;
  initial: OwnProviderLocation[];
}) {
  const t = useTranslations("healthVertical");
  const p = (k: string) => t(`pro.profile.${k}`);
  const [items, setItems] = useState<OwnProviderLocation[]>(initial);
  const [adding, setAdding] = useState(false);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white/70 p-5 dark:border-white/10 dark:bg-white/5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
        <MapPin className="h-4 w-4 text-brandHealth" aria-hidden /> {p("sectionLocations")}
      </h2>
      <ul className="mt-4 space-y-3">
        {items.map((loc) => (
          <LocationRow
            key={loc.id}
            loc={loc}
            onSaved={(next) => setItems((prev) => prev.map((x) => (x.id === next.id ? next : x)))}
            onRemoved={() => setItems((prev) => prev.filter((x) => x.id !== loc.id))}
          />
        ))}
      </ul>
      {adding ? (
        <div className="mt-3">
          <LocationForm
            onSaved={(created) => {
              setItems((prev) => [...prev, created]);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-brandHealth-200 px-4 py-1.5 text-sm font-medium text-brandHealth-700 transition hover:bg-brandHealth-50 dark:border-brandHealth/30 dark:text-brandHealth dark:hover:bg-brandHealth/10"
        >
          <Plus className="h-4 w-4" aria-hidden /> {p("addLocation")}
        </button>
      )}
    </section>
  );
}

function LocationRow({
  loc,
  onSaved,
  onRemoved,
}: {
  loc: OwnProviderLocation;
  onSaved: (l: OwnProviderLocation) => void;
  onRemoved: () => void;
}) {
  const t = useTranslations("healthVertical");
  const p = (k: string) => t(`pro.profile.${k}`);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function doRemove() {
    setError(null);
    startTransition(async () => {
      const res = await removeLocation(loc.id);
      if (res.ok) onRemoved();
      else setError(res.error === "LOCATION_IN_USE" ? p("locationInUse") : p("saveError"));
    });
  }

  if (editing) {
    return (
      <li>
        <LocationForm
          initial={loc}
          onSaved={(next) => {
            onSaved(next);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 bg-white/60 p-3 dark:border-white/5 dark:bg-white/5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{loc.label}</p>
        <p className="truncate text-xs text-gray-500 dark:text-white/50">
          {loc.address}, {loc.city}
        </p>
        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-full px-2.5 py-1 text-xs font-medium text-brandHealth-700 hover:bg-brandHealth-50 dark:text-brandHealth dark:hover:bg-brandHealth/10"
        >
          {p("edit")}
        </button>
        <button
          type="button"
          onClick={doRemove}
          disabled={pending}
          className="rounded-full p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10"
          aria-label={p("remove")}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>
    </li>
  );
}

export function LocationForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: OwnProviderLocation;
  onSaved: (l: OwnProviderLocation) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("healthVertical");
  const p = (k: string) => t(`pro.profile.${k}`);
  const tc = useTranslations("cities");
  const [pending, startTransition] = useTransition();

  const [label, setLabel] = useState(initial?.label ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [city, setCity] = useState(initial?.city ?? GLATKO_CITIES[0].name);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    // Preserve any precise coordinates the row already holds (an edit must not
    // snap a precise pin back to the city seat) — BUT only when the city is
    // unchanged; if the provider picked a different city, drop them so the schema
    // re-derives that city's seat. No map picker yet (H7b), so today coords are
    // always seat-based, but this keeps an edit lossless once precise pins exist.
    const cityUnchanged = initial != null && initial.city === city;
    const payload = {
      locationId: initial?.id ?? null,
      label,
      address,
      city,
      lat: cityUnchanged ? (initial?.lat ?? null) : null,
      lng: cityUnchanged ? (initial?.lng ?? null) : null,
    };
    const parsed = locationSchema.safeParse(payload);
    if (!parsed.success) {
      setError(p("invalid"));
      return;
    }
    startTransition(async () => {
      const res = await saveLocation(parsed.data);
      if (res.ok) {
        onSaved({
          id: res.locationId,
          label: parsed.data.label,
          address: parsed.data.address,
          city: parsed.data.city,
          lat: parsed.data.lat ?? null,
          lng: parsed.data.lng ?? null,
        });
      } else {
        setError(p("saveError"));
      }
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-brandHealth-100 bg-brandHealth-50/40 p-4 dark:border-brandHealth/20 dark:bg-brandHealth/5">
      <div>
        <label className={labelCls} htmlFor="loc-label">
          {p("locLabel")}
        </label>
        <input id="loc-label" className={inputCls + " mt-1"} value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div>
        <label className={labelCls} htmlFor="loc-address">
          {p("locAddress")}
        </label>
        <input id="loc-address" className={inputCls + " mt-1"} value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div>
        <label className={labelCls} htmlFor="loc-city">
          {p("locCity")}
        </label>
        <select id="loc-city" className={inputCls + " mt-1"} value={city} onChange={(e) => setCity(e.target.value)}>
          {GLATKO_CITIES.map((c) => (
            <option key={c.key} value={c.name}>
              {tc(c.key)}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full bg-brandHealth-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brandHealth-700 disabled:opacity-60"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {p("save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-4 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-white/60 dark:hover:text-white"
        >
          {p("cancel")}
        </button>
      </div>
    </div>
  );
}

// ── Services ──────────────────────────────────────────────────────────────────

function ServicesSection({
  locale,
  initial,
}: {
  locale: Locale;
  initial: OwnProviderService[];
}) {
  const t = useTranslations("healthVertical");
  const p = (k: string) => t(`pro.profile.${k}`);
  const [items, setItems] = useState<OwnProviderService[]>(initial);
  const [adding, setAdding] = useState(false);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white/70 p-5 dark:border-white/10 dark:bg-white/5">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{p("sectionServices")}</h2>
      <ul className="mt-4 space-y-3">
        {items.map((svc) => (
          <ServiceRow
            key={svc.id}
            locale={locale}
            svc={svc}
            onSaved={(next) => setItems((prev) => prev.map((x) => (x.id === next.id ? next : x)))}
            onRemoved={() => setItems((prev) => prev.filter((x) => x.id !== svc.id))}
          />
        ))}
      </ul>
      {adding ? (
        <div className="mt-3">
          <ServiceForm
            locale={locale}
            onSaved={(created) => {
              setItems((prev) => [...prev, created]);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-brandHealth-200 px-4 py-1.5 text-sm font-medium text-brandHealth-700 transition hover:bg-brandHealth-50 dark:border-brandHealth/30 dark:text-brandHealth dark:hover:bg-brandHealth/10"
        >
          <Plus className="h-4 w-4" aria-hidden /> {p("addService")}
        </button>
      )}
    </section>
  );
}

function ServiceRow({
  locale,
  svc,
  onSaved,
  onRemoved,
}: {
  locale: Locale;
  svc: OwnProviderService;
  onSaved: (s: OwnProviderService) => void;
  onRemoved: () => void;
}) {
  const t = useTranslations("healthVertical");
  const p = (k: string) => t(`pro.profile.${k}`);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function doRemove() {
    setError(null);
    startTransition(async () => {
      const res = await removeService(svc.id);
      if (res.ok) onRemoved();
      else setError(res.error === "SERVICE_IN_USE" ? p("serviceInUse") : p("saveError"));
    });
  }

  if (editing) {
    return (
      <li>
        <ServiceForm
          locale={locale}
          initial={svc}
          onSaved={(next) => {
            onSaved(next);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 bg-white/60 p-3 dark:border-white/5 dark:bg-white/5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
          {svc.name[locale] ?? Object.values(svc.name)[0] ?? p("unnamedService")}
          {!svc.isActive && <span className="ml-2 text-xs text-gray-400">({p("inactive")})</span>}
        </p>
        <p className="text-xs text-gray-500 dark:text-white/50">
          {svc.durationMin} {p("minShort")} · {t(`pro.serviceMode.${svc.mode}`)}
          {svc.priceEur != null ? ` · €${svc.priceEur}` : ""}
        </p>
        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-full px-2.5 py-1 text-xs font-medium text-brandHealth-700 hover:bg-brandHealth-50 dark:text-brandHealth dark:hover:bg-brandHealth/10"
        >
          {p("edit")}
        </button>
        <button
          type="button"
          onClick={doRemove}
          disabled={pending}
          className="rounded-full p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10"
          aria-label={p("remove")}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>
    </li>
  );
}

export function ServiceForm({
  locale,
  initial,
  onSaved,
  onCancel,
}: {
  locale: Locale;
  initial?: OwnProviderService;
  onSaved: (s: OwnProviderService) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("healthVertical");
  const p = (k: string) => t(`pro.profile.${k}`);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(initial?.name[locale] ?? Object.values(initial?.name ?? {})[0] ?? "");
  const [durationMin, setDurationMin] = useState(initial?.durationMin ?? 30);
  const [priceEur, setPriceEur] = useState<number | "">(initial?.priceEur ?? "");
  const [mode, setMode] = useState(initial?.mode ?? "in_person");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const nextName = { ...(initial?.name ?? {}) };
    if (name.trim()) nextName[locale] = name.trim();
    const payload = {
      serviceId: initial?.id ?? null,
      name: nextName,
      durationMin: Number(durationMin),
      priceEur: priceEur === "" ? null : Number(priceEur),
      mode,
      isActive,
    };
    const parsed = serviceSchema.safeParse(payload);
    if (!parsed.success) {
      setError(p("invalid"));
      return;
    }
    startTransition(async () => {
      const res = await saveService(parsed.data);
      if (res.ok) {
        onSaved({
          id: res.serviceId,
          name: parsed.data.name,
          durationMin: parsed.data.durationMin,
          priceEur: parsed.data.priceEur ?? null,
          mode: parsed.data.mode,
          isActive: parsed.data.isActive,
        });
      } else {
        setError(p("saveError"));
      }
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-brandHealth-100 bg-brandHealth-50/40 p-4 dark:border-brandHealth/20 dark:bg-brandHealth/5">
      <div>
        <label className={labelCls} htmlFor="svc-name">
          {p("serviceName").replace("{locale}", locale.toUpperCase())}
        </label>
        <input id="svc-name" className={inputCls + " mt-1"} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls} htmlFor="svc-dur">
            {p("duration")}
          </label>
          <input
            id="svc-dur"
            type="number"
            min={5}
            max={240}
            className={inputCls + " mt-1"}
            value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value))}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="svc-price">
            {p("price")}
          </label>
          <input
            id="svc-price"
            type="number"
            min={0}
            step="0.01"
            placeholder={p("pricePlaceholder")}
            className={inputCls + " mt-1"}
            value={priceEur}
            onChange={(e) => setPriceEur(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="svc-mode">
            {p("mode")}
          </label>
          <select
            id="svc-mode"
            className={inputCls + " mt-1"}
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            {SERVICE_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`pro.serviceMode.${m}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-white/70">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-brandHealth-600 focus:ring-brandHealth"
        />
        {p("active")}
      </label>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full bg-brandHealth-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brandHealth-700 disabled:opacity-60"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {p("save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-4 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-white/60 dark:hover:text-white"
        >
          {p("cancel")}
        </button>
      </div>
    </div>
  );
}

// ── shared save row ─────────────────────────────────────────────────────────

function SaveRow({
  pending,
  saved,
  error,
  onSave,
  saveLabel,
  savedLabel,
}: {
  pending: boolean;
  saved: boolean;
  error: string | null;
  onSave: () => void;
  saveLabel: string;
  savedLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onSave}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-full bg-brandHealth-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brandHealth-700 disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {saveLabel}
      </button>
      {error && (
        <span className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </span>
      )}
      {saved && !error && (
        <span className="inline-flex items-center gap-1.5 text-sm text-brandHealth-700 dark:text-brandHealth">
          <Check className="h-4 w-4" aria-hidden /> {savedLabel}
        </span>
      )}
    </div>
  );
}
