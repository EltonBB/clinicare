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
  // Unread messages from this staff member in the staff↔admin thread — e.g. a
  // mobile-side cancellation notice. Separate from StaffDirectoryCounts (which
  // is purely appointment-derived) since it comes from a different table and
  // the detail-page builder (buildStaffRecord) has no thread data to compute
  // it from; defaults to 0 there, where the page fetches the real value
  // separately via getAdminThread instead.
  unreadMessages: number;
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
  shifts: Pick<StaffShift, "startsAt" | "endsAt">[];
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

  const now = new Date();

  // Single source of truth for "can this staff member clock in right now" —
  // the same function the server enforces with, so the button can never
  // disagree with what a check-in request would actually do. Replaces a
  // former date-equality "todayShift" pick that missed split shifts (after
  // the morning half ends, the button showed "ended" even though an evening
  // shift was about to open) and overnight shifts (date-equality can't match
  // a shift that started yesterday).
  if (findActiveShiftWindow(args.shifts, now)) {
    return {
      canClock: true,
      clockLabel: "Check in",
      clockDisabledReason: "",
    };
  }

  // Not in an active window — explain why using whichever shift is most
  // relevant: the soonest upcoming one, else the most recently ended one.
  const upcoming = args.shifts
    .filter((shift) => shift.startsAt.getTime() > now.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];

  if (upcoming) {
    return {
      canClock: false,
      clockLabel: "Check in",
      clockDisabledReason: `Check-in opens 30 min before ${formatZonedTime(upcoming.startsAt)}.`,
    };
  }

  const mostRecentlyEnded = args.shifts
    .filter((shift) => shift.endsAt.getTime() <= now.getTime())
    .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())[0];

  if (mostRecentlyEnded) {
    return {
      canClock: false,
      clockLabel: "Check in",
      clockDisabledReason: `Today's shift ended at ${formatZonedTime(mostRecentlyEnded.endsAt)}.`,
    };
  }

  return {
    canClock: false,
    clockLabel: "No shift",
    clockDisabledReason: "Add a shift for today before check-in.",
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
  counts: StaffDirectoryCounts = EMPTY_STAFF_COUNTS,
  unreadMessages = 0
): StaffDirectoryItem {
  const todayKey = formatZonedDateKey();
  // For the "Today" column label only — a calendar-date match is the right
  // concept for "what's scheduled today" display text. Check-in eligibility
  // below is decided separately, from the full shift list, since that's a
  // currently-active-window question, not a calendar-date one (a split shift's
  // second half or an overnight shift wouldn't be "today's shift" by this
  // definition but can still be legitimately clockable right now).
  const todayShift = member.shifts.find(
    (shift) => formatZonedDateKey(shift.startsAt) === todayKey
  );
  const isCheckedIn = member.timeEntries.some((entry) => !entry.checkedOutAt);
  const normalizedStatus = normalizeStaffStatus(member.status);
  const clock = clockState({
    status: normalizedStatus,
    isCheckedIn,
    shifts: member.shifts,
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
    unreadMessages,
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
  countsByStaff: Map<string, StaffDirectoryCounts> = new Map(),
  unreadMessagesByStaff: Map<string, number> = new Map()
): StaffViewModel {
  const staff = records.map((member) =>
    buildStaffDirectoryRecord(
      member,
      countsByStaff.get(member.id) ?? EMPTY_STAFF_COUNTS,
      unreadMessagesByStaff.get(member.id) ?? 0
    )
  );

  return {
    staff,
  };
}
