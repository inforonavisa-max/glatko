/**
 * Cost guide — semantic <table> of indicative price ranges (Cephe 3 / AEO).
 * Ranges come from lib/glatko/pricing.ts; the disclaimer is mandatory
 * (Master Plan İlke 5 — indicative ranges, never fabricated stats).
 */
export interface CostGuideRow {
  label: string;
  range: string;
}

export function CostGuideTable({
  heading,
  caption,
  columns,
  typicalLabel,
  typicalRange,
  rows,
  disclaimer,
}: {
  heading: string;
  caption: string;
  columns: { scenario: string; range: string };
  typicalLabel: string;
  typicalRange: string;
  rows: CostGuideRow[];
  disclaimer: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mb-12">
      <h2 className="mb-6 font-serif text-xl font-semibold text-gray-900 dark:text-white">
        {heading}
      </h2>
      <div className="overflow-hidden rounded-2xl border border-gray-200/50 bg-white/70 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-gray-200/60 dark:border-white/[0.08]">
              <th
                scope="col"
                className="px-5 py-3 font-semibold text-gray-900 dark:text-white"
              >
                {columns.scenario}
              </th>
              <th
                scope="col"
                className="px-5 py-3 text-right font-semibold text-gray-900 dark:text-white"
              >
                {columns.range}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-200/40 bg-teal-500/[0.04] dark:border-white/[0.06]">
              <th
                scope="row"
                className="px-5 py-3 font-medium text-gray-900 dark:text-white"
              >
                {typicalLabel}
              </th>
              <td className="px-5 py-3 text-right font-semibold text-teal-700 dark:text-teal-300">
                {typicalRange}
              </td>
            </tr>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-gray-200/40 last:border-0 dark:border-white/[0.06]"
              >
                <th
                  scope="row"
                  className="px-5 py-3 font-normal text-gray-700 dark:text-white/70"
                >
                  {row.label}
                </th>
                <td className="px-5 py-3 text-right text-gray-700 dark:text-white/70">
                  {row.range}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-gray-500 dark:text-white/40">
        {disclaimer}
      </p>
    </section>
  );
}
