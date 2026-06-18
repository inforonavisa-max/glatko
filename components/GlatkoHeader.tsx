"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Menu, X, Mail, LogOut, User, Settings, ChevronDown, Briefcase, Target } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { useTheme } from "next-themes";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { useActiveVertical } from "@/lib/verticals/useActiveVertical";
import { HEALTH_ROUTES } from "@/lib/saglik/config";
import { CAREER_ROUTES } from "@/lib/kariyer/config";
import { cn } from "@/lib/utils";
import { UnreadBadge } from "@/components/glatko/messaging/UnreadBadge";
import { SearchTrigger } from "@/components/glatko/search/SearchTrigger";
import * as Sentry from "@sentry/nextjs";

// G-PERF-1: NotificationBell pulls in @supabase/ssr (realtime subscription).
// Anonymous visitors don't render it (gated by userId) so split it into its
// own chunk and skip SSR. Saves ~60 KB unused JS on the homepage.
const NotificationBell = dynamic(
  () =>
    import("@/components/glatko/notifications/NotificationDropdown").then(
      (m) => m.NotificationBell,
    ),
  { ssr: false, loading: () => null },
);

interface GlatkoHeaderProps {
  userId?: string | null;
  isPro?: boolean;
  isAdmin?: boolean;
}

export function GlatkoHeader({
  userId,
  isPro = false,
  isAdmin = false,
}: GlatkoHeaderProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();
  const reduced = useReducedMotion();
  // KATMAN 2 is vertical-aware (data-vertical attr below). Content branches per
  // vertical: SERVICES keeps the full reverse-marketplace header; HEALTH/CAREER
  // get a minimal header — no reverse-marketplace links, no in-header search, no
  // "request service" CTA (those are meaningless outside services). HEALTH also
  // surfaces a provider-join link. Global chrome (language, theme, login/profile,
  // notifications) stays on every vertical.
  const activeVertical = useActiveVertical();
  const isServices = activeVertical === "services";
  const isHealth = activeVertical === "health";
  const isCareer = activeVertical === "career";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [headerOpacity, setHeaderOpacity] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 12);
      setHeaderOpacity(Math.min(0.8, (y / 200) * 0.8));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setMobileOpen(false); setAvatarOpen(false); }, [pathname]);

  const handleLogout = useCallback(async () => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.setUser(null);
    }
    // G-PERF-1: dynamic import keeps @supabase/ssr out of the homepage chunk.
    // Header is shipped on every page but signOut only fires on click.
    const { createClient } = await import("@/supabase/browser");
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }, []);

  const isDark = mounted && resolvedTheme === "dark";
  const headerBg =
    !mounted || headerOpacity < 0.02
      ? "transparent"
      : isDark
        ? `rgba(8, 8, 8, ${headerOpacity})`
        : `rgba(255, 255, 255, ${headerOpacity})`;

  const guestLinks = [
    { href: "/services", label: t("nav.services") },
    { href: "/#how-it-works", label: t("nav.howItWorks"), isAnchor: true },
    { href: "/become-a-pro", label: t("nav.becomeAPro") },
  ];

  const customerLinks = [
    { href: "/services", label: t("nav.services") },
    { href: "/dashboard/requests", label: t("nav.requests") },
    { href: "/become-a-pro", label: t("nav.becomeAPro") },
    { href: "/messages", label: t("nav.inbox"), hasIcon: true },
  ];

  const proLinks = [
    { href: "/services", label: t("nav.services") },
    { href: "/pro/dashboard", label: t("nav.proDashboard") },
    { href: "/pro/dashboard/leads", label: t("nav.leads"), hasLeadsIcon: true },
    { href: "/messages", label: t("nav.inbox"), hasIcon: true },
  ];

  const baseNavLinks = !userId ? guestLinks : isPro ? proLinks : customerLinks;
  const navLinks =
    userId && isAdmin
      ? [
          ...baseNavLinks,
          {
            href: "/admin/professionals",
            label: t("nav.adminPanel"),
            hasAdminIcon: true,
          },
        ]
      : baseNavLinks;

  const baseDropdownItems = isPro
    ? [
        { href: "/pro/dashboard", label: t("nav.proDashboard") },
        { href: "/pro/dashboard/leads", label: t("nav.leads"), icon: Target },
        { href: "/messages", label: t("nav.inbox") },
        { href: "/settings/profile", label: t("nav.userProfile"), icon: User },
        { href: "/pro/dashboard/profile", label: t("nav.businessProfile") },
        { href: "/settings/notifications", label: t("nav.settings") },
      ]
    : [
        { href: "/dashboard/requests", label: t("nav.requests") },
        { href: "/become-a-pro", label: t("nav.becomeAPro"), icon: Briefcase },
        { href: "/messages", label: t("nav.inbox") },
        { href: "/settings/profile", label: t("nav.userProfile"), icon: User },
        { href: "/settings/notifications", label: t("nav.settings") },
      ];

  const dropdownItems =
    userId && isAdmin
      ? [
          {
            href: "/admin/professionals",
            label: t("nav.adminPanel"),
            icon: Settings,
          },
          ...baseDropdownItems,
        ]
      : baseDropdownItems;

  return (
    <>
      <header
        data-vertical={activeVertical}
        className={cn(
          // KATMAN 2 (lower layer): in-flow inside the combined sticky header
          // block (app/[locale]/layout.tsx) — no longer position:fixed; the
          // wrapper owns the sticky-to-top behaviour. The scroll-driven
          // background/border below is unchanged.
          "relative w-full z-50 transition-[border-color] duration-300",
          scrolled
            ? "border-b border-black/5 backdrop-blur-md dark:border-white/5"
            : "border-b border-transparent"
        )}
        style={{ backgroundColor: headerBg }}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-1">
            <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
              Glatko
            </span>
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-teal-500" />
          </Link>

          {isServices && (
          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((l) => {
              const isActive = pathname === l.href;
              if ("isAnchor" in l) {
                return (
                  <a
                    key={l.href}
                    href={l.href}
                    className="rounded-md px-4 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
                  >
                    {l.label}
                  </a>
                );
              }
              return (
                <Link
                  key={l.href}
                  // @ts-expect-error -- nav config href is string-typed; runtime URLs are valid pathnames
                  href={l.href}
                  className={cn(
                    "rounded-md px-4 py-2 text-xs font-medium transition-colors",
                    "hasIcon" in l || "hasAdminIcon" in l || "hasLeadsIcon" in l
                      ? "flex items-center gap-1.5 text-teal-600 dark:text-teal-400"
                      : isActive
                        ? "bg-gray-100 text-gray-900 dark:bg-neutral-800 dark:text-white"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
                  )}
                >
                  {"hasIcon" in l && <Mail className="h-3.5 w-3.5" />}
                  {"hasAdminIcon" in l && <Settings className="h-3.5 w-3.5" />}
                  {"hasLeadsIcon" in l && <Target className="h-3.5 w-3.5" />}
                  {l.label}
                  {userId && l.href === "/messages" ? <UnreadBadge /> : null}
                </Link>
              );
            })}
          </nav>
          )}

          <div className="hidden items-center gap-3 md:flex">
            {isServices && <SearchTrigger className="w-40 lg:w-56" />}
            {isHealth && (
              <Link
                href={HEALTH_ROUTES.providerJoin}
                className="rounded-md px-4 py-2 text-xs font-medium text-teal-600 transition-colors hover:bg-teal-50 hover:text-teal-700 dark:text-teal-400 dark:hover:bg-teal-500/10"
              >
                {t("nav.healthProviderJoin")}
              </Link>
            )}
            {/* Career vertical (C0) — employer-facing nav. Accent = amber-600
                (brandCareer) where Health uses teal/sky. Route keys are typed
                (registered in i18n/routing.ts); the CTA points at the bulk
                requisition wizard. TODO(i18n-deck): nav.careerTalentPool /
                careerHowItWorks / careerSectors / careerEmployerJoin /
                careerCreateRequisition keys are owned by the dictionary deck
                (tr/en) — falls back to the key string until they land. */}
            {isCareer && (
              <>
                <Link
                  href={CAREER_ROUTES.pool}
                  className="rounded-md px-4 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-amber-50 hover:text-amber-700 dark:text-neutral-400 dark:hover:bg-amber-500/10"
                >
                  {t("nav.careerTalentPool")}
                </Link>
                <Link
                  href={CAREER_ROUTES.howItWorks}
                  className="rounded-md px-4 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-amber-50 hover:text-amber-700 dark:text-neutral-400 dark:hover:bg-amber-500/10"
                >
                  {t("nav.careerHowItWorks")}
                </Link>
                <Link
                  href={CAREER_ROUTES.sectors}
                  className="rounded-md px-4 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-amber-50 hover:text-amber-700 dark:text-neutral-400 dark:hover:bg-amber-500/10"
                >
                  {t("nav.careerSectors")}
                </Link>
                <Link
                  href={CAREER_ROUTES.employerJoin}
                  className="rounded-md px-4 py-2 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-50 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-500/10"
                >
                  {t("nav.careerEmployerJoin")}
                </Link>
                <Link
                  // Typed route key registered in i18n/routing.ts. Not exposed
                  // as a CAREER_ROUTES.* constant (lib/kariyer/config is owned
                  // by the core deck, R14) — the bulk-requisition wizard is the
                  // employer conversion CTA, so the key is used directly here.
                  href="/career/employer/dashboard/requisitions/new"
                  className="rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-amber-500/25 transition-all hover:shadow-amber-500/40"
                >
                  {t("nav.careerCreateRequisition")}
                </Link>
              </>
            )}
            {userId && <NotificationBell userId={userId} />}
            <LanguageSwitcher />
            <ThemeToggle />

            {userId ? (
              <div className="relative">
                <button
                  onClick={() => setAvatarOpen(!avatarOpen)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-all hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-500 text-[10px] font-bold text-white">
                    <User className="h-3.5 w-3.5" />
                  </div>
                  <ChevronDown className="h-3 w-3 text-gray-400" />
                </button>
                <AnimatePresence>
                  {avatarOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96, filter: "blur(10px)" }}
                      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                      exit={{ opacity: 0, scale: 0.96, filter: "blur(10px)" }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-gray-200 bg-white p-2 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
                    >
                      {dropdownItems.map((item) => (
                        <Link
                          key={item.href}
                          // @ts-expect-error -- dropdown config href is string-typed; runtime URLs are valid pathnames
                          href={item.href}
                          className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                        >
                          {"icon" in item && item.icon ? (
                            <item.icon className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                          ) : null}
                          {item.label}
                        </Link>
                      ))}
                      <div className="my-1 border-t border-gray-100 dark:border-neutral-800" />
                      <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                      >
                        <LogOut className="h-4 w-4" />
                        {t("auth.logout")}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-lg px-4 py-2 text-xs font-medium text-gray-700 transition-all hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  {t("nav.login")}
                </Link>
                {isServices && (
                  <Link
                    href="/request-service"
                    className={cn(
                      "rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40",
                      !reduced && "animate-teal-pulse"
                    )}
                  >
                    {t("nav.requestService")}
                  </Link>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-1 md:hidden">
            {isServices && <SearchTrigger variant="icon" />}
            <button
              className="p-2 text-gray-700 dark:text-white"
              onClick={() => setMobileOpen(true)}
              aria-label={t("nav.menu")}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Close avatar dropdown on outside click */}
      {avatarOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setAvatarOpen(false)} />
      )}

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-[100] flex flex-col bg-white dark:bg-[#0b1f23]"
          >
            <div className="flex h-16 items-center justify-between border-b border-gray-200 px-4 dark:border-white/10">
              <Link href="/" className="flex items-center gap-1">
                <span className="text-xl font-bold text-gray-900 dark:text-white">Glatko</span>
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-teal-500" />
              </Link>
              <button onClick={() => setMobileOpen(false)} className="p-2" aria-label={t("common.close")}>
                <X className="h-5 w-5 text-gray-700 dark:text-white" />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-1 px-4 py-6">
              {isServices && navLinks.map((l) => (
                <Link
                  key={l.href}
                  // @ts-expect-error -- nav config href is string-typed; runtime URLs are valid pathnames
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "border-b border-gray-100 py-3 text-lg font-medium dark:border-white/5",
                    "hasIcon" in l || "hasAdminIcon" in l || "hasLeadsIcon" in l
                      ? "flex items-center gap-2 text-teal-600 dark:text-teal-400"
                      : "text-gray-900 dark:text-white"
                  )}
                >
                  {"hasIcon" in l && <Mail className="h-5 w-5" />}
                  {"hasAdminIcon" in l && (
                    <Settings className="h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" />
                  )}
                  {"hasLeadsIcon" in l && <Target className="h-5 w-5" />}
                  {l.label}
                  {userId && l.href === "/messages" ? <UnreadBadge /> : null}
                </Link>
              ))}

              {isHealth && (
                <Link
                  href={HEALTH_ROUTES.providerJoin}
                  onClick={() => setMobileOpen(false)}
                  className="border-b border-gray-100 py-3 text-lg font-medium text-teal-600 dark:border-white/5 dark:text-teal-400"
                >
                  {t("nav.healthProviderJoin")}
                </Link>
              )}

              {/* Career vertical (C0) — mobile employer nav mirror of the
                  desktop block. Amber-600 (brandCareer) accent; same TODO on
                  the deck-owned nav.career* dictionary keys as desktop. */}
              {isCareer && (
                <>
                  <Link
                    href={CAREER_ROUTES.pool}
                    onClick={() => setMobileOpen(false)}
                    className="border-b border-gray-100 py-3 text-lg font-medium text-gray-900 dark:border-white/5 dark:text-white"
                  >
                    {t("nav.careerTalentPool")}
                  </Link>
                  <Link
                    href={CAREER_ROUTES.howItWorks}
                    onClick={() => setMobileOpen(false)}
                    className="border-b border-gray-100 py-3 text-lg font-medium text-gray-900 dark:border-white/5 dark:text-white"
                  >
                    {t("nav.careerHowItWorks")}
                  </Link>
                  <Link
                    href={CAREER_ROUTES.sectors}
                    onClick={() => setMobileOpen(false)}
                    className="border-b border-gray-100 py-3 text-lg font-medium text-gray-900 dark:border-white/5 dark:text-white"
                  >
                    {t("nav.careerSectors")}
                  </Link>
                  <Link
                    href={CAREER_ROUTES.employerJoin}
                    onClick={() => setMobileOpen(false)}
                    className="border-b border-gray-100 py-3 text-lg font-medium text-amber-600 dark:border-white/5 dark:text-amber-400"
                  >
                    {t("nav.careerEmployerJoin")}
                  </Link>
                  <Link
                    // Typed route key registered in i18n/routing.ts (see
                    // desktop CTA note) — bulk-requisition wizard.
                    href="/career/employer/dashboard/requisitions/new"
                    onClick={() => setMobileOpen(false)}
                    className="mt-3 w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3 text-center text-sm font-semibold uppercase tracking-wider text-white shadow-lg shadow-amber-500/30"
                  >
                    {t("nav.careerCreateRequisition")}
                  </Link>
                </>
              )}

              {userId && (
                <>
                  <Link
                    href="/settings/profile"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 border-b border-gray-100 py-3 text-lg font-medium text-gray-900 dark:border-white/5 dark:text-white"
                  >
                    <User className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                    {t("nav.userProfile")}
                  </Link>
                  {isPro && (
                    <Link
                      href="/pro/dashboard/profile"
                      onClick={() => setMobileOpen(false)}
                      className="border-b border-gray-100 py-3 text-lg font-medium text-gray-900 dark:border-white/5 dark:text-white"
                    >
                      {t("nav.businessProfile")}
                    </Link>
                  )}
                  <Link
                    href="/settings/notifications"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 border-b border-gray-100 py-3 text-lg font-medium text-gray-900 dark:border-white/5 dark:text-white"
                  >
                    <Settings className="h-5 w-5" />
                    {t("nav.settings")}
                  </Link>
                </>
              )}

              <div className="mt-6 flex flex-col gap-3">
                {userId ? (
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 py-3 text-sm font-medium text-red-600 dark:border-red-500/20 dark:text-red-400"
                  >
                    <LogOut className="h-4 w-4" />
                    {t("auth.logout")}
                  </button>
                ) : (
                  <>
                    <Link
                      href="/login"
                      onClick={() => setMobileOpen(false)}
                      className="w-full rounded-xl border border-teal-500 py-3 text-center text-sm font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400"
                    >
                      {t("nav.login")}
                    </Link>
                    {isServices && (
                      <Link
                        href="/request-service"
                        onClick={() => setMobileOpen(false)}
                        className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 py-3 text-center text-sm font-semibold uppercase tracking-wider text-white shadow-lg shadow-teal-500/30"
                      >
                        {t("nav.requestService")}
                      </Link>
                    )}
                  </>
                )}
              </div>

              <div className="mt-auto flex items-center gap-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                {userId && <NotificationBell userId={userId} />}
                <LanguageSwitcher dropdownPlacement="above" />
                <ThemeToggle />
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
