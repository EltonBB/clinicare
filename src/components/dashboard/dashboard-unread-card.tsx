"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, MessageSquareMore } from "lucide-react";

import { refreshWorkspaceNotificationsAction } from "@/app/(workspace)/actions";
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
    <section className="overflow-hidden rounded-[1.1rem] border border-border/80 bg-white/88 shadow-[0_14px_30px_rgba(20,32,51,0.04)]">
      <div className="flex items-center justify-between gap-4 px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-[0.9rem] bg-primary/10 text-primary">
            <MessageSquareMore className="size-4" />
          </span>
          <p className="text-sm font-semibold text-foreground">
            {initialSummary.title}
          </p>
        </div>
        <p className="text-3xl font-semibold tracking-tight text-primary">
          {unreadCount}
        </p>
      </div>
      <div className="border-t border-border/70 px-4 py-3">
        <Link
          href="/inbox"
          className="inline-flex w-full items-center justify-between rounded-[0.85rem] px-1 py-1 text-sm font-medium text-primary transition-transform duration-200 hover:translate-x-0.5"
        >
          Open inbox
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}
