import { format } from "date-fns";
import type {
  Business,
  BusinessHours,
  ReminderSettings,
  StaffMember,
  WhatsAppConnection,
  WhatsAppDisplayNameStatus,
  WhatsAppConnectionMode,
  WhatsAppConnectionStatus,
  WhatsAppProvider,
  WhatsAppVerificationStatus,
} from "@prisma/client";

import { businessTypes, type BusinessType } from "@/lib/constants";
import {
  type WeekdayKey,
  type WorkingHoursState,
  weekdayOrder,
} from "@/lib/onboarding";
import { planDisplayName, planStatusLabel } from "@/lib/billing";

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
    connection: {
      provider: WhatsAppProvider;
      mode: WhatsAppConnectionMode;
      status: WhatsAppConnectionStatus;
      requestedPhoneNumber: string;
      senderPhoneNumber: string;
      externalSenderId: string;
      senderLabel: string;
      statusLabel: string;
      modeLabel: string;
      readinessLabel: string;
      detail: string;
      verificationLabel: string;
      displayNameLabel: string;
      lastError: string;
      connectedAtLabel: string;
      onboardingStartedAtLabel: string;
      lastSyncedLabel: string;
    };
  };
  reminders: SettingsReminders;
  billing: {
    planName: string;
    statusLabel: string;
    note: string;
    nextStep: string;
    ctaLabel: string;
    lockedFeatures: string[];
  };
};

type SettingsWorkspaceData = {
  business: Business;
  supportEmail: string;
  ownerName: string;
  businessHours: BusinessHours[];
  staffMembers: StaffMember[];
  reminderSettings: ReminderSettings | null;
  whatsappConnection: WhatsAppConnection | null;
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
  const planName = planDisplayName(business.plan);

  return {
    planName,
    statusLabel: planStatusLabel(business.planStatus),
    note:
      planName === "Pro"
        ? "Your workspace is on the Pro plan with reports and premium workflow surfaces enabled."
        : "Your workspace is on the Basic plan with core clinic operations enabled for daily use.",
    nextStep:
      planName === "Pro"
        ? "Live billing is not connected yet. When payments are enabled, this workspace will manage plan changes here."
        : "Upgrade flow is prepared, but payment collection goes live later. For now, Pro can be unlocked manually during testing.",
    ctaLabel: planName === "Pro" ? "Manage plan" : "Unlock Pro",
    lockedFeatures:
      planName === "Pro"
        ? ["Reports", "Premium workflow surfaces", "Future automation tools"]
        : ["Reports", "Premium workflow surfaces", "Future automation tools"],
  };
}

export function resolveWhatsAppConnectionStatus(args: {
  hasSender: boolean;
  previousStatus?: WhatsAppConnectionStatus | null;
}) {
  if (!args.hasSender) {
    return "PENDING_SETUP" as const;
  }

  if (args.previousStatus === "CONNECTED") {
    return "CONNECTED" as const;
  }

  if (args.previousStatus === "ERRORED") {
    return "ERRORED" as const;
  }

  return "PENDING_VERIFICATION" as const;
}

function formatConnectionTimestamp(value: Date | null | undefined) {
  return value ? format(value, "MMM d, yyyy 'at' h:mm a") : "";
}

function formatVerificationLabel(status: WhatsAppVerificationStatus) {
  const labels: Record<WhatsAppVerificationStatus, string> = {
    NOT_STARTED: "Not started",
    PENDING: "Pending verification",
    VERIFIED: "Verified",
    FAILED: "Verification failed",
  };

  return labels[status];
}

function formatDisplayNameLabel(status: WhatsAppDisplayNameStatus) {
  const labels: Record<WhatsAppDisplayNameStatus, string> = {
    UNKNOWN: "Not submitted",
    PENDING: "Pending review",
    APPROVED: "Approved",
    REJECTED: "Rejected",
  };

  return labels[status];
}

export function buildWhatsAppConnectionSummary(
  connection: WhatsAppConnection | null,
  fallbackRequestedPhoneNumber: string
): SettingsState["whatsapp"]["connection"] {
  const provider = connection?.provider ?? "TWILIO";
  const mode = connection?.mode ?? "SANDBOX";
  const status = connection?.status ?? "PENDING_SETUP";
  const requestedPhoneNumber =
    connection?.requestedPhoneNumber ?? fallbackRequestedPhoneNumber;
  const senderPhoneNumber = connection?.senderPhoneNumber ?? "";
  const externalSenderId = connection?.externalSenderId ?? "";
  const senderLabel = mode === "LIVE" ? "Live sender" : "Sandbox sender";
  const verificationStatus = connection?.verificationStatus ?? "NOT_STARTED";
  const displayNameStatus = connection?.displayNameStatus ?? "UNKNOWN";

  const statusLabelMap: Record<WhatsAppConnectionStatus, string> = {
    DISCONNECTED: "Disconnected",
    PENDING_SETUP: "Pending setup",
    PENDING_VERIFICATION: "Pending verification",
    CONNECTED: "Connected",
    ERRORED: "Needs attention",
  };

  const modeLabelMap: Record<WhatsAppConnectionMode, string> = {
    SANDBOX: "Sandbox",
    LIVE: "Live",
  };

  const readinessLabelMap: Record<WhatsAppConnectionStatus, string> = {
    DISCONNECTED: "Connection disconnected",
    PENDING_SETUP: "Provider setup needed",
    PENDING_VERIFICATION: "Waiting for sandbox verification",
    CONNECTED: mode === "SANDBOX" ? "Ready for WhatsApp sandbox testing" : "Ready for live client messaging",
    ERRORED: "Connection needs attention",
  };

  let detail =
    "Save a clinic number here first. Vela will treat it as the requested WhatsApp number for this workspace.";

  if (mode === "SANDBOX" && status === "CONNECTED") {
    detail =
      "Twilio sandbox is connected. Messages send from the sandbox sender for testing, while your clinic number stays saved as the requested live sender.";
  } else if (mode === "LIVE" && status === "PENDING_VERIFICATION") {
    detail =
      "The clinic number is saved for live onboarding. The next step is provider verification and sender approval before client messaging can go live.";
  } else if (mode === "SANDBOX" && status === "PENDING_VERIFICATION") {
    detail =
      "The sandbox sender is configured, but Vela still needs one successful sandbox test before this clinic is treated as message-ready.";
  } else if (status === "PENDING_VERIFICATION") {
    detail =
      "The clinic number is saved, but the provider still needs verification before it can send live client messages.";
  } else if (mode === "LIVE" && status === "CONNECTED") {
    detail =
      "This workspace has an approved live WhatsApp sender. Client messages can use the connected clinic sender.";
  } else if (status === "ERRORED") {
    detail =
      "The provider connection needs attention before Vela can send messages for this clinic.";
  }

  return {
    provider,
    mode,
    status,
    requestedPhoneNumber,
    senderPhoneNumber,
    externalSenderId,
    senderLabel,
    statusLabel: statusLabelMap[status],
    modeLabel: modeLabelMap[mode],
    readinessLabel: readinessLabelMap[status],
    detail,
    verificationLabel: formatVerificationLabel(verificationStatus),
    displayNameLabel: formatDisplayNameLabel(displayNameStatus),
    lastError: connection?.lastError ?? "",
    connectedAtLabel: formatConnectionTimestamp(connection?.connectedAt),
    onboardingStartedAtLabel: formatConnectionTimestamp(connection?.onboardingStartedAt),
    lastSyncedLabel: formatConnectionTimestamp(connection?.lastSyncedAt),
  };
}

export function buildSettingsStateFromWorkspace({
  business,
  supportEmail,
  ownerName,
  businessHours,
  staffMembers,
  reminderSettings,
  whatsappConnection,
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
      connection: buildWhatsAppConnectionSummary(
        whatsappConnection,
        business.whatsappNumber ?? ""
      ),
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
