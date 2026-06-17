import { BadgeCheck, Briefcase, Globe, Lock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { ShowcaseWorkerCard } from "@/lib/kariyer/queries";
import { WatermarkedPhoto } from "@/components/glatko-kariyer/WatermarkedPhoto";

/**
 * Anonymized talent-pool card (Spec 07 — the conversion heart of /career/pool
 * AND the anonymization firewall). MIRRORS components/glatko-saglik/ProviderCard.tsx:
 * a SYNC server component, NO client JS, localized labels passed in (the parent
 * WorkerPoolBrowser/page owns the translator). Plain presentational — no data
 * fetching, no auth, no RPC calls inside the card.
 *
 * Accent = amber / brandCareer (swaps health's sky / brandHealth). It is wayfinding
 * ONLY: the Verified-by-RoNa badge, skill/cert chips, the readiness pill, the photo
 * fallback tile, and focus-visible rings. The worker code (<h3>), role/trade subline
 * and the meta line stay NEUTRAL gray — accent is never body text (brandCareer text
 * uses the -700 ramp; the DEFAULT amber-600 is below AA).
 *
 * IDENTITY FIREWALL (BUILD-RULES R2/R6/R8): this card renders ONLY the public-safe
 * anonymized fields the showcase VIEW/RPC projects (worker_code, role/trade, bands,
 * region, skills, readiness, verification) plus a derived showcase-variant photo URL.
 * There is NO name / DOB / phone / email / passport / exact-location / original-doc
 * field on ShowcaseWorkerCard — do not invent one. The photo fallback glyph derives
 * from the worker code's trade segment ("CW"), NEVER initials of a name.
 *
 * HTML rule (load-bearing — same as health): <a> cannot nest inside <a>. The outer
 * element is a plain <div>; the identity block is ONE inner <Link> to the worker
 * detail page, and the footer actions are SEPARATE <Link> siblings OUTSIDE that
 * Link. Never wrap the whole card in a Link with Links/buttons inside it.
 */

type WorkerCardLabels = {
  /** "Verified by RoNa Legal" trust pill. */
  verified: string;
  /** Readiness pill prefix, e.g. "Hazırlık". */
  readinessLabel: string;
  /** Footer primary action — express interest ("İlgi Göster"). */
  expressInterest: string;
  /** Disabled pill when this employer already expressed interest ("İlgi gösterildi"). */
  interestSent: string;
  /** Footer "view full profile (locked)" affordance ("Profili gör (kilitli)"). */
  viewLocked: string;
  /** Inline locked prompt for an anon/non-employer viewer ("İşveren girişi gerekli"). */
  employerLoginRequired: string;
  /** Generic, non-identifying alt/fallback string for the photo tile ("İşçi fotoğrafı"). */
  photoAlt: string;
};

/**
 * Verification statuses that qualify for the "Verified by RoNa Legal" trust pill.
 * "pending"/"rejected" do NOT earn the badge (mirror health's binary `verified` flag).
 */
function isVerified(status: string | null): boolean {
  return (
    status === "id_verified" ||
    status === "skills_verified" ||
    status === "documents_verified" ||
    status === "interview_passed"
  );
}

export function WorkerCard({
  worker,
  photoUrl,
  viewerId,
  viewerRole,
  interestSent,
  labels,
}: {
  /** Anonymized worker object — public-safe columns ONLY (showcase VIEW, R2). */
  worker: ShowcaseWorkerCard;
  /**
   * Derived showcase-variant photo URL (blurred + watermarked `public_anonymized`
   * variant, signed by the parent via R6's `signShowcaseVariant`) or null → fallback
   * tile. NEVER a gated original — the signer rejects non-`public_anonymized` paths.
   * It is a separate prop because ShowcaseWorkerCard carries no photo field.
   */
  photoUrl: string | null;
  /** Optional per-session/employer id for the WatermarkedPhoto overlay (PART 4). */
  viewerId?: string;
  /** Viewer role decided by the parent (it reads auth, the card never does). */
  viewerRole: "employer" | "anon";
  /** True iff this employer already expressed interest in this worker. */
  interestSent: boolean;
  labels: WorkerCardLabels;
}) {
  const verified = isVerified(worker.verificationStatus);
  const skills = worker.skills.slice(0, 5);
  // Detail-page route key (registered gated segment, i18n/routing.ts). The whole
  // identity block + the footer "view locked" affordance point here; for an anon
  // viewer the footer action routes to /career/login instead (locked state).
  const detailHref = {
    pathname: "/career/pool/[workerCode]" as const,
    params: { workerCode: worker.workerCode },
  };

  return (
    <div className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-premium-sm transition-all hover:border-gray-300 hover:shadow-premium-md dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20">
      {/* Identity block — ONE inner Link to the (locked) detail dossier. */}
      <Link href={detailHref} className="block">
        <div className="flex gap-4">
          {/* Blurred + watermarked showcase thumb, or amber fallback tile. The photo
              component never receives a gated original (R6). */}
          <WatermarkedPhoto
            src={photoUrl}
            alt={`${labels.photoAlt} · ${worker.workerCode}`}
            size="thumb"
            viewerId={viewerId}
            labels={{ fallback: labels.photoAlt }}
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {/* Worker code is the ONLY identifier — neutral gray, never a name. */}
                <h3 className="truncate font-semibold text-gray-900 dark:text-white">
                  {worker.workerCode}
                </h3>
                {(worker.role || worker.trade) && (
                  <p className="truncate text-sm text-gray-500 dark:text-white/50">
                    {[worker.role, worker.trade].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              {verified && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brandCareer-50 px-2 py-0.5 text-xs font-medium text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  {labels.verified}
                </span>
              )}
            </div>

            {/* Meta line — experience band + region + age band (NO location, ever).
                Mirrors health's MapPin line but with neutral career-safe facts. */}
            {(worker.experienceBand || worker.region || worker.ageBand) && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-500 dark:text-white/50">
                {worker.region ? (
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <Briefcase className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="truncate">
                  {[worker.experienceBand, worker.region, worker.ageBand]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </p>
            )}

            {/* Skill-badge row (mirror health's languages row): top 3–5 skills as
                amber 50/700 chips. Omitted entirely when there are no skills. */}
            {skills.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-md bg-brandCareer-50 px-1.5 py-0.5 text-xs font-medium text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Link>

      {/* Footer action row — OUTSIDE the identity Link (anchor-in-anchor firewall).
          Left: readiness pill. Right: locked "view profile" + interest control.
          Mirrors health's border-t time-chip footer. */}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-white/5">
        {worker.readinessScore !== null ? (
          <span className="inline-flex shrink-0 items-center rounded-full bg-brandCareer-50 px-2 py-0.5 text-xs font-medium text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
            {labels.readinessLabel} {worker.readinessScore}
          </span>
        ) : (
          <span aria-hidden className="shrink-0" />
        )}

        <div className="flex items-center gap-2">
          {/* "View full profile (locked)" — explicit lock affordance to the detail
              dossier so the gate is legible on the card (separate Link sibling). */}
          <Link
            href={detailHref}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brandCareer focus-visible:ring-offset-1 dark:text-white/50 dark:hover:text-white/70 dark:focus-visible:ring-offset-0"
          >
            <Lock className="h-3.5 w-3.5 shrink-0" />
            {labels.viewLocked}
          </Link>

          {/* Express-interest control. Active (employer) → routes to the detail page
              where the client ExpressInterestButton lives (card stays zero-JS).
              interestSent → disabled "İlgi gösterildi" pill (still LOCKED).
              Anon/non-employer → locked prompt routing to /career/login. */}
          {interestSent ? (
            <span className="inline-flex shrink-0 cursor-default items-center rounded-lg bg-brandCareer-50 px-2.5 py-1 text-xs font-medium text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
              {labels.interestSent}
            </span>
          ) : viewerRole === "employer" ? (
            <Link
              href={detailHref}
              className="inline-flex shrink-0 items-center rounded-lg border border-brandCareer-50 bg-brandCareer-50 px-2.5 py-1 text-xs font-medium text-brandCareer-700 transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brandCareer focus-visible:ring-offset-1 dark:border-brandCareer/30 dark:bg-brandCareer/15 dark:text-brandCareer dark:hover:bg-transparent dark:focus-visible:ring-offset-0"
            >
              {labels.expressInterest}
            </Link>
          ) : (
            <Link
              href={{ pathname: "/career/login" as const }}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brandCareer focus-visible:ring-offset-1 dark:border-white/10 dark:text-white/50 dark:hover:border-white/20 dark:hover:text-white/70 dark:focus-visible:ring-offset-0"
            >
              <Lock className="h-3.5 w-3.5 shrink-0" />
              {labels.employerLoginRequired}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
