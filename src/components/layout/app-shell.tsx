"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { LogOut, Settings } from "lucide-react";

import { logoutAction } from "@/app/(auth)/actions";
import { refreshWorkspaceNotificationsAction } from "@/app/(workspace)/actions";
import { BrandMark } from "@/components/brand-mark";
import { LogoutButton } from "@/components/auth/logout-button";
import {
  GlobalSearchPalette,
  GlobalSearchTrigger,
  useGlobalSearchHotkey,
} from "@/components/layout/global-search";
import { NotificationsMenu, type NotificationItem } from "@/components/layout/notifications-menu";
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

function navLinkClasses(isActive: boolean) {
  return cn(
    "flex h-10 items-center gap-3 rounded-(--radius-tile) border border-transparent px-3 text-sm font-semibold text-muted-foreground transition-[background-color,border-color,color] duration-(--duration-base) hover:bg-[#f7f9fc] hover:text-foreground active:bg-[#eef2f8]",
    isActive &&
      "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground active:bg-primary/92"
  );
}

function formatBadgeCount(count: number) {
  return count > 99 ? "99+" : String(count);
}

// A count bubble on a nav item. Inverted on the active (primary-filled) item so
// it stays visible; the visible number is backed by a screen-reader label.
function NavCountBadge({
  count,
  isActive,
  className,
}: {
  count: number;
  isActive: boolean;
  className?: string;
}) {
  if (count <= 0) {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-semibold leading-none tabular-nums",
        isActive ? "bg-white text-primary" : "bg-primary text-primary-foreground",
        className
      )}
    >
      {count > 9 ? "9+" : count}
      <span className="sr-only"> unread</span>
    </span>
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
  // Combined bell total (inbox + staff messages + check-ins) — the bell badge only.
  unreadCount?: number;
  // Patient-inbox-only unread — feeds WorkspaceLiveContext (dashboard KPI, Messages card).
  inboxUnreadCount?: number;
  notifications?: NotificationItem[];
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
  inboxUnreadCount = 0,
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
  // The bell's own combined total (inbox + staff messages + check-ins) — feeds
  // ONLY the bell badge/header, never WorkspaceLiveContext (see below).
  const [liveUnreadCount, setLiveUnreadCount] = useState(unreadCount);
  // Patient-inbox-only unread — this, not the combined total above, is what
  // WorkspaceLiveContext publishes: its existing consumers (dashboard "Unread
  // messages" KPI, the Messages card badge) specifically mean unread
  // conversations, and would silently start counting staff chatter/check-ins
  // as messages needing a reply if fed the combined total instead.
  const [liveInboxUnreadCount, setLiveInboxUnreadCount] = useState(inboxUnreadCount);
  const [unreadInitialized, setUnreadInitialized] = useState(false);
  const [liveNotifications, setLiveNotifications] = useState(notifications);
  const [liveStaffUnreadCount, setLiveStaffUnreadCount] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const logoutFormRef = useRef<HTMLFormElement>(null);
  const businessInitial = (businessName || "V").charAt(0).toUpperCase();
  // The count badge on a nav item (sidebar + mobile bottom nav): Inbox for
  // patient-conversation unread, Staff for staff-thread messages plus unseen
  // check-ins. Neither source drives any other nav item.
  const navBadgeCount = useCallback(
    (href: string) => {
      if (href === "/inbox") return liveInboxUnreadCount;
      if (href === "/staff") return liveStaffUnreadCount;
      return 0;
    },
    [liveInboxUnreadCount, liveStaffUnreadCount]
  );

  // Show the total in the browser tab ("(3) Dashboard | Vela") so new
  // activity is noticeable from another tab. Next rewrites <title> on every
  // navigation, so re-apply the prefix whenever <head> changes.
  useEffect(() => {
    const applyTitlePrefix = () => {
      const base = document.title.replace(/^\(\d+\+?\) /, "");
      const next = liveUnreadCount > 0 ? `(${formatBadgeCount(liveUnreadCount)}) ${base}` : base;
      if (document.title !== next) {
        document.title = next;
      }
    };
    applyTitlePrefix();
    const observer = new MutationObserver(applyTitlePrefix);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [liveUnreadCount]);
  // Published to descendants (e.g. the dashboard Messages card) so they read
  // this single poll instead of starting their own. Inbox-only count — see
  // liveInboxUnreadCount above.
  const liveUnread = useMemo(
    () => ({ unreadCount: liveInboxUnreadCount, initialized: unreadInitialized }),
    [liveInboxUnreadCount, unreadInitialized]
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

  // "/" opens the search palette from anywhere, like most apps that dock
  // search in the sidebar — disabled while search or Settings is already
  // open so it can't stack a second modal on top of one that's showing.
  useGlobalSearchHotkey(() => setSearchOpen(true), searchOpen || settingsOpen);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      navigationItems.forEach((item) => prefetchRoute(item.href));
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [prefetchRoute]);

  useEffect(() => {
    let cancelled = false;
    let interval: number | undefined;

    // Keeps polling while the tab is in the background (browsers throttle
    // hidden-tab timers on their own): the "(3)" tab-title count is meant to
    // be seen from another tab, so it has to keep updating there.
    async function refreshNotifications() {
      const result = await refreshWorkspaceNotificationsAction();

      if (!result.ok || !result.view || cancelled) {
        return;
      }

      setLiveUnreadCount(result.view.unreadCount);
      setLiveInboxUnreadCount(result.view.inboxUnreadCount);
      setLiveNotifications(result.view.notifications);
      setLiveStaffUnreadCount(result.view.staffUnreadCount);
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

            <div className="mb-3 px-0.5">
              <GlobalSearchTrigger compact onOpen={() => setSearchOpen(true)} />
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
                    <NavCountBadge
                      count={navBadgeCount(item.href)}
                      isActive={isActive}
                      className="ml-auto"
                    />
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
            <div className="flex w-full items-center gap-4 lg:h-[56px] lg:gap-5">
              <BrandMark compact href="/dashboard" className="lg:hidden" />
              <div className="ml-auto flex items-center gap-1.5">
                <NotificationsMenu
                  unreadCount={liveUnreadCount}
                  items={liveNotifications}
                  hasInboxUnread={liveInboxUnreadCount > 0}
                  hasStaffUnread={liveStaffUnreadCount > 0}
                />
                <div className="lg:hidden">
                  <LogoutButton />
                </div>
              </div>
            </div>
            {/* Search moves into the sidebar at lg+ (compact instance above);
                below lg the sidebar is hidden, so this is the only way to search. */}
            <GlobalSearchTrigger className="mt-3 w-full lg:hidden" onOpen={() => setSearchOpen(true)} />
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
                <span className="relative inline-flex">
                  <Icon className="size-4" />
                  <NavCountBadge
                    count={navBadgeCount(item.href)}
                    isActive={isActive}
                    className="absolute -right-2.5 -top-2"
                  />
                </span>
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

      <GlobalSearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
