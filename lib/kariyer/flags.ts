/**
 * C0 (docs/career/career-vertical-plan-v1.md, Phase 0): the career vertical
 * ships dark. Vercel env matrix — Production=false, Preview=true,
 * Development=true. The flag only flips in Production with Rohat's written
 * launch approval. Read at request time in both middleware (edge) and
 * layouts/pages (node), so no NEXT_PUBLIC_ prefix.
 */
export function isCareerVerticalEnabled(): boolean {
  return process.env.CAREER_VERTICAL_ENABLED === "true";
}
