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
    <CreatePageShell title="New staff member">
      <NewStaffForm businessHours={businessHours} />
    </CreatePageShell>
  );
}
