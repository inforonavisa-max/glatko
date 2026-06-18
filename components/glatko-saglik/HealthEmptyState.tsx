import { SearchX } from "lucide-react";
import { Link } from "@/i18n/navigation";

/**
 * H3 designed no-results state. Two flavours, same shell:
 *   • plain  — the specialty has no published providers at all (H2 behaviour).
 *   • filtered — providers exist but the active filters matched none → offer
 *     "clear filters" (link to the bare specialty) + "nearby cities" chips
 *     (K3 coastal→Podgorica clustering resolved by the caller).
 *
 * Sync server-render, no client JS; labels + nearby-city links passed in (the
 * page owns the translator + the city resolver). Mirrors the [specialty] empty
 * block (dashed border, SearchX, brandHealth accent) so the design language
 * stays consistent.
 */
export type NearbyCityChip = {
  slug: string;
  name: string;
};

export function HealthEmptyState({
  specialtySlug,
  filtered,
  labels,
  nearbyCities,
}: {
  specialtySlug: string;
  /** true when filters are active (offers clear-filters + nearby-city chips). */
  filtered: boolean;
  labels: {
    title: string;
    body: string;
    clearFilters: string;
    nearbyCities: string;
  };
  /** Pre-resolved nearby-city suggestions (caller applies K3 clustering). */
  nearbyCities: NearbyCityChip[];
}) {
  return (
    <div className="mt-12 rounded-2xl border border-dashed border-gray-300 bg-white/50 p-10 text-center dark:border-white/15 dark:bg-white/5">
      <SearchX className="mx-auto h-8 w-8 text-gray-400" />
      <h2 className="mt-4 font-semibold text-gray-900 dark:text-white">
        {labels.title}
      </h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500 dark:text-white/50">
        {labels.body}
      </p>

      {filtered && (
        <div className="mt-6 flex flex-col items-center gap-5">
          {/* Clear filters → bare specialty list (no searchParams). */}
          <Link
            href={{
              pathname: "/health/[specialty]",
              params: { specialty: specialtySlug },
            }}
            className="inline-flex items-center rounded-full bg-brandHealth-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brandHealth-700"
          >
            {labels.clearFilters}
          </Link>

          {nearbyCities.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white/40">
                {labels.nearbyCities}
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                {nearbyCities.map((c) => (
                  <Link
                    key={c.slug}
                    href={{
                      pathname: "/health/[specialty]/[city]",
                      params: { specialty: specialtySlug, city: c.slug },
                    }}
                    className="rounded-full border border-brandHealth-50 bg-white px-3 py-1 text-sm text-brandHealth-700 transition-colors hover:border-brandHealth-100 dark:border-brandHealth/30 dark:bg-white/5 dark:text-brandHealth"
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
