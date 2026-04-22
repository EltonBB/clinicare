export const onboardingSteps = [
  {
    id: "owner",
    shortLabel: "Owner",
    title: "Tell us who owns this workspace",
    description:
      "Start with the clinic owner name. This keeps the workspace and account profile aligned.",
  },
  {
    id: "clinic",
    shortLabel: "Clinic",
    title: "Set up your clinic identity",
    description:
      "Add the clinic name, type, optional logo, and accent color before configuring operations.",
  },
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
    id: "dashboard",
    shortLabel: "Dashboard",
    title: "Customize your dashboard",
    description:
      "Choose what your workspace should prioritize first so the dashboard feels useful from day one.",
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
  owner: {
    name: string;
  };
  clinic: {
    name: string;
    type: string;
    logoUrl: string;
    accentColor: string;
    accentHex: string;
  };
  workingHours: WorkingHoursState;
  staffMember: {
    name: string;
    role: string;
  };
  dashboard: {
    focus: "appointments" | "clients" | "inbox";
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
    owner: {
      name: "",
    },
    clinic: {
      name: "",
      type: "Clinic",
      logoUrl: "",
      accentColor: "teal",
      accentHex: "#268987",
    },
    workingHours: defaultWorkingHours,
    staffMember: {
      name: "",
      role: "Owner",
    },
    dashboard: {
      focus: "appointments",
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

function readDashboardFocus(
  value: unknown,
  fallback: OnboardingState["dashboard"]["focus"]
) {
  return value === "appointments" || value === "clients" || value === "inbox"
    ? value
    : fallback;
}

function readCurrentStep(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 1;
  }

  return Math.min(Math.max(Math.round(value), 1), onboardingSteps.length);
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
  const dashboard = isRecord(value.dashboard) ? value.dashboard : {};
  const owner = isRecord(value.owner) ? value.owner : {};
  const clinic = isRecord(value.clinic) ? value.clinic : {};

  return {
    currentStep: readCurrentStep(value.currentStep),
    completed: readBoolean(value.completed, defaults.completed),
    owner: {
      name: readString(owner.name, defaults.owner.name),
    },
    clinic: {
      name: readString(clinic.name, defaults.clinic.name),
      type: readString(clinic.type, defaults.clinic.type),
      logoUrl: readString(clinic.logoUrl, defaults.clinic.logoUrl),
      accentColor: readString(clinic.accentColor, defaults.clinic.accentColor),
      accentHex: readString(clinic.accentHex, defaults.clinic.accentHex),
    },
    workingHours,
    staffMember: {
      name: readString(staffMember.name, defaults.staffMember.name),
      role: readString(staffMember.role, defaults.staffMember.role),
    },
    dashboard: {
      focus: readDashboardFocus(dashboard.focus, defaults.dashboard.focus),
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
