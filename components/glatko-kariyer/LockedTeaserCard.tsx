import { BadgeCheck, Lock } from "lucide-react";

/**
 * Landing teaser card (§01-landing layout item 4 — the "locked" affordance on
 * the static hero page). Sync server-render, no client JS, no data layer. This
 * is a PURELY presentational placeholder: it renders hardcoded, anonymized
 * sample data ONLY (worker_code + role/trade + experience band + region + a
 * couple of skill words). It NEVER reads the showcase view and NEVER carries a
 * name/phone/email — there is zero real identity here (IMPL-CONTRACT "No
 * identity leak"; spec edge case "ZERO real names/contacts even as sample
 * text"). The thumbnail is a greyed avatar block, face-blurred (`blur-sm
 * grayscale`) under a frosted overlay + `Lock` icon, communicating that the
 * full file unlocks only inside the gated pool. The whole card is
 * non-interactive teaser content (no <Link>) — the page owns the single
 * "Browse the talent pool" CTA below the row.
 *
 * Accent = amber / brandCareer (where health's ProviderCard uses sky /
 * brandHealth). Text accent uses `brandCareer-700` (AA-safe); chip/icon
 * surfaces may use `brandCareer`/`-50`. Mirrors the visual structure of
 * `components/glatko-saglik/ProviderCard.tsx`.
 */

/** Anonymized placeholder shape — a deliberate subset of the real showcase
 *  card (worker_code + role + region only, per the task note). No DB fields,
 *  no PII; values are baked sample text. */
export type LockedTeaserWorker = {
  workerCode: string;
  role: string;
  experienceBand: string;
  region: string;
  skills: string[];
};

/**
 * Static, representative sample placeholders for the landing teaser row. These
 * are NOT showcase-view reads — they are hardcoded so the landing page stays
 * `revalidate=3600` static-cacheable and leaks nothing. Worker codes follow the
 * `MNE-CW-####` pattern; roles/regions/skills are generic words.
 */
export const LOCKED_TEASER_WORKERS: readonly LockedTeaserWorker[] = [
  {
    workerCode: "MNE-CW-0427",
    role: "Mason",
    experienceBand: "5–10 yıl",
    region: "Balkanlar",
    skills: ["Bricklaying", "Plastering"],
  },
  {
    workerCode: "MNE-CW-0613",
    role: "Welder",
    experienceBand: "3–5 yıl",
    region: "Orta Doğu",
    skills: ["MIG/MAG", "TIG"],
  },
  {
    workerCode: "MNE-HK-0188",
    role: "Housekeeper",
    experienceBand: "1–3 yıl",
    region: "Uzak Doğu",
    skills: ["Housekeeping", "Laundry"],
  },
  {
    workerCode: "MNE-CK-0352",
    role: "Cook",
    experienceBand: "5–10 yıl",
    region: "Balkanlar",
    skills: ["À la carte", "Banquet"],
  },
] as const;

export function LockedTeaserCard({
  worker,
  labels,
}: {
  worker: LockedTeaserWorker;
  /** Localized labels (parent page owns the translator):
   *  `verified` = career trust mini-badge, `locked` = blurred-thumbnail overlay. */
  labels: { verified: string; locked: string };
}) {
  return (
    <div className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-premium-sm dark:border-white/10 dark:bg-white/5">
      <div className="flex gap-4">
        {/* Face-blurred / locked thumbnail: greyed avatar block under a frosted
            overlay + Lock icon. Decorative only (aria-hidden) — no real face. */}
        <div className="relative h-16 w-16 shrink-0">
          <div
            aria-hidden="true"
            className="h-16 w-16 rounded-xl bg-gradient-to-br from-gray-200 to-gray-300 blur-sm grayscale dark:from-white/15 dark:to-white/5"
          />
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/40 backdrop-blur-[2px] dark:bg-black/30">
            <Lock className="h-5 w-5 text-gray-500 dark:text-white/60" />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-mono text-sm font-semibold tracking-tight text-gray-900 dark:text-white">
                {worker.workerCode}
              </h3>
              <p className="truncate text-sm text-gray-500 dark:text-white/50">
                {worker.role}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brandCareer-50 px-2 py-0.5 text-xs font-medium text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
              <BadgeCheck className="h-3.5 w-3.5" />
              {labels.verified}
            </span>
          </div>

          {/* Experience band + region (region, NOT country — anonymized). */}
          <p className="mt-2 truncate text-sm text-gray-500 dark:text-white/50">
            {worker.experienceBand} · {worker.region}
          </p>

          {worker.skills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {worker.skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-white/10 dark:text-white/50"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Locked-state footer: the frosted "locked" affordance that signals the
          full file opens inside the gated pool. Static, non-interactive. */}
      <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3 dark:border-white/5">
        <Lock className="h-4 w-4 shrink-0 text-brandCareer" />
        <span className="text-sm text-gray-400 dark:text-white/40">
          {labels.locked}
        </span>
      </div>
    </div>
  );
}
