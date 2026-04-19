import { normalizePhone } from "@/lib/inbox";

export const onboardingSteps = [
  {
    id: "hours",
    shortLabel: "Hours",
    title: "Set your working hours",
    description:
      "Define when your business is open for appointments. You can customize individual staff hours later.",
  },
  {
    id: "staff",
    shortLabel: "Staff",
    title: "Add your first staff member",
    description:
      "Start with one person so bookings and availability have an owner from day one.",
  },
  {
    id: "whatsapp",
    shortLabel: "WhatsApp",
    title: "Configure WhatsApp reminders",
    description:
      "Set the sending number and decide how reminder messages should behave for your first bookings.",
  },
  {
    id: "client",
    shortLabel: "Client",
    title: "Create your first client",
    description:
      "Add one client profile so you can connect bookings, reminders, and client history right away.",
  },
  {
    id: "booking",
    shortLabel: "Booking",
    title: "Create your first booking",
    description:
      "Capture the first appointment details to finish setup and enter the main workspace with meaningful data.",
  },
] as const;

export type OnboardingStepId = (typeof onboardingSteps)[number]["id"];

export const weekdayOrder = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type WeekdayKey = (typeof weekdayOrder)[number];

export type DaySchedule = {
  enabled: boolean;
  start: string;
  end: string;
};

export type WorkingHoursState = Record<WeekdayKey, DaySchedule>;

export type OnboardingState = {
  currentStep: number;
  completed: boolean;
  workingHours: WorkingHoursState;
  staffMember: {
    name: string;
    role: string;
  };
  whatsapp: {
    phoneNumber: string;
    sendReminders: boolean;
    reminderWindow: string;
    template: string;
  };
  client: {
    name: string;
    email: string;
    phone: string;
    notes: string;
  };
  booking: {
    service: string;
    date: string;
    time: string;
    staffName: string;
    clientName: string;
  };
};

const defaultWorkingHours: WorkingHoursState = {
  monday: { enabled: true, start: "09:00", end: "17:00" },
  tuesday: { enabled: true, start: "09:00", end: "17:00" },
  wednesday: { enabled: true, start: "09:00", end: "17:00" },
  thursday: { enabled: true, start: "09:00", end: "17:00" },
  friday: { enabled: true, start: "09:00", end: "17:00" },
  saturday: { enabled: false, start: "09:00", end: "13:00" },
  sunday: { enabled: false, start: "09:00", end: "13:00" },
};

export function createDefaultOnboardingState(): OnboardingState {
  return {
    currentStep: 1,
    completed: false,
    workingHours: defaultWorkingHours,
    staffMember: {
      name: "",
      role: "Owner",
    },
    whatsapp: {
      phoneNumber: "",
      sendReminders: true,
      reminderWindow: "24 hours before",
      template:
        "Hi {client_name}, this is a reminder for your appointment at {time}. Reply here if you need to reschedule.",
    },
    client: {
      name: "",
      email: "",
      phone: "",
      notes: "",
    },
    booking: {
      service: "",
      date: "",
      time: "",
      staffName: "",
      clientName: "",
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readCurrentStep(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 1;
  }

  return Math.min(Math.max(Math.round(value), 1), onboardingSteps.length);
}

function normalizeOptionalPhone(value: unknown, fallback: string) {
  const normalized = normalizePhone(readString(value, fallback));
  return normalized || "";
}

export function normalizeOnboardingState(value: unknown): OnboardingState {
  const defaults = createDefaultOnboardingState();

  if (!isRecord(value)) {
    return defaults;
  }

  const workingHours = weekdayOrder.reduce<WorkingHoursState>((result, day) => {
    const candidate = value.workingHours;
    const nextValue = isRecord(candidate) && isRecord(candidate[day]) ? candidate[day] : {};
    result[day] = {
      enabled: readBoolean(nextValue.enabled, defaults.workingHours[day].enabled),
      start: readString(nextValue.start, defaults.workingHours[day].start),
      end: readString(nextValue.end, defaults.workingHours[day].end),
    };
    return result;
  }, {} as WorkingHoursState);

  const staffMember = isRecord(value.staffMember) ? value.staffMember : {};
  const whatsapp = isRecord(value.whatsapp) ? value.whatsapp : {};
  const client = isRecord(value.client) ? value.client : {};
  const booking = isRecord(value.booking) ? value.booking : {};

  return {
    currentStep: readCurrentStep(value.currentStep),
    completed: readBoolean(value.completed, defaults.completed),
    workingHours,
    staffMember: {
      name: readString(staffMember.name, defaults.staffMember.name),
      role: readString(staffMember.role, defaults.staffMember.role),
    },
    whatsapp: {
      phoneNumber: normalizeOptionalPhone(
        whatsapp.phoneNumber,
        defaults.whatsapp.phoneNumber
      ),
      sendReminders: readBoolean(
        whatsapp.sendReminders,
        defaults.whatsapp.sendReminders
      ),
      reminderWindow: readString(
        whatsapp.reminderWindow,
        defaults.whatsapp.reminderWindow
      ),
      template: readString(whatsapp.template, defaults.whatsapp.template),
    },
    client: {
      name: readString(client.name, defaults.client.name),
      email: readString(client.email, defaults.client.email),
      phone: normalizeOptionalPhone(client.phone, defaults.client.phone),
      notes: readString(client.notes, defaults.client.notes),
    },
    booking: {
      service: readString(booking.service, defaults.booking.service),
      date: readString(booking.date, defaults.booking.date),
      time: readString(booking.time, defaults.booking.time),
      staffName: readString(booking.staffName, defaults.booking.staffName),
      clientName: readString(booking.clientName, defaults.booking.clientName),
    },
  };
}

export function isOnboardingCompleted(metadata: unknown) {
  if (!isRecord(metadata)) {
    return false;
  }

  if (metadata.onboarding_completed === true) {
    return true;
  }

  return normalizeOnboardingState(metadata.onboarding_state).completed;
}
