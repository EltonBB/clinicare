"use client";

import Link from "next/link";
import { ArrowRight, Bell, Gift, TriangleAlert } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n/client";
import { plural } from "@/i18n/format";
import { cn } from "@/lib/utils";
import { HoverPrefetchLink } from "@/components/workspace/hover-prefetch-link";

import type { ReminderWarning } from "@/app/(workspace)/actions";

export type NotificationItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
};

type NotificationsMenuProps = {
  unreadCount: number;
  items: NotificationItem[];
  hasInboxUnread: boolean;
  hasStaffUnread: boolean;
  /** A WhatsApp problem while visits coming up are owed reminders (see reminderWarning). */
  reminderWarning: ReminderWarning;
  onOpenWhatsAppSettings: () => void;
  /** The free Pro trial is on offer: "new" (first week, the bell shows a dot) or "open". */
  proTrialOffer: "new" | "open" | null;
  onOpenBillingSettings: () => void;
};

export function NotificationsMenu({
  unreadCount,
  items,
  hasInboxUnread,
  hasStaffUnread,
  reminderWarning,
  onOpenWhatsAppSettings,
  proTrialOffer,
  onOpenBillingSettings,
}: NotificationsMenuProps) {
  const { locale, m } = useI18n();
  const t = m.shell.notifications;
  const warning = reminderWarning ? m.shell.reminderWarning[reminderWarning] : null;
  const hasUpdates = unreadCount > 0 && items.length > 0;
  // The footer CTA should always land somewhere relevant to what's actually
  // outstanding — driven by the true (uncapped) per-source flags, not the
  // capped visible list, so a busy source can't make this pick a destination
  // that doesn't match what's really pending. "Open inbox" only makes sense
  // while inbox unread is nonzero; once ALL that's pending is staff activity
  // (messages or check-ins), send the click there instead of a page with
  // nothing relevant on it.
  const hasOnlyStaffUnread = !hasInboxUnread && hasStaffUnread;
  const footerHref = hasOnlyStaffUnread
    ? (items.find((item) => item.href !== "/inbox")?.href ?? "/staff")
    : "/inbox";
  const footerLabel = hasOnlyStaffUnread ? t.openStaffMessages : t.openInbox;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t.open}
        className="relative inline-flex size-9 items-center justify-center rounded-(--radius-tile) border border-transparent text-muted-foreground transition-[background-color,border-color,color,transform] duration-(--duration-base) hover:border-border/70 hover:bg-[#f7f9fc] hover:text-foreground active:scale-[0.97] active:bg-[#eef2f8]"
      >
        <Bell className="size-[18px]" />
        {unreadCount > 0 || warning || proTrialOffer === "new" ? (
          <span
            className={cn(
              "absolute right-1.5 top-1.5 size-2 rounded-full border-2 border-white",
              warning ? "bg-amber-500" : "bg-primary"
            )}
          />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-[340px] rounded-(--radius-panel) border border-border/80 bg-white p-0 shadow-(--shadow-pop)"
      >
        <div className="px-4 pb-1.5 pt-3.5">
          <p className="text-sm font-semibold text-foreground">{t.title}</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {hasUpdates
              ? plural(t.unread, unreadCount, locale)
              : warning
                ? t.remindersNeedAttention
                : t.allClear}
          </p>
        </div>

        {/* Nothing pending: the header already says "All clear", so there is
            no second empty message (and no box) below it. */}
        {warning || hasUpdates || proTrialOffer ? (
          <div className="space-y-0.5 px-2 py-2">
            {warning ? (
              // A menu item (not a plain button) so choosing it closes the menu
              // before the settings dialog opens over it.
              <DropdownMenuItem
                onClick={onOpenWhatsAppSettings}
                className="items-start gap-2.5 rounded-(--radius-tile) px-2.5 py-2.5 transition-colors duration-(--duration-base) hover:bg-amber-50 focus:bg-amber-50"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{warning.title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{warning.detail}</span>
                </span>
              </DropdownMenuItem>
            ) : null}
            {proTrialOffer ? (
              <DropdownMenuItem
                onClick={onOpenBillingSettings}
                className="items-start gap-2.5 rounded-(--radius-tile) px-2.5 py-2.5 transition-colors duration-(--duration-base) hover:bg-[#f7f9fc] focus:bg-[#f7f9fc]"
              >
                <Gift className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{t.proTrial.title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{t.proTrial.detail}</span>
                </span>
              </DropdownMenuItem>
            ) : null}
            {hasUpdates ? (
              items.map((item) => (
                <HoverPrefetchLink
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
                </HoverPrefetchLink>
              ))
            ) : null}
          </div>
        ) : null}

        <div className="px-4 pb-3 pt-1.5">
          <Link
            href={footerHref}
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
            )}
          >
            {footerLabel}
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
