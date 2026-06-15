"use server";

import { revalidatePath } from "next/cache";

import { getAuthedBusiness as getAuthedBusinessContext } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import {
  formatZonedDateKey,
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

function revalidateStaffSurfaces() {
  revalidatePath("/staff");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  revalidatePath("/settings");
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

  revalidateStaffSurfaces();

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

  revalidateStaffSurfaces();

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
  const timeZone = getAppTimeZone();
  const todayKey = formatZonedDateKey(now, timeZone);
  const todayShift = staff.shifts.find(
    (shift) =>
      formatZonedDateKey(shift.startsAt, timeZone) === todayKey &&
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

  revalidatePath("/staff");

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

  revalidatePath("/staff");

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

  revalidateStaffSurfaces();

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

  revalidateStaffSurfaces();

  return {
    ok: true,
    shiftId,
  };
}
