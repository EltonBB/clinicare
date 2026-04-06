"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        <aside className="hidden w-[260px] shrink-0 border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col">
          <div className="border-b border-sidebar-border px-6 py-7">
            <BrandMark />
          </div>
          <nav className="flex-1 space-y-1 px-4 py-6">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const navClasses = cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
                isActive && "bg-sidebar-accent text-foreground"
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
          <div className="space-y-5 border-t border-sidebar-border px-4 py-5">
            <div className="border-t border-border/80 pt-5 text-sm">
              <p className="font-medium text-foreground">Vela Pro Access</p>
              <p className="mt-2 leading-6 text-muted-foreground">
                Unlock automation, advanced analytics, and premium client
                experiences.
              </p>
              <UpgradeModalTrigger triggerClassName="mt-4" />
            </div>
            <div className="border-t border-border/80 pt-5">
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
                className="mt-4 justify-center"
              />
            </div>
          </div>
        </aside>
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
            <div className="page-gutter flex h-18 items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="lg:hidden">
                  <BrandMark compact href="/dashboard" />
                </div>
                <div className="hidden min-w-0 lg:block">
                  <div className="flex items-center gap-3">
                    <p className="truncate text-lg font-semibold text-foreground">
                      Vela
                    </p>
                    <span className="text-sm text-muted-foreground">|</span>
                    <p className="truncate text-sm text-muted-foreground">
                      {businessName}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <NotificationsMenu unreadCount={unreadCount} items={notifications} />
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
          <main className="page-gutter flex-1 py-8 pb-28 lg:pb-10">{children}</main>
        </div>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-2 py-2 backdrop-blur-sm lg:hidden">
        <div className="grid grid-cols-6 gap-1">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const mobileNavClasses = cn(
              "flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium text-muted-foreground",
              isActive && "bg-secondary text-foreground"
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
