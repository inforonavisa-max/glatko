import type { ComponentProps } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";

/**
 * Internal-linking section (G-PSEO-FOUNDATION FAZ 3): related services in the
 * same city + the same service in other cities. Demand-driven city list (İlke 3
 * — no city priority). Empty groups are dropped.
 */
type Href = ComponentProps<typeof Link>["href"];

export interface RelatedLinkItem {
  label: string;
  href: Href;
}

export interface RelatedLinkGroup {
  heading: string;
  links: RelatedLinkItem[];
}

export function RelatedLinks({ groups }: { groups: RelatedLinkGroup[] }) {
  const visible = groups.filter((g) => g.links.length > 0);
  if (visible.length === 0) return null;
  return (
    <section className="mb-4 space-y-8">
      {visible.map((group, gi) => (
        <div key={gi}>
          <h2 className="mb-4 font-serif text-xl font-semibold text-gray-900 dark:text-white">
            {group.heading}
          </h2>
          <div className="flex flex-wrap gap-2">
            {group.links.map((link, li) => (
              <Link
                key={li}
                href={link.href}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200/60 bg-white/70 px-4 py-2 text-sm text-gray-700 backdrop-blur-sm transition hover:border-teal-500/30 hover:text-teal-700 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/70 dark:hover:text-teal-300"
              >
                {link.label}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
