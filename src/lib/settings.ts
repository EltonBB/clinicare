import { format } from "date-fns";
import type {
  Business,
  BusinessHours,
  ReminderSettings,
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
    logoUrl: string;
    logoDisplayUrl: string;
  };
  appearance: {
    accentColor: BrandAccentChoice;
    accentHex: string;
  };
  workingHours: WorkingHoursState;
  whatsapp: {
    phoneNumber: string;
    sendReminders: boolean;
    reminderWindow: string;
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
    checkoutHref: string;
    lockedFeatures: string[];
  };
};

type SettingsWorkspaceData = {
  business: Business;
  supportEmail: string;
  ownerName: string;
  businessHours: BusinessHours[];
  reminderSettings: ReminderSettings | null;
  whatsappConnection: WhatsAppConnection | null;
  logoDisplayUrl?: string;
};

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
        ? "Online billing opens soon. Contact support to change plans."
        : "Pro unlocks full reports. Contact support to upgrade.",
    ctaLabel: planName === "Pro" ? "Manage plan" : "Unlock Pro",
    checkoutHref: "/checkout?plan=pro",
    lockedFeatures:
      planName === "Pro"
        ? ["Reports", "Premium workflow surfaces", "Future automation tools"]
        : ["Reports", "Premium workflow surfaces", "Future automation tools"],
  };
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

function resolveCustomerFacingPhase(connection: WhatsAppConnection | null) {
  // Only a Baileys connection has a worker session behind it. A legacy or
  // other-provider row (e.g. an un-migrated TWILIO/CONNECTED record) must NOT
  // read as connected — that would hide the Connect button while every send
  // silently fails. Treat it as not started so the clinic can (re-)pair.
  if (connection && connection.provider !== "BAILEYS") {
    return "NOT_STARTED" as const;
  }
  // Otherwise derive the phase from the stored status. (Baileys pairs by QR and
  // never sets a phone number, so the old number-gate would hide a live link.)
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
  const provider = connection?.provider ?? "BAILEYS";
  const mode = connection?.mode ?? "SANDBOX";
  const status = connection?.status ?? "PENDING_SETUP";
  const requestedPhoneNumber = normalizePhone(
    connection?.requestedPhoneNumber ?? fallbackRequestedPhoneNumber
  );
  const senderPhoneNumber = normalizePhone(connection?.senderPhoneNumber ?? "");
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
  const phase = resolveCustomerFacingPhase(connection);
  const customerCopy = buildCustomerFacingConnectionCopy({
    phase,
    requestedPhoneNumber,
    senderPhoneNumber,
    alternatePhoneNumber,
    lastError:
      status === "ERRORED"
        ? "We couldn't finish connecting this clinic number yet."
        : connection?.lastError ?? "",
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
  reminderSettings,
  whatsappConnection,
  logoDisplayUrl: resolvedLogoDisplayUrl,
}: SettingsWorkspaceData): SettingsState {
  const businessType = businessTypes.includes(business.businessType as BusinessType)
    ? (business.businessType as BusinessType)
    : "Clinic";
  const accentPreset = resolveBrandAccentPreset(business.brandAccentColor);
  const savedCustomHex = normalizeBrandHexColor(business.brandAccentColor);
  const isCustomAccent = Boolean(savedCustomHex && accentPreset.id === "custom");
  const reminderTemplate = reminderSettings?.template ?? defaultReminderTemplate;
  const logoUrl = business.logoUrl ?? "";
  const logoDisplayUrl = resolvedLogoDisplayUrl ?? logoUrl;

  return {
    business: {
      businessName: business.name,
      businessType,
      ownerName,
      supportEmail,
      logoUrl,
      logoDisplayUrl,
    },
    appearance: {
      accentColor: isCustomAccent ? "custom" : accentPreset.id ?? defaultBrandAccent.id,
      accentHex: accentPreset.value ?? defaultBrandAccent.value,
    },
    workingHours: normalizeWorkingHoursFromDatabase(businessHours),
    whatsapp: {
      phoneNumber: business.whatsappNumber ?? "",
      sendReminders: business.whatsappEnabled,
      reminderWindow: reminderSettings?.reminderWindow ?? "24 hours before",
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

/**
 * The editable subset of SettingsState. Derived/display fields (logoDisplayUrl,
 * connection copy, billing summary) are intentionally excluded — they are
 * server-computed output, never client input.
 */
export type SaveSettingsPayload = {
  business: {
    businessName: string;
    businessType: BusinessType;
    ownerName: string;
    logoUrl: string;
  };
  appearance: {
    accentColor: BrandAccentChoice;
    accentHex: string;
  };
  workingHours: WorkingHoursState;
  whatsapp: {
    phoneNumber: string;
    sendReminders: boolean;
    reminderWindow: string;
  };
  reminders: SettingsReminders;
};

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
