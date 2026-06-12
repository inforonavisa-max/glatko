import type { Metadata } from "next";

// H0 SEO quarantine (MASTER_PLAN Demir Kural 8): every health route ships
// noindex + stays out of the sitemap until the H11 launch PR reverses it.
// Canonical/hreflang are intentionally NOT emitted for noindex pages
// (buildAlternates stays unused here); middleware also skips the hreflang
// Link headers for these prefixes.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function HealthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
