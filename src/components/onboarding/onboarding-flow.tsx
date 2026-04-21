"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LayoutDashboard,
  MessageSquareText,
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
    default:
      return null;
  }
}

const dashboardFocusOptions: Array<{
  value: OnboardingState["dashboard"]["focus"];
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    value: "appointments",
    title: "Appointments first",
    description: "Prioritize today's schedule, bookings, and quick appointment creation.",
    icon: <CalendarDays className="size-5" />,
  },
  {
    value: "clients",
    title: "Clients first",
    description: "Prioritize relationship management, profiles, and adding new clients.",
    icon: <Users className="size-5" />,
  },
  {
    value: "inbox",
    title: "Inbox first",
    description: "Prioritize WhatsApp replies, unread messages, and fast follow-up.",
    icon: <MessageSquareText className="size-5" />,
  },
];

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
  const nextStepLabel =
    onboardingSteps[Math.min(stepIndex + 1, onboardingSteps.length - 1)]
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
      case "dashboard":
        return {
          title: "Dashboard behavior",
          icon: <LayoutDashboard className="size-4" />,
          body: "This changes the first shortcuts and empty states the clinic sees. The team can still use every feature from the sidebar.",
        };
      default:
        return null;
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

  function updateDay(
    day: WeekdayKey,
    patch: Partial<(typeof state.workingHours)[WeekdayKey]>
  ) {
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

    if (step.id === "dashboard") {
      return (
        <div className="grid gap-4 md:grid-cols-3">
          {dashboardFocusOptions.map((option) => {
            const selected = state.dashboard.focus === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  setState((current) => ({
                    ...current,
                    dashboard: {
                      ...current.dashboard,
                      focus: option.value,
                    },
                  }))
                }
                className={cn(
                  "group rounded-[1.35rem] border bg-card p-5 text-left transition-[border-color,box-shadow,transform,background-color] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_18px_40px_rgba(20,32,51,0.06)]",
                  selected
                    ? "border-primary/55 bg-primary/8 shadow-[0_18px_40px_rgba(38,137,135,0.12)]"
                    : "border-border"
                )}
              >
                <span
                  className={cn(
                    "flex size-12 items-center justify-center rounded-[1rem] bg-muted text-muted-foreground transition-colors duration-200 group-hover:bg-primary/10 group-hover:text-primary",
                    selected && "bg-primary/12 text-primary"
                  )}
                >
                  {option.icon}
                </span>
                <span className="mt-5 block text-base font-semibold text-foreground">
                  {option.title}
                </span>
                <span className="mt-2 block text-sm leading-6 text-muted-foreground">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      );
    }

    return null;
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

        <div className="py-6">
          <div className="rounded-[1.25rem] border border-border bg-card px-4 py-4 shadow-[0_14px_32px_rgba(20,32,51,0.04)]">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Step {state.currentStep} of {onboardingSteps.length}
              </p>
              <p className="text-sm font-medium text-foreground">
                {Math.round(progressValue)}% complete
              </p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted shadow-[inset_0_1px_2px_rgba(20,32,51,0.08)]">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                style={{ width: `${progressValue}%` }}
              />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {onboardingSteps.map((item, index) => (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-[0.95rem] border px-3 py-3 transition-colors duration-200",
                    stepIndex >= index
                      ? "border-primary/25 bg-primary/8 text-foreground"
                      : "border-border bg-white/58 text-muted-foreground"
                  )}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.14em]">
                    {item.shortLabel}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col py-4 sm:py-8">
          <StepMeta title={step.title} description={step.description} />

          <div className="mt-10 space-y-8">
            {renderStepContent()}
            {hint ? (
              <SurfaceNote icon={hint.icon} title={hint.title}>
                {hint.body}
              </SurfaceNote>
            ) : null}
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
                  Dashboard focus: {state.dashboard.focus}
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
