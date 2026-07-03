"use server";

import { prisma } from "@/lib/prisma";
import { getAuthedBusiness as getAuthedBusinessContext } from "@/lib/business";
import {
  cancelAppointmentCore,
  deleteAppointmentCore,
  notifyStaffOfAppointmentChange,
  refreshClientLastVisitAt,
  revalidateCalendarSurfaces,
} from "@/lib/appointments-shared";
import {
  formatZonedDateKey,
  formatZonedTime24,
  getZonedWeekday,
  parseZonedWallClock,
} from "@/lib/time-zone";
import {
  toPrismaAppointmentStatus,
  type CalendarAppointment,
  type CalendarAppointmentStatus,
} from "@/lib/calendar";

export type SaveAppointmentPayload = {
  id?: string;
  clientId: string;
  service: string;
  staffMemberId?: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string;
  status: CalendarAppointmentStatus;
};

export type SaveAppointmentResult = {
  ok: boolean;
  error?: string;
  appointment?: CalendarAppointment;
};

export type CancelAppointmentResult = {
  ok: boolean;
  error?: string;
  appointmentId?: string;
};

export type DeleteAppointmentResult = {
  ok: boolean;
  error?: string;
  appointmentId?: string;
};

function getAuthedBusiness() {
  return getAuthedBusinessContext(
    "Your session expired. Log in again to manage appointments."
  );
}

// Interpret the operator's wall-clock entry in the clinic's time zone and store
// the true UTC instant (shared helper — see lib/time-zone.ts).
function parseDateTime(date: string, time: string) {
  return parseZonedWallClock(date, time);
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

async function isInsideBusinessHours(args: {
  businessId: string;
  startAt: Date;
  startTime: string;
  endTime: string;
}) {
  // Map the zoned weekday (Sun=0..Sat=6) onto the clinic schedule's Monday=0
  // convention so near-midnight bookings resolve to the correct day's hours.
  const weekday = (getZonedWeekday(args.startAt) + 6) % 7;
  const hours = await prisma.businessHours.findUnique({
    where: {
      businessId_weekday: {
        businessId: args.businessId,
        weekday,
      },
    },
    select: {
      isOpen: true,
      startTime: true,
      endTime: true,
    },
  });

  const start = timeToMinutes(args.startTime);
  const end = timeToMinutes(args.endTime);

  if (!hours) {
    return weekday < 5 && start >= timeToMinutes("09:00") && end <= timeToMinutes("17:00");
  }

  if (!hours.isOpen) {
    return false;
  }

  return start >= timeToMinutes(hours.startTime) && end <= timeToMinutes(hours.endTime);
}

async function hydrateAppointment(appointmentId: string) {
  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: {
      id: appointmentId,
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
  });

  const status =
    appointment.status === "CANCELLED"
      ? "cancelled"
      : appointment.status === "COMPLETED"
        ? "completed"
      : appointment.status === "PENDING"
        ? "pending"
        : "confirmed";

  return {
    id: appointment.id,
    clientId: appointment.clientId,
    clientName: appointment.client.name,
    service: appointment.title,
    staffMemberId: appointment.staffMemberId ?? undefined,
    staffName: appointment.staffMember?.name ?? "Workspace staff",
    date: formatZonedDateKey(appointment.startAt),
    startTime: formatZonedTime24(appointment.startAt),
    endTime: formatZonedTime24(appointment.endAt),
    notes: appointment.notes ?? "",
    status,
    tone:
      status === "confirmed" || status === "completed"
        ? "primary"
        : status === "pending"
          ? "secondary"
          : "muted",
  } satisfies CalendarAppointment;
}

export async function saveAppointmentAction(
  payload: SaveAppointmentPayload
): Promise<SaveAppointmentResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const business = context.business;
  const startAt = parseDateTime(payload.date, payload.startTime);
  const endAt = parseDateTime(payload.date, payload.endTime);

  if (!payload.clientId || !payload.service.trim() || !startAt || !endAt || endAt <= startAt) {
    return {
      ok: false,
      error: "Choose a client and valid start/end time before saving.",
    };
  }

  const insideBusinessHours = await isInsideBusinessHours({
    businessId: business.id,
    startAt,
    startTime: payload.startTime,
    endTime: payload.endTime,
  });

  if (!insideBusinessHours) {
    return {
      ok: false,
      error: "This appointment is outside your operating hours. Choose a time inside the clinic schedule.",
    };
  }

  const client = await prisma.client.findFirst({
    where: {
      id: payload.clientId,
      businessId: business.id,
    },
    select: {
      id: true,
    },
  });

  if (!client) {
    return {
      ok: false,
      error: "The selected client does not belong to this clinic workspace.",
    };
  }

  let staffMemberId: string | null = null;
  if (payload.staffMemberId) {
    const staff = await prisma.staffMember.findFirst({
      where: {
        id: payload.staffMemberId,
        businessId: business.id,
      },
      select: {
        id: true,
      },
    });

    if (!staff) {
      return {
        ok: false,
        error: "The selected staff member does not belong to this clinic workspace.",
      };
    }

    staffMemberId = staff.id;
  }

  try {
    let appointmentId = payload.id;
    let shouldResetReminders = false;
    let previousClientId: string | null = null;
    let previousStaffMemberId: string | null = null;

    if (payload.id) {
      const existing = await prisma.appointment.findFirst({
        where: {
          id: payload.id,
          businessId: business.id,
        },
        select: {
          id: true,
          clientId: true,
          staffMemberId: true,
          title: true,
          startAt: true,
          endAt: true,
          status: true,
        },
      });

      if (!existing) {
        return {
          ok: false,
          error: "Appointment not found in this clinic workspace.",
        };
      }

      previousClientId = existing.clientId;
      previousStaffMemberId = existing.staffMemberId;
      shouldResetReminders =
        existing.clientId !== payload.clientId ||
        existing.staffMemberId !== staffMemberId ||
        existing.title !== payload.service.trim() ||
        existing.startAt.getTime() !== startAt.getTime() ||
        existing.endAt.getTime() !== endAt.getTime() ||
        existing.status !== toPrismaAppointmentStatus(payload.status);
    }

    // The appointment write, reminder reset, and last-visit refresh commit
    // together. Payment is intentionally NOT collected here — it's recorded
    // separately on the client's Payments tab, after the visit.
    await prisma.$transaction(async (tx) => {
      if (payload.id) {
        await tx.appointment.update({
          where: {
            id: payload.id,
          },
          data: {
            clientId: payload.clientId,
            staffMemberId,
            title: payload.service.trim(),
            startAt,
            endAt,
            notes: payload.notes.trim() || null,
            status: toPrismaAppointmentStatus(payload.status),
          },
        });

        if (shouldResetReminders) {
          await tx.appointmentReminder.deleteMany({
            where: {
              appointmentId: payload.id,
            },
          });
        }

        const affectedClientIds = Array.from(
          new Set(
            [previousClientId, payload.clientId].filter(
              (value): value is string => Boolean(value)
            )
          )
        );
        for (const clientId of affectedClientIds) {
          await refreshClientLastVisitAt(clientId, business.id, tx);
        }
      } else {
        const created = await tx.appointment.create({
          data: {
            businessId: business.id,
            clientId: payload.clientId,
            staffMemberId,
            title: payload.service.trim(),
            startAt,
            endAt,
            notes: payload.notes.trim() || null,
            status: toPrismaAppointmentStatus(payload.status),
          },
        });

        appointmentId = created.id;
        await refreshClientLastVisitAt(payload.clientId, business.id, tx);
      }
    });

    revalidateCalendarSurfaces(
      [payload.clientId, previousClientId],
      [staffMemberId, previousStaffMemberId]
    );

    return {
      ok: true,
      appointment: await hydrateAppointment(appointmentId!),
    };
  } catch {
    return {
      ok: false,
      error: "We couldn't save the appointment.",
    };
  }
}

export async function cancelAppointmentAction(
  appointmentId: string
): Promise<CancelAppointmentResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const business = context.business;
  const outcome = await cancelAppointmentCore({ id: appointmentId, businessId: business.id });

  if (!outcome.ok) {
    return {
      ok: false,
      error:
        outcome.status === 404
          ? "Appointment not found in this clinic workspace."
          : outcome.error,
    };
  }

  revalidateCalendarSurfaces([outcome.clientId], [outcome.staffMemberId]);

  if (outcome.changed) {
    await notifyStaffOfAppointmentChange(business.id, outcome.staffMemberId, outcome.appointmentId);
  }

  return {
    ok: true,
    appointmentId: outcome.appointmentId,
  };
}

export async function deleteAppointmentAction(
  appointmentId: string
): Promise<DeleteAppointmentResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const business = context.business;
  const outcome = await deleteAppointmentCore({ id: appointmentId, businessId: business.id });

  if (!outcome.ok) {
    return {
      ok: false,
      error:
        outcome.status === 404
          ? "Appointment not found in this clinic workspace."
          : outcome.error,
    };
  }

  revalidateCalendarSurfaces([outcome.clientId], [outcome.staffMemberId]);

  // No deep link — the row is gone, unlike a cancel which keeps it (status only).
  await notifyStaffOfAppointmentChange(business.id, outcome.staffMemberId, null);

  return {
    ok: true,
    appointmentId: outcome.appointmentId,
  };
}

