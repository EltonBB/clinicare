"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { LogOut, Settings } from "lucide-react";

import { logoutAction } from "@/app/(auth)/actions";
import { refreshWorkspaceNotificationsAction } from "@/app/(workspace)/actions";
import { BrandMark } from "@/components/brand-mark";
import { LogoutButton } from "@/components/auth/logout-button";
import { GlobalSearch } from "@/components/layout/global-search";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { SettingsDialog } from "@/components/layout/settings-dialog";
import { WorkspaceLiveProvider } from "@/components/layout/workspace-live-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { resolveBrandAccentPreset } from "@/lib/branding";
import { navigationItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type AppShellNotification = {
  id: string;
  title: string;
  detail: string;
};

function navLinkClasses(isActive: boolean) {
  return cn(
    "flex h-10 items-center gap-3 rounded-(--radius-tile) border border-transparent px-3 text-sm font-semibold text-muted-foreground transition-[background-color,border-color,color] duration-(--duration-base) hover:bg-[#f7f9fc] hover:text-foreground active:bg-[#eef2f8]",
    isActive &&
      "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground active:bg-primary/92"
  );
}

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
  unreadCount?: number;
  notifications?: AppShellNotification[];
};

export function AppShell({
  children,
  businessName = "Rivera Health & Wellness",
  ownerName = "Alex Rivera",
  ownerEmail = "owner@vela.app",
  ownerPhone = "",
  brandAccentColor = null,
  logoUrl = null,
  unreadCount = 0,
  notifications = [],
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const accent = useMemo(
    () => resolveBrandAccentPreset(brandAccentColor),
    [brandAccentColor]
  );
  const accentVars = useMemo<Record<`--${string}`, string>>(
    () => ({
      // Override the accent family so the chosen color recolors every
      // primary/accent surface in the workspace (bg-primary, rings, charts…).
      "--primary": accent.value,
      "--primary-hover": accent.hover,
      "--primary-soft": accent.soft,
      "--primary-shadow": accent.shadow,
      "--ring": accent.value,
      "--accent": accent.soft,
      "--accent-foreground": accent.value,
      "--sidebar-primary": accent.value,
      "--sidebar-ring": accent.value,
      "--chart-1": accent.value,
      "--workspace-accent": accent.value,
      "--workspace-accent-soft": accent.soft,
      "--workspace-accent-shadow": accent.shadow,
    }),
    [accent]
  );
  const [liveUnreadCount, setLiveUnreadCount] = useState(unreadCount);
  const [unreadInitialized, setUnreadInitialized] = useState(false);
  const [liveNotifications, setLiveNotifications] = useState(notifications);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const logoutFormRef = useRef<HTMLFormElement>(null);
  const businessInitial = (businessName || "V").charAt(0).toUpperCase();
  // Published to descendants (e.g. the dashboard Messages card) so they read
  // this single poll instead of starting their own.
  const liveUnread = useMemo(
    () => ({ unreadCount: liveUnreadCount, initialized: unreadInitialized }),
    [liveUnreadCount, unreadInitialized]
  );

  useEffect(() => {
    // Mirror the accent onto <html> so portaled surfaces (dialogs, dropdowns)
    // inherit it too. Reset on unmount so auth/marketing keep Vela's brand.
    const root = document.documentElement;
    const entries = Object.entries(accentVars);

    for (const [key, value] of entries) {
      root.style.setProperty(key, value);
    }

    return () => {
      for (const [key] of entries) {
        root.style.removeProperty(key);
      }
    };
  }, [accentVars]);

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
      setUnreadInitialized(true);
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
      className="app-shell-bg relative min-h-screen overflow-x-clip bg-background"
      style={accentVars as CSSProperties}
    >
      <div className="relative flex min-h-screen bg-background lg:min-h-screen lg:overflow-x-clip">
        <aside className="hidden w-64 shrink-0 border-r border-sidebar-border/80 bg-white backdrop-blur-xl lg:flex">
          <div className="sticky top-0 flex h-screen w-full flex-col bg-white p-3">
            <div className="mb-4 px-2 py-2">
              <BrandMark href="/dashboard" includeSubtitle={false} size="lg" />
            </div>

            <nav className="flex-1 space-y-1.5 px-0.5 py-2">
            {navigationItems
              .filter((item) => item.href !== "/settings")
              .map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    className={navLinkClasses(isActive)}
                    onFocus={() => prefetchRoute(item.href)}
                    onMouseEnter={() => prefetchRoute(item.href)}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-2 border-t border-sidebar-border/70 px-0.5 pt-2.5">
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="flex w-full items-center gap-2.5 rounded-(--radius-tile) border border-transparent px-2 py-2 text-left transition-[background-color,border-color] duration-(--duration-base) hover:bg-[#f7f9fc] data-[popup-open]:bg-[#f7f9fc]"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-(--radius-tile) border border-border/70 bg-white text-sm font-semibold text-primary">
                    {logoUrl ? (
                      <span
                        aria-hidden="true"
                        className="size-full bg-contain bg-center bg-no-repeat"
                        style={{ backgroundImage: `url("${logoUrl}")` }}
                      />
                    ) : (
                      businessInitial
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold leading-4 text-foreground">
                      {businessName}
                    </span>
                    <span className="block truncate text-[11px] leading-4 text-muted-foreground">
                      {ownerName}
                    </span>
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="start"
                  sideOffset={8}
                  className="min-w-[208px]"
                >
                  <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                    <Settings className="size-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => logoutFormRef.current?.requestSubmit()}
                  >
                    <LogOut className="size-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <form ref={logoutFormRef} action={logoutAction} className="hidden" />
            </div>
          </div>
        </aside>

        <div className="relative flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border/70 bg-white px-4 py-3 backdrop-blur-xl sm:px-5 lg:px-6 lg:py-0">
            <div className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 lg:h-[56px] lg:gap-5">
              <div className="flex min-w-[148px] items-center">
                <BrandMark compact href="/dashboard" className="lg:hidden" />
              </div>
              <GlobalSearch className="hidden min-w-0 w-full max-w-3xl justify-self-center md:block" />
              <div className="flex items-center gap-1.5">
                <NotificationsMenu unreadCount={liveUnreadCount} items={liveNotifications} />
                <div className="lg:hidden">
                  <LogoutButton />
                </div>
              </div>
            </div>
            <GlobalSearch className="mt-3 w-full md:hidden" />
          </header>

          <main className="relative flex-1 bg-background px-4 py-3 pb-28 sm:px-5 lg:px-6 lg:py-4 lg:pb-4">
            <WorkspaceLiveProvider value={liveUnread}>{children}</WorkspaceLiveProvider>
          </main>
        </div>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-30 rounded-(--radius-field) border border-border/80 bg-white/96 px-2 py-2 shadow-[0_12px_28px_rgba(20,21,47,0.07)] backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-7 gap-1">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const mobileNavClasses = cn(
              "flex flex-col items-center gap-1 rounded-(--radius-field) border border-transparent px-2 py-2 text-[11px] font-medium text-muted-foreground transition-[background-color,border-color,color,transform] duration-(--duration-base) active:bg-[#eef2f8]",
              isActive &&
                "bg-primary text-primary-foreground active:bg-primary/92"
            );

            if (item.href === "/settings") {
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className={mobileNavClasses}
                >
                  <Icon className="size-4" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                className={mobileNavClasses}
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

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        ownerName={ownerName}
        ownerEmail={ownerEmail}
        ownerPhone={ownerPhone}
      />
    </div>
  );
}
