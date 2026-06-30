import { isAfter, isBefore } from "date-fns";
import type { Appointment, StaffMember, StaffShift, StaffTimeEntry } from "@prisma/client";

import {
  formatZonedDateKey,
  formatZonedDayName,
  formatZonedShortDate,
  formatZonedTime,
  formatZonedTime24,
  getZonedWeekWindow,
} from "@/lib/time-zone";

export const staffRoles = [
  "Specialist",
  "Receptionist",
  "Manager",
  "Assistant",
] as const;

export const staffStatuses = ["ACTIVE", "AWAY", "INACTIVE"] as const;

export type StaffRole = (typeof staffRoles)[number];
export type StaffStatus = (typeof staffStatuses)[number];

export type StaffDirectoryItem = {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  profileNote: string;
  status: StaffStatus;
  isCheckedIn: boolean;
  weeklyHours: number;
  appointmentsToday: number;
  completionRate: number;
  shiftLabel: string;
  nextShift: string;
  canClock: boolean;
  clockLabel: string;
  clockDisabledReason: string;
  completedThisMonth: number;
};

export type StaffRecord = StaffDirectoryItem & {
  schedule: Array<{
    id: string;
    date: string;
    day: string;
    startTime: string;
    endTime: string;
    status: string;
  }>;
  todayAppointments: Array<{
    id: string;
    title: string;
    clientName: string;
    time: string;
    status: string;
  }>;
  recentAppointments: Array<{
    id: string;
    title: string;
    clientName: string;
    date: string;
    time: string;
  }>;
  weekTimeEntries: Array<{
    id: string;
    day: string;
    checkedIn: string;
    checkedOut: string;
    duration: string;
  }>;
};

export type StaffViewModel = {
  staff: StaffDirectoryItem[];
};

export type SaveStaffPayload = {
  id?: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  profileNote: string;
  status: StaffStatus;
  weeklySchedule?: Array<{
    date: string;
    enabled: boolean;
    startTime: string;
    endTime: string;
  }>;
};

type StaffWithRelations = StaffMember & {
  timeEntries: Pick<StaffTimeEntry, "checkedInAt" | "checkedOutAt">[];
  shifts: Pick<StaffShift, "id" | "startsAt" | "endsAt" | "status">[];
  appointments: Array<
    Pick<Appointment, "id" | "title" | "startAt" | "endAt" | "status"> & {
      client: {
        name: string;
      };
    }
  >;
};

type StaffDirectoryWithRelations = StaffMember & {
  timeEntries: Pick<StaffTimeEntry, "checkedInAt" | "checkedOutAt">[];
  shifts: Pick<StaffShift, "id" | "startsAt" | "endsAt" | "status">[];
};

/** Per-staff appointment counts for the directory, computed in the DB at scale. */
export type StaffDirectoryCounts = {
  appointmentsToday: number;
  completionRate: number;
  completedThisMonth: number;
};

const EMPTY_STAFF_COUNTS: StaffDirectoryCounts = {
  appointmentsToday: 0,
  completionRate: 0,
  completedThisMonth: 0,
};

/**
 * Directory counts from in-memory appointment rows — used by the staff *detail*
 * builder, which already loads a single member's appointments. The directory
 * *page* computes the same shape in the DB (see lib/staff-data.ts) so it never
 * loads every appointment per member.
 */
function computeStaffDirectoryCounts(
  appointments: Array<Pick<Appointment, "startAt" | "status">>
): StaffDirectoryCounts {
  const todayKey = formatZonedDateKey();

  return {
    appointmentsToday: appointments.filter(
      (appointment) => formatZonedDateKey(appointment.startAt) === todayKey
    ).length,
    completionRate: calculateCompletionRate(appointments),
    completedThisMonth: appointments.filter(
      (appointment) => appointment.status === "COMPLETED" && isThisMonth(appointment.startAt)
    ).length,
  };
}

function normalizeStaffStatus(value: StaffMember["status"]): StaffStatus {
  return staffStatuses.includes(value as StaffStatus) ? (value as StaffStatus) : "ACTIVE";
}

function currentWeekStart() {
  // Monday 00:00 in the clinic zone, as a UTC instant (week-to-date boundary).
  return getZonedWeekWindow().start;
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);

  if (hours === 0) {
    return `${remainder}m`;
  }

  if (remainder === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainder}m`;
}

function calculateWeeklyHours(entries: Pick<StaffTimeEntry, "checkedInAt" | "checkedOutAt">[]) {
  const now = new Date();
  const weekStart = currentWeekStart();

  const minutes = entries.reduce((total, entry) => {
    const checkedOutAt = entry.checkedOutAt ?? now;
    if (checkedOutAt < weekStart) {
      return total;
    }

    const startedAt = entry.checkedInAt < weekStart ? weekStart : entry.checkedInAt;
    return total + Math.max(checkedOutAt.getTime() - startedAt.getTime(), 0) / 60000;
  }, 0);

  return Number((minutes / 60).toFixed(1));
}

function isThisMonth(date: Date) {
  // Compare the zoned YYYY-MM prefixes so month boundaries follow the clinic zone.
  return formatZonedDateKey(date).slice(0, 7) === formatZonedDateKey().slice(0, 7);
}

function formatShift(startsAt?: Date, endsAt?: Date) {
  if (!startsAt || !endsAt) {
    return "";
  }

  return `${formatZonedTime(startsAt)} - ${formatZonedTime(endsAt)}`;
}

function nextShiftLabel(shifts: Pick<StaffShift, "startsAt" | "endsAt" | "status">[]) {
  const now = new Date();
  const nextShift = shifts
    .filter((shift) => shift.endsAt >= now)
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())[0];

  if (!nextShift) {
    return "";
  }

  const dayLabel =
    formatZonedDateKey(nextShift.startsAt) === formatZonedDateKey(now)
      ? "Today"
      : formatZonedShortDate(nextShift.startsAt);
  return `${dayLabel}, ${formatZonedTime(nextShift.startsAt)}`;
}

function buildSchedule(
  shifts: Pick<StaffShift, "id" | "startsAt" | "endsAt" | "status">[]
) {
  return shifts
    .slice()
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())
    .map((shift) => ({
      id: shift.id,
      date: formatZonedDateKey(shift.startsAt),
      day: `${formatZonedDayName(shift.startsAt)}, ${formatZonedShortDate(shift.startsAt)}`,
      startTime: formatZonedTime24(shift.startsAt),
      endTime: formatZonedTime24(shift.endsAt),
      status: shift.status,
    }));
}

function clockState(args: {
  status: StaffStatus;
  isCheckedIn: boolean;
  todayShift?: Pick<StaffShift, "startsAt" | "endsAt">;
}) {
  if (args.isCheckedIn) {
    return {
      canClock: true,
      clockLabel: "Check out",
      clockDisabledReason: "",
    };
  }

  if (args.status === "INACTIVE") {
    return {
      canClock: false,
      clockLabel: "Off duty",
      clockDisabledReason: "Inactive staff cannot check in.",
    };
  }

  if (!args.todayShift) {
    return {
      canClock: false,
      clockLabel: "No shift",
      clockDisabledReason: "Add a shift for today before check-in.",
    };
  }

  const now = new Date();
  const earliestCheckIn = new Date(args.todayShift.startsAt.getTime() - 30 * 60 * 1000);
  const latestCheckIn = args.todayShift.endsAt;
  const withinShiftWindow =
    (isAfter(now, earliestCheckIn) || now.getTime() === earliestCheckIn.getTime()) &&
    (isBefore(now, latestCheckIn) || now.getTime() === latestCheckIn.getTime());

  return {
    canClock: withinShiftWindow,
    clockLabel: "Check in",
    clockDisabledReason: withinShiftWindow
      ? ""
      : isAfter(now, latestCheckIn)
        ? `Today's shift ended at ${formatZonedTime(args.todayShift.endsAt)}.`
        : `Check-in opens 30 min before ${formatZonedTime(args.todayShift.startsAt)}.`,
  };
}

/** Early check-in grace before a scheduled shift's start. */
export const CHECK_IN_EARLY_GRACE_MS = 30 * 60 * 1000;

/**
 * The scheduled shift whose check-in window currently covers `now` — from 30 min
 * before its start through its end — or undefined if none does. The single source
 * of truth for "is this staff member allowed to clock in right now", shared by
 * the admin check-in action and the mobile self check-in so both enforce the
 * SAME window (no clocking in outside a scheduled shift).
 */
export function findActiveShiftWindow(
  shifts: Pick<StaffShift, "startsAt" | "endsAt">[],
  now: Date = new Date()
): Pick<StaffShift, "startsAt" | "endsAt"> | undefined {
  const ms = now.getTime();
  return shifts.find(
    (shift) =>
      ms >= shift.startsAt.getTime() - CHECK_IN_EARLY_GRACE_MS &&
      ms <= shift.endsAt.getTime()
  );
}

function calculateCompletionRate(appointments: Pick<Appointment, "status">[]) {
  const finalized = appointments.filter(
    (appointment) => appointment.status === "COMPLETED" || appointment.status === "CANCELLED"
  );

  if (finalized.length === 0) {
    return 0;
  }

  const completed = finalized.filter((appointment) => appointment.status === "COMPLETED").length;
  return Math.round((completed / finalized.length) * 1000) / 10;
}

export function buildStaffDirectoryRecord(
  member: StaffDirectoryWithRelations,
  counts: StaffDirectoryCounts = EMPTY_STAFF_COUNTS
): StaffDirectoryItem {
  const todayKey = formatZonedDateKey();
  const todayShift = member.shifts.find(
    (shift) => formatZonedDateKey(shift.startsAt) === todayKey
  );
  const isCheckedIn = member.timeEntries.some((entry) => !entry.checkedOutAt);
  const normalizedStatus = normalizeStaffStatus(member.status);
  const clock = clockState({
    status: normalizedStatus,
    isCheckedIn,
    todayShift,
  });

  return {
    id: member.id,
    name: member.name,
    role: member.role,
    email: member.email ?? "",
    phone: member.phone ?? "",
    profileNote: member.profileNote ?? "",
    status: normalizedStatus,
    isCheckedIn,
    weeklyHours: calculateWeeklyHours(member.timeEntries),
    appointmentsToday: counts.appointmentsToday,
    completionRate: counts.completionRate,
    shiftLabel: todayShift ? formatShift(todayShift.startsAt, todayShift.endsAt) : "",
    nextShift: nextShiftLabel(member.shifts),
    canClock: clock.canClock,
    clockLabel: clock.clockLabel,
    clockDisabledReason: clock.clockDisabledReason,
    completedThisMonth: counts.completedThisMonth,
  };
}

export function buildStaffRecord(member: StaffWithRelations): StaffRecord {
  const completedAppointments = member.appointments.filter(
    (appointment) => appointment.status === "COMPLETED"
  );
  const todayKey = formatZonedDateKey();
  const weekStart = currentWeekStart();

  return {
    ...buildStaffDirectoryRecord(member, computeStaffDirectoryCounts(member.appointments)),
    schedule: buildSchedule(member.shifts),
    todayAppointments: member.appointments
      .filter(
        (appointment) =>
          formatZonedDateKey(appointment.startAt) === todayKey &&
          appointment.status !== "CANCELLED"
      )
      .sort((left, right) => left.startAt.getTime() - right.startAt.getTime())
      .map((appointment) => ({
        id: appointment.id,
        title: appointment.title,
        clientName: appointment.client.name,
        time: formatZonedTime(appointment.startAt),
        status: appointment.status,
      })),
    recentAppointments: completedAppointments.slice(0, 5).map((appointment) => ({
      id: appointment.id,
      title: appointment.title,
      clientName: appointment.client.name,
      date: formatZonedShortDate(appointment.startAt),
      time: formatZonedTime24(appointment.startAt),
    })),
    weekTimeEntries: member.timeEntries
      .filter((entry) => (entry.checkedOutAt ?? new Date()) >= weekStart)
      .sort((left, right) => right.checkedInAt.getTime() - left.checkedInAt.getTime())
      .map((entry) => ({
        id: entry.checkedInAt.toISOString(),
        day: `${formatZonedDayName(entry.checkedInAt)}, ${formatZonedShortDate(entry.checkedInAt)}`,
        checkedIn: formatZonedTime(entry.checkedInAt),
        checkedOut: entry.checkedOutAt ? formatZonedTime(entry.checkedOutAt) : "",
        duration: entry.checkedOutAt
          ? formatDuration(
              Math.max(entry.checkedOutAt.getTime() - entry.checkedInAt.getTime(), 0) / 60000
            )
          : "",
      })),
  };
}

export function buildStaffViewFromRecords(
  records: StaffDirectoryWithRelations[],
  countsByStaff: Map<string, StaffDirectoryCounts> = new Map()
): StaffViewModel {
  const staff = records.map((member) =>
    buildStaffDirectoryRecord(member, countsByStaff.get(member.id) ?? EMPTY_STAFF_COUNTS)
  );

  return {
    staff,
  };
}
