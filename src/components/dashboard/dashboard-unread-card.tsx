"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, MessageSquareMore } from "lucide-react";

import { refreshWorkspaceNotificationsAction } from "@/app/(workspace)/actions";
import type { DashboardMessageSummary } from "@/lib/dashboard";

type DashboardUnreadCardProps = {
  businessName: string;
  initialSummary: DashboardMessageSummary;
};

function buildDescription(unreadCount: number, businessName: string) {
  return unreadCount > 0
    ? `Client replies are waiting for ${businessName}. Open inbox to keep response times tight and bookings moving.`
    : `No unread client messages for ${businessName} right now. Open inbox to review the latest conversation history.`;
}

export function DashboardUnreadCard({
  businessName,
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
    <section className="surface-soft space-y-4 rounded-[1.1rem] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquareMore className="size-4 text-primary" />
          <p className="text-base font-semibold text-foreground">
            {initialSummary.title}
          </p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-primary shadow-[0_8px_18px_rgba(20,32,51,0.04)]">
          {unreadCount} new
        </span>
      </div>
      <div className="mt-4 border-l-2 border-primary/70 pl-4">
        <p className="text-sm leading-7 text-muted-foreground">
          {buildDescription(unreadCount, businessName)}
        </p>
        <Link
          href="/inbox"
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary transition-transform duration-200 hover:translate-x-0.5"
        >
          Go to inbox
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}
