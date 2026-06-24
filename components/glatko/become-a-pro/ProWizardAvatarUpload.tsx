"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Loader2, AlertCircle, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateAvatar } from "@/lib/actions/profile";

const AVATAR_MAX = 5 * 1024 * 1024;
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

function initials(name: string | null, email: string) {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    const a = parts[0]?.[0] ?? "";
    const b = parts[1]?.[0] ?? "";
    return (a + b).toUpperCase() || a.toUpperCase();
  }
  return email[0]?.toUpperCase() ?? "?";
}

type Props = {
  displayName: string | null;
  email: string;
  initialUrl: string | null;
  onUrlChange: (url: string) => void;
};

export function ProWizardAvatarUpload({
  displayName,
  email,
  initialUrl,
  onUrlChange,
}: Props) {
  const t = useTranslations("pro.wizard");
  const tAvatar = useTranslations("settings.profile.avatar");
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Single-step: picking a file uploads immediately. The old two-step
  // (pick → preview → separate "Upload" button) stranded users who saw the
  // preview, assumed it was done, and hit a disabled "Next" — the avatar
  // never persisted (G-FUNNEL root cause).
  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!AVATAR_TYPES.includes(file.type)) {
      setError(tAvatar("uploadError"));
      toast.error(tAvatar("uploadError"));
      return;
    }
    if (file.size > AVATAR_MAX) {
      setError(tAvatar("maxSize"));
      toast.error(tAvatar("maxSize"));
      return;
    }

    setError(null);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    const fd = new FormData();
    fd.append("avatar", file);
    startTransition(async () => {
      const res = await updateAvatar(fd);
      URL.revokeObjectURL(objectUrl);
      setPreview(null);
      if ("error" in res && res.error) {
        const msg =
          res.error === "file_too_large"
            ? tAvatar("maxSize")
            : tAvatar("uploadError");
        setError(msg);
        toast.error(msg);
        return;
      }
      if ("success" in res && res.success && "url" in res && res.url) {
        setError(null);
        toast.success(tAvatar("uploadSuccess"));
        onUrlChange(res.url);
        router.refresh();
      }
    });
  }

  const showUrl = preview ?? initialUrl ?? null;
  const hasAvatar = Boolean((preview ?? initialUrl)?.trim());

  return (
    <div className="rounded-2xl border border-gray-200/80 bg-gray-50/50 p-5 dark:border-white/[0.08] dark:bg-white/[0.03]">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
        {t("avatarTitle")}
      </h3>
      <p className="mt-1 text-xs text-gray-500 dark:text-white/45">
        {t("avatarHint")}
      </p>

      <div className="mt-4 flex flex-col items-center sm:flex-row sm:items-start sm:gap-6">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-4 border-white/20 bg-teal-500/20 dark:border-white/10">
          {showUrl ? (
            <Image
              src={showUrl}
              alt={t("avatarTitle")}
              width={96}
              height={96}
              className="h-full w-full object-cover"
              unoptimized={
                showUrl.includes("supabase") || showUrl.startsWith("blob:")
              }
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-teal-700 dark:text-teal-300">
              {initials(displayName, email)}
            </div>
          )}
          {pending && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="h-6 w-6 animate-spin text-white" aria-hidden />
            </div>
          )}
        </div>

        <div className="mt-4 flex w-full min-w-0 flex-1 flex-col items-center sm:mt-0 sm:items-stretch">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onFilePick}
            disabled={pending}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
            className={cn(
              "inline-flex items-center justify-center gap-2 self-center rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2 text-xs font-medium text-white shadow-lg shadow-teal-500/25 transition-opacity sm:self-start",
              "disabled:opacity-60",
            )}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Camera className="h-4 w-4" aria-hidden />
            )}
            {hasAvatar ? tAvatar("upload") : tAvatar("chooseFile")}
          </button>

          {!hasAvatar && !pending && (
            <p className="mt-2 text-center text-xs font-medium text-amber-700 dark:text-amber-400 sm:text-left">
              {t("avatarNudge")}
            </p>
          )}

          {error && (
            <p className="mt-2 flex items-center gap-1.5 text-center text-xs font-medium text-red-600 dark:text-red-400 sm:text-left">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
