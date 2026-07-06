"use client";

import Link from "next/link";
import { ArrowRight, Bell } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
};

type NotificationsMenuProps = {
  unreadCount: number;
  items: NotificationItem[];
};

export function NotificationsMenu({
  unreadCount,
  items,
}: NotificationsMenuProps) {
  const hasUpdates = unreadCount > 0 && items.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Open notifications"
        className="relative inline-flex size-9 items-center justify-center rounded-(--radius-tile) border border-transparent text-muted-foreground transition-[background-color,border-color,color,transform] duration-(--duration-base) hover:border-border/70 hover:bg-[#f7f9fc] hover:text-foreground active:scale-[0.97] active:bg-[#eef2f8]"
      >
        <Bell className="size-[18px]" />
        {unreadCount > 0 ? (
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full border-2 border-white bg-primary" />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-[340px] rounded-(--radius-panel) border border-border/80 bg-white p-0 shadow-(--shadow-pop)"
      >
        <div className="border-b border-border/70 px-4 py-3.5">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {hasUpdates
              ? `${unreadCount} unread message${unreadCount === 1 ? "" : "s"} waiting for you`
              : "All clear. Nothing needs your attention right now."}
          </p>
        </div>

        <div className="space-y-0.5 px-2 py-2">
          {hasUpdates ? (
            items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="flex items-start gap-2.5 rounded-(--radius-tile) px-2.5 py-2.5 transition-colors duration-(--duration-base) hover:bg-[#f7f9fc]"
              >
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    {item.detail}
                  </span>
                </span>
              </Link>
            ))
          ) : (
            <div className="rounded-(--radius-card) border border-border/75 bg-[#fbfcfe] px-3 py-3 text-xs leading-5 text-muted-foreground">
              No new notifications yet. Check back later or open the inbox to
              review recent conversations.
            </div>
          )}
        </div>

        <div className="border-t border-border/70 px-4 py-2.5">
          <Link
            href="/inbox"
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
            )}
          >
            Open inbox
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
