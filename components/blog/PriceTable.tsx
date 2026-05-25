/**
 * PriceTable — renders a `priceTable` body block for cost-guide posts.
 *
 * Strings arrive already localized (the GROQ projection flattens
 * `content.$locale`). Prices are numbers + a shared currency, formatted
 * here. Horizontally scrollable on narrow screens.
 */

export interface PriceTableRow {
  service: string;
  priceLow: number;
  priceHigh?: number;
  unit?: string;
  notes?: string;
}

const CURRENCY_SYMBOL: Record<string, string> = { EUR: "€", USD: "$" };

export function PriceTable({
  heading,
  currency = "EUR",
  rows,
  caption,
}: {
  heading?: string;
  currency?: string;
  rows: PriceTableRow[];
  caption?: string;
}) {
  if (!rows || rows.length === 0) return null;
  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  const hasNotes = rows.some((r) => r.notes);

  return (
    <figure className="my-10">
      {heading ? (
        <figcaption className="mb-4 font-serif text-2xl font-semibold text-gray-900 dark:text-white">
          {heading}
        </figcaption>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-gray-200/70 dark:border-white/[0.08]">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200/70 bg-gray-50 text-gray-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/60">
              <th className="px-4 py-3 font-medium">Service</th>
              <th className="px-4 py-3 text-right font-medium">Price</th>
              {hasNotes ? (
                <th className="px-4 py-3 font-medium">Notes</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-gray-100 last:border-0 dark:border-white/[0.06]"
              >
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                  {row.service}
                  {row.unit ? (
                    <span className="ml-1 text-xs font-normal text-gray-500 dark:text-white/50">
                      ({row.unit})
                    </span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-gray-900 dark:text-white">
                  {symbol}
                  {row.priceLow}
                  {row.priceHigh != null ? `–${symbol}${row.priceHigh}` : null}
                </td>
                {hasNotes ? (
                  <td className="px-4 py-3 text-gray-600 dark:text-white/60">
                    {row.notes ?? ""}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caption ? (
        <p className="mt-3 text-sm italic text-gray-500 dark:text-white/50">
          {caption}
        </p>
      ) : null}
    </figure>
  );
}
