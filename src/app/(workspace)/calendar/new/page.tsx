import { format } from "date-fns";

import { NewAppointmentForm } from "@/components/calendar/new-appointment-form";
import { CreatePageShell } from "@/components/workspace/create-page-shell";
import { requireCurrentWorkspace, toBusinessIdentity } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { isRealDateKey } from "@/lib/time-zone";

// A real calendar date: the shape alone lets 2026-02-31 through to be prefilled
// (and then rolled over into March 3 when saved).
function isValidDateParam(value?: string): value is string {
  return typeof value === "string" && isRealDateKey(value);
}

function isValidTimeParam(value?: string): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// A positive whole number of minutes only — anything else falls back to the
// form's own 60-minute default rather than trusting an arbitrary query value.
function parseDurationParam(value?: string): number | undefined {
  if (typeof value !== "string") return undefined;
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes > 0 ? minutes : undefined;
}

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{
    client?: string;
    date?: string;
    time?: string;
    service?: string;
    staffMemberId?: string;
    duration?: string;
  }>;
}) {
  const { user, business } = await requireCurrentWorkspace("/calendar/new", {
    missingBusinessRedirect: "/onboarding",
  });
  const { ownerName } = toBusinessIdentity(business, user);
  const {
    client: requestedClientId,
    date: requestedDate,
    time: requestedTime,
    service: requestedService,
    staffMemberId: requestedStaffMemberId,
    duration: requestedDuration,
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
  const initialService =
    typeof requestedService === "string" && requestedService ? requestedService : undefined;
  // Same validation shape as the client id above: only a real staff id in
  // this business is honored, else it's ignored rather than silently
  // preselecting an id that doesn't belong here. An explicit empty string
  // (the Follow-ups Book link's way of saying "this freed slot was genuinely
  // unassigned") is passed through as-is instead of falling into the same
  // "ignored" bucket as an absent param — the form's own default for that
  // bucket is its first staff member, which would silently override an
  // explicit unassigned choice (Codex #130).
  const initialStaffMemberId =
    requestedStaffMemberId === ""
      ? ""
      : typeof requestedStaffMemberId === "string" &&
          staffMembers.some((member) => member.id === requestedStaffMemberId)
        ? requestedStaffMemberId
        : undefined;
  const initialDuration = parseDurationParam(requestedDuration);

  return (
    <CreatePageShell title="New booking">
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
        initialService={initialService}
        initialStaffMemberId={initialStaffMemberId}
        initialDuration={initialDuration}
      />
    </CreatePageShell>
  );
}
