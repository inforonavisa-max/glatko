import type { Metadata } from "next";

// Career SEO quarantine (IMPL-CONTRACT noindex rule): every career route ships
// noindex + stays out of the sitemap until the vertical's launch PR reverses it.
// Canonical/hreflang are intentionally NOT emitted for noindex pages
// (buildAlternates stays unused here); middleware also skips the hreflang
// Link headers for these prefixes.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function CareerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
