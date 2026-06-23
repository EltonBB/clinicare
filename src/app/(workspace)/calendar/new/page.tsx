import { format } from "date-fns";

import { NewAppointmentForm } from "@/components/calendar/new-appointment-form";
import { CreatePageShell } from "@/components/workspace/create-page-shell";
import { requireCurrentWorkspace, toBusinessIdentity } from "@/lib/business";
import { prisma } from "@/lib/prisma";

function isValidDateParam(value?: string): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTimeParam(value?: string): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; date?: string; time?: string }>;
}) {
  const { user, business } = await requireCurrentWorkspace("/calendar/new", {
    missingBusinessRedirect: "/onboarding",
  });
  const { ownerName } = toBusinessIdentity(business, user);
  const {
    client: requestedClientId,
    date: requestedDate,
    time: requestedTime,
  } = await searchParams;

  const [clients, staffMembers, businessHours] = await Promise.all([
    // Bounded recent list for the picker; the form's combobox searches the rest
    // via /api/clients/search, so we never ship the whole client table.
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

  // Make sure a deep-linked (?client=) client is in the picker list even if it's
  // not among the 25 most recent, so the preselection renders correctly.
  let pickerClients = clients;
  if (
    typeof requestedClientId === "string" &&
    requestedClientId &&
    !clients.some((client) => client.id === requestedClientId)
  ) {
    const preselected = await prisma.client.findFirst({
      where: {
        id: requestedClientId,
        businessId: business.id,
        isArchived: false,
      },
      select: { id: true, name: true, phone: true },
    });
    if (preselected) {
      pickerClients = [preselected, ...clients];
    }
  }

  const initialClientId =
    typeof requestedClientId === "string" &&
    pickerClients.some((client) => client.id === requestedClientId)
      ? requestedClientId
      : undefined;
  const initialDate: string = isValidDateParam(requestedDate)
    ? requestedDate
    : format(new Date(), "yyyy-MM-dd");
  const initialStartTime = isValidTimeParam(requestedTime) ? requestedTime : undefined;

  return (
    <CreatePageShell
      eyebrow="Booking timeline"
      title="New booking"
      description="Create a scheduled client visit with the right service, staff owner, date, time, and notes."
      backHref="/calendar"
      backLabel="calendar"
    >
      <NewAppointmentForm
        clients={pickerClients.map((client) => ({
          id: client.id,
          name: client.name,
          phone: client.phone ?? undefined,
        }))}
        staffMembers={staffMembers}
        businessHours={businessHours.map((item) => ({
          weekday: item.weekday,
          enabled: item.isOpen,
          start: item.startTime,
          end: item.endTime,
        }))}
        ownerName={ownerName}
        initialClientId={initialClientId}
        initialDate={initialDate}
        initialStartTime={initialStartTime}
      />
    </CreatePageShell>
  );
}
