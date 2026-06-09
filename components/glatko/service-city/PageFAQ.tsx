import { ArrowRight } from "lucide-react";

/**
 * Page-specific FAQ (G-PSEO-FOUNDATION FAZ 3). Native <details>/<summary> — no
 * client JS, answers always in the DOM (FAQ rich-result eligible). The matching
 * FAQPage JSON-LD is emitted by the page from the same data (single source).
 */
export interface PageFAQItem {
  question: string;
  answer: string;
}

export function PageFAQ({
  heading,
  faqs,
}: {
  heading: string;
  faqs: PageFAQItem[];
}) {
  if (faqs.length === 0) return null;
  return (
    <section className="mb-12">
      <h2 className="mb-6 font-serif text-xl font-semibold text-gray-900 dark:text-white">
        {heading}
      </h2>
      <div className="space-y-3">
        {faqs.map((entry, i) => (
          <details
            key={i}
            className="group rounded-2xl border border-gray-200/50 bg-white/70 px-5 py-4 backdrop-blur-sm transition-all duration-200 open:border-teal-500/30 open:bg-teal-500/[0.04] dark:border-white/[0.08] dark:bg-white/[0.03] dark:open:border-teal-500/20"
          >
            <summary className="cursor-pointer list-none text-sm font-medium text-gray-900 marker:hidden dark:text-white">
              <span className="flex items-center justify-between gap-4">
                <span>{entry.question}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-teal-600 transition-transform duration-200 group-open:rotate-90 dark:text-teal-400" />
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-white/60">
              {entry.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
