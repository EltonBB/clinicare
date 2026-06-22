// The onboarding flow opens on a Welcome intro (not a data step), then walks
// three data steps before the "You're ready" launchpad. Each step pairs the
// question it answers with the one-line "why" and the workspace section its
// live preview should show, so the form and the preview stay in lockstep.
export const onboardingSteps = [
  {
    id: "clinic",
    shortLabel: "Your clinic",
    title: "What's your clinic, and how should it look?",
    why: "This is how your workspace and patient messages will look.",
    previewSection: "dashboard",
  },
  {
    id: "hours",
    shortLabel: "Opening hours",
    title: "When are you open?",
    why: "Vela builds your calendar from these and protects closed days.",
    previewSection: "calendar",
  },
  {
    id: "team",
    shortLabel: "Your team",
    title: "Who's working day one?",
    why: "Appointments are assigned to staff — add your first now, more anytime.",
    previewSection: "staff",
  },
] as const;

export type OnboardingStepId = (typeof onboardingSteps)[number]["id"];
export type OnboardingPreviewSection =
  (typeof onboardingSteps)[number]["previewSection"];

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
  version: number;
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

// Bump when the persisted draft shape or step ordering changes, so drafts saved
// under an older shape restart from the first step instead of resuming at a
// numeric step index that now points at a different step.
export const ONBOARDING_STATE_VERSION = 2;

export function createDefaultOnboardingState(): OnboardingState {
  return {
    version: ONBOARDING_STATE_VERSION,
    currentStep: 1,
    completed: false,
    owner: {
      name: "",
    },
    clinic: {
      name: "",
      type: "Clinic",
      logoUrl: "",
      accentColor: "vela",
      accentHex: "#0A22FF",
    },
    workingHours: defaultWorkingHours,
    staffMember: {
      name: "",
      role: "Specialist",
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
  const owner = isRecord(value.owner) ? value.owner : {};
  const clinic = isRecord(value.clinic) ? value.clinic : {};

  const incomingVersion = typeof value.version === "number" ? value.version : 0;

  const normalized: OnboardingState = {
    version: ONBOARDING_STATE_VERSION,
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
  };

  // Drafts saved under an older shape can't be trusted to resume mid-flow: a
  // numeric currentStep from a previous step ordering points at a different step
  // now (e.g. old Hours -> new Team), so a user could finish without seeing a
  // step. Restart such drafts from the first step so every step is walked under
  // the current ordering; entered data is kept as defaults so it stays fast.
  if (incomingVersion !== ONBOARDING_STATE_VERSION) {
    normalized.currentStep = 1;
  }

  // Belt-and-suspenders: never resume past the clinic step without its required
  // field, regardless of version.
  if (normalized.currentStep > 1 && !normalized.clinic.name.trim()) {
    normalized.currentStep = 1;
  }

  return normalized;
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
