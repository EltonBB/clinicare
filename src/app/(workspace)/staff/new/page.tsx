import type { Metadata } from "next";
import { NewStaffForm } from "@/components/staff/new-staff-form";
import { CreatePageShell } from "@/components/workspace/create-page-shell";
import { WorkspaceLockedState } from "@/components/billing/workspace-locked-state";
import { canUseWorkspace } from "@/lib/billing-access";
import { requireCurrentWorkspace } from "@/lib/business";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "New staff member | Vela" };

export default async function NewStaffPage() {
  const { business } = await requireCurrentWorkspace("/staff/new", {
    missingBusinessRedirect: "/onboarding",
  });
  if (!canUseWorkspace(business)) {
    return (
      <CreatePageShell title="New staff member">
        <WorkspaceLockedState />
      </CreatePageShell>
    );
  }
  const businessHours = await prisma.businessHours.findMany({
    where: {
      businessId: business.id,
    },
    select: {
      weekday: true,
      isOpen: true,
      startTime: true,
      endTime: true,
    },
    orderBy: {
      weekday: "asc",
    },
  });

  return (
    <CreatePageShell title="New staff member">
      <NewStaffForm businessHours={businessHours} />
    </CreatePageShell>
  );
}
