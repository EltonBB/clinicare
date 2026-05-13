"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { BadgeCheck } from "lucide-react";

import { refreshWorkspaceNotificationsAction } from "@/app/(workspace)/actions";
import { BrandMark } from "@/components/brand-mark";
import { LogoutButton } from "@/components/auth/logout-button";
import { GlobalSearch } from "@/components/layout/global-search";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { OwnerAccountDialog } from "@/components/layout/owner-account-dialog";
import { resolveBrandAccentPreset } from "@/lib/branding";
import { navigationItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const WorkspaceTour = dynamic(
  () => import("@/components/layout/workspace-tour").then((mod) => mod.WorkspaceTour),
  { ssr: false }
);

type AppShellNotification = {
  id: string;
  title: string;
  detail: string;
};

type AppShellProps = {
  children: React.ReactNode;
  businessName?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  planName?: string;
  planStatus?: string;
  brandAccentColor?: string | null;
  logoUrl?: string | null;
  tourScopeId?: string;
  tourCompleted?: boolean;
  unreadCount?: number;
  notifications?: AppShellNotification[];
};

export function AppShell({
  children,
  businessName = "Rivera Health & Wellness",
  ownerName = "Alex Rivera",
  ownerEmail = "owner@vela.app",
  ownerPhone = "",
  planName = "Basic",
  planStatus = "active",
  brandAccentColor = null,
  logoUrl = null,
  tourScopeId = "default",
  tourCompleted = false,
  unreadCount = 0,
  notifications = [],
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const accent = useMemo(
    () => resolveBrandAccentPreset(brandAccentColor),
    [brandAccentColor]
  );
  const [liveUnreadCount, setLiveUnreadCount] = useState(unreadCount);
  const [liveNotifications, setLiveNotifications] = useState(notifications);

  useEffect(() => {
    const root = document.documentElement;
    const vars = {
      "--primary": accent.value,
      "--primary-soft": accent.soft,
      "--primary-shadow": accent.shadow,
      "--ring": accent.shadow,
      "--accent": accent.soft,
      "--accent-foreground": accent.value,
      "--sidebar-primary": accent.value,
      "--sidebar-ring": accent.shadow,
      "--chart-1": accent.value,
    };

    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
  }, [accent]);

  function getTourTarget(href: string) {
    switch (href) {
      case "/dashboard":
        return "dashboard-nav";
      case "/calendar":
        return "calendar-nav";
      case "/clients":
        return "clients-nav";
      case "/staff":
        return "staff-nav";
      case "/inbox":
        return "inbox-nav";
      case "/reports":
        return "reports-nav";
      case "/settings":
        return "settings-nav";
      default:
        return undefined;
    }
  }

  const prefetchRoute = useCallback((href: string) => {
    if (href !== pathname) {
      router.prefetch(href);
    }
  }, [pathname, router]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      navigationItems.forEach((item) => prefetchRoute(item.href));
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [prefetchRoute]);

  useEffect(() => {
    let cancelled = false;
    let interval: number | undefined;

    async function refreshNotifications() {
      if (document.visibilityState !== "visible") {
        return;
      }

      const result = await refreshWorkspaceNotificationsAction();

      if (!result.ok || !result.view || cancelled) {
        return;
      }

      setLiveUnreadCount(result.view.unreadCount);
      setLiveNotifications(result.view.notifications);
    }

    const timeout = window.setTimeout(() => {
      void refreshNotifications();
      interval = window.setInterval(() => {
        void refreshNotifications();
      }, 20000);
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      if (interval) {
        window.clearInterval(interval);
      }
    };
  }, []);

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-background"
      style={
        {
          "--primary": accent.value,
          "--primary-soft": accent.soft,
          "--primary-shadow": accent.shadow,
          "--ring": accent.shadow,
          "--accent": accent.soft,
          "--accent-foreground": accent.value,
          "--sidebar-primary": accent.value,
          "--sidebar-ring": accent.shadow,
          "--chart-1": accent.value,
        } as CSSProperties
      }
    >
      <div className="relative flex min-h-screen">
        <aside className="hidden w-[268px] shrink-0 border-r border-sidebar-border/80 bg-white/94 lg:flex">
          <div
            className="sticky top-0 flex h-screen w-full flex-col bg-white/94 p-4"
            data-tour="sidebar-shell"
          >
            <div className="px-2 pb-5 pt-2">
              <Link
                href="/dashboard"
                className="group flex items-center gap-3 rounded-[1.1rem] px-1 py-1"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-[0.75rem] bg-transparent text-sm font-semibold uppercase text-primary shadow-none">
                  {logoUrl ? (
                    <span
                      aria-hidden="true"
                      className="size-full rounded-[0.75rem] bg-contain bg-center bg-no-repeat"
                      style={{ backgroundImage: `url("${logoUrl}")` }}
                    />
                  ) : (
                    businessName.charAt(0)
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-lg font-semibold tracking-tight text-foreground">
                    {businessName}
                  </span>
                  <span className="block truncate text-xs font-medium text-muted-foreground">
                    {ownerName}
                  </span>
                </span>
              </Link>
            </div>

            <nav className="flex-1 space-y-1.5 px-1 py-2">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const navClasses = cn(
                "interactive-lift flex items-center gap-3 rounded-[1rem] px-4 py-3 text-sm font-medium text-muted-foreground transition-[background-color,color,box-shadow,transform] duration-200 hover:bg-white hover:text-foreground hover:shadow-[0_8px_18px_rgba(20,32,51,0.035)]",
                isActive &&
                  "bg-primary/8 text-foreground shadow-[0_10px_22px_rgba(20,32,51,0.04)] ring-1 ring-primary/25"
              );

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  className={navClasses}
                  data-tour={getTourTarget(item.href)}
                  onFocus={() => prefetchRoute(item.href)}
                  onMouseEnter={() => prefetchRoute(item.href)}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
            </nav>

            <div className="mt-4 space-y-4 border-t border-sidebar-border/70 px-1 pt-5">
              <div className="surface-soft rounded-[1.05rem] px-4 py-4 text-sm">
                <div className="flex items-center gap-2">
                  <BadgeCheck className="size-4 text-primary" />
                  <p className="font-semibold text-foreground">
                    Vela {planName} plan
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <span className="text-xs font-semibold text-primary">
                    {planStatus}
                  </span>
                </div>
              </div>

              <div className="glass-divider rounded-[1.05rem] px-3 py-3">
                <OwnerAccountDialog
                  ownerName={ownerName}
                  ownerEmail={ownerEmail}
                  ownerPhone={ownerPhone}
                  businessName={businessName}
                  variant="sidebar"
                />
                <LogoutButton
                  fullWidth
                  variant="outline"
                  className="mt-3 justify-center rounded-[0.9rem] bg-white/70"
                />
              </div>
            </div>
          </div>
        </aside>

        <div className="relative flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border/80 bg-white/94 px-4 py-3 sm:px-6 lg:px-8 lg:py-0">
            <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-5 lg:h-16">
              <div className="flex min-w-[88px] items-center gap-3">
                <div className="lg:hidden">
                  <BrandMark compact href="/dashboard" />
                </div>
                <Link
                  href="/dashboard"
                  className="hidden text-lg font-semibold text-foreground transition-colors hover:text-primary lg:block"
                >
                  Vela
                </Link>
              </div>
              <GlobalSearch className="hidden min-w-0 max-w-3xl flex-1 md:block" />
              <div className="flex items-center gap-2">
                <NotificationsMenu unreadCount={liveUnreadCount} items={liveNotifications} />
                <div className="hidden items-center gap-3 sm:flex">
                  <OwnerAccountDialog
                    ownerName={ownerName}
                    ownerEmail={ownerEmail}
                    ownerPhone={ownerPhone}
                    businessName={businessName}
                    variant="header"
                  />
                  <LogoutButton className="ml-2" />
                </div>
              </div>
            </div>
            <GlobalSearch className="mx-auto mt-3 w-full max-w-[1600px] md:hidden" />
          </header>

          <main className="page-gutter relative flex-1 py-6 pb-28 lg:pb-10 lg:pt-8">
            {children}
          </main>
        </div>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-30 rounded-[1.25rem] border border-border/80 bg-white/94 px-2 py-2 shadow-[0_12px_28px_rgba(20,32,51,0.06)] lg:hidden">
        <div className="grid grid-cols-7 gap-1">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const mobileNavClasses = cn(
              "flex flex-col items-center gap-1 rounded-[1rem] px-2 py-2 text-[11px] font-medium text-muted-foreground transition-[background-color,color,transform] duration-200",
              isActive && "bg-primary/8 text-foreground shadow-[0_8px_18px_rgba(20,32,51,0.035)] ring-1 ring-primary/20"
            );

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                className={mobileNavClasses}
                data-tour={getTourTarget(item.href)}
                onFocus={() => prefetchRoute(item.href)}
                onMouseEnter={() => prefetchRoute(item.href)}
              >
                <Icon className="size-4" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {!tourCompleted ? (
        <WorkspaceTour initialCompleted={tourCompleted} scopeId={tourScopeId} />
      ) : null}
    </div>
  );
}
