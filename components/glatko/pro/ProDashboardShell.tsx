"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Search, Gavel, User, Settings, Menu, X, CheckCircle, MessageSquare, Package, CalendarDays, UserCog } from "lucide-react";
import { BackgroundGrids } from "@/components/aceternity/background-grids";
import { cn } from "@/lib/utils";
import type { ProfessionalProfile } from "@/types/glatko";

interface Props {
  children: React.ReactNode;
  profile: ProfessionalProfile;
  locale: string;
  translations: {
    home: string;
    requests: string;
    bids: string;
    profile: string;
    settings: string;
    inbox: string;
    packages: string;
    availability: string;
    editProfile: string;
  };
}

const NAV_ITEMS = [
  { key: "home", href: "/pro/dashboard", icon: Home, exact: true },
  { key: "requests", href: "/pro/dashboard/requests", icon: Search },
  { key: "bids", href: "/pro/dashboard/bids", icon: Gavel },
  { key: "inbox", href: "/messages", icon: MessageSquare },
  { key: "packages", href: "/pro/dashboard/packages", icon: Package },
  { key: "availability", href: "/pro/dashboard/availability", icon: CalendarDays },
  { key: "editProfile", href: "/pro/dashboard/profile", icon: UserCog },
  { key: "profile", href: "/provider", icon: User, external: true },
  { key: "settings", href: "/settings/notifications", icon: Settings },
] as const;

export function ProDashboardShell({ children, profile, locale, translations }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const displayName = profile.business_name || profile.profile?.full_name || "Pro";

  function isActive(href: string, exact?: boolean) {
    const full = `/${locale}${href}`;
    return exact ? pathname === full : pathname.startsWith(full);
  }

  const navContent = NAV_ITEMS.map((item) => {
    const Icon = item.icon;
    const active = isActive(item.href, "exact" in item ? item.exact : false);
    const href = item.key === "profile" ? `/${locale}/provider/${profile.id}` : `/${locale}${item.href}`;
    const label = translations[item.key as keyof typeof translations];

    return (
      <Link
        key={item.key}
        href={href}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200",
          active
            ? "bg-teal-500/10 text-teal-600 border-l-2 border-teal-500 dark:text-teal-400"
            : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-white/50 dark:hover:bg-white/[0.04] dark:hover:text-white/80"
        )}
      >
        <Icon className="h-5 w-5" />
        <span>{label}</span>
      </Link>
    );
  });

  return (
    <div className="relative min-h-screen bg-[#F8F6F0] dark:bg-[#0b1f23]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ opacity: 0.1 }}>
        <BackgroundGrids />
      </div>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute left-1/4 top-1/4 h-[500px] w-[500px] rounded-full bg-teal-500/[0.04] blur-[120px] dark:bg-teal-500/[0.06]" />
        <div className="absolute bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full bg-cyan-500/[0.03] blur-[100px] dark:bg-cyan-500/[0.05]" />
      </div>

      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 border-r border-gray-200/50 bg-white/80 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[#0b1f23]/80 md:block">
        <div className="flex h-full flex-col">
          <div className="border-b border-gray-200/50 p-6 dark:border-white/[0.06]">
            <Link href={`/${locale}`} className="inline-flex items-center gap-1">
              <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">Glatko</span>
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-teal-500" />
            </Link>
          </div>

          <div className="border-b border-gray-200/50 p-4 dark:border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-500/10 text-sm font-bold text-teal-600 dark:text-teal-400">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{displayName}</p>
                <div className="flex items-center gap-1">
                  {profile.is_verified && <CheckCircle className="h-3 w-3 text-teal-500 dark:text-teal-400" />}
                  <span className="text-xs text-gray-400 dark:text-white/40">
                    {profile.is_verified ? "Verified" : profile.verification_status}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 p-4">{navContent}</nav>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between border-b border-gray-200/50 bg-white/80 px-4 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[#0b1f23]/80 md:hidden">
        <Link href={`/${locale}`} className="inline-flex items-center gap-1">
          <span className="text-lg font-bold text-gray-900 dark:text-white">Glatko</span>
          <span className="mt-0.5 h-1 w-1 rounded-full bg-teal-500" />
        </Link>
        <button onClick={() => setMobileOpen(true)} className="p-2 text-gray-600 dark:text-white/60" aria-label="Menu">
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-50 bg-black/60 md:hidden"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed left-0 top-0 z-50 h-screen w-72 border-r border-gray-200/50 bg-white dark:border-white/[0.06] dark:bg-[#0b1f23] md:hidden"
            >
              <div className="flex h-16 items-center justify-between border-b border-gray-200/50 px-4 dark:border-white/[0.06]">
                <span className="text-lg font-bold text-gray-900 dark:text-white">Glatko<span className="text-teal-500">.</span></span>
                <button onClick={() => setMobileOpen(false)} className="p-2 text-gray-500 dark:text-white/60" aria-label="Close">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-500/10 text-sm font-bold text-teal-600 dark:text-teal-400">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{displayName}</p>
                    <p className="text-xs text-gray-400 dark:text-white/40">{profile.verification_status}</p>
                  </div>
                </div>
                <nav className="space-y-1">{navContent}</nav>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="relative z-10 min-h-screen pt-16 md:ml-64 md:pt-0">
        <div className="p-4 md:p-8 lg:p-12">{children}</div>
      </main>
    </div>
  );
}
