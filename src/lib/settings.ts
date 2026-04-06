import { differenceInCalendarDays } from "date-fns";
import type {
  Business,
  BusinessHours,
  ReminderSettings,
  StaffMember,
} from "@prisma/client";

import { businessTypes, type BusinessType } from "@/lib/constants";
import {
  type WeekdayKey,
  type WorkingHoursState,
  weekdayOrder,
} from "@/lib/onboarding";

export type StaffRole = "Owner" | "Manager" | "Specialist" | "Reception";

export type SettingsStaffMember = {
  id: string;
  name: string;
  role: StaffRole;
};

export type SettingsReminders = {
  twentyFourHour: boolean;
  twoHour: boolean;
  template: string;
};

export type SettingsState = {
  business: {
    businessName: string;
    businessType: BusinessType;
    ownerName: string;
    supportEmail: string;
  };
  workingHours: WorkingHoursState;
  staff: SettingsStaffMember[];
  whatsapp: {
    phoneNumber: string;
    sendReminders: boolean;
    reminderWindow: string;
    template: string;
  };
  reminders: SettingsReminders;
  billing: {
    planName: string;
    trialLabel: string;
    note: string;
  };
};

type SettingsWorkspaceData = {
  business: Business;
  supportEmail: string;
  ownerName: string;
  businessHours: BusinessHours[];
  staffMembers: StaffMember[];
  reminderSettings: ReminderSettings | null;
};

function normalizeStaffRole(value: unknown): StaffRole {
  const roles: StaffRole[] = ["Owner", "Manager", "Specialist", "Reception"];

  return roles.includes(value as StaffRole) ? (value as StaffRole) : "Owner";
}

function normalizeWorkingHoursFromDatabase(hours: BusinessHours[]): WorkingHoursState {
  const defaults = weekdayOrder.reduce<WorkingHoursState>((result, day, index) => {
    result[day] = {
      enabled: index < 5,
      start: "09:00",
      end: "17:00",
    };
    return result;
  }, {} as WorkingHoursState);

  return weekdayOrder.reduce<WorkingHoursState>((result, day, index) => {
    const match = hours.find((item) => item.weekday === index);
    result[day] = match
      ? {
          enabled: match.isOpen,
          start: match.startTime,
          end: match.endTime,
        }
      : defaults[day];
    return result;
  }, {} as WorkingHoursState);
}

function normalizeSettingsStaff(staffMembers: StaffMember[], fallbackName: string) {
  if (staffMembers.length > 0) {
    return staffMembers.map((member) => ({
      id: member.id,
      name: member.name,
      role: normalizeStaffRole(member.role),
    }));
  }

  return [
    {
      id: "staff-seed",
      name: fallbackName,
      role: "Owner" as const,
    },
  ];
}

function buildBillingSummary(business: Business): SettingsState["billing"] {
  const planName =
    business.plan === "TRIAL"
      ? "Trial"
      : business.plan.charAt(0) + business.plan.slice(1).toLowerCase();
  const daysLeft =
    business.trialEndsAt != null
      ? Math.max(differenceInCalendarDays(business.trialEndsAt, new Date()), 0)
      : 0;

  return {
    planName,
    trialLabel:
      business.plan === "TRIAL" ? `${daysLeft} days left` : business.planStatus.toLowerCase(),
    note:
      business.plan === "TRIAL"
        ? "Your workspace is on the Vela trial with bookings, clients, reminders, and inbox tools enabled for MVP testing."
        : `Your workspace is on the ${planName} plan with clinic-scoped appointments, clients, reminders, and inbox access.`,
  };
}

export function buildSettingsStateFromWorkspace({
  business,
  supportEmail,
  ownerName,
  businessHours,
  staffMembers,
  reminderSettings,
}: SettingsWorkspaceData): SettingsState {
  return {
    business: {
      businessName: business.name,
      businessType: businessTypes.includes(business.businessType as BusinessType)
        ? (business.businessType as BusinessType)
        : "Clinic",
      ownerName,
      supportEmail,
    },
    workingHours: normalizeWorkingHoursFromDatabase(businessHours),
    staff: normalizeSettingsStaff(staffMembers, ownerName),
    whatsapp: {
      phoneNumber: business.whatsappNumber ?? "",
      sendReminders: business.whatsappEnabled,
      reminderWindow: reminderSettings?.reminderWindow ?? "24 hours before",
      template:
        reminderSettings?.template ??
        "Hi {client_name}, this is a reminder for your appointment at {time}. Reply here if you need to reschedule.",
    },
    reminders: {
      twentyFourHour: reminderSettings?.send24HourReminder ?? true,
      twoHour: reminderSettings?.send2HourReminder ?? true,
      template:
        reminderSettings?.template ??
        "Hi {client_name}, this is a reminder for your appointment at {time}. Reply here if you need to reschedule.",
    },
    billing: buildBillingSummary(business),
  };
}

export type SaveSettingsPayload = SettingsState;

export const weekdayLabels: Record<WeekdayKey, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export const timeOptions = [
  "07:00",
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
];

export const reminderWindows = ["2 hours before", "24 hours before", "48 hours before"];
export const staffRoles: StaffRole[] = ["Owner", "Manager", "Specialist", "Reception"];
