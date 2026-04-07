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
        className="interactive-lift relative inline-flex size-10 items-center justify-center rounded-[1rem] border border-transparent bg-white/40 text-muted-foreground transition-[background-color,color,border-color,box-shadow,transform] duration-200 hover:border-border/70 hover:bg-white/78 hover:text-foreground hover:shadow-[0_14px_28px_rgba(20,32,51,0.07)]"
      >
        <Bell className="size-5" />
        {unreadCount > 0 ? (
          <span className="absolute right-2 top-2 size-2.5 rounded-full border border-white bg-primary shadow-[0_0_0_4px_rgba(255,255,255,0.45)]" />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-[340px] rounded-[1.1rem] border border-border/80 bg-white/92 p-0 shadow-[0_26px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl"
      >
        <div className="glass-divider rounded-t-[1.1rem] px-5 py-4">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasUpdates
              ? `${unreadCount} unread message${unreadCount === 1 ? "" : "s"} in your inbox`
              : "All clear. Your clinic inbox is quiet right now."}
          </p>
        </div>

        <div className="space-y-2 px-4 py-4">
          {hasUpdates ? (
            items.map((item) => (
              <Link
                key={item.id}
                href="/inbox"
                className="interactive-lift block rounded-[0.95rem] border border-border/75 bg-white/74 px-4 py-3 transition-[background-color,border-color,box-shadow,transform] duration-200 hover:border-border hover:bg-secondary/55 hover:shadow-[0_18px_32px_rgba(20,32,51,0.06)]"
              >
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {item.detail}
                </p>
              </Link>
            ))
          ) : (
            <div className="rounded-[0.95rem] border border-dashed border-border/90 bg-white/52 px-4 py-4 text-sm leading-6 text-muted-foreground">
              No new notifications yet. Check back later or open the inbox to
              review recent conversations.
            </div>
          )}
        </div>

        <div className="glass-divider rounded-b-[1.1rem] px-5 py-3">
          <Link
            href="/inbox"
            className={cn(
              "inline-flex items-center gap-2 text-sm font-medium text-primary transition-opacity hover:opacity-80"
            )}
          >
            Open inbox
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
