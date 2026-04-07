"use server";

import { format } from "date-fns";

import { prisma } from "@/lib/prisma";
import { requireCurrentBusiness } from "@/lib/business";
import {
  toPrismaAppointmentStatus,
  type CalendarAppointment,
  type CalendarAppointmentStatus,
} from "@/lib/calendar";
import { syncAppointmentRemindersForBusiness } from "@/lib/reminders";
import { createClient } from "@/utils/supabase/server";

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

async function getAuthedBusiness() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "Your session expired. Log in again to manage appointments.",
    } as const;
  }

  const business = await requireCurrentBusiness(user, {
    missingBusinessRedirect: "/onboarding",
  });

  return { business } as const;
}

function parseDateTime(date: string, time: string) {
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
    date: format(appointment.startAt, "yyyy-MM-dd"),
    startTime: format(appointment.startAt, "HH:mm"),
    endTime: format(appointment.endAt, "HH:mm"),
    notes: appointment.notes ?? "",
    status,
    tone: status === "confirmed" ? "primary" : status === "pending" ? "secondary" : "muted",
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

      shouldResetReminders =
        existing.clientId !== payload.clientId ||
        existing.staffMemberId !== staffMemberId ||
        existing.title !== payload.service.trim() ||
        existing.startAt.getTime() !== startAt.getTime() ||
        existing.endAt.getTime() !== endAt.getTime() ||
        existing.status !== toPrismaAppointmentStatus(payload.status);

      await prisma.appointment.update({
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
        await prisma.appointmentReminder.deleteMany({
          where: {
            appointmentId: payload.id,
          },
        });
      }
    } else {
      const created = await prisma.appointment.create({
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

      await prisma.client.update({
        where: {
          id: payload.clientId,
        },
        data: {
          lastVisitAt: startAt,
        },
      });

      appointmentId = created.id;
    }

    await syncAppointmentRemindersForBusiness(business.id);

    return {
      ok: true,
      appointment: await hydrateAppointment(appointmentId!),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "We couldn't save the appointment.",
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
  const existing = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      businessId: business.id,
    },
    select: {
      id: true,
    },
  });

  if (!existing) {
    return {
      ok: false,
      error: "Appointment not found in this clinic workspace.",
    };
  }

  await prisma.appointment.update({
    where: {
      id: appointmentId,
    },
    data: {
      status: "CANCELLED",
    },
  });

  return {
    ok: true,
    appointmentId,
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
  const existing = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      businessId: business.id,
    },
    select: {
      id: true,
    },
  });

  if (!existing) {
    return {
      ok: false,
      error: "Appointment not found in this clinic workspace.",
    };
  }

  await prisma.appointment.delete({
    where: {
      id: appointmentId,
    },
  });

  return {
    ok: true,
    appointmentId,
  };
}
