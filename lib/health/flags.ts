/**
 * H0 (docs/health/MASTER_PLAN.md, Demir Kural 1): the health vertical ships
 * dark. Vercel env matrix — Production=false, Preview=true, Development=true.
 * The flag only flips in Production with Rohat's written launch approval
 * (H11 checklist). Read at request time in both middleware (edge) and
 * layouts/pages (node), so no NEXT_PUBLIC_ prefix.
 */
export function isHealthVerticalEnabled(): boolean {
  return process.env.HEALTH_VERTICAL_ENABLED === "true";
}
