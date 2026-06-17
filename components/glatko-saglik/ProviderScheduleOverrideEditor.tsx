"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus, Trash2, Check } from "lucide-react";

import { saveOverride, removeOverride } from "@/app/[locale]/saglik-pro/actions";
import { overrideSchema, OVERRIDE_KINDS, type OverrideKind } from "@/lib/saglik/provider-validation";
import type { ProviderOverride } from "@/lib/saglik/provider";
import { intlLocale } from "@/lib/saglik/intl";
import type { Locale } from "@/i18n/routing";

/**
 * Glatko Sağlık — H7b schedule override editor (holiday / break / extra). Mirrors
 * WeeklyScheduleEditor's mobile-first stacked-card structure: an "add" form (date +
 * kind + optional start/end) and a list of existing overrides with delete. Each save/
 * delete goes through the owner-checked server action via useTransition. holiday needs
 * no times; break/extra require start<end (client overrideSchema gates before the RPC).
 */

type Draft = {
  date: string;
  kind: OverrideKind;
  startTime: string;
  endTime: string;
};

function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Podgorica" }).format(new Date());
}

export function ProviderScheduleOverrideEditor({
  locale,
  initialOverrides,
}: {
  locale: Locale;
  initialOverrides: ProviderOverride[];
}) {
  const t = useTranslations("healthVertical");
  const o = (k: string) => t(`pro.override.${k}`);
  const [pending, startTransition] = useTransition();

  const [items, setItems] = useState<ProviderOverride[]>(initialOverrides);
  const [draft, setDraft] = useState<Draft>({
    date: todayLocal(),
    kind: "holiday",
    startTime: "09:00",
    endTime: "13:00",
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function add() {
    setError(null);
    setSaved(false);
    const payload = {
      date: draft.date,
      kind: draft.kind,
      startTime: draft.kind === "holiday" ? null : draft.startTime,
      endTime: draft.kind === "holiday" ? null : draft.endTime,
    };
    const parsed = overrideSchema.safeParse(payload);
    if (!parsed.success) {
      setError(o("invalid"));
      return;
    }
    startTransition(async () => {
      const res = await saveOverride(parsed.data);
      if (!res.ok) {
        setError(res.error === "OVERRIDE_INVALID" ? o("invalid") : o("saveError"));
        return;
      }
      setItems((prev) =>
        [
          ...prev,
          {
            id: res.overrideId,
            date: payload.date,
            kind: payload.kind,
            startTime: payload.startTime,
            endTime: payload.endTime,
          },
        ].sort((a, b) => a.date.localeCompare(b.date)),
      );
      setSaved(true);
    });
  }

  function del(id: string) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await removeOverride(id);
      if (!res.ok) {
        setError(o("deleteError"));
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
    });
  }

  const fieldCls =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brandHealth focus:outline-none focus:ring-1 focus:ring-brandHealth dark:border-white/10 dark:bg-white/5 dark:text-white";
  const labelCls = "block text-sm font-medium text-gray-700 dark:text-white/70";

  const dateLabel = (d: string) =>
    new Intl.DateTimeFormat(intlLocale(locale), {
      timeZone: "Europe/Podgorica",
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(`${d}T12:00:00Z`));

  return (
    <div>
      <h1 className="font-serif text-2xl font-light tracking-tight text-gray-900 dark:text-white">
        {o("title")}
      </h1>
      <p className="mt-1 text-sm text-gray-600 dark:text-white/60">{o("subtitle")}</p>

      {/* Add form */}
      <div className="mt-5 rounded-2xl border border-gray-200 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="ov-date">
              {o("date")}
            </label>
            <input
              id="ov-date"
              type="date"
              min={todayLocal()}
              className={fieldCls + " mt-1"}
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="ov-kind">
              {o("kind")}
            </label>
            <select
              id="ov-kind"
              className={fieldCls + " mt-1"}
              value={draft.kind}
              onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as OverrideKind }))}
            >
              {OVERRIDE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {o(`kindLabel.${k}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {draft.kind !== "holiday" && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="ov-start">
                {o("startTime")}
              </label>
              <input
                id="ov-start"
                type="time"
                className={fieldCls + " mt-1"}
                value={draft.startTime}
                onChange={(e) => setDraft((d) => ({ ...d, startTime: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="ov-end">
                {o("endTime")}
              </label>
              <input
                id="ov-end"
                type="time"
                className={fieldCls + " mt-1"}
                value={draft.endTime}
                onChange={(e) => setDraft((d) => ({ ...d, endTime: e.target.value }))}
              />
            </div>
          </div>
        )}

        <p className="mt-2 text-xs text-gray-500 dark:text-white/40">{o(`hint.${draft.kind}`)}</p>

        {error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
        {saved && !error && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-brandHealth-700 dark:text-brandHealth">
            <Check className="h-4 w-4" aria-hidden /> {o("saved")}
          </p>
        )}

        <button
          type="button"
          onClick={add}
          disabled={pending}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-brandHealth-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brandHealth-700 disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
          {o("add")}
        </button>
      </div>

      {/* Existing overrides */}
      <div className="mt-6 space-y-2">
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 bg-white/40 p-6 text-center text-sm text-gray-400 dark:border-white/10 dark:bg-white/5 dark:text-white/30">
            {o("empty")}
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/5"
            >
              <KindBadge kind={item.kind} label={o(`kindLabel.${item.kind}`)} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                  {dateLabel(item.date)}
                </p>
                {item.kind !== "holiday" && item.startTime && item.endTime && (
                  <p className="text-xs text-gray-500 dark:text-white/50">
                    <bdi>
                      {item.startTime} – {item.endTime}
                    </bdi>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => del(item.id)}
                disabled={pending}
                aria-label={o("delete")}
                className="ml-auto rounded-full p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function KindBadge({ kind, label }: { kind: OverrideKind; label: string }) {
  const cls: Record<OverrideKind, string> = {
    holiday: "bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300",
    break: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
    extra: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
  };
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls[kind]}`}>
      {label}
    </span>
  );
}
