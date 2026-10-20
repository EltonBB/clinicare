import type { Metadata } from "next";
import Link from "next/link";

import { ActivityFilters } from "@/components/automations/activity-filters";
import { AutomationsHeader } from "@/components/automations/automations-header";
import { WorkspaceEmptyState, WorkspacePage } from "@/components/workspace/workspace-layout";
import { listAutomationActivity, parseActivityKind, type ActivityStatus } from "@/lib/automation-activity";
import { AUTOMATIONS } from "@/lib/automations";
import { isProBusinessPlan } from "@/lib/billing";
import { requireCurrentWorkspace } from "@/lib/business";
import { getPendingFollowUpDraftCount } from "@/lib/follow-ups-data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Automations activity | Vela" };

const STATUS_TONE: Record<ActivityStatus, string> = {
  Sent: "text-muted-foreground",
  Delivered: "text-emerald-700",
  Read: "text-emerald-700",
  Failed: "text-destructive",
};

type ActivityPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AutomationsActivityPage({ searchParams }: ActivityPageProps) {
  const { business } = await requireCurrentWorkspace("/automations/activity", {
    missingBusinessRedirect: "/onboarding",
  });
  const params = searchParams ? await searchParams : {};
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const kind = parseActivityKind(first(params.kind));
  const page = Number(first(params.page)) || 1;

  const isPro = isProBusinessPlan(business.plan);
  const [activity, reviewCount] = await Promise.all([
    listAutomationActivity({ businessId: business.id, kind, page }),
    isPro ? getPendingFollowUpDraftCount(business.id) : Promise.resolve(0),
  ]);

  // Chips only for automations that sent something, in the page's own order.
  const chips = AUTOMATIONS.filter((automation) => activity.counts[automation.kind]).map((automation) => ({
    kind: automation.kind,
    label: automation.label,
    count: activity.counts[automation.kind] ?? 0,
  }));
  const pageHref = (next: number) => {
    const query = new URLSearchParams();
    if (kind) query.set("kind", kind);
    if (next > 1) query.set("page", String(next));
    const search = query.toString();
    return `/automations/activity${search ? `?${search}` : ""}`;
  };

  return (
    <WorkspacePage size="wide">
      <AutomationsHeader active="activity" showReviewTab={isPro} reviewCount={reviewCount} />

      {chips.length > 0 ? (
        <ActivityFilters
          chips={chips}
          active={kind ?? null}
          total={Object.values(activity.counts).reduce((sum, value) => sum + (value ?? 0), 0)}
        />
      ) : null}

      <div className="surface-card mt-3 overflow-hidden p-0">
        {activity.rows.length === 0 ? (
          <WorkspaceEmptyState
            title="Nothing sent yet"
            description="Messages your automations send in the last 30 days show here."
            compact
          />
        ) : (
          <ul>
            {activity.rows.map((row) => (
              <li
                key={row.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-4 py-3 transition-colors hover:bg-[#f7f9fc] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto_auto]"
              >
                <span className="truncate text-sm font-medium text-foreground">
                  {row.clientId ? (
                    <Link href={`/clients/${row.clientId}`} prefetch={false} className="hover:text-primary">
                      {row.clientName}
                    </Link>
                  ) : (
                    row.clientName
                  )}
                </span>
                <span className="order-3 truncate text-xs text-muted-foreground sm:order-none sm:text-sm">{row.label}</span>
                <span className="order-4 text-xs tabular-nums text-muted-foreground sm:order-none">{row.sentLabel}</span>
                <span className={cn("text-right text-xs font-medium", STATUS_TONE[row.status])}>{row.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {activity.page > 1 || activity.hasMore ? (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          {activity.page > 1 ? (
            <Link href={pageHref(activity.page - 1)} className="rounded-(--radius-field) px-3 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
              Newer
            </Link>
          ) : null}
          {activity.hasMore ? (
            <Link href={pageHref(activity.page + 1)} className="rounded-(--radius-field) px-3 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
              Older
            </Link>
          ) : null}
        </div>
      ) : null}
    </WorkspacePage>
  );
}
