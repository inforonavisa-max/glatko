"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Check } from "lucide-react";

import { saveSettings } from "@/app/[locale]/health-pro/actions";
import { settingsSchema, SLOT_GRID_VALUES } from "@/lib/saglik/provider-validation";
import type { OwnProviderSettings } from "@/lib/saglik/provider";

/**
 * Glatko Sağlık — provider scheduling settings (H7a /ayarlar). Drives
 * health.provider_settings: buffer / min-notice / horizon / daily cap / slot grid.
 * These feed the availability engine (lib/saglik/availability.ts). Mobile-first.
 */
const DEFAULTS: OwnProviderSettings = {
  bufferMin: 0,
  minNoticeMin: 120,
  horizonDays: 60,
  dailyCap: null,
  slotGridMin: 15,
};

export function ProviderSettingsForm({
  initialSettings,
}: {
  initialSettings: OwnProviderSettings | null;
}) {
  const t = useTranslations("healthVertical");
  const s = (k: string) => t(`pro.settings.${k}`);
  const [pending, startTransition] = useTransition();

  const base = initialSettings ?? DEFAULTS;
  const [bufferMin, setBufferMin] = useState(base.bufferMin);
  const [minNoticeMin, setMinNoticeMin] = useState(base.minNoticeMin);
  const [horizonDays, setHorizonDays] = useState(base.horizonDays);
  const [dailyCap, setDailyCap] = useState<number | "">(base.dailyCap ?? "");
  const [slotGridMin, setSlotGridMin] = useState(base.slotGridMin);

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function submit() {
    setError(null);
    setSaved(false);
    const payload = {
      bufferMin: Number(bufferMin),
      minNoticeMin: Number(minNoticeMin),
      horizonDays: Number(horizonDays),
      dailyCap: dailyCap === "" ? null : Number(dailyCap),
      slotGridMin: Number(slotGridMin),
    };
    const parsed = settingsSchema.safeParse(payload);
    if (!parsed.success) {
      setError(s("invalid"));
      return;
    }
    startTransition(async () => {
      const res = await saveSettings(parsed.data);
      if (res.ok) {
        setSaved(true);
      } else {
        setError(res.error === "NOT_A_PROVIDER" ? s("noProviderTitle") : s("saveError"));
      }
    });
  }

  const fieldCls =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brandHealth focus:outline-none focus:ring-1 focus:ring-brandHealth dark:border-white/10 dark:bg-white/5 dark:text-white";
  const labelCls = "block text-sm font-medium text-gray-700 dark:text-white/70";
  const hintCls = "mt-1 text-xs text-gray-500 dark:text-white/40";

  return (
    <div>
      <h1 className="font-serif text-2xl font-light tracking-tight text-gray-900 dark:text-white">
        {s("title")}
      </h1>
      <p className="mt-1 text-sm text-gray-600 dark:text-white/60">{s("subtitle")}</p>

      <div className="mt-6 space-y-5 rounded-2xl border border-gray-200 bg-white/70 p-5 dark:border-white/10 dark:bg-white/5">
        <div>
          <label className={labelCls} htmlFor="slotGrid">
            {s("slotGrid")}
          </label>
          <select
            id="slotGrid"
            className={fieldCls + " mt-1"}
            value={slotGridMin}
            onChange={(e) => setSlotGridMin(Number(e.target.value))}
          >
            {SLOT_GRID_VALUES.map((v) => (
              <option key={v} value={v}>
                {s("minutes").replace("{n}", String(v))}
              </option>
            ))}
          </select>
          <p className={hintCls}>{s("slotGridHint")}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="buffer">
              {s("buffer")}
            </label>
            <input
              id="buffer"
              type="number"
              min={0}
              max={240}
              className={fieldCls + " mt-1"}
              value={bufferMin}
              onChange={(e) => setBufferMin(Number(e.target.value))}
            />
            <p className={hintCls}>{s("bufferHint")}</p>
          </div>
          <div>
            <label className={labelCls} htmlFor="notice">
              {s("minNotice")}
            </label>
            <input
              id="notice"
              type="number"
              min={0}
              className={fieldCls + " mt-1"}
              value={minNoticeMin}
              onChange={(e) => setMinNoticeMin(Number(e.target.value))}
            />
            <p className={hintCls}>{s("minNoticeHint")}</p>
          </div>
          <div>
            <label className={labelCls} htmlFor="horizon">
              {s("horizon")}
            </label>
            <input
              id="horizon"
              type="number"
              min={1}
              max={180}
              className={fieldCls + " mt-1"}
              value={horizonDays}
              onChange={(e) => setHorizonDays(Number(e.target.value))}
            />
            <p className={hintCls}>{s("horizonHint")}</p>
          </div>
          <div>
            <label className={labelCls} htmlFor="cap">
              {s("dailyCap")}
            </label>
            <input
              id="cap"
              type="number"
              min={1}
              max={200}
              placeholder={s("dailyCapPlaceholder")}
              className={fieldCls + " mt-1"}
              value={dailyCap}
              onChange={(e) =>
                setDailyCap(e.target.value === "" ? "" : Number(e.target.value))
              }
            />
            <p className={hintCls}>{s("dailyCapHint")}</p>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
        {saved && !error && (
          <p className="inline-flex items-center gap-1.5 text-sm text-brandHealth-700 dark:text-brandHealth">
            <Check className="h-4 w-4" aria-hidden /> {s("saved")}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-full bg-brandHealth-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brandHealth-700 disabled:opacity-60"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {s("save")}
        </button>
      </div>
    </div>
  );
}
