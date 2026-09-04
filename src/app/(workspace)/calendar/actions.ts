"use server";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getAuthedBusiness as getAuthedBusinessContext } from "@/lib/business";
import {
  APPOINTMENT_ALREADY_COMPLETED_ERROR,
  APPOINTMENT_CONFLICT_ERROR,
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
  /**
   * The status this form was loaded/last-synced with — NOT re-read from the
   * database at submit time. The compare-and-set guard below matches the
   * row's live status against THIS value, not a fresh read, because a fresh
   * read would already reflect a concurrent change made while the form sat
   * open and defeat the whole point of the guard. Ignored for new bookings
   * (no existing row to guard against).
   */
  baselineStatus: CalendarAppointmentStatus;
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

  // No configured row for this weekday means closed, not a guessed Mon-Fri
  // 9-5 default — matches calendar-workspace.tsx, reports.ts, and the
  // client-side businessHoursForDate in new-appointment-form.tsx.
  if (!hours?.isOpen) {
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
    // The edit form's Status dropdown can cancel an appointment directly
    // (not just the dedicated Cancel booking action) — the doctor's app
    // needs to hear about that path too, not just cancelAppointmentAction.
    let wasNewlyCancelled = false;

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
      // existing.status (fresh, just read above) drives the bookkeeping
      // below — it should describe what's actually in the DB right now, not
      // what the client's stale form last saw. That's a deliberately
      // different source than payload.baselineStatus, which the guarded
      // write further down compares against instead of this fresh read —
      // see that guard's comment for why. The two are expected to agree
      // outside of a sub-millisecond window between this read and the
      // transaction starting.
      const newStatus = toPrismaAppointmentStatus(payload.status);

      // Same rule cancelAppointmentCore enforces for the dedicated Cancel
      // button (409 there) — a completed visit already happened, so flipping
      // it to CANCELLED would corrupt the completion-rate metric and the
      // client's last-visit date. The Status dropdown offers every status,
      // so this is reachable with no race at all — just picking "Cancelled"
      // while editing an old completed visit. (Other corrections away from
      // COMPLETED, e.g. reverting an accidental auto-complete back to
      // CONFIRMED, stay allowed — only the CANCELLED destination is barred.)
      if (existing.status === "COMPLETED" && newStatus === "CANCELLED") {
        return {
          ok: false,
          error: APPOINTMENT_ALREADY_COMPLETED_ERROR,
        };
      }

      wasNewlyCancelled = existing.status !== "CANCELLED" && newStatus === "CANCELLED";
      shouldResetReminders =
        existing.clientId !== payload.clientId ||
        existing.staffMemberId !== staffMemberId ||
        existing.title !== payload.service.trim() ||
        existing.startAt.getTime() !== startAt.getTime() ||
        existing.endAt.getTime() !== endAt.getTime() ||
        existing.status !== newStatus;
    }

    // The appointment write, reminder reset, and last-visit refresh commit
    // together. Payment is intentionally NOT collected here — it's recorded
    // separately on the client's Payments tab, after the visit.
    const txResult = await prisma.$transaction(async (tx) => {
      if (payload.id) {
        // Compare-and-set: guard the write on the status the CLIENT'S form
        // was built from (payload.baselineStatus), not a status re-read
        // here at submit time — a fresh read would already reflect a
        // concurrent change made while the form sat open (most commonly
        // completePastConfirmedAppointments' sweep flipping CONFIRMED to
        // COMPLETED), so the guard would just match the new value and wave
        // the stale save straight through. Comparing against what the
        // client actually saw is what makes this a real compare-and-set —
        // the same class of race cancelAppointmentCore closes for the
        // dedicated cancel action, just keyed on the client's baseline
        // instead of an exclusion set (a save can legitimately move status
        // to any value, unlike a cancel which only ever moves to CANCELLED).
        // Scope: this guards `status` only, not clientId/staffMemberId/
        // title/startAt/endAt/notes — two concurrent saves that leave
        // status untouched can still clobber each other's other fields.
        // Closing that fully would be general optimistic-concurrency
        // control for the whole edit form, a materially bigger feature;
        // this fix targets the specific status-vs-completion-sweep race.
        const { count } = await tx.appointment.updateMany({
          where: {
            id: payload.id,
            businessId: business.id,
            status: toPrismaAppointmentStatus(payload.baselineStatus),
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

        if (count === 0) {
          return { conflict: true as const };
        }

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

      return { conflict: false as const };
    });

    if (txResult.conflict) {
      return {
        ok: false,
        error: APPOINTMENT_CONFLICT_ERROR,
      };
    }

    revalidateCalendarSurfaces(
      [payload.clientId, previousClientId],
      [staffMemberId, previousStaffMemberId]
    );

    if (wasNewlyCancelled) {
      // The doctor who is told is whoever HAD this slot before the edit, not
      // the post-save assignee: if the same save also reassigns or clears the
      // staff dropdown, the previous owner is the one whose schedule just
      // lost an appointment — the new/cleared assignee never had it to lose.
      await notifyStaffOfAppointmentChange(business.id, previousStaffMemberId, appointmentId!);
    } else if (!payload.id) {
      // Brand-new booking — tell whoever it's assigned to, if anyone.
      if (staffMemberId) {
        await notifyStaffOfAppointmentChange(business.id, staffMemberId, appointmentId!, "new");
      }
    } else if (shouldResetReminders) {
      // An existing appointment changed some other meaningful way (reschedule,
      // a non-cancel status change, reassignment, or a service/title edit).
      // Tell whoever is now assigned, and separately tell whoever had it
      // before if the slot moved to someone else (or was unassigned) — each
      // side of a reassignment needs to know their own schedule just changed.
      const recipients = new Set(
        [staffMemberId, previousStaffMemberId].filter((id): id is string => Boolean(id))
      );
      // Concurrent, not sequential — this runs on every reassignment/reschedule
      // save (not just the rare cancel/delete path), so awaiting recipients one
      // at a time would let a slow push call stack up to ~2x the latency on a
      // routine save.
      await Promise.allSettled(
        Array.from(recipients).map((recipientId) =>
          notifyStaffOfAppointmentChange(business.id, recipientId, appointmentId!)
        )
      );
    }

    return {
      ok: true,
      appointment: await hydrateAppointment(appointmentId!),
    };
  } catch (error) {
    // The client/staff ownership checks above run before the transaction, so
    // a concurrent delete of either one in that window survives them and
    // only fails here, as a foreign-key violation on the create/update.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return {
        ok: false,
        error: "The selected client or staff member no longer exists. Refresh and try again.",
      };
    }
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

