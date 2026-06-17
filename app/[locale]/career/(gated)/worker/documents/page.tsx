import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { LogIn, UserPlus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { createClient } from "@/supabase/server";
import {
  getWorkerDocuments,
  getWorkerStatus,
  resolveCareerRole,
  type WorkerDocument,
} from "@/lib/kariyer/queries";
import { signShowcaseVariant } from "@/lib/kariyer/storage";
import { CAREER_ROUTES } from "@/lib/kariyer/config";
import {
  WorkerDocumentsUploader,
  type WorkerDocumentItem,
  type DocumentsReadiness,
} from "@/components/glatko-kariyer/WorkerDocumentsUploader";

type Props = {
  params: Promise<{ locale: string }> | { locale: string };
};

// R5/R11 — this surface reads auth.getUser() to scope to ONE worker and loads
// that worker's own documents + freshly-minted signed READ URLs. It is per-worker
// auth state: NEVER ISR-cache one worker's render and serve it to another. The
// pool/dashboard surfaces are the same exception. No generateStaticParams.
// `noindex` is inherited from app/[locale]/career/layout.tsx; the (gated) group
// layout owns the CAREER_VERTICAL_ENABLED flag check (→ real 404 when off).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  // noindex inherited from the career layout — no buildAlternates (IMPL-CONTRACT).
  return { title: t("careerVertical.worker.documents.seoTitle") };
}

// Short-lived TTL for the signed READ URLs minted here. Photos shown via the
// blurred+watermarked showcase variant only; gated/internal ORIGINALS are NOT
// signed at page level — they are minted on demand by /api/career/documents/sign
// (R6: the worker may always read their OWN original, but through the gate route
// that writes an access-log row). Here those rows render as a glyph + filename.
const SIGNED_READ_TTL = 60;

const PHOTO_CATEGORIES = new Set(["profile_photo", "work_photo"]);

/**
 * Derive a stable, human display name for a row. The `worker_documents` read RPC
 * (074) projects no original filename (it is NOT public-safe metadata), so we use
 * a category-scoped localized label as the visible name. This is the worker's OWN
 * data on the worker's OWN page; we still never echo a raw filename that could
 * carry a name into any showcase/public context (Spec 20 §No PII in DOM).
 */
function displayName(t: Awaited<ReturnType<typeof getTranslations>>, doc: WorkerDocument): string {
  const known = new Set([
    "profile_photo",
    "work_photo",
    "passport",
    "diploma",
    "skill_cert",
    "insurance",
    "reference",
  ]);
  if (known.has(doc.category)) {
    return t(`careerVertical.worker.documents.categories.${doc.category}`);
  }
  return doc.category;
}

/**
 * Resolve each stored document row into a `WorkerDocumentItem` the client can
 * render: a freshly-minted short-lived signed READ URL (showcase variant for a
 * public_anonymized PHOTO only — the original stays private; gated/internal
 * originals carry `signedUrl: null` and render as a glyph + filename via the
 * sign route on demand), plus a display filename + mime branch hint.
 *
 * R6 two-step read: the showcase variant is the blurred+watermarked PUBLIC file
 * (career-showcase bucket); we sign it ONLY when the row's visibility is
 * public_anonymized AND a watermarked variant path exists. A sign failure on one
 * row degrades to `signedUrl: null` (the row still lists) rather than throwing the
 * whole page into error.tsx — one missing thumbnail must not blank the center.
 */
async function toItem(
  t: Awaited<ReturnType<typeof getTranslations>>,
  doc: WorkerDocument,
): Promise<WorkerDocumentItem> {
  const isShowcasePhoto =
    doc.visibility === "public_anonymized" &&
    PHOTO_CATEGORIES.has(doc.category) &&
    !!doc.watermarkedVariantPath;

  let signedUrl: string | null = null;
  if (isShowcasePhoto && doc.watermarkedVariantPath) {
    try {
      signedUrl = await signShowcaseVariant(doc.watermarkedVariantPath, SIGNED_READ_TTL);
    } catch {
      // Degrade gracefully — log no PII, keep the row, drop the thumbnail.
      signedUrl = null;
    }
  }

  return {
    ...doc,
    signedUrl,
    filename: displayName(t, doc),
    // Photos branch on an image mime; non-photo originals render as a download
    // link (the client treats a null/non-image mime as a file glyph).
    mimeType: PHOTO_CATEGORIES.has(doc.category) ? "image/jpeg" : null,
  };
}

/**
 * Spec 20 — Worker Document & Photo Upload Center. The ONE surface where the
 * per-document `visibility` + `consent_status` rows are written and where a worker
 * sees + revokes what is public about them. There is no health analog *component*
 * for upload; we mirror health's gated-page preamble (locale guard →
 * setRequestLocale → getTranslations → auth.getUser() → read wrappers) and its
 * client-form conventions inside WorkerDocumentsUploader. `force-dynamic` (R11).
 *
 * Identity (`workerId`) is derived server-side from the trusted session and passed
 * to the read RPC as the explicit p_user_id (R1 — never auth.uid() inside the RPC);
 * the component receives NO raw ids it could forge. Anon → designed sign-in prompt
 * (mirror the employer-dashboard graceful screen, never throw); authed-but-not-a-
 * worker → complete-registration prompt.
 *
 * R7 — the worker is NEVER charged: this page (and the component it renders) carries
 * ZERO fee/price/payment field, copy, or CTA.
 */
export default async function WorkerDocumentsPage({ params }: Props) {
  const { locale } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();

  // Identity from the trusted session — NEVER the request (R1). Anon → designed
  // sign-in prompt (mirror the employer dashboard graceful block; do NOT throw).
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <GracefulScreen
        icon={<LogIn className="h-7 w-7 text-brandCareer" />}
        title={t("careerVertical.login.title")}
        body={t("careerVertical.login.subtitle")}
        ctaLabel={t("careerVertical.login.submit")}
        ctaHref={CAREER_ROUTES.login}
      />
    );
  }

  // Authed but not a worker account → complete-registration prompt (a worker must
  // exist before they can own documents — R1: the read RPC re-verifies ownership).
  const role = await resolveCareerRole(user.id);
  if (role !== "worker") {
    return (
      <GracefulScreen
        icon={<UserPlus className="h-7 w-7 text-brandCareer" />}
        title={t("careerVertical.worker.register.title")}
        body={t("careerVertical.worker.register.subtitle")}
        ctaLabel={t("careerVertical.worker.register.submit")}
        ctaHref={CAREER_ROUTES.workerRegister}
      />
    );
  }

  // Two read-RPCs in parallel (R1: ownership re-verified inside each via the
  // explicit user id). A genuine RPC failure throws → caught by the gated group
  // error.tsx; an empty array / null is a real "no rows" (the component renders
  // its designed empty/first-run state).
  const [documents, status] = await Promise.all([
    getWorkerDocuments(user.id),
    getWorkerStatus(user.id),
  ]);

  // Mint short-lived signed READ URLs per row (showcase variant for public photos
  // only; gated/internal originals stay null → glyph + filename). Sequential awaits
  // are fine — the typical worker holds a handful of documents, and each sign call
  // is sub-100ms against the same admin client.
  const items: WorkerDocumentItem[] = await Promise.all(
    documents.map((doc) => toItem(t, doc)),
  );

  // Readiness sub-signals for the top strip (mirror Spec 06 meter, amber). A
  // missing status row degrades to a neutral pending strip rather than throwing.
  const readiness: DocumentsReadiness = {
    readinessScore: status?.readinessScore ?? null,
    isShowcased: status?.isShowcased ?? false,
    verificationStatus: status?.verificationStatus ?? "pending",
  };

  return (
    <div className="bg-brandCareer-50/40 dark:bg-transparent">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-28">
        <WorkerDocumentsUploader documents={items} readiness={readiness} />
      </div>
    </div>
  );
}

/**
 * Graceful block for the not-signed-in / not-a-worker states — mirrors the
 * employer-dashboard GracefulScreen (designed prompt + amber-gradient CTA, never a
 * crash). R7: no fee/price wording — worker-direction copy only.
 */
function GracefulScreen({
  icon,
  title,
  body,
  ctaLabel,
  ctaHref,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: "/career/login" | "/career/worker/register";
}) {
  return (
    <div className="bg-brandCareer-50/40 dark:bg-transparent">
      <div className="mx-auto max-w-md px-4 pb-24 pt-40 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brandCareer-50 dark:bg-brandCareer/15">
          {icon}
        </span>
        <h1 className="mt-5 font-serif text-2xl font-light tracking-tight text-gray-900 dark:text-white">
          {title}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500 dark:text-white/50">
          {body}
        </p>
        <Link
          href={ctaHref}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 transition-all hover:shadow-amber-500/40"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
