import { notFound } from "next/navigation";
import { isCareerVerticalEnabled } from "@/lib/kariyer/flags";

// Defense-in-depth behind the middleware guard (see middleware.ts career block):
// if a request ever reaches a gated career route while the flag is off —
// e.g. a future middleware matcher regression — it still 404s here.
// The coming-soon page lives OUTSIDE this route group on purpose (K2).
export default function CareerGatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isCareerVerticalEnabled()) notFound();
  return children;
}
