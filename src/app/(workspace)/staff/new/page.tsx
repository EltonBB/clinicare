import type { Metadata } from "next";
import { NewStaffForm } from "@/components/staff/new-staff-form";
import { getI18n } from "@/i18n/server";
import { WithMessages } from "@/i18n/with-messages";
import { CreatePageShell } from "@/components/workspace/create-page-shell";
import { WorkspaceLockedState } from "@/components/billing/workspace-locked-state";
import { canUseWorkspace } from "@/lib/billing-access";
import { requireCurrentWorkspace } from "@/lib/business";
import { prisma } from "@/lib/prisma";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.staff.meta.newMember };
}

export default async function NewStaffPage() {
  const { business } = await requireCurrentWorkspace("/staff/new", {
    missingBusinessRedirect: "/onboarding",
  });
  const title = (await getI18n()).m.staff.directory.newMember;
  if (!canUseWorkspace(business)) {
    return (
      <CreatePageShell title={title}>
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
    <CreatePageShell title={title}>
      <WithMessages namespaces={["staff"]}>
        <NewStaffForm businessHours={businessHours} />
      </WithMessages>
    </CreatePageShell>
  );
}
