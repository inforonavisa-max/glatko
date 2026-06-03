"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createProfileFieldsSchema,
  type ProfileFormValues,
} from "@/lib/validations/profile";
import type { UserProfileRow } from "@/lib/actions/profile";
import { updateProfile } from "@/lib/actions/profile";
import { GLATKO_CITIES } from "@/lib/glatko/cities";
import { AvatarUpload } from "@/components/settings/AvatarUpload";
import { LanguageSelector } from "@/components/settings/LanguageSelector";
import { Link } from "@/i18n/navigation";
import { PasswordChangeModal } from "@/components/settings/PasswordChangeModal";
import { DeactivateModal } from "@/components/settings/DeactivateModal";
import { DeleteAccountModal } from "@/components/settings/DeleteAccountModal";

// Sourced from the single source of truth (lib/glatko/cities.ts) so this list
// stays in sync everywhere. Shape kept as { value, cityKey } so the render and
// cityFieldToSelect below are unchanged; the free-text "other" sentinel is
// preserved as the final option.
const CITY_VALUES: { value: string; cityKey: string }[] = [
  ...GLATKO_CITIES.map((c) => ({ value: c.name, cityKey: c.key })),
  { value: "__other__", cityKey: "other" },
];

const inputCls = cn(
  "block w-full rounded-xl border border-gray-200 dark:border-white/10",
  "bg-white px-4 py-3 text-sm dark:bg-white/5",
  "text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30",
  "focus:border-teal-500 focus:ring-2 focus:ring-teal-500/50 focus:outline-none"
);

const glassCard = cn(
  "rounded-2xl border border-gray-200/50 bg-white/70 p-6 shadow-xl backdrop-blur-sm",
  "dark:border-white/[0.08] dark:bg-white/[0.03]"
);

type ProfileFormProps = {
  initialProfile: UserProfileRow;
  email: string;
};

function cityFieldToSelect(city: string | null | undefined): string {
  if (!city) return "";
  const known = CITY_VALUES.find((x) => x.value === city);
  if (known) return known.value;
  return "__other__";
}

export function ProfileForm({ initialProfile, email }: ProfileFormProps) {
  const t = useTranslations("settings.profile");
  const tp = useTranslations("settings.profile.personal");
  const tCities = useTranslations("cities");
  const tVal = useTranslations("validation");
  const router = useRouter();
  const [pwdOpen, setPwdOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const defaultValues = useMemo<ProfileFormValues>(
    () => ({
      full_name: initialProfile.full_name ?? "",
      phone: initialProfile.phone ?? "",
      city: initialProfile.city ?? "",
      bio: initialProfile.bio ?? "",
    }),
    [initialProfile]
  );

  const profileSchema = useMemo(
    () => createProfileFieldsSchema((key, values) => tVal(key, values)),
    [tVal],
  );

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues,
  });

  const { isDirty, isSubmitting } = form.formState;

  useEffect(() => {
    form.reset({
      full_name: initialProfile.full_name ?? "",
      phone: initialProfile.phone ?? "",
      city: initialProfile.city ?? "",
      bio: initialProfile.bio ?? "",
    });
  }, [initialProfile.full_name, initialProfile.phone, initialProfile.city, initialProfile.bio, form]);

  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [isDirty]);

  async function onSubmit(values: ProfileFormValues) {
    const fd = new FormData();
    fd.append("full_name", values.full_name);
    fd.append("phone", values.phone ?? "");
    const cityVal = values.city.trim() === "" ? "" : values.city;
    fd.append("city", cityVal);
    fd.append("bio", values.bio ?? "");

    const res = await updateProfile(fd);
    if ("error" in res && res.error) {
      if (typeof res.error === "object" && res.error !== null && !Array.isArray(res.error)) {
        const fe = res.error as Record<string, string[] | undefined>;
        if (fe.full_name?.length) form.setError("full_name", { message: fe.full_name[0] });
        if (fe.phone?.length) form.setError("phone", { message: fe.phone[0] });
        if (fe.city?.length) form.setError("city", { message: fe.city[0] });
        if (fe.bio?.length) form.setError("bio", { message: fe.bio[0] });
        toast.error(tp("saveError"));
      } else {
        toast.error(tp("saveError"));
      }
      return;
    }
    toast.success(tp("saveSuccess"));
    form.reset(values);
    router.refresh();
  }

  const watchedCity = form.watch("city");
  const citySelect = cityFieldToSelect(watchedCity);

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 pb-24 pt-28 sm:px-6">
      <div className={glassCard}>
        <h1 className="font-serif text-2xl font-semibold text-gray-900 dark:text-white">
          {t("title")}
        </h1>
        <div className="mt-2 h-0.5 w-16 rounded-full bg-gradient-to-r from-teal-500 to-teal-600" />

        <div className="mt-8">
          <h2 className="mb-4 text-center font-serif text-base font-semibold text-gray-800 dark:text-white/90">
            {t("avatar.title")}
          </h2>
          <AvatarUpload
            displayName={form.watch("full_name") || initialProfile.full_name}
            email={email}
            avatarUrl={initialProfile.avatar_url}
          />
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className={cn(glassCard, "space-y-4")}>
        <h2 className="font-serif text-lg font-semibold text-gray-900 dark:text-white">
          {tp("title")}
        </h2>
        <div className="h-0.5 w-16 rounded-full bg-gradient-to-r from-teal-500 to-teal-600" />

        {isDirty && (
          <p className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100">
            {t("unsavedHint")}
          </p>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-white/50">
            {tp("fullName")} *
          </label>
          <input
            className={inputCls}
            placeholder={tp("fullNamePlaceholder")}
            {...form.register("full_name")}
          />
          {form.formState.errors.full_name && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {form.formState.errors.full_name.message}
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-white/50">
            {tp("email")}
          </label>
          <input className={cn(inputCls, "cursor-not-allowed opacity-60")} value={email} disabled readOnly />
          <p className="mt-1 text-xs text-gray-500 dark:text-white/40">{tp("emailHint")}</p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-white/50">
            {tp("phone")}
          </label>
          <input
            className={inputCls}
            type="tel"
            {...form.register("phone")}
            placeholder={tp("phonePlaceholder")}
          />
          {form.formState.errors.phone && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {form.formState.errors.phone.message}
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-white/50">
            {tp("city")}
          </label>
          <select
            className={inputCls}
            value={citySelect}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__other__") {
                form.setValue("city", "Other", { shouldDirty: true });
              } else if (v === "") {
                form.setValue("city", "", { shouldDirty: true });
              } else {
                form.setValue("city", v, { shouldDirty: true });
              }
            }}
          >
            <option value="">{tp("cityPlaceholder")}</option>
            {CITY_VALUES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.cityKey === "other" ? tp("cityOther") : tCities(c.cityKey as never)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-white/50">
            {tp("bio")}
          </label>
          <textarea
            className={cn(inputCls, "min-h-[120px] resize-y")}
            maxLength={500}
            {...form.register("bio")}
            placeholder={tp("bioPlaceholder")}
          />
          <div className="mt-1 flex justify-between text-xs text-gray-400 dark:text-white/35">
            <span>{tp("bioHint")}</span>
            <span>{(form.watch("bio") ?? "").length}/500</span>
          </div>
          {form.formState.errors.bio && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {form.formState.errors.bio.message}
            </p>
          )}
        </div>

        <div className="border-t border-gray-200/60 pt-6 dark:border-white/[0.08]">
          <LanguageSelector value={initialProfile.preferred_locale ?? "tr"} />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !isDirty}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 py-3.5 text-sm font-medium text-white shadow-lg shadow-teal-500/25 transition-opacity disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {tp("saving")}
            </>
          ) : (
            tp("save")
          )}
        </button>
      </form>

      <div className={glassCard}>
        <h2 className="font-serif text-lg font-semibold text-gray-900 dark:text-white">
          {t("notifications.title")}
        </h2>
        <div className="mt-2 h-0.5 w-16 rounded-full bg-gradient-to-r from-teal-500 to-teal-600" />
        <p className="mt-3 text-sm text-gray-600 dark:text-white/55">
          {t("notifications.manageHint")}
        </p>
        <Link
          href="/settings/notifications"
          className="mt-4 inline-flex items-center justify-center rounded-xl bg-teal-500/10 px-4 py-2.5 text-sm font-medium text-teal-700 transition-colors hover:bg-teal-500/15 dark:text-teal-300 dark:hover:bg-teal-500/20"
        >
          {t("notifications.manageLink")}
        </Link>
      </div>

      <div className={glassCard}>
        <h2 className="font-serif text-lg font-semibold text-gray-900 dark:text-white">
          {t("account.title")}
        </h2>
        <div className="mt-2 h-0.5 w-16 rounded-full bg-gradient-to-r from-teal-500 to-teal-600" />
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => setPwdOpen(true)}
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-gray-100 px-4 py-3 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/[0.14] sm:flex-none"
          >
            {t("account.changePassword.button")}
          </button>
          <button
            type="button"
            onClick={() => setDeactivateOpen(true)}
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-amber-300 px-4 py-3 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50 dark:border-amber-500/35 dark:text-amber-200 dark:hover:bg-amber-500/10 sm:flex-none"
          >
            {t("account.deactivate.button")}
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-red-500 to-red-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-red-500/25 sm:flex-none"
          >
            {t("account.delete.button")}
          </button>
        </div>
      </div>

      <PasswordChangeModal open={pwdOpen} onOpenChange={setPwdOpen} />
      <DeactivateModal open={deactivateOpen} onOpenChange={setDeactivateOpen} />
      <DeleteAccountModal open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  );
}
