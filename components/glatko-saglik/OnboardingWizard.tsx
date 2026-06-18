"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Check, Plus, Trash2, Upload, ChevronRight, ChevronLeft } from "lucide-react";

import { useRouter } from "@/i18n/navigation";
import {
  saveProfile,
  saveLicense,
  removeLocation,
  removeService,
  finalizeOnboarding,
} from "@/app/[locale]/saglik-pro/actions";
import {
  profileSchema,
  licenseSchema,
  buildLicensePath,
  PROVIDER_TYPES,
} from "@/lib/saglik/provider-validation";
import type {
  OwnProvider,
  OwnProviderLocation,
  OwnProviderService,
} from "@/lib/saglik/provider";
import type { HealthSpecialty } from "@/lib/saglik/queries";
import type { Locale } from "@/i18n/routing";
import { LocationForm, ServiceForm } from "@/components/glatko-saglik/ProviderProfileEditor";

/**
 * Glatko Sağlık — provider onboarding wizard (H7a /basvuru). 5 steps + a step
 * indicator, RESUMABLE: the partial provider row (is_published=false,
 * verification_status='pending') IS the persisted draft, so the host loads it and
 * the wizard pre-fills. Each step calls the SAME owner-checked upsert actions the
 * editor uses. Submit keeps the provider pending (admin H8 approves) — it never
 * publishes. Mobile-first. brandHealth accent (CTA stays teal per §1.5? — wizard
 * uses brandHealth for its primary advance, the design system's health surface).
 */

const STEPS = ["profile", "license", "locations", "services", "schedule"] as const;

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brandHealth focus:outline-none focus:ring-1 focus:ring-brandHealth dark:border-white/10 dark:bg-white/5 dark:text-white";
const labelCls = "block text-sm font-medium text-gray-700 dark:text-white/70";

export function OnboardingWizard({
  locale,
  specialties,
  initialDraft,
}: {
  locale: Locale;
  specialties: HealthSpecialty[];
  initialDraft: OwnProvider | null;
}) {
  const t = useTranslations("healthVertical");
  const w = (k: string) => t(`pro.onboarding.${k}`);
  const router = useRouter();

  // Resume at the first incomplete step (or step 0 for a brand-new draft).
  const [step, setStep] = useState<number>(() => firstIncompleteStep(initialDraft));
  const [hasProvider, setHasProvider] = useState<boolean>(Boolean(initialDraft));
  const [locations, setLocations] = useState<OwnProviderLocation[]>(
    initialDraft?.locations ?? [],
  );
  const [services, setServices] = useState<OwnProviderService[]>(
    initialDraft?.services ?? [],
  );

  const stepKey = STEPS[step];

  function goNext() {
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  return (
    <div>
      <StepIndicator current={step} labels={STEPS.map((k) => w(`step.${k}`))} />

      <div className="mt-6">
        {stepKey === "profile" && (
          <ProfileStep
            locale={locale}
            specialties={specialties}
            draft={initialDraft}
            onSaved={() => {
              setHasProvider(true);
              goNext();
            }}
          />
        )}
        {stepKey === "license" && (
          <LicenseStep
            locale={locale}
            draft={initialDraft}
            disabled={!hasProvider}
            onSaved={goNext}
            onBack={goBack}
          />
        )}
        {stepKey === "locations" && (
          <LocationsStep
            locale={locale}
            items={locations}
            setItems={setLocations}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {stepKey === "services" && (
          <ServicesStep
            locale={locale}
            items={services}
            setItems={setServices}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {stepKey === "schedule" && (
          <FinalizeStep locale={locale} onBack={goBack} router={router} />
        )}
      </div>
    </div>
  );
}

function firstIncompleteStep(draft: OwnProvider | null): number {
  if (!draft) return 0;
  if (!draft.licenseNumber && !draft.licenseFileSet) return 1;
  if (draft.locations.length === 0) return 2;
  if (!draft.services.some((s) => s.isActive)) return 3;
  return 4;
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current, labels }: { current: number; labels: string[] }) {
  return (
    <ol className="flex items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {labels.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex shrink-0 items-center gap-1.5">
            <span
              className={
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition " +
                (active
                  ? "bg-brandHealth-600 text-white"
                  : done
                    ? "bg-brandHealth-100 text-brandHealth-700 dark:bg-brandHealth/20 dark:text-brandHealth"
                    : "bg-gray-100 text-gray-400 dark:bg-white/10 dark:text-white/40")
              }
            >
              {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
            </span>
            <span
              className={
                "hidden text-xs font-medium sm:inline " +
                (active ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-white/40")
              }
            >
              {label}
            </span>
            {i < labels.length - 1 && <span className="mx-1 h-px w-4 bg-gray-200 dark:bg-white/10" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

// ── Step 1: profile ─────────────────────────────────────────────────────────

function ProfileStep({
  locale,
  specialties,
  draft,
  onSaved,
}: {
  locale: Locale;
  specialties: HealthSpecialty[];
  draft: OwnProvider | null;
  onSaved: () => void;
}) {
  const t = useTranslations("healthVertical");
  const w = (k: string) => t(`pro.onboarding.${k}`);
  const p = (k: string) => t(`pro.profile.${k}`);
  const [pending, startTransition] = useTransition();

  const [providerType, setProviderType] = useState(draft?.providerType ?? "doctor");
  const [fullName, setFullName] = useState(draft?.fullName ?? "");
  const [title, setTitle] = useState(draft?.title ?? "");
  const [bio, setBio] = useState(draft?.bio[locale] ?? "");
  const [languages, setLanguages] = useState((draft?.languages ?? []).join(", "));
  const [selected, setSelected] = useState<string[]>(draft?.specialties.map((s) => s.slug) ?? []);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const nextBio: Record<string, string> = { ...(draft?.bio ?? {}) };
    if (bio.trim()) nextBio[locale] = bio.trim();
    const payload = {
      providerType,
      fullName,
      title: title.trim() || null,
      bio: nextBio,
      photoUrl: draft?.photoUrl ?? null,
      languages: languages.split(/[,\n]/).map((x) => x.trim()).filter(Boolean),
      specialtySlugs: selected,
    };
    const parsed = profileSchema.safeParse(payload);
    if (!parsed.success) {
      setError(p("invalid"));
      return;
    }
    startTransition(async () => {
      const res = await saveProfile(parsed.data);
      if (res.ok) onSaved();
      else setError(p("saveError"));
    });
  }

  return (
    <StepCard title={w("step.profile")} description={w("profileHint")}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="w-ptype">
              {p("providerType")}
            </label>
            <select
              id="w-ptype"
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
            <label className={labelCls} htmlFor="w-title">
              {p("titleField")}
            </label>
            <input id="w-title" className={inputCls + " mt-1"} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="w-name">
            {p("fullName")}
          </label>
          <input id="w-name" className={inputCls + " mt-1"} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="w-bio">
            {p("bio").replace("{locale}", locale.toUpperCase())}
          </label>
          <textarea id="w-bio" rows={3} className={inputCls + " mt-1"} value={bio} onChange={(e) => setBio(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="w-langs">
            {p("languages")}
          </label>
          <input id="w-langs" className={inputCls + " mt-1"} value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="en, sr, ru" />
        </div>
        <div>
          <span className={labelCls}>{p("specialties")}</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {specialties.map((sp) => {
              const active = selected.includes(sp.slug);
              return (
                <button
                  key={sp.slug}
                  type="button"
                  onClick={() =>
                    setSelected((prev) =>
                      prev.includes(sp.slug) ? prev.filter((s) => s !== sp.slug) : [...prev, sp.slug],
                    )
                  }
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
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <NavRow nextLabel={w("next")} pending={pending} onNext={submit} />
      </div>
    </StepCard>
  );
}

// ── Step 2: license (signed upload to private bucket) ──────────────────────────

function LicenseStep({
  locale: _locale,
  draft,
  disabled,
  onSaved,
  onBack,
}: {
  locale: Locale;
  draft: OwnProvider | null;
  disabled: boolean;
  onSaved: () => void;
  onBack: () => void;
}) {
  const t = useTranslations("healthVertical");
  const w = (k: string) => t(`pro.onboarding.${k}`);
  const lc = (k: string) => t(`pro.license.${k}`);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [licenseNumber, setLicenseNumber] = useState(draft?.licenseNumber ?? "");
  const [chamber, setChamber] = useState(draft?.chamber ?? "");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>(draft?.licenseFileSet ? lc("fileOnFile") : "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    // Pre-validate ext client-side (the route + RPC re-check).
    const built = buildLicensePath("pre", file.name);
    if (!built.ok) {
      setError(lc("badType"));
      return;
    }
    setUploading(true);
    try {
      const res = await fetch("/api/health/provider/license-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
      });
      if (!res.ok) {
        setError(lc("uploadError"));
        return;
      }
      const { signedUrl, path } = (await res.json()) as { signedUrl: string; path: string };
      // Upload the bytes straight to the signed URL (never exposes the file publicly).
      const put = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      }).catch(() => null);
      if (!put || !put.ok) {
        setError(lc("uploadError"));
        return;
      }
      setFilePath(path);
      setFileName(file.name);
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    setError(null);
    const payload = {
      licenseNumber: licenseNumber.trim() || null,
      chamber: chamber.trim() || null,
      filePath,
    };
    const parsed = licenseSchema.safeParse(payload);
    if (!parsed.success) {
      setError(lc("invalid"));
      return;
    }
    startTransition(async () => {
      const res = await saveLicense(parsed.data);
      if (res.ok) onSaved();
      else setError(lc("saveError"));
    });
  }

  return (
    <StepCard title={w("step.license")} description={w("licenseHint")}>
      <div className="space-y-4">
        {disabled && <p className="text-sm text-amber-600 dark:text-amber-400">{lc("completeProfileFirst")}</p>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="lic-num">
              {lc("number")}
            </label>
            <input id="lic-num" className={inputCls + " mt-1"} value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="lic-chamber">
              {lc("chamber")}
            </label>
            <input id="lic-chamber" className={inputCls + " mt-1"} value={chamber} onChange={(e) => setChamber(e.target.value)} />
          </div>
        </div>
        <div>
          <span className={labelCls}>{lc("file")}</span>
          <div className="mt-1.5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-lg border border-brandHealth-200 px-4 py-2 text-sm font-medium text-brandHealth-700 transition hover:bg-brandHealth-50 disabled:opacity-60 dark:border-brandHealth/30 dark:text-brandHealth dark:hover:bg-brandHealth/10"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
              {lc("chooseFile")}
            </button>
            {fileName && (
              <span className="inline-flex items-center gap-1.5 truncate text-sm text-gray-600 dark:text-white/60">
                <Check className="h-4 w-4 text-brandHealth-600" aria-hidden /> {fileName}
              </span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <p className="mt-1.5 text-xs text-gray-500 dark:text-white/40">{lc("privacyNote")}</p>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <NavRow nextLabel={w("next")} pending={pending} onNext={submit} onBack={onBack} disableNext={disabled} backLabel={w("back")} />
      </div>
    </StepCard>
  );
}

// ── Step 3: locations ─────────────────────────────────────────────────────────

function LocationsStep({
  locale: _locale,
  items,
  setItems,
  onNext,
  onBack,
}: {
  locale: Locale;
  items: OwnProviderLocation[];
  setItems: React.Dispatch<React.SetStateAction<OwnProviderLocation[]>>;
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useTranslations("healthVertical");
  const w = (k: string) => t(`pro.onboarding.${k}`);
  const p = (k: string) => t(`pro.profile.${k}`);
  const [adding, setAdding] = useState(items.length === 0);
  const [pending, startTransition] = useTransition();

  function doRemove(id: string) {
    startTransition(async () => {
      const res = await removeLocation(id);
      if (res.ok) setItems((prev) => prev.filter((x) => x.id !== id));
    });
  }

  return (
    <StepCard title={w("step.locations")} description={w("locationsHint")}>
      <ul className="space-y-2">
        {items.map((loc) => (
          <li
            key={loc.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white/60 p-3 dark:border-white/5 dark:bg-white/5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{loc.label}</p>
              <p className="truncate text-xs text-gray-500 dark:text-white/50">
                {loc.address}, {loc.city}
              </p>
            </div>
            <button
              type="button"
              onClick={() => doRemove(loc.id)}
              disabled={pending}
              className="rounded-full p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
              aria-label={p("remove")}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {adding || items.length === 0 ? (
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
      <NavRow
        nextLabel={w("next")}
        pending={false}
        onNext={onNext}
        onBack={onBack}
        backLabel={w("back")}
        disableNext={items.length === 0}
      />
    </StepCard>
  );
}

// ── Step 4: services ──────────────────────────────────────────────────────────

function ServicesStep({
  locale,
  items,
  setItems,
  onNext,
  onBack,
}: {
  locale: Locale;
  items: OwnProviderService[];
  setItems: React.Dispatch<React.SetStateAction<OwnProviderService[]>>;
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useTranslations("healthVertical");
  const w = (k: string) => t(`pro.onboarding.${k}`);
  const p = (k: string) => t(`pro.profile.${k}`);
  const [adding, setAdding] = useState(items.length === 0);
  const [pending, startTransition] = useTransition();

  function doRemove(id: string) {
    startTransition(async () => {
      const res = await removeService(id);
      if (res.ok) setItems((prev) => prev.filter((x) => x.id !== id));
    });
  }

  const hasActive = items.some((s) => s.isActive);

  return (
    <StepCard title={w("step.services")} description={w("servicesHint")}>
      <ul className="space-y-2">
        {items.map((svc) => (
          <li
            key={svc.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white/60 p-3 dark:border-white/5 dark:bg-white/5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                {svc.name[locale] ?? Object.values(svc.name)[0] ?? p("unnamedService")}
              </p>
              <p className="text-xs text-gray-500 dark:text-white/50">
                {svc.durationMin} {p("minShort")} · {t(`pro.serviceMode.${svc.mode}`)}
                {svc.priceEur != null ? ` · €${svc.priceEur}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => doRemove(svc.id)}
              disabled={pending}
              className="rounded-full p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
              aria-label={p("remove")}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {adding || items.length === 0 ? (
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
      <NavRow
        nextLabel={w("next")}
        pending={false}
        onNext={onNext}
        onBack={onBack}
        backLabel={w("back")}
        disableNext={!hasActive}
      />
    </StepCard>
  );
}

// ── Step 5: schedule reminder + finalize ───────────────────────────────────────

function FinalizeStep({
  locale: _locale,
  onBack,
  router,
}: {
  locale: Locale;
  onBack: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const t = useTranslations("healthVertical");
  const w = (k: string) => t(`pro.onboarding.${k}`);
  const [pending, startTransition] = useTransition();
  const [missing, setMissing] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function submit() {
    setError(null);
    setMissing(null);
    startTransition(async () => {
      const res = await finalizeOnboarding();
      if (res.ok) {
        setDone(true);
      } else if ("missing" in res) {
        setMissing(res.missing);
      } else {
        setError(w("submitError"));
      }
    });
  }

  if (done) {
    return (
      <StepCard title={w("submittedTitle")} description={w("submittedBody")}>
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brandHealth-100 text-brandHealth-700 dark:bg-brandHealth/20 dark:text-brandHealth">
            <Check className="h-6 w-6" aria-hidden />
          </span>
          <button
            type="button"
            onClick={() => router.push("/health-pro/profil")}
            className="inline-flex items-center gap-2 rounded-full bg-brandHealth-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brandHealth-700"
          >
            {w("goToProfile")}
          </button>
        </div>
      </StepCard>
    );
  }

  return (
    <StepCard title={w("step.schedule")} description={w("scheduleHint")}>
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => router.push("/health-pro/takvim")}
          className="inline-flex items-center gap-1.5 rounded-full border border-brandHealth-200 px-4 py-1.5 text-sm font-medium text-brandHealth-700 transition hover:bg-brandHealth-50 dark:border-brandHealth/30 dark:text-brandHealth dark:hover:bg-brandHealth/10"
        >
          {w("openScheduleEditor")} <ChevronRight className="h-4 w-4" aria-hidden />
        </button>

        {missing && missing.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <p className="font-medium">{w("missingTitle")}</p>
            <ul className="mt-1 list-inside list-disc">
              {missing.map((m) => (
                <li key={m}>{w(`missing.${m}`)}</li>
              ))}
            </ul>
          </div>
        )}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-white/60 dark:hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden /> {w("back")}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-full bg-brandHealth-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brandHealth-700 disabled:opacity-60"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {w("submit")}
          </button>
        </div>
      </div>
    </StepCard>
  );
}

// ── shared bits ─────────────────────────────────────────────────────────────

function StepCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white/70 p-5 dark:border-white/10 dark:bg-white/5 sm:p-6">
      <h2 className="font-serif text-lg font-light text-gray-900 dark:text-white">{title}</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-white/60">{description}</p>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function NavRow({
  nextLabel,
  backLabel,
  pending,
  onNext,
  onBack,
  disableNext,
}: {
  nextLabel: string;
  backLabel?: string;
  pending: boolean;
  onNext: () => void;
  onBack?: () => void;
  disableNext?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-white/60 dark:hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden /> {backLabel}
        </button>
      ) : (
        <span />
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={pending || disableNext}
        className="inline-flex items-center gap-2 rounded-full bg-brandHealth-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brandHealth-700 disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {nextLabel}
        {!pending && <ChevronRight className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );
}
