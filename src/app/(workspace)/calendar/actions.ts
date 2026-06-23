"use server";

import { revalidatePath } from "next/cache";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getAuthedBusiness as getAuthedBusinessContext } from "@/lib/business";
import {
  formatZonedDateKey,
  formatZonedTime24,
  getZonedWeekday,
  parseZonedWallClock,
} from "@/lib/time-zone";
import {
  hasUnsafePublicUrl,
  normalizeOptionalPublicUrl,
} from "@/lib/safe-url";
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
  paymentAmount?: string;
  paymentStatus?: string;
  paymentDescription?: string;
  paymentReceiptUrl?: string;
  paymentPaidAt?: string;
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

export type SaveScheduleBlockPayload = {
  id?: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  notes?: string;
};

export type SaveScheduleBlockResult = {
  ok: boolean;
  error?: string;
  blockId?: string;
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

function parseOptionalDate(value?: string) {
  if (!value?.trim()) {
    return null;
  }

  // Store date-only fields at UTC midnight: the render/edit paths format the
  // stored Date with date-fns (UTC on Vercel), so UTC midnight round-trips to
  // the entered calendar day (a zoned anchor would shift the day — PR #13).
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseAmountToCents(value?: string) {
  if (!value?.trim()) {
    return null;
  }

  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  // Reject negatives and absurd fat-finger amounts (> $1,000,000) so a typo
  // can't write a huge value into the ledger and corrupt revenue reporting.
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) {
    return null;
  }

  return Math.round(parsed * 100);
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

async function refreshClientLastVisitAt(
  clientId: string,
  businessId: string,
  db: Prisma.TransactionClient = prisma
) {
  const latestAppointment = await db.appointment.findFirst({
    where: {
      businessId,
      clientId,
      status: {
        in: ["CONFIRMED", "COMPLETED"],
      },
    },
    select: {
      startAt: true,
    },
    orderBy: {
      startAt: "desc",
    },
  });

  await db.client.updateMany({
    where: {
      id: clientId,
      businessId,
    },
    data: {
      lastVisitAt: latestAppointment?.startAt ?? null,
    },
  });
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

  // Validate the optional payment up front (pure guards) so the write path below
  // can run as a single atomic transaction.
  const enteredAmount = payload.paymentAmount?.trim();
  const paymentAmountCents = parseAmountToCents(payload.paymentAmount);

  // A non-blank amount that won't parse (malformed, negative, or over the $1M
  // cap) is a user error — reject it instead of silently saving an appointment
  // with no ledger entry. Blank stays optional; "0" parses to a no-charge entry.
  if (enteredAmount && paymentAmountCents === null) {
    return {
      ok: false,
      error: "Enter a valid payment amount up to $1,000,000, or leave it blank.",
    };
  }

  const hasPayment = paymentAmountCents !== null && paymentAmountCents > 0;

  if (hasPayment && hasUnsafePublicUrl(payload.paymentReceiptUrl)) {
    return {
      ok: false,
      error: "Use a safe HTTPS receipt link.",
    };
  }

  try {
    let appointmentId = payload.id;
    let shouldResetReminders = false;
    let previousClientId: string | null = null;

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
      shouldResetReminders =
        existing.clientId !== payload.clientId ||
        existing.staffMemberId !== staffMemberId ||
        existing.title !== payload.service.trim() ||
        existing.startAt.getTime() !== startAt.getTime() ||
        existing.endAt.getTime() !== endAt.getTime() ||
        existing.status !== toPrismaAppointmentStatus(payload.status);
    }

    // The appointment write, reminder reset, last-visit refresh, and the optional
    // payment all commit together — a payment failure must not leave a saved
    // appointment behind (which the caller reports as "couldn't save", prompting
    // the operator to retry and create a duplicate).
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

      if (hasPayment) {
        await tx.clientPayment.create({
          data: {
            businessId: business.id,
            clientId: payload.clientId,
            appointmentId: appointmentId!,
            amountCents: paymentAmountCents!,
            status: payload.paymentStatus?.trim() || "Unpaid",
            description:
              payload.paymentDescription?.trim() ||
              `Payment for ${payload.service.trim()}`,
            receiptUrl:
              normalizeOptionalPublicUrl(payload.paymentReceiptUrl) || null,
            paidAt:
              payload.paymentStatus === "Paid"
                ? parseOptionalDate(payload.paymentPaidAt) ?? new Date()
                : parseOptionalDate(payload.paymentPaidAt),
          },
        });
      }
    });

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
  const existing = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      businessId: business.id,
    },
    select: {
      id: true,
      clientId: true,
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
  // Clear any pending reminder rows so a later re-confirm starts clean.
  await prisma.appointmentReminder.deleteMany({
    where: {
      appointmentId,
    },
  });
  await refreshClientLastVisitAt(existing.clientId, business.id);

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
      clientId: true,
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
  await refreshClientLastVisitAt(existing.clientId, business.id);

  return {
    ok: true,
    appointmentId,
  };
}

export async function saveScheduleBlockAction(
  payload: SaveScheduleBlockPayload
): Promise<SaveScheduleBlockResult> {
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
  const title = payload.title.trim();

  if (!title || !startAt || !endAt || endAt <= startAt) {
    return {
      ok: false,
      error: "Add a block title and valid start/end time.",
    };
  }

  const data = {
    title,
    startsAt: startAt,
    endsAt: endAt,
    reason: payload.notes?.trim() || null,
  };

  let blockId = payload.id;
  if (payload.id) {
    const existing = await prisma.scheduleBlock.findFirst({
      where: {
        id: payload.id,
        businessId: business.id,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return {
        ok: false,
        error: "Schedule block not found in this clinic workspace.",
      };
    }

    await prisma.scheduleBlock.update({
      where: {
        id: payload.id,
      },
      data,
    });
  } else {
    const block = await prisma.scheduleBlock.create({
        data: {
          businessId: business.id,
          ...data,
        },
      });
    blockId = block.id;
  }

  revalidatePath("/calendar");
  revalidatePath("/dashboard");

  return {
    ok: true,
    blockId,
  };
}

export async function deleteScheduleBlockAction(
  blockId: string
): Promise<SaveScheduleBlockResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const existing = await prisma.scheduleBlock.findFirst({
    where: {
      id: blockId,
      businessId: context.business.id,
    },
    select: {
      id: true,
    },
  });

  if (!existing) {
    return {
      ok: false,
      error: "Schedule block not found in this clinic workspace.",
    };
  }

  await prisma.scheduleBlock.delete({
    where: {
      id: blockId,
    },
  });

  revalidatePath("/calendar");
  revalidatePath("/dashboard");

  return {
    ok: true,
    blockId,
  };
}
