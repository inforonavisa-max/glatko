/**
 * Service × city intro — lead paragraph under the hero (G-PSEO-FOUNDATION FAZ 3).
 * Per-page copy; the page only renders it when the locale has authored content.
 */
export function Intro({ text }: { text: string }) {
  return (
    <p className="mb-10 max-w-3xl text-base leading-relaxed text-gray-600 dark:text-white/70">
      {text}
    </p>
  );
}
