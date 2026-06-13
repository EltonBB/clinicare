import { notFound } from "next/navigation";

import { NewAppointmentForm } from "@/components/calendar/new-appointment-form";
import { CreatePageShell } from "@/components/workspace/create-page-shell";
import { requireCurrentWorkspace, toBusinessIdentity } from "@/lib/business";
import { buildCalendarViewFromRecords } from "@/lib/calendar";
import { prisma } from "@/lib/prisma";
import { formatZonedDateKey } from "@/lib/time-zone";

export default async function EditAppointmentPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const { user, business } = await requireCurrentWorkspace("/calendar", {
    missingBusinessRedirect: "/onboarding",
  });
  const { ownerName } = toBusinessIdentity(business, user);
  const { appointmentId } = await params;

  const [appointment, clients, staffMembers, businessHours] = await Promise.all([
    prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        businessId: business.id,
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
          },
        },
        staffMember: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.client.findMany({
      where: {
        businessId: business.id,
        isArchived: false,
      },
      select: {
        id: true,
        name: true,
        phone: true,
      },
      orderBy: {
        name: "asc",
      },
    }),
    prisma.staffMember.findMany({
      where: {
        businessId: business.id,
        isActive: true,
        status: {
          not: "INACTIVE",
        },
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    }),
    prisma.businessHours.findMany({
      where: {
        businessId: business.id,
      },
      orderBy: {
        weekday: "asc",
      },
    }),
  ]);

  if (!appointment) {
    notFound();
  }

  const calendarView = buildCalendarViewFromRecords({
    appointments: [appointment],
    clients,
    staffMembers,
    businessHours,
    ownerName,
    initialDate: formatZonedDateKey(appointment.startAt),
  });
  const initialAppointment = calendarView.appointments[0];

  return (
    <CreatePageShell
      eyebrow="Booking timeline"
      title="Edit booking"
      description="Update the client, service, staff owner, time, status, and appointment notes."
      backHref={`/calendar?date=${initialAppointment.date}`}
      backLabel="calendar"
    >
      <NewAppointmentForm
        clients={calendarView.clients}
        staffMembers={calendarView.staffMembers}
        businessHours={calendarView.businessHours}
        ownerName={ownerName}
        initialDate={initialAppointment.date}
        initialAppointment={initialAppointment}
      />
    </CreatePageShell>
  );
}
