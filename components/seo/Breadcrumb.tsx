"use client";

import { ChevronRight, Home } from "lucide-react";
import { useLocale } from "next-intl";
import type { ComponentProps } from "react";
import { Link } from "@/i18n/navigation";

export interface BreadcrumbCrumb {
  /** Localized display label. */
  name: string;
  /**
   * next-intl Link href: a route key ("/services") or a parametric pathname
   * object ({ pathname: "/services/[slug]", params: { slug } }). Concrete
   * strings like `/services/${slug}` are NOT localized by next-intl and would
   * emit non-localized /services/... links (SEO-FIX-1 A2).
   */
  href: ComponentProps<typeof Link>["href"];
}

interface BreadcrumbProps {
  items: BreadcrumbCrumb[];
}

/**
 * SEO + a11y breadcrumb. RTL-aware (chevron mirrors in Arabic), keyboard
 * focusable, mobile horizontal-scroll on overflow. Matches the GlatkoHeader
 * grayscale palette so it sits quietly under the page hero.
 */
export function Breadcrumb({ items }: BreadcrumbProps) {
  const locale = useLocale();
  const isRTL = locale === "ar";

  return (
    <nav
      aria-label="Breadcrumb"
      className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8"
      dir={isRTL ? "rtl" : "ltr"}
    >
      <ol className="flex items-center gap-2 overflow-x-auto text-sm text-gray-600 dark:text-neutral-400">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li
              key={`${item.href}-${index}`}
              className="flex shrink-0 items-center gap-2"
            >
              {index === 0 && (
                <Home className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              {isLast ? (
                <span
                  aria-current="page"
                  className="max-w-[14rem] truncate font-medium text-gray-900 dark:text-white"
                >
                  {item.name}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="max-w-[14rem] truncate transition hover:text-gray-900 dark:hover:text-white"
                >
                  {item.name}
                </Link>
              )}
              {!isLast && (
                <ChevronRight
                  className={`h-3.5 w-3.5 shrink-0 ${isRTL ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
