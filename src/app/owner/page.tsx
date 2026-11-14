import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OwnerBillingControl } from "@/components/owner/owner-billing-control";
import { fmt, plural } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { WithMessages } from "@/i18n/with-messages";
import { WorkspaceHeader, WorkspacePage, WorkspaceTable } from "@/components/workspace/workspace-layout";
import { requireCurrentUser } from "@/lib/auth";
import { isOwnerAdmin, ownerBillingRow } from "@/lib/owner-admin";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.owner.meta, robots: { index: false, follow: false } };
}

// Owner-only (VELA_ADMIN_EMAILS): every clinic's billing at a glance, where the
// owner makes a pilot clinic free or requires it to pay, and sees which locked
// clinics are past their 90 days. Anyone else gets a plain 404.
export default async function OwnerPage() {
  const user = await requireCurrentUser("/owner");
  if (!isOwnerAdmin(user)) notFound();

  const businesses = await prisma.business.findMany({
    select: {
      id: true,
      name: true,
      createdAt: true,
      plan: true,
      billingMode: true,
      subscriptionStatus: true,
      billingInterval: true,
      currentPeriodEndsAt: true,
      cancelAt: true,
      trialEndsAt: true,
      lockedAt: true,
      subscribedPlan: true,
      proTrialOfferedAt: true,
      proTrialStartedAt: true,
      proTrialEndsAt: true,
      proTrialAnsweredAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const { locale, m } = await getI18n();
  const t = m.owner;
  const now = new Date();
  const rows = businesses.map((business) => ownerBillingRow(business, now, undefined, locale));
  const due = rows.filter((row) => row.dueForDeletion).length;

  return (
    <WithMessages namespaces={["owner"]}>
    <div className="min-h-screen bg-background px-4 py-6 sm:px-6">
      <WorkspacePage size="wide">
        <WorkspaceHeader title={t.title} meta={due > 0 ? plural(t.due, due, locale) : undefined} />
        <WorkspaceTable
          minWidthClassName="min-w-[960px]"
          headers={
            <div className="grid grid-cols-[1.4fr_0.6fr_1.2fr_1.4fr_1.3fr] gap-4 px-4 py-2.5 text-xs font-medium text-muted-foreground">
              <span>{t.columns.clinic}</span>
              <span>{t.columns.plan}</span>
              <span>{t.columns.billing}</span>
              <span>{t.columns.access}</span>
              <span>{t.columns.change}</span>
            </div>
          }
        >
          {rows.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[1.4fr_0.6fr_1.2fr_1.4fr_1.3fr] items-center gap-4 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{row.name}</p>
                <p className="text-xs text-muted-foreground">{fmt(t.since, { date: row.createdOn })}</p>
              </div>
              <span>{row.plan}</span>
              <div className="min-w-0">
                <p>{row.billing}</p>
                {row.detail ? <p className="text-xs text-muted-foreground">{row.detail}</p> : null}
              </div>
              <p className={cn(row.dueForDeletion && "font-medium text-destructive")}>
                {row.access}
                {row.dueForDeletion ? t.dueSuffix : ""}
              </p>
              <OwnerBillingControl
                businessId={row.id}
                isFree={row.isFree}
                plan={row.plan}
                canMakeFree={row.canMakeFree}
                proTrial={row.proTrial}
              />
            </div>
          ))}
        </WorkspaceTable>
      </WorkspacePage>
    </div>
    </WithMessages>
  );
}
