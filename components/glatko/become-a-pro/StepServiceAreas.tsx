"use client";

import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { SpotlightCard } from "@/components/landing/spotlight-card";
import { cn } from "@/lib/utils";
import { resolveIcon } from "@/lib/utils/categoryIcon";
import type { ServiceCategory, MultiLangText } from "@/types/glatko";
import type { Locale } from "@/i18n/routing";
import type { useTranslations } from "next-intl";

const MAX_ROOT_CATEGORIES = 6;
const MAX_SUBS_PER_ROOT = 10;

function categoryLabel(cat: ServiceCategory, locale: Locale): string {
  const n = cat.name as MultiLangText;
  return (
    n[locale] ??
    n.en ??
    n.tr ??
    (Object.values(n).find((v) => typeof v === "string") as
      | string
      | undefined) ??
    cat.slug
  );
}

const labelCls = "text-xs font-medium text-gray-500 dark:text-white/50 mb-1.5";

export interface StepServiceAreasProps {
  parents: ServiceCategory[];
  childrenOf: (parentId: string) => ServiceCategory[];
  allCategories: ServiceCategory[];
  selectedCategoryIds: string[];
  toggleCategory: (id: string) => void;
  primaryCategoryId: string;
  setPrimaryCategoryId: (id: string) => void;
  expandedParent: string | null;
  setExpandedParent: (id: string | null) => void;
  locale: Locale;
  t: ReturnType<typeof useTranslations>;
}

export function StepServiceAreas({
  parents,
  childrenOf,
  allCategories,
  selectedCategoryIds,
  toggleCategory,
  primaryCategoryId,
  setPrimaryCategoryId,
  expandedParent,
  setExpandedParent,
  locale,
  t,
}: StepServiceAreasProps) {
  function rootIdOf(catId: string): string | null {
    const c = allCategories.find((x) => x.id === catId);
    return c?.parent_id ?? c?.id ?? null;
  }

  const activeRootIds = new Set<string>();
  for (const id of selectedCategoryIds) {
    const r = rootIdOf(id);
    if (r) activeRootIds.add(r);
  }

  function gatedToggle(subId: string, parentId: string) {
    const isSelected = selectedCategoryIds.includes(subId);
    if (isSelected) {
      toggleCategory(subId);
      return;
    }

    const subsInThisRoot = selectedCategoryIds.filter(
      (id) => rootIdOf(id) === parentId,
    ).length;
    if (subsInThisRoot >= MAX_SUBS_PER_ROOT) {
      toast.error(
        t("becomePro.serviceAreas.maxSubsExceeded", {
          max: MAX_SUBS_PER_ROOT,
        }),
      );
      return;
    }

    if (
      !activeRootIds.has(parentId) &&
      activeRootIds.size >= MAX_ROOT_CATEGORIES
    ) {
      toast.error(
        t("becomePro.serviceAreas.maxRootsExceeded", {
          max: MAX_ROOT_CATEGORIES,
        }),
      );
      return;
    }

    toggleCategory(subId);
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
        {t("pro.wizard.step2Title")}
      </h2>
      <p className="text-sm text-gray-500 dark:text-white/50">
        {t("pro.wizard.step2Desc")}
      </p>

      <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 px-4 py-2.5 text-xs text-teal-700 dark:text-teal-300">
        {t("becomePro.serviceAreas.limitsHint", {
          maxRoots: MAX_ROOT_CATEGORIES,
          maxSubs: MAX_SUBS_PER_ROOT,
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {parents.map((cat) => {
          const children = childrenOf(cat.id);
          const isExpanded = expandedParent === cat.id;
          const hasSelected = children.some((c) =>
            selectedCategoryIds.includes(c.id)
          );

          return (
            <SpotlightCard
              key={cat.id}
              className={cn(
                "cursor-pointer !p-0",
                hasSelected && "ring-2 ring-teal-500/40"
              )}
            >
              <div
                className="p-5"
                onClick={() =>
                  setExpandedParent(isExpanded ? null : cat.id)
                }
              >
                <div className="flex items-center gap-3">
                  {(() => {
                    const Icon = resolveIcon(cat.icon);
                    return (
                      <Icon
                        className="h-5 w-5 shrink-0 text-teal-500"
                        aria-hidden
                      />
                    );
                  })()}
                  <span className="font-medium text-gray-900 dark:text-white">
                    {categoryLabel(cat, locale)}
                  </span>
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && children.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden border-t border-gray-100 dark:border-white/5"
                  >
                    <div className="space-y-2 p-5 pt-4">
                      {children.map((sub) => {
                        const checked = selectedCategoryIds.includes(sub.id);
                        return (
                          <label
                            key={sub.id}
                            className="flex items-center gap-3 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => gatedToggle(sub.id, cat.id)}
                              className="h-4 w-4 rounded border-gray-300 text-teal-500 focus:ring-teal-500/30"
                            />
                            <span className="text-gray-700 dark:text-white/70">
                              {categoryLabel(sub, locale)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </SpotlightCard>
          );
        })}
      </div>

      {selectedCategoryIds.length > 0 && (
        <div>
          <label className={labelCls}>{t("pro.wizard.primaryService")}</label>
          <div className="mt-2 space-y-2">
            {selectedCategoryIds.map((id) => {
              const cat = allCategories.find((c) => c.id === id);
              if (!cat) return null;
              return (
                <label key={id} className="flex items-center gap-3 text-sm">
                  <input
                    type="radio"
                    name="primary"
                    checked={primaryCategoryId === id}
                    onChange={() => setPrimaryCategoryId(id)}
                    className="h-4 w-4 border-gray-300 text-teal-500 focus:ring-teal-500/30"
                  />
                  <span className="text-gray-700 dark:text-white/70">
                    {categoryLabel(cat, locale)}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
