"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, MessageSquareMore } from "lucide-react";

import { refreshWorkspaceNotificationsAction } from "@/app/(workspace)/actions";
import { WorkspaceCard } from "@/components/workspace/workspace-layout";
import type { DashboardMessageSummary } from "@/lib/dashboard";

type DashboardUnreadCardProps = {
  initialSummary: DashboardMessageSummary;
};

export function DashboardUnreadCard({
  initialSummary,
}: DashboardUnreadCardProps) {
  const [unreadCount, setUnreadCount] = useState(initialSummary.unreadCount);

  useEffect(() => {
    let cancelled = false;

    async function refreshUnreadSummary() {
      if (document.visibilityState !== "visible") {
        return;
      }

      const result = await refreshWorkspaceNotificationsAction();

      if (!result.ok || !result.view || cancelled) {
        return;
      }

      setUnreadCount(result.view.unreadCount);
    }

    void refreshUnreadSummary();

    const interval = window.setInterval(() => {
      void refreshUnreadSummary();
    }, 3500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <WorkspaceCard compact>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-[0.85rem] border border-border/80 bg-white text-primary">
            <MessageSquareMore className="size-4" />
          </span>
          <p className="text-sm font-semibold text-foreground">
            {initialSummary.title}
          </p>
        </div>
        <p className="text-2xl font-semibold tracking-tight text-primary">
          {unreadCount}
        </p>
      </div>
      <div className="mt-3 border-t border-border/70 pt-3">
        <Link
          href="/inbox"
          className="inline-flex w-full items-center justify-between rounded-[0.85rem] px-1 py-1 text-sm font-medium text-primary transition-transform duration-200 hover:translate-x-0.5"
        >
          Open inbox
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </WorkspaceCard>
  );
}
