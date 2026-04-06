"use client";

import Link from "next/link";
import { Bell } from "lucide-react";

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
        className="relative inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Bell className="size-5" />
        {unreadCount > 0 ? (
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-[320px] rounded-[0.95rem] border border-border bg-card p-0 shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
      >
        <div className="border-b border-border px-4 py-4">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasUpdates
              ? `${unreadCount} unread message${unreadCount === 1 ? "" : "s"} in your inbox`
              : "All clear. Your clinic inbox is quiet right now."}
          </p>
        </div>

        <div className="space-y-2 px-3 py-3">
          {hasUpdates ? (
            items.map((item) => (
              <Link
                key={item.id}
                href="/inbox"
                className="block rounded-[0.8rem] border border-border px-3 py-3 transition-colors hover:bg-secondary/55"
              >
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {item.detail}
                </p>
              </Link>
            ))
          ) : (
            <div className="rounded-[0.8rem] border border-dashed border-border px-3 py-4 text-sm leading-6 text-muted-foreground">
              No new notifications yet. Check back later or open the inbox to
              review recent conversations.
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 py-3">
          <Link
            href="/inbox"
            className={cn(
              "inline-flex text-sm font-medium text-primary transition-opacity hover:opacity-80"
            )}
          >
            Open inbox
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
