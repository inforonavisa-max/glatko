"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  removeProAction,
  restoreProAction,
} from "@/app/[locale]/admin/professionals/actions";

interface Props {
  professionalId: string;
  businessName: string;
  isActive: boolean;
}

/**
 * Sprint B2 — detail-page quick action to soft-remove (is_active=false) or
 * restore (is_active=true) a pro. Calls the same RPC the edit form uses, so
 * the two surfaces stay consistent. Mirrors AdminActions' client pattern.
 */
export function ProActiveToggle({
  professionalId,
  businessName,
  isActive,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRemove() {
    if (
      !window.confirm(
        t("admin.professionals.removeProConfirmBody", { name: businessName }),
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await removeProAction(professionalId);
      if (res.ok) {
        toast.success(t("admin.professionals.removeProSuccess"));
        router.refresh();
      } else {
        toast.error(res.error ?? t("admin.professionals.removeProError"));
      }
    });
  }

  function handleRestore() {
    startTransition(async () => {
      const res = await restoreProAction(professionalId);
      if (res.ok) {
        toast.success(t("admin.professionals.restoreProSuccess"));
        router.refresh();
      } else {
        toast.error(res.error ?? t("admin.professionals.restoreProError"));
      }
    });
  }

  if (isActive) {
    return (
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        type="button"
        disabled={isPending}
        onClick={handleRemove}
        className="w-full rounded-lg border border-red-300 px-5 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
      >
        {isPending ? t("common.loading") : t("admin.professionals.removePro")}
      </motion.button>
    );
  }

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      type="button"
      disabled={isPending}
      onClick={handleRestore}
      className="w-full rounded-lg bg-gradient-to-r from-green-500 to-green-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {isPending ? t("common.loading") : t("admin.professionals.restorePro")}
    </motion.button>
  );
}
