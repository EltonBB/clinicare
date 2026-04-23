import { format } from "date-fns";
import type { Appointment, StaffMember, StaffTimeEntry } from "@prisma/client";

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
  completedThisMonth: number;
  recentAppointments: Array<{
    id: string;
    title: string;
    clientName: string;
    date: string;
    time: string;
  }>;
};

export type StaffViewModel = {
  staff: StaffRecord[];
  initialSelectedStaffId: string;
};

export type SaveStaffPayload = {
  id?: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  profileNote: string;
  status: StaffStatus;
};

type StaffWithRelations = StaffMember & {
  timeEntries: Pick<StaffTimeEntry, "checkedInAt" | "checkedOutAt">[];
  appointments: Array<
    Pick<Appointment, "id" | "title" | "startAt" | "status"> & {
      client: {
        name: string;
      };
    }
  >;
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

export function buildStaffRecord(member: StaffWithRelations): StaffRecord {
  const completedAppointments = member.appointments.filter(
    (appointment) => appointment.status === "COMPLETED"
  );

  return {
    id: member.id,
    name: member.name,
    role: member.role,
    email: member.email ?? "",
    phone: member.phone ?? "",
    profileNote: member.profileNote ?? "",
    status: normalizeStaffStatus(member.status),
    isCheckedIn: member.timeEntries.some((entry) => !entry.checkedOutAt),
    weeklyHours: calculateWeeklyHours(member.timeEntries),
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

export function buildStaffViewFromRecords(records: StaffWithRelations[]): StaffViewModel {
  const staff = records.map(buildStaffRecord);

  return {
    staff,
    initialSelectedStaffId: staff[0]?.id ?? "",
  };
}
