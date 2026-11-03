import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";

import { NewAppointmentForm } from "@/components/calendar/new-appointment-form";
import { getI18n } from "@/i18n/server";
import { WithMessages } from "@/i18n/with-messages";
import { CreatePageShell } from "@/components/workspace/create-page-shell";
import { isProBusinessPlan } from "@/lib/billing";
import { WorkspaceLockedState } from "@/components/billing/workspace-locked-state";
import { canUseWorkspace } from "@/lib/billing-access";
import { ownerActor, recordAudit } from "@/lib/audit";
import { requireCurrentWorkspace, toBusinessIdentity } from "@/lib/business";
import { buildCalendarViewFromRecords } from "@/lib/calendar";
import { prisma } from "@/lib/prisma";
import { formatZonedDateKey } from "@/lib/time-zone";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.calendar.meta.editBooking };
}

export default async function EditAppointmentPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const { user, business } = await requireCurrentWorkspace("/calendar", {
    missingBusinessRedirect: "/onboarding",
  });
  if (!canUseWorkspace(business)) {
    return (
      <CreatePageShell title={(await getI18n()).m.calendar.form.editTitle}>
        <WorkspaceLockedState />
      </CreatePageShell>
    );
  }
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
            phone: true,
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
    // Bounded recent list; the form's combobox searches the rest server-side.
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
        updatedAt: "desc",
      },
      take: 25,
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

  after(() =>
    recordAudit({
      businessId: business.id,
      actor: ownerActor(user),
      action: "appointment.view",
      clientId: appointment.clientId,
      recordId: appointment.id,
    })
  );

  // Ensure the appointment's current client is in the bounded picker list so the
  // combobox shows it even when it isn't among the 25 most recent.
  const pickerClients = clients.some((client) => client.id === appointment.clientId)
    ? clients
    : [
        {
          id: appointment.client.id,
          name: appointment.client.name,
          phone: appointment.client.phone,
        },
        ...clients,
      ];

  const calendarView = buildCalendarViewFromRecords({
    appointments: [appointment],
    clients: pickerClients,
    staffMembers,
    businessHours,
    ownerName,
    initialDate: formatZonedDateKey(appointment.startAt),
  });
  const initialAppointment = calendarView.appointments[0];

  return (
    <WithMessages namespaces={["calendar"]}>
    <CreatePageShell title={(await getI18n()).m.calendar.form.editTitle}>
      <NewAppointmentForm
        clients={calendarView.clients}
        staffMembers={calendarView.staffMembers}
        businessHours={calendarView.businessHours}
        ownerName={ownerName}
        initialDate={initialAppointment.date}
        initialAppointment={initialAppointment}
        canRecordNoShows={isProBusinessPlan(business.plan)}
      />
    </CreatePageShell>
    </WithMessages>
  );
}
