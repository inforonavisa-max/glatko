/**
 * "How it works" — generic 3-step marketplace flow (G-PSEO-FOUNDATION FAZ 3).
 * Template copy (all locales); not city- or service-specific.
 */
export interface HowItWorksStep {
  title: string;
  body: string;
}

export function HowItWorks({
  heading,
  steps,
}: {
  heading: string;
  steps: HowItWorksStep[];
}) {
  if (steps.length === 0) return null;
  return (
    <section className="mb-12">
      <h2 className="mb-6 font-serif text-xl font-semibold text-gray-900 dark:text-white">
        {heading}
      </h2>
      <ol className="grid gap-4 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li
            key={i}
            className="rounded-2xl border border-gray-200/50 bg-white/70 p-5 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/10 text-sm font-semibold text-teal-600 dark:text-teal-400">
              {i + 1}
            </span>
            <h3 className="mt-3 font-semibold text-gray-900 dark:text-white">
              {step.title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-white/60">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
