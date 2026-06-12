import { notFound } from "next/navigation";
import { isHealthVerticalEnabled } from "@/lib/health/flags";

// Defense-in-depth behind the middleware guard (see middleware.ts H0 block):
// if a request ever reaches a gated health route while the flag is off —
// e.g. a future middleware matcher regression — it still 404s here.
// The coming-soon page lives OUTSIDE this route group on purpose (K2).
export default function HealthGatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isHealthVerticalEnabled()) notFound();
  return children;
}
