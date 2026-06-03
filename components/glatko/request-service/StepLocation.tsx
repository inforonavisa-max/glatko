"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Zap, CalendarDays, Clock, CalendarSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { CITY_KEYS } from "@/lib/glatko/cities";

interface Props {
  municipality: string;
  setMunicipality: (v: string) => void;
  address: string;
  setAddress: (v: string) => void;
  marina: string;
  setMarina: (v: string) => void;
  urgency: string;
  setUrgency: (v: string) => void;
  dateStart: string;
  setDateStart: (v: string) => void;
  dateEnd: string;
  setDateEnd: (v: string) => void;
  showMarina: boolean;
  t: (key: string) => string;
}

const inputCls = cn(
  "block w-full rounded-xl border border-gray-200 dark:border-white/[0.08]",
  "bg-gray-50/50 dark:bg-white/[0.03] px-4 py-3 text-sm",
  "text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30",
  "focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
);

// i18n keys from the single source of truth (lib/glatko/cities.ts). The stored
// municipality value stays the city key (unchanged behaviour), now covering all
// 25 municipalities. MARINA_OPTIONS below is unrelated and left untouched.
const CITY_SLUGS = CITY_KEYS;

const MARINA_OPTIONS = [
  "Porto Montenegro",
  "Marina Budva",
  "Marina Bar",
  "Lazure Marina",
  "Marina Kotor",
] as const;

/** Values must match DB + zod: asap | this_week | flexible | specific_date */
const URGENCY_OPTIONS = [
  { value: "asap", labelKey: "urgent48h", icon: Zap },
  { value: "this_week", labelKey: "thisWeek", icon: CalendarDays },
  { value: "flexible", labelKey: "flexible", icon: Clock },
  { value: "specific_date", labelKey: "specificDate", icon: CalendarSearch },
] as const;

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/50">
      {children}
    </label>
  );
}

export function StepLocation({
  municipality,
  setMunicipality,
  address,
  setAddress,
  marina,
  setMarina,
  urgency,
  setUrgency,
  dateStart,
  setDateStart,
  dateEnd,
  setDateEnd,
  showMarina,
  t,
}: Props) {
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
        {t("request.step3.title")}
      </h2>
      <p className="mb-6 text-sm text-gray-500 dark:text-white/50">
        {t("request.step3.subtitle")}
      </p>

      <div className="space-y-6">
        <div>
          <FieldLabel>{t("request.step3.city")}</FieldLabel>
          <select
            value={municipality}
            onChange={(e) => setMunicipality(e.target.value)}
            className={inputCls}
          >
            <option value="">{t("request.step3.selectCity")}</option>
            {CITY_SLUGS.map((slug) => (
              <option key={slug} value={slug}>
                {t(`cities.${slug}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <FieldLabel>{t("request.step3.address")}</FieldLabel>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t("request.step3.addressPlaceholder")}
            rows={2}
            className={cn(inputCls, "resize-none")}
          />
        </div>

        {showMarina && (
          <div>
            <FieldLabel>{t("request.step3.marina")}</FieldLabel>
            <select
              value={marina}
              onChange={(e) => setMarina(e.target.value)}
              className={inputCls}
            >
              <option value="">{t("request.step3.selectMarina")}</option>
              {MARINA_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        )}

        {/* ── Urgency cards — glassmorphism grid adapted from kit pricing Card pattern ── */}
        <div>
          <FieldLabel>{t("request.step3.urgencyLabel")}</FieldLabel>
          <div className="grid grid-cols-2 gap-3">
            {URGENCY_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelected = urgency === opt.value;
              return (
                <motion.button
                  key={opt.value}
                  type="button"
                  onClick={() => setUrgency(opt.value)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    "group relative flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all duration-200",
                    isSelected
                      ? "border-teal-500/50 bg-teal-500/[0.04] shadow-md shadow-teal-500/10 dark:border-teal-500/40 dark:bg-teal-500/[0.06]"
                      : "border-gray-200/60 bg-white/40 hover:border-teal-400/30 dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-teal-500/20"
                  )}
                >
                  <div className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                    isSelected ? "bg-teal-500/15 dark:bg-teal-500/20" : "bg-gray-100 dark:bg-white/[0.06]"
                  )}>
                    <Icon className={cn("h-5 w-5", isSelected ? "text-teal-600 dark:text-teal-400" : "text-gray-400 dark:text-white/40")} />
                  </div>
                  <span className={cn(
                    "text-xs font-semibold",
                    isSelected ? "text-teal-700 dark:text-teal-300" : "text-gray-600 dark:text-white/60"
                  )}>
                    {t(`request.step3.urgency.${opt.labelKey}`)}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>

        <AnimatePresence>
          {urgency === "specific_date" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>{t("request.step3.dateStart")}</FieldLabel>
                  <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <FieldLabel>{t("request.step3.dateEnd")}</FieldLabel>
                  <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} className={inputCls} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
