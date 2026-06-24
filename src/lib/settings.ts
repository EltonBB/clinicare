import type {
  Business,
  BusinessHours,
  ReminderSettings,
  WhatsAppConnection,
  WhatsAppConnectionStatus,
} from "@prisma/client";

import { businessTypes, type BusinessType } from "@/lib/constants";
import {
  type WeekdayKey,
  type WorkingHoursState,
  weekdayOrder,
} from "@/lib/onboarding";
import { planDisplayName, planStatusLabel } from "@/lib/billing";
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
      // WhatsApp pairs by QR through the worker (Baileys); there is no clinic
      // phone number, verification code, sender, or sandbox/live mode to track.
      // The UI only needs the coarse phase + a customer-facing status label.
      phase: "NOT_STARTED" | "STARTING" | "CONNECTED" | "NEEDS_SUPPORT";
      status: WhatsAppConnectionStatus;
      statusLabel: string;
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

const statusLabelMap: Record<WhatsAppConnectionStatus, string> = {
  DISCONNECTED: "Not connected",
  PENDING_SETUP: "Not connected",
  CONNECTING: "Connecting",
  PENDING_VERIFICATION: "Connecting",
  CONNECTED: "Connected",
  ERRORED: "Needs attention",
};

function resolveCustomerFacingPhase(
  connection: WhatsAppConnection | null
): SettingsState["whatsapp"]["connection"]["phase"] {
  // Only a Baileys connection has a worker session behind it. A legacy or
  // other-provider row (e.g. an un-migrated TWILIO/CONNECTED record) must NOT
  // read as connected — that would hide the Connect button while every send
  // silently fails. Treat it as not started so the clinic can (re-)pair.
  if (connection && connection.provider !== "BAILEYS") {
    return "NOT_STARTED";
  }

  switch (connection?.status) {
    case "CONNECTED":
      return "CONNECTED";
    case "ERRORED":
      return "NEEDS_SUPPORT";
    case "CONNECTING":
    case "PENDING_VERIFICATION":
      return "STARTING";
    default:
      return "NOT_STARTED";
  }
}

export function buildWhatsAppConnectionSummary(
  connection: WhatsAppConnection | null
): SettingsState["whatsapp"]["connection"] {
  const status = connection?.status ?? "PENDING_SETUP";

  return {
    phase: resolveCustomerFacingPhase(connection),
    status,
    statusLabel: statusLabelMap[status],
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
      connection: buildWhatsAppConnectionSummary(whatsappConnection),
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
