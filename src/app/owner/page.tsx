import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OwnerBillingControl } from "@/components/owner/owner-billing-control";
import { WorkspaceHeader, WorkspacePage, WorkspaceTable } from "@/components/workspace/workspace-layout";
import { requireCurrentUser } from "@/lib/auth";
import { isOwnerAdmin, ownerBillingRow } from "@/lib/owner-admin";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Clinics | Vela", robots: { index: false, follow: false } };

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
    },
    orderBy: { createdAt: "desc" },
  });
  const now = new Date();
  const rows = businesses.map((business) => ownerBillingRow(business, now));
  const due = rows.filter((row) => row.dueForDeletion).length;

  return (
    <div className="min-h-screen bg-background px-4 py-6 sm:px-6">
      <WorkspacePage size="wide">
        <WorkspaceHeader title="Clinics" meta={due > 0 ? `${due} due for deletion` : undefined} />
        <WorkspaceTable
          minWidthClassName="min-w-[960px]"
          headers={
            <div className="grid grid-cols-[1.4fr_0.6fr_1.2fr_1.4fr_1.3fr] gap-4 px-4 py-2.5 text-xs font-medium text-muted-foreground">
              <span>Clinic</span>
              <span>Plan</span>
              <span>Billing</span>
              <span>Access</span>
              <span>Change</span>
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
                <p className="text-xs text-muted-foreground">Since {row.createdOn}</p>
              </div>
              <span>{row.plan}</span>
              <div className="min-w-0">
                <p>{row.billing}</p>
                {row.detail ? <p className="text-xs text-muted-foreground">{row.detail}</p> : null}
              </div>
              <p className={cn(row.dueForDeletion && "font-medium text-destructive")}>
                {row.access}
                {row.dueForDeletion ? " · due for deletion" : ""}
              </p>
              <OwnerBillingControl
                businessId={row.id}
                isFree={row.isFree}
                plan={row.plan}
                canMakeFree={row.canMakeFree}
              />
            </div>
          ))}
        </WorkspaceTable>
      </WorkspacePage>
    </div>
  );
}
