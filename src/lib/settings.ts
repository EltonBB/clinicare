import { format } from "date-fns";
import type {
  Appointment,
  Business,
  BusinessHours,
  ReminderSettings,
  StaffMember,
  StaffTimeEntry,
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
import { normalizePhone } from "@/lib/inbox";
import {
  defaultBrandAccent,
  normalizeBrandHexColor,
  resolveBrandAccentPreset,
  type BrandAccentChoice,
} from "@/lib/branding";

export const defaultReminderTemplate =
  "Hi {client_name}, this is a reminder for your appointment at {time} on {date}. Reply here if you need to reschedule.";

export type StaffRole = "Manager" | "Specialist" | "Reception";
export type StaffProfileStatus = "ACTIVE" | "AWAY" | "INACTIVE";

export type SettingsStaffMember = {
  id: string;
  name: string;
  role: StaffRole;
  email: string;
  phone: string;
  profileNote: string;
  status: StaffProfileStatus;
  isCheckedIn: boolean;
  weeklyHours: number;
  completedThisMonth: number;
  recentAppointments: Array<{
    id: string;
    title: string;
    clientName: string;
    date: string;
  }>;
};

export type SettingsReminders = {
  twentyFourHour: boolean;
  twoHour: boolean;
  firstReminderHours: number;
  secondReminderHours: number;
  template: string;
};

export type SettingsState = {
  business: {
    businessName: string;
    businessType: BusinessType;
    ownerName: string;
    supportEmail: string;
  };
  appearance: {
    accentColor: BrandAccentChoice;
    accentHex: string;
  };
  workingHours: WorkingHoursState;
  staff: SettingsStaffMember[];
  whatsapp: {
    phoneNumber: string;
    sendReminders: boolean;
    reminderWindow: string;
    template: string;
    connection: {
      phase:
        | "NOT_STARTED"
        | "STARTING"
        | "CODE_REQUIRED"
        | "PENDING_APPROVAL"
        | "CONNECTED"
        | "NEEDS_SUPPORT";
      provider: WhatsAppProvider;
      mode: WhatsAppConnectionMode;
      status: WhatsAppConnectionStatus;
      requestedPhoneNumber: string;
      senderPhoneNumber: string;
      alternatePhoneNumber: string;
      externalSenderId: string;
      senderLabel: string;
      phaseLabel: string;
      statusLabel: string;
      modeLabel: string;
      headline: string;
      detail: string;
      nextStep: string;
      primaryActionLabel: string;
      showVerificationInput: boolean;
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
  staffMembers: Array<
    StaffMember & {
      timeEntries?: Pick<StaffTimeEntry, "checkedInAt" | "checkedOutAt">[];
      appointments?: Array<
        Pick<Appointment, "id" | "title" | "startAt" | "status"> & {
          client: {
            name: string;
          };
        }
      >;
    }
  >;
  reminderSettings: ReminderSettings | null;
  whatsappConnection: WhatsAppConnection | null;
};

function normalizeStaffRole(value: unknown): StaffRole {
  const roles: StaffRole[] = ["Manager", "Specialist", "Reception"];

  return roles.includes(value as StaffRole) ? (value as StaffRole) : "Specialist";
}

function normalizeStaffStatus(value: unknown): StaffProfileStatus {
  const statuses: StaffProfileStatus[] = ["ACTIVE", "AWAY", "INACTIVE"];

  return statuses.includes(value as StaffProfileStatus)
    ? (value as StaffProfileStatus)
    : "ACTIVE";
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

    const start = entry.checkedInAt < weekStart ? weekStart : entry.checkedInAt;
    return total + Math.max(checkedOutAt.getTime() - start.getTime(), 0) / 60000;
  }, 0);

  return Math.round((minutes / 60) * 10) / 10;
}

function isThisMonth(value: Date) {
  const now = new Date();
  return value.getFullYear() === now.getFullYear() && value.getMonth() === now.getMonth();
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

function normalizeSettingsStaff(
  staffMembers: SettingsWorkspaceData["staffMembers"],
  fallbackName: string
) {
  if (staffMembers.length > 0) {
    return staffMembers.map((member) => {
      const completedAppointments =
        member.appointments?.filter((appointment) => appointment.status === "COMPLETED") ?? [];

      return {
        id: member.id,
        name: member.name,
        role: normalizeStaffRole(member.role),
        email: member.email ?? "",
        phone: member.phone ?? "",
        profileNote: member.profileNote ?? "",
        status: normalizeStaffStatus(member.status),
        isCheckedIn:
          member.timeEntries?.some((entry) => !entry.checkedOutAt) ?? false,
        weeklyHours: calculateWeeklyHours(member.timeEntries ?? []),
        completedThisMonth: completedAppointments.filter((appointment) =>
          isThisMonth(appointment.startAt)
        ).length,
        recentAppointments: completedAppointments.slice(0, 5).map((appointment) => ({
          id: appointment.id,
          title: appointment.title,
          clientName: appointment.client.name,
          date: format(appointment.startAt, "MMM d"),
        })),
      };
    });
  }

  return [
    {
      id: "staff-seed",
      name: fallbackName,
      role: "Specialist" as const,
      email: "",
      phone: "",
      profileNote: "",
      status: "ACTIVE" as const,
      isCheckedIn: false,
      weeklyHours: 0,
      completedThisMonth: 0,
      recentAppointments: [],
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

  if (args.previousStatus === "CONNECTING") {
    return "CONNECTING" as const;
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

function extractPhoneNumber(value: string) {
  const match = value.match(/\+\d[\d\s()-]{6,}\d/);
  return match ? match[0].replace(/\s+/g, "") : "";
}

function resolveCustomerFacingPhase(connection: WhatsAppConnection | null, requestedPhoneNumber: string) {
  if (!requestedPhoneNumber.trim()) {
    return "NOT_STARTED" as const;
  }

  const status = connection?.status ?? "PENDING_SETUP";
  const lastError = connection?.lastError?.toLowerCase() ?? "";

  if (status === "CONNECTED") {
    return "CONNECTED" as const;
  }

  if (status === "ERRORED") {
    return "NEEDS_SUPPORT" as const;
  }

  if (status === "CONNECTING") {
    return "STARTING" as const;
  }

  if (status === "PENDING_VERIFICATION") {
    if (/code|pin|sms|verification/i.test(lastError)) {
      return "CODE_REQUIRED" as const;
    }

    return "PENDING_APPROVAL" as const;
  }

  return "NOT_STARTED" as const;
}

function buildCustomerFacingConnectionCopy(args: {
  phase: SettingsState["whatsapp"]["connection"]["phase"];
  requestedPhoneNumber: string;
  senderPhoneNumber: string;
  alternatePhoneNumber: string;
  lastError: string;
}) {
  const requestedPhoneNumber = args.requestedPhoneNumber.trim();
  const senderPhoneNumber = args.senderPhoneNumber.trim();
  const alternatePhoneNumber = args.alternatePhoneNumber.trim();
  const activeNumberLabel = senderPhoneNumber || requestedPhoneNumber || "this clinic number";

  switch (args.phase) {
    case "NOT_STARTED":
      return {
        phaseLabel: "Not started",
        headline: "WhatsApp setup not started",
        detail:
          requestedPhoneNumber.length > 0
            ? `The clinic number ${requestedPhoneNumber} is saved. Start setup when you're ready, or skip this for now and connect it later from settings.`
            : "Add the clinic WhatsApp number, then start setup when you're ready. You can skip this for now and connect it later from settings.",
        nextStep:
          "Start setup to connect the clinic number, or continue into the workspace and finish this later.",
        primaryActionLabel: "Start setup",
        showVerificationInput: false,
      };
    case "STARTING":
      return {
        phaseLabel: "Starting connection",
        headline: "Starting clinic number setup",
        detail:
          "We're creating the connection for the clinic number now. This usually takes a moment before the next step appears.",
        nextStep:
          "If the status does not move forward shortly, refresh the status to check the latest setup step.",
        primaryActionLabel: "Retry setup",
        showVerificationInput: true,
      };
    case "CODE_REQUIRED":
      return {
        phaseLabel: "Verification code needed",
        headline: "Verify the clinic number",
        detail:
          "Finish setup by entering the code sent to the clinic number. Once the code is accepted, the inbox can start using this number.",
        nextStep:
          "Enter the verification code below, then refresh the status if the connection does not update right away.",
        primaryActionLabel: "Retry setup",
        showVerificationInput: true,
      };
    case "PENDING_APPROVAL":
      return {
        phaseLabel: "Pending approval",
        headline: "Waiting for number approval",
        detail:
          requestedPhoneNumber.length > 0
            ? `${requestedPhoneNumber} is saved and the connection is in progress. The number may still be waiting for review or a final confirmation step.`
            : "The clinic number is saved and the connection is in progress. The number may still be waiting for review or a final confirmation step.",
        nextStep:
          "Refresh the status in a moment. If a code is requested later, enter it here and continue.",
        primaryActionLabel: "Retry setup",
        showVerificationInput: true,
      };
    case "CONNECTED":
      return {
        phaseLabel: "Connected",
        headline: "Ready for client messaging",
        detail:
          `WhatsApp is connected and the inbox can now send and receive messages using ${activeNumberLabel}.`,
        nextStep:
          "Open the inbox to test a real client message, or continue into the dashboard and finish the rest of the workspace setup.",
        primaryActionLabel: "Reconnect number",
        showVerificationInput: false,
      };
    case "NEEDS_SUPPORT":
      if (alternatePhoneNumber) {
        return {
          phaseLabel: "Needs support",
          headline: "This number still needs to be moved",
          detail:
            `${alternatePhoneNumber} is the number currently active in the inbox. ${requestedPhoneNumber || "The clinic number you entered"} still needs to be moved into this WhatsApp setup before it can replace the active number.`,
          nextStep:
            "You can keep using the current active number for testing now, or finish moving the clinic's own number and reconnect when it is ready.",
          primaryActionLabel: "Retry setup",
          showVerificationInput: false,
        };
      }

      return {
        phaseLabel: "Needs support",
        headline: "Connection needs attention",
        detail:
          args.lastError.trim() ||
          "We couldn't finish connecting this clinic number yet. The app saved the number and is ready to try again when the issue is resolved.",
        nextStep:
          "Retry the setup. If the same message appears again, finish the number move or verification step and then reconnect.",
        primaryActionLabel: "Retry setup",
        showVerificationInput: false,
      };
  }
}

export function buildWhatsAppConnectionSummary(
  connection: WhatsAppConnection | null,
  fallbackRequestedPhoneNumber: string
): SettingsState["whatsapp"]["connection"] {
  const provider = connection?.provider ?? "TWILIO";
  const mode = connection?.mode ?? "SANDBOX";
  const status = connection?.status ?? "PENDING_SETUP";
  const requestedPhoneNumber = normalizePhone(
    connection?.requestedPhoneNumber ?? fallbackRequestedPhoneNumber
  );
  const senderPhoneNumber = normalizePhone(connection?.senderPhoneNumber ?? "");
  const externalSenderId = connection?.externalSenderId ?? "";
  const senderLabel = mode === "LIVE" ? "Live sender" : "Sandbox sender";
  const verificationStatus = connection?.verificationStatus ?? "NOT_STARTED";
  const displayNameStatus = connection?.displayNameStatus ?? "UNKNOWN";
  const extractedAlternatePhoneNumber = normalizePhone(
    connection?.senderPhoneNumber?.trim() ||
      extractPhoneNumber(connection?.lastError ?? "")
  );
  const alternatePhoneNumber =
    extractedAlternatePhoneNumber &&
    extractedAlternatePhoneNumber !== requestedPhoneNumber &&
    extractedAlternatePhoneNumber !== senderPhoneNumber
      ? extractedAlternatePhoneNumber
      : "";
  const phase = resolveCustomerFacingPhase(connection, requestedPhoneNumber);
  const customerCopy = buildCustomerFacingConnectionCopy({
    phase,
    requestedPhoneNumber,
    senderPhoneNumber,
    alternatePhoneNumber,
    lastError: connection?.lastError ?? "",
  });

  const statusLabelMap: Record<WhatsAppConnectionStatus, string> = {
    DISCONNECTED: "Disconnected",
    PENDING_SETUP: "Pending setup",
    CONNECTING: "Connecting",
    PENDING_VERIFICATION: "Pending verification",
    CONNECTED: "Connected",
    ERRORED: "Needs attention",
  };

  const modeLabelMap: Record<WhatsAppConnectionMode, string> = {
    SANDBOX: "Sandbox",
    LIVE: "Live",
  };

  return {
    phase,
    provider,
    mode,
    status,
    requestedPhoneNumber,
    senderPhoneNumber,
    alternatePhoneNumber,
    externalSenderId,
    senderLabel,
    phaseLabel: customerCopy.phaseLabel,
    statusLabel: statusLabelMap[status],
    modeLabel: modeLabelMap[mode],
    headline: customerCopy.headline,
    detail: customerCopy.detail,
    nextStep: customerCopy.nextStep,
    primaryActionLabel: customerCopy.primaryActionLabel,
    showVerificationInput: customerCopy.showVerificationInput,
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
  const businessType = businessTypes.includes(business.businessType as BusinessType)
    ? (business.businessType as BusinessType)
    : "Clinic";
  const accentPreset = resolveBrandAccentPreset(business.brandAccentColor);
  const savedCustomHex = normalizeBrandHexColor(business.brandAccentColor);
  const isCustomAccent = Boolean(savedCustomHex && accentPreset.id === "custom");
  const reminderTemplate = reminderSettings?.template ?? defaultReminderTemplate;

  return {
    business: {
      businessName: business.name,
      businessType,
      ownerName,
      supportEmail,
    },
    appearance: {
      accentColor: isCustomAccent ? "custom" : accentPreset.id ?? defaultBrandAccent.id,
      accentHex: accentPreset.value ?? defaultBrandAccent.value,
    },
    workingHours: normalizeWorkingHoursFromDatabase(businessHours),
    staff: normalizeSettingsStaff(staffMembers, ownerName),
    whatsapp: {
      phoneNumber: business.whatsappNumber ?? "",
      sendReminders: business.whatsappEnabled,
      reminderWindow: reminderSettings?.reminderWindow ?? "24 hours before",
      template: reminderTemplate,
      connection: buildWhatsAppConnectionSummary(
        whatsappConnection,
        business.whatsappNumber ?? ""
      ),
    },
    reminders: {
      twentyFourHour: reminderSettings?.send24HourReminder ?? true,
      twoHour: reminderSettings?.send2HourReminder ?? true,
      firstReminderHours: reminderSettings?.firstReminderHours ?? 24,
      secondReminderHours: reminderSettings?.secondReminderHours ?? 2,
      template: reminderTemplate,
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

export const staffRoles: StaffRole[] = ["Manager", "Specialist", "Reception"];
