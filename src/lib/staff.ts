import { format, isAfter, isBefore, isSameDay } from "date-fns";
import type { Appointment, StaffMember, StaffShift, StaffTimeEntry } from "@prisma/client";

export const staffRoles = [
  "Specialist",
  "Receptionist",
  "Manager",
  "Assistant",
] as const;

export const staffStatuses = ["ACTIVE", "AWAY", "INACTIVE"] as const;

export type StaffRole = (typeof staffRoles)[number];
export type StaffStatus = (typeof staffStatuses)[number];

export type StaffRecord = {
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
  schedule: Array<{
    id: string;
    date: string;
    day: string;
    startTime: string;
    endTime: string;
    status: string;
  }>;
  completedThisMonth: number;
  recentAppointments: Array<{
    id: string;
    title: string;
    clientName: string;
    date: string;
    time: string;
  }>;
};

export type StaffDirectoryItem = Omit<StaffRecord, "recentAppointments">;

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
  appointments: Pick<Appointment, "startAt" | "endAt" | "status">[];
};

function normalizeStaffStatus(value: StaffMember["status"]): StaffStatus {
  return staffStatuses.includes(value as StaffStatus) ? (value as StaffStatus) : "ACTIVE";
}

function calculateWeeklyHours(entries: Pick<StaffTimeEntry, "checkedInAt" | "checkedOutAt">[]) {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));

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
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function formatShift(startsAt?: Date, endsAt?: Date) {
  if (!startsAt || !endsAt) {
    return "-";
  }

  return `${format(startsAt, "h:mm a")} - ${format(endsAt, "h:mm a")}`;
}

function nextShiftLabel(shifts: Pick<StaffShift, "startsAt" | "endsAt" | "status">[]) {
  const now = new Date();
  const nextShift = shifts
    .filter((shift) => shift.endsAt >= now)
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())[0];

  if (!nextShift) {
    return "-";
  }

  const dayLabel = isSameDay(nextShift.startsAt, now) ? "Today" : format(nextShift.startsAt, "MMM d");
  return `${dayLabel}, ${format(nextShift.startsAt, "h:mm a")}`;
}

function buildSchedule(
  shifts: Pick<StaffShift, "id" | "startsAt" | "endsAt" | "status">[]
) {
  return shifts
    .slice()
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())
    .map((shift) => ({
      id: shift.id,
      date: format(shift.startsAt, "yyyy-MM-dd"),
      day: format(shift.startsAt, "EEE, MMM d"),
      startTime: format(shift.startsAt, "HH:mm"),
      endTime: format(shift.endsAt, "HH:mm"),
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
      : `Check-in opens 30 min before ${format(args.todayShift.startsAt, "h:mm a")}.`,
  };
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

export function buildStaffRecord(member: StaffWithRelations): StaffRecord {
  const completedAppointments = member.appointments.filter(
    (appointment) => appointment.status === "COMPLETED"
  );
  const today = new Date();
  const todayShift = member.shifts.find((shift) => isSameDay(shift.startsAt, today));
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
    appointmentsToday: member.appointments.filter((appointment) =>
      isSameDay(appointment.startAt, today)
    ).length,
    completionRate: calculateCompletionRate(member.appointments),
    shiftLabel: todayShift ? formatShift(todayShift.startsAt, todayShift.endsAt) : "-",
    nextShift: nextShiftLabel(member.shifts),
    canClock: clock.canClock,
    clockLabel: clock.clockLabel,
    clockDisabledReason: clock.clockDisabledReason,
    schedule: buildSchedule(member.shifts),
    completedThisMonth: completedAppointments.filter((appointment) =>
      isThisMonth(appointment.startAt)
    ).length,
    recentAppointments: completedAppointments.slice(0, 5).map((appointment) => ({
      id: appointment.id,
      title: appointment.title,
      clientName: appointment.client.name,
      date: format(appointment.startAt, "MMM d"),
      time: format(appointment.startAt, "HH:mm"),
    })),
  };
}

export function buildStaffDirectoryRecord(
  member: StaffDirectoryWithRelations
): StaffDirectoryItem {
  const completedThisMonth = member.appointments.filter(
    (appointment) =>
      appointment.status === "COMPLETED" && isThisMonth(appointment.startAt)
  ).length;
  const today = new Date();
  const todayShift = member.shifts.find((shift) => isSameDay(shift.startsAt, today));
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
    appointmentsToday: member.appointments.filter((appointment) =>
      isSameDay(appointment.startAt, today)
    ).length,
    completionRate: calculateCompletionRate(member.appointments),
    shiftLabel: todayShift ? formatShift(todayShift.startsAt, todayShift.endsAt) : "-",
    nextShift: nextShiftLabel(member.shifts),
    canClock: clock.canClock,
    clockLabel: clock.clockLabel,
    clockDisabledReason: clock.clockDisabledReason,
    schedule: buildSchedule(member.shifts),
    completedThisMonth,
  };
}

export function buildStaffViewFromRecords(
  records: StaffDirectoryWithRelations[]
): StaffViewModel {
  const staff = records.map(buildStaffDirectoryRecord);

  return {
    staff,
  };
}
