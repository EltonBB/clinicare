"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { refreshWorkspaceNotificationsAction } from "@/app/(workspace)/actions";
import { BrandMark } from "@/components/brand-mark";
import { LogoutButton } from "@/components/auth/logout-button";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { OwnerAccountDialog } from "@/components/layout/owner-account-dialog";
import { UpgradeModalTrigger } from "@/components/upgrade/upgrade-modal-trigger";
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
  unreadCount?: number;
  notifications?: AppShellNotification[];
};

export function AppShell({
  children,
  businessName = "Rivera Health & Wellness",
  ownerName = "Alex Rivera",
  ownerEmail = "owner@vela.app",
  ownerPhone = "",
  unreadCount = 0,
  notifications = [],
}: AppShellProps) {
  const pathname = usePathname();
  const [liveUnreadCount, setLiveUnreadCount] = useState(unreadCount);
  const [liveNotifications, setLiveNotifications] = useState(notifications);

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
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="relative flex min-h-screen">
        <aside className="hidden w-[284px] shrink-0 px-4 py-4 lg:flex">
          <div className="sticky top-4 flex h-[calc(100vh-2rem)] w-full flex-col rounded-[1.45rem] border border-sidebar-border/80 bg-white/92 p-4 shadow-[0_12px_28px_rgba(20,32,51,0.04)]">
            <div className="px-2 pb-5 pt-2">
              <BrandMark />
            </div>

            <nav className="flex-1 space-y-1.5 px-1 py-2">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const navClasses = cn(
                "interactive-lift flex items-center gap-3 rounded-[1rem] px-4 py-3 text-sm font-medium text-muted-foreground transition-[background-color,color,box-shadow,transform] duration-200 hover:bg-white hover:text-foreground hover:shadow-[0_8px_18px_rgba(20,32,51,0.035)]",
                isActive &&
                  "bg-white text-foreground shadow-[0_10px_22px_rgba(20,32,51,0.04)] ring-1 ring-border/70"
              );

              if (item.href === "/inbox") {
                return (
                  <a key={item.href} href={item.href} className={navClasses}>
                    <Icon className="size-4" />
                    {item.label}
                  </a>
                );
              }

              return (
                <Link key={item.href} href={item.href} className={navClasses}>
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
            </nav>

            <div className="mt-4 space-y-4 border-t border-sidebar-border/70 px-1 pt-5">
              <div className="surface-soft space-y-3 rounded-[1.05rem] px-4 py-4 text-sm">
                <p className="font-medium text-foreground">Vela Pro Access</p>
                <p className="leading-6 text-muted-foreground">
                Unlock automation, advanced analytics, and premium client
                experiences.
                </p>
                <UpgradeModalTrigger triggerClassName="w-full" />
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
                <div className="hidden min-w-0 lg:block">
                  <div className="flex items-center gap-3">
                    <p className="truncate text-lg font-semibold text-foreground">
                      Vela
                    </p>
                    <span className="text-sm text-border">|</span>
                    <p className="truncate text-sm font-medium text-muted-foreground">
                      {businessName}
                    </p>
                  </div>
                </div>
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
              isActive && "bg-secondary/90 text-foreground shadow-[0_8px_18px_rgba(20,32,51,0.035)]"
            );

            if (item.href === "/inbox") {
              return (
                <a key={item.href} href={item.href} className={mobileNavClasses}>
                  <Icon className="size-4" />
                  <span className="truncate">{item.label}</span>
                </a>
              );
            }

            return (
              <Link key={item.href} href={item.href} className={mobileNavClasses}>
                <Icon className="size-4" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
