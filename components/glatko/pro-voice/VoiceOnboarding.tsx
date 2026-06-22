"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { Mic, Square, Upload, Image as ImageIcon, X, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { VoiceDraftResult } from "@/lib/pro-voice/types";

const MAX_SECONDS = 120;
const MAX_PHOTOS = 5;
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface PhotoItem {
  file: File;
  preview: string;
}

/** Feature-detect the best supported recorder mime (spec §4b chain). */
function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return "";
}

function extFor(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("mpeg")) return "mp3";
  return "webm";
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VoiceOnboarding({
  onDraft,
  onFallbackToManual,
}: {
  onDraft: (result: VoiceDraftResult) => void;
  onFallbackToManual: () => void;
}) {
  const t = useTranslations("pro.voice");

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    stopTimer();
    setRecording(false);
  }, [stopTimer]);

  const startRecording = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error(t("error.micUnavailable"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMimeType();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const file = new File([blob], `voice-note.${extFor(type)}`, { type });
        setAudioFile(file);
        releaseStream();
      };
      recorderRef.current = rec;
      rec.start();
      setAudioFile(null);
      setSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) {
            stopRecording();
            return MAX_SECONDS;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      releaseStream();
      toast.error(t("error.micDenied"));
    }
  }, [t, releaseStream, stopRecording]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stopTimer();
      releaseStream();
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAudioUpload = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      if (!f.type.startsWith("audio/")) {
        toast.error(t("error.notAudio"));
        return;
      }
      if (f.size > 20 * 1024 * 1024) {
        toast.error(t("error.tooLong"));
        return;
      }
      setAudioFile(f);
      setSeconds(0);
    },
    [t],
  );

  const onPhotosAdd = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = "";
      setPhotos((prev) => {
        const next = [...prev];
        for (const f of files) {
          if (next.length >= MAX_PHOTOS) {
            toast.error(t("error.tooManyPhotos", { max: MAX_PHOTOS }));
            break;
          }
          if (!PHOTO_TYPES.includes(f.type)) {
            toast.error(t("error.invalidPhoto"));
            continue;
          }
          if (f.size > PHOTO_MAX_BYTES) {
            toast.error(t("error.photoTooLarge"));
            continue;
          }
          next.push({ file: f, preview: URL.createObjectURL(f) });
        }
        return next;
      });
    },
    [t],
  );

  const removePhoto = useCallback((idx: number) => {
    setPhotos((prev) => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const submit = useCallback(async () => {
    if (!audioFile) {
      toast.error(t("error.noAudio"));
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("audio", audioFile);
      photos.forEach((p) => fd.append("photos", p.file));
      const res = await fetch("/api/pro-onboarding/voice", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        // Pipeline / availability failures → graceful fallback to the manual form.
        const code = res.status;
        if (code === 503 || code === 500) {
          toast.error(t("error.generic"));
          onFallbackToManual();
        } else if (code === 413) {
          toast.error(t("error.tooLong"));
        } else if (code === 409) {
          toast.error(t("error.alreadyPro"));
        } else {
          toast.error(t("error.generic"));
        }
        return;
      }
      const data = (await res.json()) as VoiceDraftResult;
      onDraft(data);
    } catch {
      toast.error(t("error.generic"));
      onFallbackToManual();
    } finally {
      setSubmitting(false);
    }
  }, [audioFile, photos, t, onDraft, onFallbackToManual]);

  return (
    <div className="rounded-2xl border border-teal-200/60 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-teal-500/20 dark:bg-white/[0.03]">
      <h2 className="font-serif text-xl font-semibold text-gray-900 dark:text-white">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-white/60">{t("subtitle")}</p>

      {/* ── Recorder ─────────────────────────────────────────────────── */}
      <div className="mt-6 flex flex-col items-center gap-4 rounded-xl bg-teal-50/60 p-6 dark:bg-teal-500/[0.06]">
        {!recording ? (
          <button
            type="button"
            onClick={startRecording}
            disabled={submitting}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-teal-600 text-white shadow-teal-md transition hover:bg-teal-700 active:translate-y-px disabled:opacity-50"
            aria-label={t("recordButton")}
          >
            <Mic className="h-8 w-8" />
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-red-600 text-white shadow-md transition hover:bg-red-700 active:translate-y-px"
            aria-label={t("stopButton")}
          >
            <span className="relative flex items-center justify-center">
              <span className="absolute h-12 w-12 animate-ping rounded-full bg-red-400/40" />
              <Square className="h-7 w-7 fill-current" />
            </span>
          </button>
        )}
        <div className="text-center">
          <p className="font-mono text-lg font-semibold text-gray-900 tabular-nums dark:text-white">
            {fmt(seconds)}
            <span className="text-gray-400"> / {fmt(MAX_SECONDS)}</span>
          </p>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-white/50">
            {recording ? t("recording") : audioFile ? t("recorded") : t("recordHint")}
          </p>
        </div>

        {/* Fallback: upload an audio file (iOS Safari / WhatsApp voice note). */}
        {!recording && (
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-teal-700 hover:underline dark:text-teal-300">
            <Upload className="h-4 w-4" />
            {t("uploadAudio")}
            <input type="file" accept="audio/*" className="hidden" onChange={onAudioUpload} />
          </label>
        )}
      </div>

      {/* ── Photos ───────────────────────────────────────────────────── */}
      <div className="mt-6">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{t("addPhotos")}</p>
        <p className="text-xs text-gray-500 dark:text-white/50">{t("photosHint")}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {photos.map((p, i) => (
            <div key={p.preview} className="relative h-20 w-20 overflow-hidden rounded-lg border border-gray-200 dark:border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                aria-label={t("removePhoto")}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-teal-400 hover:text-teal-600 dark:border-white/15">
              <ImageIcon className="h-5 w-5" />
              <span className="text-[10px]">{t("addPhotoShort")}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={onPhotosAdd} />
            </label>
          )}
        </div>
      </div>

      {/* ── Consent + submit ─────────────────────────────────────────── */}
      <p className="mt-6 text-xs leading-relaxed text-gray-500 dark:text-white/50">{t("consent")}</p>

      <button
        type="button"
        onClick={submit}
        disabled={!audioFile || submitting || recording}
        className={cn(
          "mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-3 font-semibold text-white shadow-teal-md transition hover:bg-teal-700 active:translate-y-px",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {submitting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            {t("processing")}
          </>
        ) : (
          <>
            {t("submit")}
            <ArrowRight className="h-5 w-5" />
          </>
        )}
      </button>

      <button
        type="button"
        onClick={onFallbackToManual}
        className="mt-3 w-full text-center text-sm text-gray-500 hover:text-gray-700 hover:underline dark:text-white/50"
      >
        {t("fallbackToManual")}
      </button>
    </div>
  );
}
