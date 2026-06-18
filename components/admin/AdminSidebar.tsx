"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  ClipboardList,
  FolderTree,
  LayoutDashboard,
  Star,
  Stethoscope,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  locale: string;
  adminEmail: string;
  /** Health vertical flag (server-read) — hides the Sağlık nav while the vertical is dark. */
  healthEnabled: boolean;
}

/**
 * G-ADMIN-1 Faz 1: sidebar nav for the admin panel. 5 entries; active
 * state computed from the current pathname (exact match for /admin
 * dashboard root, prefix match for sub-sections so detail pages keep
 * the parent highlighted).
 *
 * Tailwind v3 explicit colours only — no shadcn v4 design tokens
 * (memory item 21).
 */
export function AdminSidebar({ locale, adminEmail, healthEnabled }: Props) {
  const pathname = usePathname();

  const items: Array<{
    href: string;
    label: string;
    icon: typeof Users;
  }> = [
    {
      href: `/${locale}/admin`,
      label: "Dashboard",
      icon: LayoutDashboard,
    },
    {
      href: `/${locale}/admin/users`,
      label: "Üyeler",
      icon: Users,
    },
    {
      href: `/${locale}/admin/professionals`,
      label: "Profesyoneller",
      icon: Briefcase,
    },
    {
      href: `/${locale}/admin/requests`,
      label: "Talepler",
      icon: ClipboardList,
    },
    {
      href: `/${locale}/admin/reviews`,
      label: "Değerlendirmeler",
      icon: Star,
    },
    {
      href: `/${locale}/admin/categories`,
      label: "Kategoriler",
      icon: FolderTree,
    },
  ];

  // Sağlık vertical ships dark — only surface its admin nav when the flag is on (the
  // /admin/saglik subtree 404s when off, so the link would otherwise be a dead end).
  if (healthEnabled) {
    items.push({
      href: `/${locale}/admin/saglik`,
      label: "Sağlık",
      icon: Stethoscope,
    });
  }

  const dashboardRoot = `/${locale}/admin`;

  return (
    <aside className="w-full md:w-56 md:shrink-0">
      <div className="rounded-2xl border border-gray-200/80 bg-white/80 p-4 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
        <div className="mb-4 px-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/40">
            Glatko
          </div>
          <div className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">
            Yönetim Paneli
          </div>
        </div>

        <nav className="space-y-1">
          {items.map((item) => {
            const isExact = pathname === item.href;
            const isPrefix =
              item.href !== dashboardRoot && pathname?.startsWith(item.href);
            const isActive = Boolean(isExact || isPrefix);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-teal-500/10 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300"
                    : "text-gray-700 hover:bg-gray-100 dark:text-white/70 dark:hover:bg-white/[0.04]",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 border-t border-gray-200/80 pt-3 dark:border-white/[0.08]">
          <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/40">
            Giriş
          </div>
          <div className="mt-1 truncate px-2 text-xs text-gray-600 dark:text-white/60">
            {adminEmail}
          </div>
        </div>
      </div>
    </aside>
  );
}
