import { NewStaffForm } from "@/components/staff/new-staff-form";
import { CreatePageShell } from "@/components/workspace/create-page-shell";
import { requireCurrentWorkspace } from "@/lib/business";
import { prisma } from "@/lib/prisma";

export default async function NewStaffPage() {
  const { business } = await requireCurrentWorkspace("/staff/new", {
    missingBusinessRedirect: "/onboarding",
  });
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
    <CreatePageShell
      eyebrow="Staff workspace"
      title="New staff member"
      description="Add the team member profile used for booking ownership, time tracking, and staff performance records."
      backHref="/staff"
      backLabel="staff"
    >
      <NewStaffForm businessHours={businessHours} />
    </CreatePageShell>
  );
}
