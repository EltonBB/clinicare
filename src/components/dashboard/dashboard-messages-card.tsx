"use client";

import Link from "next/link";
import { useState } from "react";
import { MessageSquareText } from "lucide-react";

import { WorkspaceCard } from "@/components/workspace/workspace-layout";
import {
  useWorkspaceConversationPreviews,
  useWorkspaceUnreadCount,
} from "@/components/layout/workspace-live-context";
import { cn } from "@/lib/utils";
import type { DashboardConversationPreview } from "@/lib/dashboard";

type DashboardMessagesCardProps = {
  initialUnreadCount: number;
  conversations: DashboardConversationPreview[];
};

export function DashboardMessagesCard({
  initialUnreadCount,
  conversations,
}: DashboardMessagesCardProps) {
  // Subscribe to the app shell's single notifications poll instead of running a
  // second one — the badge and the preview list update on the same cadence, no
  // extra round-trips, so incoming replies appear without a reload.
  const unreadCount = useWorkspaceUnreadCount(initialUnreadCount);
  const liveConversations = useWorkspaceConversationPreviews(conversations);
  const [pulseKey, setPulseKey] = useState(0);
  const [prevUnreadCount, setPrevUnreadCount] = useState(unreadCount);

  // Replay the badge pulse when the count changes to a positive value. Adjusting
  // state during render (React's documented pattern) avoids a setState-in-effect
  // cascade.
  if (unreadCount !== prevUnreadCount) {
    setPrevUnreadCount(unreadCount);

    if (unreadCount > 0) {
      setPulseKey((key) => key + 1);
    }
  }

  return (
    <WorkspaceCard
      fill
      title={
        <span className="inline-flex items-center gap-2">
          Messages
          {unreadCount > 0 ? (
            <span
              key={pulseKey}
              className={cn(
                "inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground",
                pulseKey > 0 && "badge-pulse"
              )}
            >
              {unreadCount}
            </span>
          ) : null}
        </span>
      }
      action={
        <Link
          href="/inbox"
          className="text-xs font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
        >
          Open inbox
        </Link>
      }
    >
      {liveConversations.length > 0 ? (
        <div className="divide-y divide-border/65">
          {liveConversations.map((conversation) => (
            <Link
              key={conversation.id}
              href="/inbox"
              className="flex items-center gap-3 rounded-(--radius-tile) px-1.5 py-2.5 transition-colors duration-(--duration-base) hover:bg-[#f7f9fc]"
            >
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  conversation.unreadCount > 0 ? "bg-primary" : "bg-border"
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-sm text-foreground",
                    conversation.unreadCount > 0 ? "font-semibold" : "font-medium"
                  )}
                >
                  {conversation.contactName}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {conversation.snippet}
                </span>
              </span>
              <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                {conversation.timeLabel}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-(--radius-card) border border-dashed border-border/80 bg-[#fbfcfe] px-4 py-5 text-center">
          <span className="flex size-8 items-center justify-center rounded-(--radius-tile) border border-border/75 bg-white text-primary">
            <MessageSquareText className="size-3.5" />
          </span>
          <p className="text-sm font-semibold text-foreground">No conversations yet</p>
          <p className="text-xs leading-5 text-muted-foreground">
            Client replies will appear here as they come in.
          </p>
        </div>
      )}
    </WorkspaceCard>
  );
}
