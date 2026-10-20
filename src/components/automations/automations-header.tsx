import Link from "next/link";

import { WorkspaceHeader } from "@/components/workspace/workspace-layout";
import { cn } from "@/lib/utils";

type Tab = "automations" | "review" | "activity";

/**
 * The page title with its three tabs. Each tab is its own button (no joined
 * segmented box, AGENTS.md rule 7); To review is Pro only and carries a live count.
 */
export function AutomationsHeader({
  active,
  showReviewTab,
  reviewCount,
}: {
  active: Tab;
  showReviewTab: boolean;
  reviewCount: number;
}) {
  const tabs: Array<{ id: Tab; label: string; href: string; count?: number }> = [
    { id: "automations", label: "Automations", href: "/automations" },
    ...(showReviewTab ? [{ id: "review" as const, label: "To review", href: "/automations/review", count: reviewCount }] : []),
  ];

  return (
    <WorkspaceHeader
      title="Automations"
      actions={
        <nav aria-label="Automations sections" className="flex items-center gap-1.5">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={tab.id === active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-(--radius-field) px-3 text-sm font-medium transition-colors duration-(--duration-base) active:scale-[0.97]",
                tab.id === active
                  ? "bg-white text-foreground shadow-[0_0_0_1px_var(--border)]"
                  : "text-muted-foreground hover:bg-white/70 hover:text-foreground"
              )}
            >
              {tab.label}
              {tab.count ? (
                <span className="min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] font-semibold leading-5 text-primary-foreground">
                  {tab.count}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
      }
    />
  );
}
