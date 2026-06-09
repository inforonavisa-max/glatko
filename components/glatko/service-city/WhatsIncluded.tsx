import { Check } from "lucide-react";

/**
 * "What's included" — a localized list of common sub-services for the combo
 * (G-PSEO-FOUNDATION FAZ 3). General framing only (İlke 1 — no vertical niche).
 */
export function WhatsIncluded({
  heading,
  items,
}: {
  heading: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="mb-12">
      <h2 className="mb-6 font-serif text-xl font-semibold text-gray-900 dark:text-white">
        {heading}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rounded-2xl border border-gray-200/50 bg-white/70 px-4 py-3 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]"
          >
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" />
            <span className="text-sm text-gray-700 dark:text-white/70">
              {item}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
