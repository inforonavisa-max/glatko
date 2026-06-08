/**
 * Homepage FAQ item keys — the single source shared by:
 *   - the visible accordion (components/glatko/landing/FAQ.tsx), and
 *   - the FAQPage JSON-LD (app/[locale]/page.tsx).
 *
 * Each key `n` maps to the dictionary entries `landing.faq.q{n}` (question)
 * and `landing.faq.a{n}` (answer) in dictionaries/{locale}.json. Keeping the
 * key list in one place guarantees the structured data and the on-page
 * content stay in lockstep, which Google's FAQ rich-result policy requires.
 */
export const HOME_FAQ_KEYS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
] as const;
