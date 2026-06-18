"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  BadgeCheck,
  FileText,
  Loader2,
  Lock,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkerDocument } from "@/lib/kariyer/queries";
import { WatermarkedPhoto } from "./WatermarkedPhoto";

/**
 * Glatko Kariyer — Spec 20 Worker Document & Photo Upload Center (Client Component).
 *
 * The ONE surface where a worker sets, per document, what is PUBLIC vs GATED vs
 * INTERNAL and grants/revokes the matching PDPL consent. Mirrors health's client-form
 * conventions (BookingForm: `"use client"`, a single status machine, `fetch` + a
 * `mapApiError` → localized message, `role="alert"` red error line, disabled-while-busy
 * CTAs) — swapping teal → amber (brandCareer). The per-document consent toggle mirrors
 * BookingForm's not-prechecked + link-to-/privacy pattern, applied PER ITEM.
 *
 * R7 — the worker is NEVER charged: there is ZERO fee/price/payment field, copy, or CTA
 * anywhere on this surface.
 *
 * Two-step upload (BUILD-RULES R6, never name a path client-side):
 *   1) POST /api/career/documents/upload-url  → short-lived signed PUT URL (server picks
 *      the private career-worker/{workerId}/{category}/… path from the SESSION).
 *   2) PUT the bytes straight to storage.
 *   3) POST /api/career/documents (category + visibility + consent + filename) → the
 *      `worker_documents` row is written via a SECURITY DEFINER RPC.
 * Visibility change + consent revoke each POST a small update to /api/career/documents.
 *
 * Two-step read: the PAGE mints short-lived signed READ URLs per item (showcase variant
 * for photos via WatermarkedPhoto; gated originals / internal files via a plain `<a href>`,
 * NEVER next/image — signed URLs are not stable cacheable origins, and we don't want the
 * Next optimizer minting variants of sensitive files). This component renders what it's given.
 *
 * Identity (`workerId`) is derived from the session server-side; the client never sends
 * (and cannot forge) it — every endpoint re-derives it from auth.getUser().
 */

// ─────────────────────────────────────────────────────────────────────────────
// Categories + the visibility set each one ALLOWS (PART 6 §D, purpose-bound).
// ─────────────────────────────────────────────────────────────────────────────
type Visibility = "public_anonymized" | "gated" | "internal_only";
type ConsentStatus = "pending" | "granted" | "revoked";

type Category =
  | "profile_photo"
  | "work_photo"
  | "passport"
  | "diploma"
  | "skill_cert"
  | "insurance"
  | "reference";

const CATEGORIES: Category[] = [
  "profile_photo",
  "work_photo",
  "passport",
  "diploma",
  "skill_cert",
  "insurance",
  "reference",
];

// Photo categories render a derived blurred+watermarked showcase variant when
// public_anonymized; doc categories render the original as a download <a>.
const PHOTO_CATEGORIES: ReadonlySet<Category> = new Set<Category>(["profile_photo", "work_photo"]);

// The allowed visibility set per category. Special-category data (ID/passport,
// insurance/medical) can NEVER be public_anonymized — that option is disabled with a
// tooltip. Diplomas/certs/references default to `gated` (fact shows; file unlocks after
// approval + payment) and may be downgraded to internal_only — never public.
const ALLOWED_VISIBILITY: Record<Category, Visibility[]> = {
  profile_photo: ["public_anonymized", "gated", "internal_only"],
  work_photo: ["public_anonymized", "gated", "internal_only"],
  passport: ["internal_only"],
  insurance: ["internal_only"],
  diploma: ["gated", "internal_only"],
  skill_cert: ["gated", "internal_only"],
  reference: ["gated", "internal_only"],
};

const DEFAULT_VISIBILITY: Record<Category, Visibility> = {
  profile_photo: "public_anonymized",
  work_photo: "public_anonymized",
  passport: "internal_only",
  insurance: "internal_only",
  diploma: "gated",
  skill_cert: "gated",
  reference: "gated",
};

const VISIBILITY_ORDER: Visibility[] = ["public_anonymized", "gated", "internal_only"];

// Client-side file validation (server re-validates — defense in depth). Photo
// categories accept images; doc categories accept PDF/JPG/PNG. 5 MiB cap = the
// storage bucket file_size_limit (migration 077).
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png"];
const DOC_TYPES = ["application/pdf", "image/jpeg", "image/png"];

function acceptFor(category: Category): string {
  return PHOTO_CATEGORIES.has(category)
    ? "image/jpeg,image/png"
    : "application/pdf,image/jpeg,image/png";
}

function allowedTypesFor(category: Category): string[] {
  return PHOTO_CATEGORIES.has(category) ? IMAGE_TYPES : DOC_TYPES;
}

// ─────────────────────────────────────────────────────────────────────────────
// Props — the PAGE (force-dynamic, auth-scoped) passes already-resolved data down.
// Each item carries its freshly-minted short-lived signed READ URL (page mints it);
// this component never signs or fetches a read URL itself. No raw ids the client
// could forge — identity is session-derived server-side on every write endpoint.
// ─────────────────────────────────────────────────────────────────────────────

/** A worker_documents row + its freshly-minted signed READ URL + display metadata. */
export type WorkerDocumentItem = WorkerDocument & {
  /** Short-lived signed READ URL: showcase variant (photos) OR gated/internal original. */
  signedUrl: string | null;
  /** Original filename (the worker's OWN data on the worker's OWN page — allowed). */
  filename: string;
  /** MIME of the stored original (drives the photo-vs-file render branch). */
  mimeType: string | null;
};

/** Readiness sub-signals for the top strip (mirror Spec 06 readiness meter, amber). */
export type DocumentsReadiness = {
  readinessScore: number | null;
  isShowcased: boolean;
  verificationStatus: string;
};

type Props = {
  /** Existing documents (any category), each with a freshly-minted signed READ URL. */
  documents: WorkerDocumentItem[];
  /** Readiness sub-signals for the top strip. */
  readiness: DocumentsReadiness;
};

// Per-item transient client state keyed by row id (busy + scoped error).
type ItemState = { busy: boolean; error: string | null };

type ApiErrorPayload = { error?: string; reason?: string };

/** Per-category transient upload state (one in-flight upload per category at a time). */
type UploadState = { busy: boolean; error: string | null };

export function WorkerDocumentsUploader({ documents, readiness }: Props) {
  const t = useTranslations("careerVertical.documents");

  // The list is owned client-side so optimistic add/remove/visibility/consent edits
  // reflect immediately; the server is the source of truth on the next page load.
  const [items, setItems] = useState<WorkerDocumentItem[]>(documents);
  const [itemState, setItemState] = useState<Record<string, ItemState>>({});
  const [uploadState, setUploadState] = useState<Record<string, UploadState>>({});

  function setItemBusy(id: string, busy: boolean, error: string | null = null) {
    setItemState((s) => ({ ...s, [id]: { busy, error } }));
  }
  function setCatBusy(category: Category, busy: boolean, error: string | null = null) {
    setUploadState((s) => ({ ...s, [category]: { busy, error } }));
  }

  // Mirror BookingForm's mapApiError → a localized, PII-free message. Errors stay red
  // (never amber-tint danger).
  function mapApiError(payload: ApiErrorPayload): string {
    if (payload.error === "rate_limited" || payload.reason === "RATE_LIMITED")
      return t("errors.rateLimited");
    if (payload.error === "invalid_type" || payload.reason === "INVALID_TYPE")
      return t("errors.invalidType");
    if (payload.error === "too_large" || payload.reason === "TOO_LARGE")
      return t("errors.tooLarge");
    if (payload.reason === "CONSENT_REQUIRED") return t("errors.consentRequired");
    if (payload.reason === "NOT_OWNED") return t("errors.notOwned");
    return t("errors.generic");
  }

  const byCategory = useMemo(() => {
    const map = new Map<Category, WorkerDocumentItem[]>();
    for (const c of CATEGORIES) map.set(c, []);
    for (const it of items) {
      const cat = (CATEGORIES as string[]).includes(it.category)
        ? (it.category as Category)
        : null;
      if (cat) map.get(cat)!.push(it);
    }
    return map;
  }, [items]);

  // ── Upload (two-step, R6) ──────────────────────────────────────────────────
  async function uploadToCategory(category: Category, file: File) {
    setCatBusy(category, true);
    // Client-side validation BEFORE requesting an upload URL (no request on reject).
    if (!allowedTypesFor(category).includes(file.type)) {
      setCatBusy(category, false, t("errors.invalidType"));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setCatBusy(category, false, t("errors.tooLarge"));
      return;
    }

    const visibility = DEFAULT_VISIBILITY[category];
    try {
      // (1) Ask the server for a short-lived signed PUT URL (server picks the path).
      const urlRes = await fetch("/api/career/documents/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, mimeType: file.type }),
      });
      if (!urlRes.ok) {
        setCatBusy(category, false, mapApiError(await urlRes.json().catch(() => ({}))));
        return;
      }
      const { uploadUrl } = (await urlRes.json()) as { uploadUrl: string };

      // (2) PUT the bytes straight to storage.
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        setCatBusy(category, false, t("errors.generic"));
        return;
      }

      // (3) POST metadata → the worker_documents row is written via the RPC. Consent
      // starts UNGRANTED (pending) — the worker must affirm it per item below.
      const metaRes = await fetch("/api/career/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          visibility,
          consent: false,
          filename: file.name,
          mimeType: file.type,
        }),
      });
      const metaPayload = await metaRes.json().catch(() => ({}));
      if (!metaRes.ok || !metaPayload.document) {
        setCatBusy(category, false, mapApiError(metaPayload));
        return;
      }

      // Optimistically add the returned row (with its freshly-minted signed URL).
      setItems((prev) => [...prev, metaPayload.document as WorkerDocumentItem]);
      setCatBusy(category, false);
    } catch {
      setCatBusy(category, false, t("errors.generic"));
    }
  }

  // ── Visibility change → re-state consent, reset to UNCHECKED (purpose-bound) ──
  async function changeVisibility(item: WorkerDocumentItem, next: Visibility) {
    if (next === item.visibility) return;
    setItemBusy(item.id, true);
    try {
      const res = await fetch("/api/career/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, visibility: next }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setItemBusy(item.id, false, mapApiError(payload));
        return;
      }
      // Changing visibility re-states the consent and FORCES a fresh affirmation:
      // consent resets to revoked/pending so it is never silently carried to a
      // broader exposure (PART 6 §D, purpose-bound).
      setItems((prev) =>
        prev.map((x) =>
          x.id === item.id
            ? { ...x, visibility: next, consentStatus: "revoked", consentAt: null }
            : x,
        ),
      );
      setItemBusy(item.id, false);
    } catch {
      setItemBusy(item.id, false, t("errors.generic"));
    }
  }

  // ── Consent grant / revoke (revocable per document) ────────────────────────
  async function setConsent(item: WorkerDocumentItem, grant: boolean) {
    setItemBusy(item.id, true);
    try {
      const res = await fetch("/api/career/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, consent: grant }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setItemBusy(item.id, false, mapApiError(payload));
        return;
      }
      // Revoking removes a showcased photo from the pool at the next read (the
      // showcase VIEW filters on consent/visibility); we reflect "no longer shown"
      // inline immediately.
      setItems((prev) =>
        prev.map((x) =>
          x.id === item.id
            ? {
                ...x,
                consentStatus: grant ? "granted" : "revoked",
                consentAt:
                  (payload.document?.consentAt as string | undefined) ??
                  (grant ? new Date().toISOString() : null),
              }
            : x,
        ),
      );
      setItemBusy(item.id, false);
    } catch {
      setItemBusy(item.id, false, t("errors.generic"));
    }
  }

  // ── Remove (soft-delete; RPC respects retention_until / audit) ─────────────
  async function removeItem(item: WorkerDocumentItem) {
    if (typeof window !== "undefined" && !window.confirm(t("confirmRemove"))) return;
    setItemBusy(item.id, true);
    try {
      const res = await fetch("/api/career/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      if (!res.ok) {
        setItemBusy(item.id, false, mapApiError(await res.json().catch(() => ({}))));
        return;
      }
      setItems((prev) => prev.filter((x) => x.id !== item.id));
    } catch {
      setItemBusy(item.id, false, t("errors.generic"));
    }
  }

  const readinessPct =
    readiness.readinessScore === null
      ? null
      : Math.max(0, Math.min(100, Math.round(readiness.readinessScore)));

  return (
    <div className="mx-auto max-w-3xl bg-brandCareer-50/40 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header + readiness strip (read-only; amber wayfinding) */}
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          {t("title")}
        </h1>
        <p className="mt-1.5 text-sm text-gray-600 dark:text-white/60">{t("subtitle")}</p>

        <div className="mt-5 rounded-2xl border border-gray-200/80 bg-white p-4 shadow-premium-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium text-gray-700 dark:text-white/80">
              <ShieldCheck className="h-4 w-4 text-brandCareer-700 dark:text-brandCareer" aria-hidden />
              {t("readiness.label")}
            </span>
            <span className="font-semibold tabular-nums text-brandCareer-700 dark:text-brandCareer">
              {readinessPct === null ? "—" : `${readinessPct}%`}
            </span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10"
            role="progressbar"
            aria-valuenow={readinessPct ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-brandCareer to-brandCareer-700"
              style={{ width: `${readinessPct ?? 0}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-white/45">
            {readiness.isShowcased ? t("readiness.showcased") : t("readiness.notShowcased")}
          </p>
        </div>
      </header>

      <div className="space-y-6">
        {CATEGORIES.map((category) => {
          const catItems = byCategory.get(category) ?? [];
          const up = uploadState[category] ?? { busy: false, error: null };
          return (
            <section
              key={category}
              className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-premium-sm dark:border-white/[0.08] dark:bg-white/[0.04]"
            >
              <CategoryHeader category={category} />

              {/* Already-uploaded items */}
              {catItems.length > 0 ? (
                <ul className="mt-4 space-y-3">
                  {catItems.map((item) => (
                    <DocumentItemRow
                      key={item.id}
                      item={item}
                      category={category}
                      state={itemState[item.id] ?? { busy: false, error: null }}
                      onChangeVisibility={changeVisibility}
                      onSetConsent={setConsent}
                      onRemove={removeItem}
                    />
                  ))}
                </ul>
              ) : (
                <p className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/40 px-4 py-3 text-center text-xs text-gray-500 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-white/45">
                  {t("noFilesYet")}
                </p>
              )}

              {/* Add control (solid amber CTA — the one solid amber button pattern) */}
              <div className="mt-4">
                <label
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brandCareer px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brandCareer/25 transition-colors hover:bg-brandCareer-700 focus-within:ring-2 focus-within:ring-brandCareer/20",
                    up.busy && "cursor-not-allowed opacity-70",
                  )}
                >
                  {up.busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Upload className="h-4 w-4" aria-hidden />
                  )}
                  {up.busy ? t("uploading") : t("uploadCta")}
                  <input
                    type="file"
                    accept={acceptFor(category)}
                    disabled={up.busy}
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void uploadToCategory(category, file);
                    }}
                  />
                </label>
                {up.error && (
                  <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {up.error}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Category card header — icon + localized title + "what / who sees it" helper +
// the default visibility for that category.
// ─────────────────────────────────────────────────────────────────────────────
function CategoryHeader({ category }: { category: Category }) {
  const t = useTranslations("careerVertical.documents");
  const Icon = PHOTO_CATEGORIES.has(category) ? BadgeCheck : FileText;
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brandCareer-50 dark:bg-brandCareer/15">
        <Icon className="h-5 w-5 text-brandCareer-700 dark:text-brandCareer" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t(`categories.${category}`)}
        </h2>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-white/50">
          {t(`categoryHelp.${category}`)}
        </p>
        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-brandCareer-50 px-2 py-0.5 text-[11px] font-medium text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
          {t("defaultVisibilityLabel")}: {t(`visibility.${DEFAULT_VISIBILITY[category]}`)}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// One uploaded item: thumbnail/link · visibility selector · per-item consent ·
// remove. The heart of the surface is the per-document consent tied to visibility.
// ─────────────────────────────────────────────────────────────────────────────
function DocumentItemRow({
  item,
  category,
  state,
  onChangeVisibility,
  onSetConsent,
  onRemove,
}: {
  item: WorkerDocumentItem;
  category: Category;
  state: ItemState;
  onChangeVisibility: (item: WorkerDocumentItem, next: Visibility) => void;
  onSetConsent: (item: WorkerDocumentItem, grant: boolean) => void;
  onRemove: (item: WorkerDocumentItem) => void;
}) {
  const t = useTranslations("careerVertical.documents");
  const allowed = ALLOWED_VISIBILITY[category];
  const isPhoto = PHOTO_CATEGORIES.has(category);
  const isShowcasePhoto = isPhoto && item.visibility === "public_anonymized";
  const consentGranted = item.consentStatus === "granted";

  return (
    <li className="rounded-xl border border-gray-200/80 bg-white/60 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
      <div className="flex items-start gap-3">
        {/* Thumbnail (showcase variant for public photos via WatermarkedPhoto;
            a generic glyph + filename <a> for everything else — gated originals /
            internal files render as a download link, NEVER next/image / <img>). */}
        {isShowcasePhoto ? (
          <WatermarkedPhoto
            src={item.signedUrl}
            alt={t("showcasePhotoAlt")}
            size="thumb"
            labels={{ fallback: t("showcasePhotoAlt") }}
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-brandCareer-50 dark:bg-brandCareer/15">
            <FileText className="h-6 w-6 text-brandCareer-700 dark:text-brandCareer" aria-hidden />
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/* Filename — gated/internal originals open via a signed <a href>, not <img> */}
          {item.signedUrl && !isShowcasePhoto ? (
            <a
              href={item.signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm font-medium text-gray-900 hover:text-brandCareer-700 dark:text-white dark:hover:text-brandCareer"
            >
              {item.filename}
            </a>
          ) : (
            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
              {item.filename}
            </p>
          )}

          {/* Visibility selector */}
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={t("visibilityLabel")}>
            {VISIBILITY_ORDER.map((v) => {
              const isAllowed = allowed.includes(v);
              const active = item.visibility === v;
              // Special-category data can NEVER be public_anonymized → disabled w/ tooltip.
              const blockedPublic = v === "public_anonymized" && !isAllowed;
              return (
                <button
                  key={v}
                  type="button"
                  disabled={!isAllowed || state.busy}
                  title={blockedPublic ? t("publicBlockedTooltip") : undefined}
                  aria-pressed={active}
                  onClick={() => onChangeVisibility(item, v)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    active
                      ? "border-brandCareer bg-brandCareer-50 text-brandCareer-700 dark:border-brandCareer dark:bg-brandCareer/15 dark:text-brandCareer"
                      : "border-gray-200 bg-white text-gray-600 hover:border-brandCareer/40 dark:border-white/10 dark:bg-white/5 dark:text-white/60",
                    !isAllowed && "cursor-not-allowed opacity-40",
                  )}
                >
                  {blockedPublic && <Lock className="h-3 w-3" aria-hidden />}
                  {t(`visibility.${v}`)}
                </button>
              );
            })}
          </div>

          {/* Per-document consent — the consent text being granted, inline, tied to
              the CURRENT visibility. Mirror BookingForm's not-prechecked + /privacy
              link pattern. Changing visibility resets consentStatus (handled in the
              parent), so this re-states + requires re-affirming. */}
          <label className="mt-3 flex items-start gap-2.5 text-xs text-gray-600 dark:text-white/70">
            <input
              type="checkbox"
              checked={consentGranted}
              disabled={state.busy}
              onChange={(e) => onSetConsent(item, e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brandCareer focus:ring-brandCareer/20 dark:border-white/20 dark:bg-white/5"
            />
            <span>
              {t(`consentText.${item.visibility}`)}{" "}
              <Link
                href="/privacy"
                className="font-medium text-brandCareer-700 underline hover:text-brandCareer dark:text-brandCareer"
              >
                {t("consent.privacyLink")}
              </Link>
            </span>
          </label>

          {/* Consent status / timestamp + revoke-effect line. Success accent amber. */}
          {consentGranted && (
            <p className="mt-1.5 text-xs font-medium text-brandCareer-700 dark:text-brandCareer">
              {t("consent.granted")}
              {item.consentAt ? ` · ${new Date(item.consentAt).toLocaleString()}` : ""}
            </p>
          )}
          {item.consentStatus === "revoked" && isShowcasePhoto && (
            <p className="mt-1.5 text-xs text-gray-500 dark:text-white/45">
              {t("consent.revokedShowcaseEffect")}
            </p>
          )}

          {state.error && (
            <p role="alert" className="mt-1.5 text-sm text-red-600 dark:text-red-400">
              {state.error}
            </p>
          )}
        </div>

        {/* Remove (X) */}
        <button
          type="button"
          onClick={() => onRemove(item)}
          disabled={state.busy}
          aria-label={t("removeCta")}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50 dark:text-white/40"
        >
          {state.busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <X className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
    </li>
  );
}

export type { Visibility, ConsentStatus, Category };
