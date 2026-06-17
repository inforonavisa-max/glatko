"use client";

import { useTranslations } from "next-intl";
import { User, Settings, CalendarClock, CalendarDays } from "lucide-react";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Glatko Sağlık — provider tree nav (H7a + H7b). Mirrors components/settings/SettingsNav:
 * randevular (day-ops dashboard) / profil / takvim / ayarlar tabs (the onboarding wizard at
 * /basvuru renders its own step indicator, so it's intentionally NOT a tab here — onboarding
 * is a one-time flow). randevular is first because it's the recurring landing the provider
 * lives in. brandHealth accent.
 */
const TABS = [
  { href: "/health-pro/randevular", labelKey: "randevular", icon: CalendarDays },
  { href: "/health-pro/profil", labelKey: "profil", icon: User },
  { href: "/health-pro/takvim", labelKey: "takvim", icon: CalendarClock },
  { href: "/health-pro/ayarlar", labelKey: "ayarlar", icon: Settings },
] as const;

type TabHref = (typeof TABS)[number]["href"];

export function SaglikProNav() {
  const t = useTranslations("healthVertical");
  const pathname = usePathname();
  const n = (k: string) => t(`pro.nav.${k}`);

  return (
    <nav
      aria-label={n("ariaLabel")}
      className="border-b border-gray-200 bg-white/70 backdrop-blur-sm dark:border-white/10 dark:bg-neutral-950/70"
    >
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <ul className="flex gap-1 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map(({ href, labelKey, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href as TabHref}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                    active
                      ? "border-brandHealth-600 text-brandHealth-700 dark:border-brandHealth dark:text-brandHealth"
                      : "border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900 dark:text-white/60 dark:hover:border-white/20 dark:hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {n(labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
