"use server";

import { revalidatePath } from "next/cache";

import { getAuthedBusiness as getAuthedBusinessContext } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import {
  getAppTimeZone,
  getZonedDayWindow,
  getZonedDayWindowFromParts,
  getZonedMonthStart,
  parseZonedWallClock,
} from "@/lib/time-zone";
import {
  buildStaffRecord,
  staffStatuses,
  type SaveStaffPayload,
  type StaffRecord,
} from "@/lib/staff";
import { logger } from "@/lib/logger";
import {
  ACCESS_CODE_TTL_MS,
  generateAccessCode,
  hashAccessCode,
} from "@/lib/staff-auth";

export type SaveStaffResult = {
  ok: boolean;
  error?: string;
  staff?: StaffRecord;
};

export type DeleteStaffResult = {
  ok: boolean;
  error?: string;
  staffId?: string;
};

export type StaffClockResult = {
  ok: boolean;
  error?: string;
  staff?: StaffRecord;
};

export type SaveStaffShiftPayload = {
  id?: string;
  staffMemberId: string;
  date: string;
  startTime: string;
  endTime: string;
  status?: string;
  notes?: string;
};

export type SaveStaffShiftResult = {
  ok: boolean;
  error?: string;
  shiftId?: string;
};

function staffTimeEntryCutoff() {
  return new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
}

function completedAppointmentCutoff() {
  // Zoned month start so early-on-the-1st visits aren't dropped in non-UTC clinics.
  return getZonedMonthStart();
}

function staffShiftCutoff() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
}

// Store shift times as the true UTC instant for the clinic's wall-clock entry
// (shared helper — see lib/time-zone.ts).
function parseDateTime(date: string, time: string) {
  return parseZonedWallClock(date, time);
}

function getAuthedBusiness() {
  return getAuthedBusinessContext(
    "Your session expired. Log in again to manage staff."
  );
}

async function fetchStaffRecord(staffId: string, businessId: string) {
  const staff = await prisma.staffMember.findFirstOrThrow({
    where: {
      id: staffId,
      businessId,
    },
    include: {
      timeEntries: {
        where: {
          checkedInAt: {
            gte: staffTimeEntryCutoff(),
          },
        },
        orderBy: {
          checkedInAt: "desc",
        },
      },
      shifts: {
        where: {
          startsAt: {
            gte: staffShiftCutoff(),
          },
        },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
        },
        orderBy: {
          startsAt: "asc",
        },
        take: 8,
      },
      appointments: {
        where: {
          startAt: {
            gte: completedAppointmentCutoff(),
          },
        },
        include: {
          client: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          startAt: "desc",
        },
        take: 50,
      },
    },
  });

  return buildStaffRecord(staff);
}

// Surfaces local to a staff change: the directory (employment status, the
// "Checked in now" signal, today's shift) and — when the change is scoped to one
// member — that member's detail page. Check-in/out and shift edits touch only
// these (the dashboard, calendar, and reports render neither check-in state nor
// shifts). Settings has no staff section, so it isn't revalidated here.
function revalidateStaffSurfaces(staffId?: string | null) {
  revalidatePath("/staff");
  if (staffId) {
    revalidatePath(`/staff/${staffId}`);
  }
}

// Roster changes (add / remove / rename / role / employment status) ripple
// beyond the staff workspace: the calendar's provider options, the dashboard's
// "Staff today" card, Reports' active-staff / top-provider / load highlights,
// and the clients directory's "last provider" column all derive from the member
// list. (Mirrors how the calendar helper fans out across the same triangle.)
function revalidateStaffRosterSurfaces(staffId?: string | null) {
  revalidateStaffSurfaces(staffId);
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  revalidatePath("/reports");
  revalidatePath("/clients");
}

function isValidTime(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

// Zoned day window (true UTC instants) for a `YYYY-MM-DD` clinic-local date key.
function zonedDateKeyWindow(dateKey: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) {
    return null;
  }

  return getZonedDayWindowFromParts(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    timeZone
  );
}

async function replaceWeeklySchedule(args: {
  businessId: string;
  staffMemberId: string;
  weeklySchedule: NonNullable<SaveStaffPayload["weeklySchedule"]>;
}) {
  const timeZone = getAppTimeZone();
  const shifts = args.weeklySchedule
    .filter((item) => item.enabled && item.date && isValidTime(item.startTime) && isValidTime(item.endTime))
    .map((item) => {
      const startsAt = parseDateTime(item.date, item.startTime);
      const endsAt = parseDateTime(item.date, item.endTime);

      if (!startsAt || !endsAt || endsAt <= startsAt) {
        return null;
      }

      return {
        businessId: args.businessId,
        staffMemberId: args.staffMemberId,
        startsAt,
        endsAt,
        status: "Scheduled",
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  // Delete only the existing shifts on exactly the clinic-local dates being
  // replaced, using zoned day bounds so they line up with how shifts are stored
  // (true UTC instants of the clinic wall-clock entry). Per-day windows (not a
  // first..last range) keep a non-contiguous or tampered payload from wiping
  // shifts on intervening days, while still catching an early-morning shift that
  // crosses to the previous UTC day in a non-UTC clinic.
  const dayWindows = Array.from(
    new Set(
      args.weeklySchedule
        .map((item) => item.date)
        .filter((date): date is string => /^\d{4}-\d{2}-\d{2}$/.test((date ?? "").trim()))
    )
  )
    .map((dateKey) => zonedDateKeyWindow(dateKey, timeZone))
    .filter((window): window is NonNullable<typeof window> => window !== null);

  const operations = [
    ...(dayWindows.length > 0
      ? [
          prisma.staffShift.deleteMany({
            where: {
              businessId: args.businessId,
              staffMemberId: args.staffMemberId,
              OR: dayWindows.map((window) => ({
                startsAt: {
                  gte: window.start,
                  lte: window.end,
                },
              })),
            },
          }),
        ]
      : []),
    ...(shifts.length > 0
      ? [
          prisma.staffShift.createMany({
            data: shifts,
          }),
        ]
      : []),
  ];

  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }
}

export async function saveStaffAction(payload: SaveStaffPayload): Promise<SaveStaffResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const business = context.business;
  const name = payload.name.trim();

  if (!name) {
    return {
      ok: false,
      error: "Staff name is required.",
    };
  }

  const status = staffStatuses.includes(payload.status) ? payload.status : "ACTIVE";
  const data = {
    name,
    role: payload.role.trim() || "Specialist",
    email: payload.email.trim() || null,
    phone: payload.phone.trim() || null,
    profileNote: payload.profileNote.trim() || null,
    status,
    isActive: status !== "INACTIVE",
  };

  let staffId = payload.id;

  if (payload.id) {
    const existing = await prisma.staffMember.findFirst({
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
        error: "Staff member not found in this workspace.",
      };
    }

    await prisma.staffMember.update({
      where: {
        id: payload.id,
      },
      data,
    });
  } else {
    const created = await prisma.staffMember.create({
      data: {
        businessId: business.id,
        ...data,
      },
    });
    staffId = created.id;
  }

  if (payload.weeklySchedule) {
    await replaceWeeklySchedule({
      businessId: business.id,
      staffMemberId: staffId!,
      weeklySchedule: payload.weeklySchedule,
    });
  }

  revalidateStaffRosterSurfaces(staffId);

  return {
    ok: true,
    staff: await fetchStaffRecord(staffId!, business.id),
  };
}

export async function deleteStaffAction(staffId: string): Promise<DeleteStaffResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const business = context.business;
  const existing = await prisma.staffMember.findFirst({
    where: {
      id: staffId,
      businessId: business.id,
    },
    select: {
      id: true,
    },
  });

  if (!existing) {
    return {
      ok: false,
      error: "Staff member not found in this workspace.",
    };
  }

  await prisma.staffMember.delete({
    where: {
      id: staffId,
    },
  });

  revalidateStaffRosterSurfaces();

  return {
    ok: true,
    staffId,
  };
}

export async function checkInStaffAction(staffId: string): Promise<StaffClockResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const business = context.business;
  const staff = await prisma.staffMember.findFirst({
    where: {
      id: staffId,
      businessId: business.id,
    },
    select: {
      id: true,
      status: true,
      shifts: {
        where: {
          startsAt: {
            gte: getZonedDayWindow().start,
          },
        },
        select: {
          startsAt: true,
          endsAt: true,
        },
        orderBy: {
          startsAt: "asc",
        },
        take: 8,
      },
    },
  });

  if (!staff) {
    return {
      ok: false,
      error: "Staff member not found in this workspace.",
    };
  }

  const now = new Date();
  // Match purely on the shift's time window (30-min early grace through its end).
  // A clinic-local-date equality check would reject the pre-midnight grace period
  // that belongs to an early-morning shift on the next date (e.g. a 00:15 shift's
  // window opens at 23:45 the previous day) and any post-midnight overnight shift.
  const todayShift = staff.shifts.find(
    (shift) =>
      now >= new Date(shift.startsAt.getTime() - 30 * 60 * 1000) &&
      now <= shift.endsAt
  );

  if (staff.status === "INACTIVE") {
    return {
      ok: false,
      error: "Inactive staff cannot check in.",
    };
  }

  if (!todayShift) {
    return {
      ok: false,
      error: "This staff member is not inside a scheduled shift window.",
    };
  }

  const openEntry = await prisma.staffTimeEntry.findFirst({
    where: {
      businessId: business.id,
      staffMemberId: staffId,
      checkedOutAt: null,
    },
  });

  if (!openEntry) {
    await prisma.staffTimeEntry.create({
      data: {
        businessId: business.id,
        staffMemberId: staffId,
        checkedInAt: new Date(),
      },
    });
  }

  revalidateStaffSurfaces(staffId);

  return {
    ok: true,
    staff: await fetchStaffRecord(staffId, business.id),
  };
}

export async function checkOutStaffAction(staffId: string): Promise<StaffClockResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const business = context.business;
  const openEntry = await prisma.staffTimeEntry.findFirst({
    where: {
      businessId: business.id,
      staffMemberId: staffId,
      checkedOutAt: null,
    },
    orderBy: {
      checkedInAt: "desc",
    },
  });

  if (!openEntry) {
    return {
      ok: false,
      error: "This staff member is not checked in.",
    };
  }

  await prisma.staffTimeEntry.update({
    where: {
      id: openEntry.id,
    },
    data: {
      checkedOutAt: new Date(),
    },
  });

  revalidateStaffSurfaces(staffId);

  return {
    ok: true,
    staff: await fetchStaffRecord(staffId, business.id),
  };
}

export async function saveStaffShiftAction(
  payload: SaveStaffShiftPayload
): Promise<SaveStaffShiftResult> {
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

  if (!payload.staffMemberId || !startAt || !endAt || endAt <= startAt) {
    return {
      ok: false,
      error: "Choose staff and a valid shift start/end time.",
    };
  }

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
      error: "Staff member not found in this workspace.",
    };
  }

  const data = {
    staffMemberId: staff.id,
    startsAt: startAt,
    endsAt: endAt,
    status: payload.status?.trim() || "Scheduled",
    notes: payload.notes?.trim() || null,
  };

  let shiftId = payload.id;
  if (payload.id) {
    const existing = await prisma.staffShift.findFirst({
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
        error: "Staff shift not found in this workspace.",
      };
    }

    await prisma.staffShift.update({
      where: {
        id: payload.id,
      },
      data,
    });
  } else {
    const shift = await prisma.staffShift.create({
      data: {
        businessId: business.id,
        ...data,
      },
    });
    shiftId = shift.id;
  }

  revalidateStaffSurfaces(staff.id);

  return {
    ok: true,
    shiftId,
  };
}

export async function deleteStaffShiftAction(
  shiftId: string
): Promise<SaveStaffShiftResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const existing = await prisma.staffShift.findFirst({
    where: {
      id: shiftId,
      businessId: context.business.id,
    },
    select: {
      id: true,
      staffMemberId: true,
    },
  });

  if (!existing) {
    return {
      ok: false,
      error: "Staff shift not found in this workspace.",
    };
  }

  await prisma.staffShift.delete({
    where: {
      id: shiftId,
    },
  });

  revalidateStaffSurfaces(existing.staffMemberId);

  return {
    ok: true,
    shiftId,
  };
}

// --- Mobile access (Vela Staff app enrollment) ------------------------------

export type MobileAccessResult = {
  ok: boolean;
  error?: string;
  /** Plaintext enrollment code — returned exactly once, on generate. */
  code?: string;
};

async function requireOwnedStaff(staffId: unknown) {
  if (typeof staffId !== "string" || !staffId.trim()) {
    return { error: "Staff member not found." } as const;
  }
  const context = await getAuthedBusinessContext();
  if ("error" in context) {
    return { error: context.error } as const;
  }
  const staff = await prisma.staffMember.findFirst({
    where: { id: staffId, businessId: context.business.id },
    select: { id: true },
  });
  if (!staff) {
    return { error: "Staff member not found." } as const;
  }
  return { businessId: context.business.id, staffId } as const;
}

/**
 * Issue a fresh one-time enrollment code for a staff member's mobile app. The
 * plaintext is returned ONCE for the admin to hand over; only its hash is
 * stored. Any prior unredeemed code is superseded so only one is ever active.
 */
export async function generateMobileAccessCodeAction(
  staffId: string
): Promise<MobileAccessResult> {
  const owned = await requireOwnedStaff(staffId);
  if ("error" in owned) {
    return { ok: false, error: owned.error };
  }

  const code = generateAccessCode();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.staffAccessCode.updateMany({
        where: { businessId: owned.businessId, staffMemberId: owned.staffId, status: "ACTIVE" },
        data: { status: "REVOKED" },
      });
      await tx.staffAccessCode.create({
        data: {
          businessId: owned.businessId,
          staffMemberId: owned.staffId,
          codeHash: hashAccessCode(code),
          expiresAt: new Date(Date.now() + ACCESS_CODE_TTL_MS),
        },
      });
    });
  } catch (error) {
    logger.error("Failed to generate mobile access code.", error, { staffId: owned.staffId });
    return { ok: false, error: "We couldn't generate a code. Please try again." };
  }

  revalidateStaffSurfaces(owned.staffId);
  return { ok: true, code };
}

/**
 * Revoke mobile access: invalidate any active code and log out every paired
 * device for this staff member.
 */
export async function revokeMobileAccessAction(
  staffId: string
): Promise<MobileAccessResult> {
  const owned = await requireOwnedStaff(staffId);
  if ("error" in owned) {
    return { ok: false, error: owned.error };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.staffAccessCode.updateMany({
        where: { businessId: owned.businessId, staffMemberId: owned.staffId, status: "ACTIVE" },
        data: { status: "REVOKED" },
      });
      await tx.staffDevice.updateMany({
        where: { businessId: owned.businessId, staffMemberId: owned.staffId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  } catch (error) {
    logger.error("Failed to revoke mobile access.", error, { staffId: owned.staffId });
    return { ok: false, error: "We couldn't update mobile access. Please try again." };
  }

  revalidateStaffSurfaces(owned.staffId);
  return { ok: true };
}
