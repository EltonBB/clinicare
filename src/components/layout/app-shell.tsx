"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { BadgeCheck, ShieldCheck } from "lucide-react";

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
      "--workspace-accent": accent.value,
      "--workspace-accent-soft": accent.soft,
      "--workspace-accent-shadow": accent.shadow,
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
      className="app-shell-bg relative min-h-screen overflow-hidden bg-background"
      style={
        {
          "--workspace-accent": accent.value,
          "--workspace-accent-soft": accent.soft,
          "--workspace-accent-shadow": accent.shadow,
        } as CSSProperties
      }
    >
      <div className="relative flex min-h-screen bg-background lg:min-h-screen lg:overflow-hidden lg:bg-[#f4f6fa]">
        <aside className="hidden w-[216px] shrink-0 border-r border-sidebar-border/80 bg-white backdrop-blur-xl lg:flex">
          <div
            className="sticky top-0 flex h-screen w-full flex-col bg-white p-3"
            data-tour="sidebar-shell"
          >
            <div className="mb-4 rounded-[0.7rem] border border-border/70 bg-[#f8fafc] p-2.5">
              <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[0.72rem] border border-border/75 bg-white text-primary">
                {logoUrl ? (
                  <span
                    aria-hidden="true"
                    className="size-full rounded-[0.72rem] bg-contain bg-center bg-no-repeat"
                    style={{ backgroundImage: `url("${logoUrl}")` }}
                  />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[var(--brand-ink)]">
                  {businessName}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {ownerName.split(" ")[0] ?? ownerName}
                </span>
              </span>
              </div>
            </div>

            <nav className="flex-1 space-y-1.5 px-0.5 py-2">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const navClasses = cn(
                "flex h-10 items-center gap-3 rounded-[0.62rem] border border-transparent px-3 text-sm font-semibold text-muted-foreground transition-[background-color,border-color,color] duration-200 hover:bg-[#f7f9fc] hover:text-foreground",
                isActive &&
                  "border-border/80 bg-[#f3f6fb] text-primary shadow-none ring-0"
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

            <div className="mt-2 space-y-2 border-t border-sidebar-border/70 px-0.5 pt-2.5">
              <div className="rounded-[0.62rem] border border-border/75 bg-[#f8fafc] px-2.5 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="vela-icon-tile size-7 rounded-[0.62rem]">
                    <BadgeCheck className="size-3.5" />
                  </span>
                  <p className="truncate font-semibold text-[var(--brand-ink)]">
                    Vela {planName} plan
                  </p>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-border/65 pt-2">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <span className="text-xs font-semibold text-primary">
                    {planStatus}
                  </span>
                </div>
              </div>

              <div className="rounded-[0.78rem] px-0.5 py-1">
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
                  className="mt-2 h-9 justify-center rounded-[0.72rem] bg-white"
                />
              </div>
            </div>
          </div>
        </aside>

        <div className="relative flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border/70 bg-white px-4 py-3 backdrop-blur-xl sm:px-5 lg:px-6 lg:py-0">
            <div className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 lg:h-[56px] lg:gap-5">
              <div className="flex min-w-[148px] items-center">
                <BrandMark href="/dashboard" includeSubtitle={false} className="hidden lg:flex" />
                <BrandMark compact href="/dashboard" className="lg:hidden" />
              </div>
              <GlobalSearch className="hidden min-w-0 w-full max-w-3xl justify-self-center md:block" />
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
            <GlobalSearch className="mt-3 w-full md:hidden" />
          </header>

          <main className="relative flex-1 bg-[#f4f6fa] px-4 py-3 pb-28 sm:px-5 lg:px-6 lg:py-4 lg:pb-4">
            {children}
          </main>
        </div>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-30 rounded-[1rem] border border-border/80 bg-white/96 px-2 py-2 shadow-[0_12px_28px_rgba(20,21,47,0.07)] backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-7 gap-1">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const mobileNavClasses = cn(
              "flex flex-col items-center gap-1 rounded-[1rem] border border-transparent px-2 py-2 text-[11px] font-medium text-muted-foreground transition-[background-color,border-color,color,transform] duration-200",
              isActive && "border-border/80 bg-white text-primary shadow-none"
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
