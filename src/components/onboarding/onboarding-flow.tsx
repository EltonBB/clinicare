"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MessageCircleMore,
  UserRoundPlus,
  Users,
} from "lucide-react";

import { saveOnboardingStateAction } from "@/app/onboarding/actions";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  onboardingSteps,
  weekdayOrder,
  type OnboardingState,
  type WeekdayKey,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";

const weekdayLabels: Record<WeekdayKey, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const timeOptions = [
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

const staffRoles = ["Owner", "Manager", "Specialist", "Reception"];
const reminderWindows = ["2 hours before", "24 hours before", "48 hours before"];

const fieldInputClass =
  "h-12 rounded-[0.95rem] border-border bg-card px-4 text-[15px] shadow-none placeholder:text-muted-foreground/70";

const selectClass =
  "h-12 w-full appearance-none rounded-[0.95rem] border border-border bg-card px-4 pr-10 text-[15px] text-foreground shadow-none outline-none transition-colors focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type OnboardingFlowProps = {
  initialState: OnboardingState;
  businessName: string;
  ownerName: string;
};

function StepMeta({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-3 text-center">
      <h1 className="text-[2.25rem] font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mx-auto max-w-2xl text-[15px] leading-7 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </label>
  );
}

function SurfaceNote({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[1.35rem] border border-border bg-card p-5">
      <div className="flex items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-sm leading-6 text-muted-foreground">{children}</p>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onPressedChange,
}: {
  checked: boolean;
  onPressedChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onPressedChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-border"
      )}
    >
      <span
        className={cn(
          "absolute top-1 size-5 rounded-full bg-white transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

function NativeSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={selectClass}
    >
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function getStepError(state: OnboardingState) {
  switch (state.currentStep) {
    case 2:
      if (!state.staffMember.name.trim()) {
        return "Add at least one staff member name before continuing.";
      }
      return null;
    case 3:
      if (!state.whatsapp.phoneNumber.trim()) {
        return "Add a WhatsApp number to continue.";
      }
      return null;
    case 4:
      if (!state.client.name.trim() || !state.client.phone.trim()) {
        return "Add your first client name and phone number before continuing.";
      }
      return null;
    case 5:
      if (
        !state.booking.service.trim() ||
        !state.booking.date.trim() ||
        !state.booking.time.trim()
      ) {
        return "Complete the first booking details before finishing onboarding.";
      }
      return null;
    default:
      return null;
  }
}

function getStepSkipStatus(stepId: string) {
  if (stepId === "client") {
    return "Skipped first client for now.";
  }

  if (stepId === "booking") {
    return "Skipped first booking for now.";
  }

  return "Skipped for now.";
}

export function OnboardingFlow({
  initialState,
  businessName,
  ownerName,
}: OnboardingFlowProps) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startSaving] = useTransition();

  const stepIndex = Math.min(
    Math.max(state.currentStep, 1),
    onboardingSteps.length
  ) - 1;
  const step = onboardingSteps[stepIndex];
  const progressValue = ((stepIndex + 1) / onboardingSteps.length) * 100;
  const nextStepLabel = onboardingSteps[Math.min(stepIndex + 1, onboardingSteps.length - 1)]
    ?.shortLabel;

  const estimatedHours = useMemo(() => {
    return weekdayOrder.reduce((total, day) => {
      const current = state.workingHours[day];

      if (!current.enabled) {
        return total;
      }

      const [startHour] = current.start.split(":").map(Number);
      const [endHour] = current.end.split(":").map(Number);
      return total + Math.max(endHour - startHour, 0);
    }, 0);
  }, [state.workingHours]);

  const hint = useMemo(() => {
    switch (step.id) {
      case "hours":
        return {
          title: "Why this matters",
          icon: <Clock3 className="size-4" />,
          body: "Clear working hours make availability predictable for clients and keep your first calendar view realistic from day one.",
        };
      case "staff":
        return {
          title: "Keep it simple",
          icon: <Users className="size-4" />,
          body: "For MVP, one staff profile is enough. You can add more people later in Settings without redoing onboarding.",
        };
      case "whatsapp":
        return {
          title: "Reminder behavior",
          icon: <MessageCircleMore className="size-4" />,
          body: "This number becomes the clinic's requested live WhatsApp number so the later connection step can activate the right inbox sender.",
        };
      case "client":
        return {
          title: "First profile",
          icon: <UserRoundPlus className="size-4" />,
          body: "The first client gives your inbox, notes, and booking flows something real to connect to as the workspace fills out.",
        };
      default:
        return {
          title: "Ready for the dashboard",
          icon: <CalendarDays className="size-4" />,
          body: "This first booking becomes the seed data for the calendar, dashboard summary, and client history views you’ll build next.",
        };
    }
  }, [step.id]);

  function persistState(
    nextState: OnboardingState,
    options?: { complete?: boolean; status?: string }
  ) {
    startSaving(async () => {
      const result = await saveOnboardingStateAction(nextState);

      if (!result.ok || !result.state) {
        setErrorMessage(
          result.error ?? "We couldn't save your onboarding progress."
        );
        setStatusMessage("");
        return;
      }

      setState(result.state);
      setErrorMessage("");
      setStatusMessage(options?.status ?? "Progress saved.");

      if (options?.complete) {
        router.push("/onboarding/complete");
        router.refresh();
        return;
      }

      router.refresh();
    });
  }

  function handleNext() {
    const validationError = getStepError(state);

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    if (state.currentStep === onboardingSteps.length) {
      persistState(
        {
          ...state,
          completed: true,
        },
        {
          complete: true,
          status: "Onboarding completed.",
        }
      );
      return;
    }

    persistState(
      {
        ...state,
        currentStep: state.currentStep + 1,
      },
      {
        status: `Saved ${step.shortLabel.toLowerCase()} and moved to the next step.`,
      }
    );
  }

  function handleBack() {
    if (state.currentStep === 1) {
      return;
    }

    setErrorMessage("");
    setStatusMessage("");
    setState((current) => ({
      ...current,
      currentStep: current.currentStep - 1,
    }));
  }

  function handleSaveProgress() {
    persistState(state, {
      status: "Progress saved. You can continue onboarding anytime.",
    });
  }

  function handleSkipForNow() {
    if (step.id !== "client" && step.id !== "booking") {
      return;
    }

    if (step.id === "client") {
      persistState(
        {
          ...state,
          currentStep: state.currentStep + 1,
          client: {
            name: "",
            phone: "",
            email: "",
            notes: "",
          },
          booking: {
            ...state.booking,
            clientName: "",
          },
        },
        {
          status: getStepSkipStatus(step.id),
        }
      );
      return;
    }

    persistState(
      {
        ...state,
        completed: true,
        booking: {
          ...state.booking,
          service: "",
          date: "",
          time: "",
          clientName: state.client.name,
        },
      },
      {
        complete: true,
        status: getStepSkipStatus(step.id),
      }
    );
  }

  function updateDay(day: WeekdayKey, patch: Partial<(typeof state.workingHours)[WeekdayKey]>) {
    setState((current) => ({
      ...current,
      workingHours: {
        ...current.workingHours,
        [day]: {
          ...current.workingHours[day],
          ...patch,
        },
      },
    }));
  }

  function renderStepContent() {
    if (step.id === "hours") {
      return (
        <div className="space-y-3">
          {weekdayOrder.map((day) => {
            const item = state.workingHours[day];

            return (
              <div
                key={day}
                className="grid gap-4 rounded-[1.35rem] border border-border bg-card px-5 py-4 md:grid-cols-[1.4fr_1fr]"
              >
                <div className="flex items-center gap-4">
                  <Toggle
                    checked={item.enabled}
                    onPressedChange={(checked) => updateDay(day, { enabled: checked })}
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {weekdayLabels[day]}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {item.enabled ? "Available for bookings" : "Closed"}
                    </p>
                  </div>
                </div>
                {item.enabled ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <NativeSelect
                      value={item.start}
                      onChange={(value) => updateDay(day, { start: value })}
                      options={timeOptions}
                    />
                    <NativeSelect
                      value={item.end}
                      onChange={(value) => updateDay(day, { end: value })}
                      options={timeOptions}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-start text-sm font-medium uppercase tracking-[0.16em] text-muted-foreground md:justify-end">
                    Closed
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    if (step.id === "staff") {
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <FieldLabel>Staff name</FieldLabel>
            <Input
              value={state.staffMember.name}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  staffMember: {
                    ...current.staffMember,
                    name: event.target.value,
                  },
                  booking: {
                    ...current.booking,
                    staffName: current.booking.staffName || event.target.value,
                  },
                }))
              }
              placeholder="Dr. Sarah Lee"
              className={fieldInputClass}
            />
          </div>
          <div className="space-y-3">
            <FieldLabel>Role</FieldLabel>
            <NativeSelect
              value={state.staffMember.role}
              onChange={(value) =>
                setState((current) => ({
                  ...current,
                  staffMember: {
                    ...current.staffMember,
                    role: value,
                  },
                }))
              }
              options={staffRoles}
            />
          </div>
          <div className="rounded-[1.35rem] border border-border bg-card p-5 md:col-span-2">
            <p className="text-sm font-semibold text-foreground">Preview</p>
            <div className="mt-4 flex items-center gap-4 rounded-[1rem] bg-muted/55 p-4">
              <div className="flex size-11 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
                {(state.staffMember.name || ownerName)
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)}
              </div>
              <div>
                <p className="font-medium text-foreground">
                  {state.staffMember.name || ownerName}
                </p>
                <p className="text-sm text-muted-foreground">
                  {state.staffMember.role}
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (step.id === "whatsapp") {
      return (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <FieldLabel>WhatsApp number</FieldLabel>
              <Input
                value={state.whatsapp.phoneNumber}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    whatsapp: {
                      ...current.whatsapp,
                      phoneNumber: event.target.value,
                    },
                  }))
                }
                placeholder="+1 555 000 0000"
                className={fieldInputClass}
              />
            </div>
            <div className="space-y-3">
              <FieldLabel>Reminder timing</FieldLabel>
              <NativeSelect
                value={state.whatsapp.reminderWindow}
                onChange={(value) =>
                  setState((current) => ({
                    ...current,
                    whatsapp: {
                      ...current.whatsapp,
                      reminderWindow: value,
                    },
                  }))
                }
                options={reminderWindows}
              />
            </div>
          </div>
          <div className="rounded-[1.35rem] border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Send appointment reminders
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Toggle reminder sending behavior for this initial setup.
                </p>
              </div>
              <Toggle
                checked={state.whatsapp.sendReminders}
                onPressedChange={(checked) =>
                  setState((current) => ({
                    ...current,
                    whatsapp: {
                      ...current.whatsapp,
                      sendReminders: checked,
                    },
                  }))
                }
              />
            </div>
          </div>
          <div className="space-y-3">
            <FieldLabel>Message template</FieldLabel>
            <Textarea
              value={state.whatsapp.template}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  whatsapp: {
                    ...current.whatsapp,
                    template: event.target.value,
                  },
                }))
              }
              className="min-h-32 rounded-[1rem] border-border bg-card px-4 py-3 text-[15px] leading-7 shadow-none placeholder:text-muted-foreground/70"
            />
          </div>
        </div>
      );
    }

    if (step.id === "client") {
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <FieldLabel>Client name</FieldLabel>
            <Input
              value={state.client.name}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  client: {
                    ...current.client,
                    name: event.target.value,
                  },
                  booking: {
                    ...current.booking,
                    clientName: current.booking.clientName || event.target.value,
                  },
                }))
              }
              placeholder="Sarah Jenkins"
              className={fieldInputClass}
            />
          </div>
          <div className="space-y-3">
            <FieldLabel>Phone number</FieldLabel>
            <Input
              value={state.client.phone}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  client: {
                    ...current.client,
                    phone: event.target.value,
                  },
                }))
              }
              placeholder="+1 555 321 1234"
              className={fieldInputClass}
            />
          </div>
          <div className="space-y-3">
            <FieldLabel>Email</FieldLabel>
            <Input
              value={state.client.email}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  client: {
                    ...current.client,
                    email: event.target.value,
                  },
                }))
              }
              placeholder="sarah@example.com"
              className={fieldInputClass}
            />
          </div>
          <div className="space-y-3 md:col-span-2">
            <FieldLabel>Notes</FieldLabel>
            <Textarea
              value={state.client.notes}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  client: {
                    ...current.client,
                    notes: event.target.value,
                  },
                }))
              }
              placeholder="First-time client. Prefers WhatsApp reminders."
              className="min-h-28 rounded-[1rem] border-border bg-card px-4 py-3 text-[15px] leading-7 shadow-none placeholder:text-muted-foreground/70"
            />
          </div>
        </div>
      );
    }

    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <FieldLabel>Service</FieldLabel>
          <Input
            value={state.booking.service}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                booking: {
                  ...current.booking,
                  service: event.target.value,
                },
              }))
            }
            placeholder="Initial consultation"
            className={fieldInputClass}
          />
        </div>
        <div className="space-y-3">
          <FieldLabel>Assigned staff</FieldLabel>
          <NativeSelect
            value={state.booking.staffName || state.staffMember.name || ownerName}
            onChange={(value) =>
              setState((current) => ({
                ...current,
                booking: {
                  ...current.booking,
                  staffName: value,
                },
              }))
            }
            options={[state.staffMember.name || ownerName].filter(Boolean)}
          />
        </div>
        <div className="space-y-3">
          <FieldLabel>Date</FieldLabel>
          <Input
            type="date"
            value={state.booking.date}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                booking: {
                  ...current.booking,
                  date: event.target.value,
                },
              }))
            }
            className={fieldInputClass}
          />
        </div>
        <div className="space-y-3">
          <FieldLabel>Time</FieldLabel>
          <NativeSelect
            value={state.booking.time}
            onChange={(value) =>
              setState((current) => ({
                ...current,
                booking: {
                  ...current.booking,
                  time: value,
                },
              }))
            }
            options={timeOptions}
            placeholder="Select time"
          />
        </div>
        <div className="space-y-3 md:col-span-2">
          <FieldLabel>Client</FieldLabel>
          <Input
            value={state.booking.clientName || state.client.name}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                booking: {
                  ...current.booking,
                  clientName: event.target.value,
                },
              }))
            }
            placeholder="Sarah Jenkins"
            className={fieldInputClass}
          />
        </div>
        <div className="rounded-[1.35rem] border border-border bg-card p-5 md:col-span-2">
          <p className="text-sm font-semibold text-foreground">Booking summary</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1rem] bg-muted/55 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Client
              </p>
              <p className="mt-2 font-medium text-foreground">
                {state.booking.clientName || state.client.name || "Your first client"}
              </p>
            </div>
            <div className="rounded-[1rem] bg-muted/55 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Service
              </p>
              <p className="mt-2 font-medium text-foreground">
                {state.booking.service || "Choose a service"}
              </p>
            </div>
            <div className="rounded-[1rem] bg-muted/55 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Time
              </p>
              <p className="mt-2 font-medium text-foreground">
                {state.booking.date && state.booking.time
                  ? `${state.booking.date} at ${state.booking.time}`
                  : "Pick a date and time"}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 border-b border-border pb-6">
          <div className="flex min-w-0 items-center gap-4">
            <BrandMark href="/dashboard" includeSubtitle={false} />
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-medium text-foreground">
                {businessName}
              </p>
              <p className="truncate text-sm text-muted-foreground">{ownerName}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-[0.9rem] px-3 text-muted-foreground"
            onClick={handleSaveProgress}
            disabled={isPending}
          >
            Save progress
          </Button>
        </div>

        <div className="flex justify-center overflow-x-auto py-6">
          <div className="flex min-w-max items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em]">
            {onboardingSteps.map((item, index) => (
              <div key={item.id} className="flex items-center gap-3">
                <span
                  className={cn(
                    "text-muted-foreground",
                    stepIndex >= index && "text-foreground"
                  )}
                >
                  {item.shortLabel}
                </span>
                {index < onboardingSteps.length - 1 ? (
                  <span className="text-border">/</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col py-4 sm:py-8">
          <StepMeta title={step.title} description={step.description} />

          <div className="mt-10 space-y-8">
            {renderStepContent()}
            <SurfaceNote icon={hint.icon} title={hint.title}>
              {hint.body}
            </SurfaceNote>
          </div>

          <div className="mt-auto space-y-5 pt-10">
            {errorMessage ? (
              <div className="rounded-[1rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {errorMessage}
              </div>
            ) : null}
            {!errorMessage && statusMessage ? (
              <div className="rounded-[1rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
                {statusMessage}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-[0.95rem] px-0 text-muted-foreground hover:bg-transparent"
                  onClick={handleBack}
                  disabled={state.currentStep === 1 || isPending}
                >
                  <ArrowLeft data-icon="inline-start" />
                  Go back
                </Button>
                {step.id === "client" || step.id === "booking" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="rounded-[0.95rem] px-0 text-muted-foreground hover:bg-transparent"
                    onClick={handleSkipForNow}
                    disabled={isPending}
                  >
                    Skip for now
                  </Button>
                ) : null}
              </div>
              <Button
                type="button"
                size="lg"
                className="h-12 rounded-[0.95rem] px-5"
                onClick={handleNext}
                disabled={isPending}
              >
                {state.currentStep === onboardingSteps.length ? (
                  <>
                    Finish setup
                    <CheckCircle2 data-icon="inline-end" />
                  </>
                ) : (
                  <>
                    Continue to {nextStepLabel}
                    <ArrowRight data-icon="inline-end" />
                  </>
                )}
              </Button>
            </div>

            <div className="grid gap-5 border-t border-border pt-6 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Estimated coverage
                </p>
                <p className="text-2xl font-semibold tracking-tight text-foreground">
                  {estimatedHours} hours/week
                </p>
                <p className="text-sm text-muted-foreground">
                  Step {state.currentStep} of {onboardingSteps.length}
                </p>
              </div>
              <div className="w-full sm:w-[220px]">
                <Progress value={progressValue}>
                  <ProgressLabel className="sr-only">
                    Onboarding progress
                  </ProgressLabel>
                  <ProgressValue />
                </Progress>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
