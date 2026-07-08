"use server";

import { revalidatePath } from "next/cache";

import { getAuthedBusiness as getAuthedBusinessContext } from "@/lib/business";
import { openTimeEntryIfAbsent } from "@/lib/mobile/clock";
import { prisma } from "@/lib/prisma";
import {
  formatZonedTime,
  getAppTimeZone,
  getZonedDayWindow,
  getZonedDayWindowFromParts,
  getZonedMonthStart,
  parseZonedWallClock,
} from "@/lib/time-zone";
import {
  buildStaffRecord,
  findActiveShiftWindow,
  staffStatuses,
  type SaveStaffPayload,
  type StaffRecord,
} from "@/lib/staff";
import { logger } from "@/lib/logger";
import {
  markAdminThreadRead,
  postAdminThreadMessage,
} from "@/lib/mobile/admin-inbox";
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
        select: {
          id: true,
          checkedInAt: true,
          checkedOutAt: true,
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

  try {
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
  } catch {
    // A failed schedule replace (or member write) would otherwise surface as an
    // unhandled rejection with no typed result and skip revalidation — mirror
    // saveClientAction and return the app's generic customer-facing error.
    return {
      ok: false,
      error: "We couldn't save the staff member.",
    };
  }
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
          // endsAt (not startsAt) so an overnight shift that started yesterday
          // but hasn't ended yet is still loaded — findActiveShiftWindow below
          // would match it, but only if the query doesn't filter it out first.
          endsAt: {
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

  // Match on the shift's time window (30-min early grace through its end) — the
  // shared findActiveShiftWindow. A clinic-local-date equality check would reject
  // the pre-midnight grace of an early-morning shift on the next date and any
  // post-midnight overnight shift.
  const todayShift = findActiveShiftWindow(staff.shifts);

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

  // Shared with the mobile self check-in — atomic (Serializable transaction),
  // so an admin double-click or an admin/mobile race can't both create an
  // open time entry for the same member.
  await openTimeEntryIfAbsent(business.id, staffId);

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

// --- Staff messaging (admin/dashboard side of the staff↔admin thread) -------

export type StaffMessageResult = { ok: boolean; error?: string };

/** Admin replies to a staff member; notifies + pushes their device. */
export async function sendStaffMessageAction(
  staffId: string,
  body: string
): Promise<StaffMessageResult> {
  const owned = await requireOwnedStaff(staffId);
  if ("error" in owned) {
    return { ok: false, error: owned.error };
  }
  if (typeof body !== "string" || !body.trim()) {
    return { ok: false, error: "Message can't be empty." };
  }
  if (body.length > 4000) {
    return { ok: false, error: "Message is too long." };
  }

  try {
    const result = await postAdminThreadMessage(owned.businessId, owned.staffId, body);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
  } catch (error) {
    logger.error("Failed to send staff message.", error, { staffId: owned.staffId });
    return { ok: false, error: "We couldn't send your message. Please try again." };
  }

  revalidateStaffSurfaces(owned.staffId);
  return { ok: true };
}

export async function markStaffThreadReadAction(staffId: string): Promise<StaffMessageResult> {
  const owned = await requireOwnedStaff(staffId);
  if ("error" in owned) {
    return { ok: false, error: owned.error };
  }
  try {
    await markAdminThreadRead(owned.businessId, owned.staffId);
  } catch (error) {
    logger.error("Failed to mark staff thread read.", error, { staffId: owned.staffId });
    return { ok: false, error: "Something went wrong." };
  }
  revalidateStaffSurfaces(owned.staffId);
  return { ok: true };
}

/**
 * Opening a staff member's detail page acknowledges their pending check-ins —
 * same "viewing the page marks it seen" convention as markStaffThreadReadAction,
 * so a check-in the admin missed stops surfacing in the notification bell once
 * they've actually looked at that staff member.
 *
 * Best-effort, not airtight: a brand-new check-in landing in the narrow window
 * between this page mounting and this sweep running gets marked seen without
 * ever having shown up in the bell for it specifically. Accepted — the
 * dashboard toaster's own independent poll still surfaces it as a live toast,
 * so the admin isn't blind to it, only the durable backstop misses this one
 * instance (same tradeoff as the bell's per-category visible-list cap).
 */
export async function markStaffCheckInsSeenAction(staffId: string): Promise<StaffMessageResult> {
  const owned = await requireOwnedStaff(staffId);
  if ("error" in owned) {
    return { ok: false, error: owned.error };
  }
  try {
    await prisma.staffTimeEntry.updateMany({
      where: { businessId: owned.businessId, staffMemberId: owned.staffId, seenByAdminAt: null },
      data: { seenByAdminAt: new Date() },
    });
  } catch (error) {
    logger.error("Failed to mark staff check-ins seen.", error, { staffId: owned.staffId });
    return { ok: false, error: "Something went wrong." };
  }
  // The Staff directory's row dot now also reflects hasUnseenCheckIn, so
  // clearing this needs to bust that page's Router Cache the same way
  // markStaffThreadReadAction does for the message side — otherwise
  // navigating back to /staff shortly after can still show the stale dot.
  revalidateStaffSurfaces(owned.staffId);
  return { ok: true };
}

// --- Staff check-in feed (dashboard verification popup) ---------------------

export type RecentCheckIn = {
  entryId: string;
  staffId: string;
  staffName: string;
  atLabel: string;
  atMs: number;
};

/**
 * Recent staff check-ins (last 10 min) for the admin's workspace. Polled by the
 * dashboard WorkspaceToaster so the admin is notified to verify a staff member
 * is actually present when they check in from the mobile app. Read-only.
 */
export async function getRecentStaffCheckInsAction(): Promise<RecentCheckIn[]> {
  const context = await getAuthedBusinessContext();
  if ("error" in context) {
    return [];
  }

  const since = new Date(Date.now() - 10 * 60 * 1000);
  const entries = await prisma.staffTimeEntry.findMany({
    where: { businessId: context.business.id, checkedInAt: { gte: since } },
    orderBy: { checkedInAt: "desc" },
    take: 20,
    select: {
      id: true,
      checkedInAt: true,
      staffMember: { select: { id: true, name: true } },
    },
  });

  return entries.map((entry) => ({
    entryId: entry.id,
    staffId: entry.staffMember.id,
    staffName: entry.staffMember.name,
    atLabel: formatZonedTime(entry.checkedInAt),
    atMs: entry.checkedInAt.getTime(),
  }));
}

export type RecentStaffMessage = {
  messageId: string;
  staffId: string;
  staffName: string;
  isSystem: boolean;
  atLabel: string;
  atMs: number;
};

/**
 * Recent inbound staff messages (last 10 min) across this workspace's staff↔admin
 * threads. Polled by the dashboard toaster so the dashboard operator (the
 * receptionist who runs it) is notified when a doctor messages in. Read-only;
 * generic notice only (no message body — they open the staff page to read it).
 */
export async function getRecentStaffMessagesAction(): Promise<RecentStaffMessage[]> {
  const context = await getAuthedBusinessContext();
  if ("error" in context) {
    return [];
  }

  const since = new Date(Date.now() - 10 * 60 * 1000);
  const messages = await prisma.staffThreadMessage.findMany({
    where: {
      // SYSTEM covers a doctor's self-service actions (e.g. a mobile
      // cancellation notice) — those must alert the admin same as a typed
      // message, or the notice sits unseen in the thread. ADMIN is excluded:
      // that's the admin's own reply, not something to alert themselves about.
      sender: { in: ["STAFF", "SYSTEM"] },
      createdAt: { gte: since },
      thread: { businessId: context.business.id },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      createdAt: true,
      sender: true,
      thread: { select: { staffMemberId: true, staffMember: { select: { name: true } } } },
    },
  });

  return messages.map((message) => ({
    messageId: message.id,
    staffId: message.thread.staffMemberId,
    staffName: message.thread.staffMember.name,
    isSystem: message.sender === "SYSTEM",
    atLabel: formatZonedTime(message.createdAt),
    atMs: message.createdAt.getTime(),
  }));
}
