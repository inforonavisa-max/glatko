import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  Award,
  BadgeCheck,
  ChevronLeft,
  Gauge,
  Languages,
  Lock,
  PlayCircle,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { createClient } from "@/supabase/server";
import {
  getEmployerUnlocks,
  getShowcaseWorker,
  resolveCareerRole,
} from "@/lib/kariyer/queries";
import { isWorkerCode } from "@/lib/kariyer/worker-code";
import { LockedDossierPanel } from "@/components/glatko-kariyer/LockedDossierPanel";
import { WatermarkedPhoto } from "@/components/glatko-kariyer/WatermarkedPhoto";

type Props = {
  params:
    | Promise<{ locale: string; workerCode: string }>
    | { locale: string; workerCode: string };
};

// R5 — per-viewer interest marker + a per-session photo watermark mean one
// employer's render must NEVER be ISR-cached and served to another. Health's
// provider profile is `revalidate=3600`; this is the deliberate exception. Do
// NOT add `generateStaticParams` (the showcase RPC fetch is dynamic anyway) and
// do NOT relax this to ISR. `noindex` is inherited from the gated group metadata.
//
// ⚠️ R12 — UNTHROTTLED SCRAPE SURFACE: this is a PAGE route, so lib/rateLimit.ts's
// `public-form` cap does NOT cover it. The structural throttle is server-side
// reads over the showcase VIEW + NO bulk export (one anonymized worker per route).
export const dynamic = "force-dynamic";

/**
 * Verification statuses that earn the "Verified by RoNa Legal" trust pill
 * (mirror health's binary `verified` flag + WorkerCard.isVerified). "pending"
 * and "rejected" do NOT earn the badge.
 */
function isVerified(status: string | null): boolean {
  return (
    status === "id_verified" ||
    status === "skills_verified" ||
    status === "documents_verified" ||
    status === "interview_passed"
  );
}

/**
 * Derive the 2-letter trade glyph from a worker code (MNE-CW-0427 → "CW") for the
 * avatar fallback tile. This is the trade code, NOT name initials — there is no
 * name on the showcase surface (R2/R8 #1).
 */
function tradeGlyph(workerCode: string): string {
  const parts = workerCode.split("-");
  const seg = parts.length >= 2 ? parts[1] : parts[0] ?? "";
  return (seg || "?").slice(0, 2).toUpperCase();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, workerCode } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  // Title is the worker code ONLY — never a name (there is none on this surface).
  // noindex is inherited from app/[locale]/career/layout.tsx; do NOT add
  // buildAlternates/indexable metadata to this gated subtree (IMPL-CONTRACT).
  return isWorkerCode(workerCode) ? { title: workerCode } : { title: undefined };
}

/**
 * Anonymized worker detail (Spec 06) — the gated, identity-firewalled counterpart
 * to the health provider profile (`app/[locale]/health/(gated)/uzman/[slug]`).
 * Two columns: LEFT = anonymized facts (header, skills matrix, languages,
 * certifications, watermarked photo strip, optional gated video, readiness),
 * RIGHT = the sticky LockedDossierPanel + ExpressInterestButton.
 *
 * IDENTITY FIREWALL (R2/R6/R8): everything below comes from the
 * `career_get_showcase_worker` RPC over the showcase VIEW — public-safe columns
 * ONLY (worker_code, role/trade, skill tier, bands, region, languages, skills,
 * readiness, verification). There is NO name/phone/email/passport/DOB/exact-
 * location/original-doc field anywhere on this surface, not even in hidden markup
 * or JSON props. The showcase types carry none of those by construction — the
 * LockedDossierPanel renders only the LABELS of fields that WILL be revealed
 * after RoNa Legal approval + fee (in the EMPLOYER DASHBOARD, never here).
 *
 * R7: the worker is never charged — no fee/price/payment UI appears on this side.
 *
 * 404 vs error (mirror health): RPC returns null for an unknown / un-showcased
 * worker → notFound(); a genuine RPC failure THROWS → caught by the gated group
 * error.tsx. An invalid/malformed code is rejected BEFORE any RPC call.
 */
export default async function WorkerDetailPage({ params }: Props) {
  const { locale, workerCode } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const l = locale as Locale;
  const d = (k: string) => t(`careerVertical.workerDetail.${k}`);

  // Malformed `[workerCode]` segment → 404 BEFORE any RPC (Spec 06 edge case;
  // validate with the shared matcher, exactly as health validates its slug shape).
  if (!isWorkerCode(workerCode)) notFound();

  // Single anonymized worker by code. null = unknown / not showcased (consent
  // revoked, de-listed) → 404. A genuine RPC failure throws → error.tsx.
  const worker = await getShowcaseWorker(workerCode);
  if (!worker) notFound();

  // Identity is derived server-side from the trusted session (auth.getUser()),
  // NEVER from the request — it decides the CTA state (locked vs active). The
  // `career` schema is off PostgREST, so the role lookup is a SECURITY DEFINER
  // RPC keyed by the verified uid (R1). Anon → "none" → CTA routes to login.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = user ? await resolveCareerRole(user.id) : "none";
  const isEmployer = role === "employer";

  // Per-viewer interest state: has THIS employer already expressed interest in
  // THIS worker? Drives the CTA → disabled "pending review" pill. Ownership is
  // re-verified inside the RPC, so a foreign uid yields zero rows (R1/R8 #9). The
  // dossier is STILL locked while owner_approved=false — there is no in-page
  // unlocked variant. We never read interest state without a session.
  const alreadyExpressed =
    isEmployer && user
      ? (await getEmployerUnlocks(user.id)).some(
          (u) => u.workerCode === worker.workerCode,
        )
      : false;

  const verified = isVerified(worker.verificationStatus);
  // Skill chips — top 5 highlighted, the remainder collapsed into a "+N" chip
  // (Spec 06 §2: "Top 5 highlighted, rest collapsible if long"). Neutral chips;
  // amber only on the skill-tier accent below.
  const topSkills = worker.skills.slice(0, 5);
  const extraSkills = Math.max(0, worker.skills.length - topSkills.length);

  return (
    <div className="bg-brandCareer-50/40 pb-12 dark:bg-transparent">
      <div className="mx-auto max-w-5xl px-4 pb-24 pt-28">
        {/* ← back to pool (mirrors health's "← allSpecialties"; amber text accent
            uses the -700 ramp — the DEFAULT amber-600 is below AA for text). */}
        <Link
          href="/career/pool"
          className="inline-flex items-center gap-1 text-sm font-medium text-brandCareer-700 hover:underline dark:text-brandCareer"
        >
          <ChevronLeft className="h-4 w-4" />
          {d("backToPool")}
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_20rem]">
          {/* ── LEFT — anonymized facts ──────────────────────────────────────── */}
          <div>
            {/* 1. Header — worker code as <h1> (mirror health's name), then
                role/trade · skill tier · experience band · region · age band, plus
                the "Verified by RoNa Legal" pill. Avatar = blurred/watermarked
                showcase thumb, or the amber trade-glyph fallback tile (no photo
                variant exists yet → fallback; never an original, R6). */}
            <div className="flex gap-4">
              <WatermarkedPhoto
                src={null}
                alt={`${worker.workerCode}`}
                size="thumb"
                viewerId={user?.id}
                labels={{ fallback: tradeGlyph(worker.workerCode) }}
              />
              <div className="min-w-0">
                <h1 className="font-serif text-3xl font-light tracking-tight text-gray-900 dark:text-white">
                  {worker.workerCode}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {[
                    worker.role,
                    worker.trade,
                    worker.skillTier,
                    worker.experienceBand,
                    worker.region,
                    worker.ageBand,
                  ]
                    .filter(Boolean)
                    .map((fact, i) => (
                      <span
                        key={`${fact}-${i}`}
                        className="text-sm text-gray-500 dark:text-white/50"
                      >
                        {fact}
                      </span>
                    ))}
                  {verified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brandCareer-50 px-2 py-0.5 text-xs font-medium text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      {t("careerVertical.pool.card.verifiedBadge")}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-gray-400 dark:text-white/40">
                  {d("anonymousNote")}
                </p>
              </div>
            </div>

            {/* 2. Skills matrix — section heading (uppercase-tracked like health),
                then a grid of neutral skill chips with the worker's skill-tier as
                the section-level amber accent badge. "—" when no skills (never
                crash, Spec 06 §empty). */}
            <section className="mt-8">
              <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
                {d("skillsMatrix.title")}
                {worker.skillTier && (
                  <span className="inline-flex items-center rounded-full bg-brandCareer-50 px-2 py-0.5 text-xs font-medium normal-case text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
                    {worker.skillTier}
                  </span>
                )}
              </h2>
              {worker.skills.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {topSkills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-white/10 dark:text-white/70"
                    >
                      {skill}
                    </span>
                  ))}
                  {extraSkills > 0 && (
                    <span className="rounded-md bg-brandCareer-50 px-2 py-1 text-xs font-medium text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
                      +{extraSkills}
                    </span>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-400 dark:text-white/40">
                  {d("skillsMatrix.empty")}
                </p>
              )}
            </section>

            {/* 4. Certifications — badge row keyed off the verification status; each
                cert shows the FACT as a neutral badge with an amber file-lock glyph
                meaning "document file locked until unlock" (R6: no signed URL minted
                pre-unlock; the badge is inert). Omitted entirely when unverified
                (Spec 06 §empty → omit). */}
            {verified && (
              <section className="mt-8">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
                  {d("certificationsLabel")}
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-white/70">
                    <Award className="h-3.5 w-3.5 text-gray-400 dark:text-white/40" />
                    {t(
                      `careerVertical.pool.verificationStatus.${worker.verificationStatus}`,
                    )}
                    <Lock
                      className="h-3 w-3 shrink-0 text-brandCareer-700 dark:text-brandCareer"
                      aria-label={d("certFileLocked")}
                    />
                  </span>
                </div>
              </section>
            )}

            {/* 5. Photos — strip of face-blurred + watermarked showcase thumbnails.
                Phase-1 has no derived `public_anonymized` variant yet, so the
                component renders its blurred-placeholder/fallback tile (R6: the page
                NEVER falls back to an original path; the signer would reject it
                anyway). The optional per-session watermark carries the viewer id so a
                leaked screenshot traces back to the session. */}
            <section className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
                {t("careerVertical.pool.card.photoBlurredNote")}
              </h2>
              <div className="mt-3">
                <WatermarkedPhoto
                  src={null}
                  alt={`${worker.workerCode}`}
                  size="detail"
                  viewerId={user?.id}
                  labels={{ fallback: tradeGlyph(worker.workerCode) }}
                />
              </div>
            </section>

            {/* 6. Optional gated video — the full intro stays gated; show a locked
                placeholder tile pointing at the LockedDossierPanel (no public clip
                exists on this surface yet → always the locked tile, never an
                original). Spec 06 §6: omit only when there is no video concept at
                all; here we surface the locked affordance so the gate is legible. */}
            <section className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
                {d("videoIntroLabel")}
              </h2>
              <div className="mt-3 flex h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-400 dark:border-white/15 dark:bg-white/5 dark:text-white/30">
                <span className="relative">
                  <PlayCircle className="h-8 w-8 text-gray-300 dark:text-white/20" />
                  <Lock className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-white text-brandCareer-700 dark:bg-gray-900 dark:text-brandCareer" />
                </span>
                {d("videoLocked")}
              </div>
            </section>

            {/* 7. Languages — uppercase chip row (mirror health's languagesLabel
                block verbatim, amber-neutral). Omitted when empty (Spec 06 §empty). */}
            {worker.languages.length > 0 && (
              <section className="mt-8">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
                  <Languages className="h-4 w-4" />
                  {d("languagesLabel")}
                </h2>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {worker.languages.map((lang) => (
                    <span
                      key={lang}
                      className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium uppercase text-gray-600 dark:bg-white/10 dark:text-white/60"
                    >
                      {lang}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* 8. Readiness summary — readiness score rendered as a labeled amber
                meter (read-only). "—" when null rather than crashing (Spec 06
                §empty). The accent is wayfinding only (the meter fill), never body
                text. */}
            <section className="mt-8">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
                <Gauge className="h-4 w-4" />
                {d("readinessLabel")}
              </h2>
              {worker.readinessScore !== null ? (
                <div className="mt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-white/70">
                      {worker.readinessScore}
                      <span className="text-gray-400 dark:text-white/40">/100</span>
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-brandCareer"
                      style={{
                        width: `${Math.min(100, Math.max(0, worker.readinessScore))}%`,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-400 dark:text-white/40">—</p>
              )}
            </section>
          </div>

          {/* ── RIGHT — LockedDossierPanel (server-rendered) + ExpressInterestButton
              (the only client island). On lg it sticks; on mobile it stacks below
              the facts (mirror health's BookingWidget aside). The dossier's resting
              state IS the success state: identity/docs stay hidden (no in-page
              unlocked variant). When this employer already expressed interest, the
              CTA inside flips to the disabled "pending review" pill; the dossier is
              STILL locked while owner_approved=false (R8 #9). */}
          <aside>
            <LockedDossierPanel
              workerCode={worker.workerCode}
              isEmployer={isEmployer}
              alreadyExpressed={alreadyExpressed}
              locale={l}
              labels={{
                title: d("lockedPanel.title"),
                body: d("lockedPanel.body"),
                lockedItemsTitle: d("lockedPanel.lockedItemsTitle"),
                itemFullName: d("lockedPanel.itemFullName"),
                itemContact: d("lockedPanel.itemContact"),
                itemLocation: d("lockedPanel.itemLocation"),
                itemPassport: d("lockedPanel.itemPassport"),
                itemDocuments: d("lockedPanel.itemDocuments"),
                itemPhotos: d("lockedPanel.itemPhotos"),
              }}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
