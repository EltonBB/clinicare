"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { BadgeCheck } from "lucide-react";

import { refreshWorkspaceNotificationsAction } from "@/app/(workspace)/actions";
import { BrandMark } from "@/components/brand-mark";
import { LogoutButton } from "@/components/auth/logout-button";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { OwnerAccountDialog } from "@/components/layout/owner-account-dialog";
import { WorkspaceTour } from "@/components/layout/workspace-tour";
import { resolveBrandAccentPreset } from "@/lib/branding";
import { navigationItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

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
  const accent = resolveBrandAccentPreset(brandAccentColor);
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
      case "/inbox":
        return "inbox-nav";
      case "/settings":
        return "settings-nav";
      default:
        return undefined;
    }
  }

  useEffect(() => {
    let cancelled = false;

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

    void refreshNotifications();

    const interval = window.setInterval(() => {
      void refreshNotifications();
    }, 3500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pathname]);

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
        <aside className="hidden w-[284px] shrink-0 px-4 py-4 lg:flex">
          <div
            className="sticky top-4 flex h-[calc(100vh-2rem)] w-full flex-col rounded-[1.45rem] border border-sidebar-border/80 bg-white/92 p-4 shadow-[0_12px_28px_rgba(20,32,51,0.04)]"
            data-tour="sidebar-shell"
          >
            <div className="px-2 pb-5 pt-2">
              <Link
                href="/dashboard"
                className="group flex items-center gap-3 rounded-[1.1rem] px-1 py-1"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-[1rem] bg-primary text-sm font-semibold uppercase text-primary-foreground shadow-[0_12px_24px_var(--primary-shadow)]">
                  {logoUrl ? (
                    <span
                      aria-hidden="true"
                      className="size-full rounded-[1rem] bg-cover bg-center"
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

              if (item.href === "/inbox") {
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={navClasses}
                    data-tour={getTourTarget(item.href)}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </a>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={navClasses}
                  data-tour={getTourTarget(item.href)}
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
          <header className="sticky top-0 z-20 px-4 pt-4 sm:px-6 lg:px-8">
            <div className="mx-auto flex h-[4.5rem] w-full max-w-[1600px] items-center justify-between gap-4 rounded-[1.2rem] border border-border/80 bg-white/92 px-5 shadow-[0_10px_24px_rgba(20,32,51,0.035)]">
              <div className="flex min-w-0 items-center gap-3">
                <div className="lg:hidden">
                  <BrandMark compact href="/dashboard" />
                </div>
                <Link
                  href="/dashboard"
                  className="hidden text-lg font-semibold tracking-[0.08em] text-foreground transition-colors hover:text-primary lg:block"
                >
                  Vela
                </Link>
              </div>
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
          </header>

          <main className="page-gutter relative flex-1 py-6 pb-28 lg:pb-10 lg:pt-8">
            {children}
          </main>
        </div>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-30 rounded-[1.25rem] border border-border/80 bg-white/94 px-2 py-2 shadow-[0_12px_28px_rgba(20,32,51,0.06)] lg:hidden">
        <div className="grid grid-cols-6 gap-1">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const mobileNavClasses = cn(
              "flex flex-col items-center gap-1 rounded-[1rem] px-2 py-2 text-[11px] font-medium text-muted-foreground transition-[background-color,color,transform] duration-200",
              isActive && "bg-primary/8 text-foreground shadow-[0_8px_18px_rgba(20,32,51,0.035)] ring-1 ring-primary/20"
            );

            if (item.href === "/inbox") {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={mobileNavClasses}
                  data-tour={getTourTarget(item.href)}
                >
                  <Icon className="size-4" />
                  <span className="truncate">{item.label}</span>
                </a>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={mobileNavClasses}
                data-tour={getTourTarget(item.href)}
              >
                <Icon className="size-4" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <WorkspaceTour initialCompleted={tourCompleted} scopeId={tourScopeId} />
    </div>
  );
}
