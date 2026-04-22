"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  MessageSquareText,
  Users,
} from "lucide-react";

import { saveOnboardingStateAction } from "@/app/onboarding/actions";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { businessTypes } from "@/lib/constants";
import {
  brandAccentPresets,
  normalizeBrandHexColor,
  resolveBrandAccentPreset,
} from "@/lib/branding";
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

const staffRoles = ["Manager", "Specialist", "Reception"];

const fieldInputClass =
  "h-12 rounded-[0.95rem] border-border bg-card px-4 text-[15px] shadow-none placeholder:text-muted-foreground/70";

const selectClass =
  "h-12 w-full appearance-none rounded-[0.95rem] border border-border bg-card px-4 pr-10 text-[15px] text-foreground shadow-none outline-none transition-colors focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type OnboardingFlowProps = {
  initialState: OnboardingState;
  businessName: string;
  ownerName: string;
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </label>
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
    case 1:
      if (!state.owner.name.trim()) {
        return "Enter the clinic owner name before continuing.";
      }
      return null;
    case 2:
      if (!state.clinic.name.trim()) {
        return "Enter the clinic name before continuing.";
      }
      if (!businessTypes.includes(state.clinic.type as (typeof businessTypes)[number])) {
        return "Select the clinic type before continuing.";
      }
      if (
        state.clinic.accentColor === "custom" &&
        !normalizeBrandHexColor(state.clinic.accentHex)
      ) {
        return "Enter a valid brand HEX color, for example #3b82f6.";
      }
      return null;
    case 4:
      if (!state.staffMember.name.trim()) {
        return "Add at least one staff member name before continuing.";
      }
      return null;
    case 5:
      if (state.dashboard.widgets.length === 0) {
        return "Choose at least one dashboard widget.";
      }
      return null;
    default:
      return null;
  }
}

const dashboardFocusOptions: Array<{
  value: OnboardingState["dashboard"]["widgets"][number];
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
  const selectedAccent = resolveBrandAccentPreset(
    state.clinic.accentColor === "custom"
      ? state.clinic.accentHex
      : state.clinic.accentColor
  );
  const normalizedCustomAccent = normalizeBrandHexColor(state.clinic.accentHex);
  const customAccentInvalid =
    state.clinic.accentColor === "custom" && !normalizedCustomAccent;
  const previewAccent = normalizedCustomAccent ?? selectedAccent.value;
  const visibleAccentPresets = brandAccentPresets.filter(
    (preset) => preset.id !== "emerald"
  );

  const stepIndex = Math.min(
    Math.max(state.currentStep, 1),
    onboardingSteps.length
  ) - 1;
  const step = onboardingSteps[stepIndex];
  const progressInset =
    onboardingSteps.length > 1 ? `${50 / onboardingSteps.length}%` : "50%";
  const progressWidth =
    onboardingSteps.length > 1
      ? `${(stepIndex / (onboardingSteps.length - 1)) * (100 - 100 / onboardingSteps.length)}%`
      : "0%";
  const nextStepLabel =
    onboardingSteps[Math.min(stepIndex + 1, onboardingSteps.length - 1)]
      ?.shortLabel;

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

  function handleLogoUpload(file: File | null) {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Upload an image file for the clinic logo.");
      return;
    }

    if (file.size > 750_000) {
      setErrorMessage("Logo file is too large. Upload an image under 750 KB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setState((current) => ({
        ...current,
        clinic: {
          ...current.clinic,
          logoUrl: result,
        },
      }));
      setErrorMessage("");
    };
    reader.readAsDataURL(file);
  }

  function renderStepContent() {
    if (step.id === "owner") {
      return (
        <div className="mx-auto grid w-full max-w-xl gap-5">
          <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-[0_14px_32px_rgba(20,32,51,0.035)]">
            <div className="space-y-3">
              <FieldLabel>Owner name</FieldLabel>
              <Input
                value={state.owner.name}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    owner: {
                      ...current.owner,
                      name: event.target.value,
                    },
                  }))
                }
                placeholder="Owner name"
                className={fieldInputClass}
              />
            </div>
          </div>
        </div>
      );
    }

    if (step.id === "clinic") {
      return (
        <div className="grid gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <FieldLabel>Clinic name</FieldLabel>
              <Input
                value={state.clinic.name}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    clinic: {
                      ...current.clinic,
                      name: event.target.value,
                    },
                  }))
                }
                placeholder="Aldent"
                className={fieldInputClass}
              />
            </div>
            <div className="space-y-3">
              <FieldLabel>Clinic type</FieldLabel>
              <NativeSelect
                value={state.clinic.type}
                onChange={(value) =>
                  setState((current) => ({
                    ...current,
                    clinic: {
                      ...current.clinic,
                      type: value,
                    },
                  }))
                }
                options={[...businessTypes]}
              />
            </div>
            <div className="space-y-3 md:col-span-2">
              <FieldLabel>Logo optional</FieldLabel>
              <div className="grid gap-3 rounded-[1.1rem] border border-border bg-card p-4 sm:grid-cols-[72px_minmax(0,1fr)] sm:items-center">
                <div className="flex size-[72px] items-center justify-center overflow-hidden rounded-[1.15rem] bg-primary/10 text-xl font-semibold text-primary">
                  {state.clinic.logoUrl ? (
                    <span
                      aria-hidden="true"
                      className="size-full bg-cover bg-center"
                      style={{ backgroundImage: `url("${state.clinic.logoUrl}")` }}
                    />
                  ) : (
                    (state.clinic.name || "V").charAt(0)
                  )}
                </div>
                <div className="space-y-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      handleLogoUpload(event.currentTarget.files?.[0] ?? null)
                    }
                    className="h-12 rounded-[0.95rem] border-border bg-white/84 px-4 text-[15px] file:mr-4 file:rounded-full file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary"
                  />
                  {state.clinic.logoUrl ? (
                    <button
                      type="button"
                      className="text-sm font-medium text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setState((current) => ({
                          ...current,
                          clinic: {
                            ...current.clinic,
                            logoUrl: "",
                          },
                        }))
                      }
                    >
                      Remove logo
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[1.35rem] border border-border bg-card p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Brand color
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use the default or choose a color that matches the clinic.
                </p>
              </div>
              <div
                className="flex h-10 min-w-28 items-center justify-center rounded-full px-4 text-sm font-semibold text-white"
                style={{ backgroundColor: previewAccent }}
              >
                Preview
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {visibleAccentPresets.map((preset) => {
                const selected = state.clinic.accentColor === preset.id;

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      setState((current) => ({
                        ...current,
                        clinic: {
                          ...current.clinic,
                          accentColor: preset.id,
                          accentHex: preset.value,
                        },
                      }))
                    }
                    className={cn(
                      "rounded-[1rem] border bg-white/84 p-3 text-left transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(20,32,51,0.055)]",
                      selected
                        ? "border-primary/55 ring-2 ring-primary/15"
                        : "border-border"
                    )}
                  >
                    <span
                      className="block h-10 rounded-[0.8rem]"
                      style={{ backgroundColor: preset.value }}
                    />
                    <span className="mt-2 block text-sm font-semibold text-foreground">
                      {preset.name}
                    </span>
                  </button>
                );
              })}
              <div
                className={cn(
                  "rounded-[1rem] border bg-white/84 p-3",
                  state.clinic.accentColor === "custom"
                    ? "border-primary/55 ring-2 ring-primary/15"
                    : "border-border",
                  customAccentInvalid && "border-destructive/45"
                )}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() =>
                    setState((current) => ({
                      ...current,
                      clinic: {
                        ...current.clinic,
                        accentColor: "custom",
                      },
                    }))
                  }
                >
                  <span
                    className="block h-10 rounded-[0.8rem]"
                    style={{ backgroundColor: previewAccent }}
                  />
                  <span className="mt-2 block text-sm font-semibold text-foreground">
                    Custom HEX
                  </span>
                </button>
                <Input
                  value={state.clinic.accentHex}
                  onFocus={() =>
                    setState((current) => ({
                      ...current,
                      clinic: {
                        ...current.clinic,
                        accentColor: "custom",
                      },
                    }))
                  }
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      clinic: {
                        ...current.clinic,
                        accentColor: "custom",
                        accentHex: event.target.value,
                      },
                    }))
                  }
                  placeholder="#3b82f6"
                  className="mt-3 h-10 rounded-[0.75rem] bg-white/88 font-mono text-xs uppercase tracking-[0.08em]"
                />
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (step.id === "hours") {
      const weeklyHours = weekdayOrder.reduce((total, day) => {
        const current = state.workingHours[day];

        if (!current.enabled) {
          return total;
        }

        const [startHour] = current.start.split(":").map(Number);
        const [endHour] = current.end.split(":").map(Number);
        return total + Math.max(endHour - startHour, 0);
      }, 0);

      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-[1.1rem] border border-border bg-card px-5 py-4">
            <p className="text-sm font-medium text-foreground">
              Weekly availability
            </p>
            <p className="text-lg font-semibold text-primary">
              {weeklyHours}h/week
            </p>
          </div>
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
              placeholder="Staff name"
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
            <p className="text-sm font-semibold text-foreground">Staff preview</p>
            <div className="mt-4 flex items-center gap-4 rounded-[1rem] bg-muted/55 p-4">
              <div className="flex size-11 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
                {(state.staffMember.name || "Staff")
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)}
              </div>
              <div>
                <p className="font-medium text-foreground">
                  {state.staffMember.name || "Staff name"}
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
            const selected = state.dashboard.widgets.includes(option.value);

            return (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  setState((current) => ({
                    ...current,
                    dashboard: {
                      ...current.dashboard,
                      widgets: selected
                        ? current.dashboard.widgets.filter(
                            (widget) => widget !== option.value
                          )
                        : [...current.dashboard.widgets, option.value],
                    },
                  }))
                }
                className={cn(
                  "group rounded-[1.35rem] border bg-card p-5 text-left transition-[border-color,box-shadow,transform,background-color] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_18px_40px_rgba(20,32,51,0.06)]",
                  selected
                    ? "border-primary/55 bg-primary/8 shadow-[0_18px_40px_var(--primary-shadow)]"
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
    <div
      className="min-h-screen bg-background"
      style={
        {
          "--primary": selectedAccent.value,
          "--primary-soft": selectedAccent.soft,
          "--primary-shadow": selectedAccent.shadow,
          "--ring": selectedAccent.shadow,
          "--accent": selectedAccent.soft,
          "--accent-foreground": selectedAccent.value,
        } as CSSProperties
      }
    >
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 border-b border-border pb-6">
          <div className="flex min-w-0 items-center gap-4">
            <BrandMark href="/dashboard" includeSubtitle={false} />
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-medium text-foreground">
                {state.clinic.name || businessName}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {state.owner.name || ownerName}
              </p>
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
          <div className="mx-auto max-w-3xl px-8 py-7">
            <div
              className="relative grid"
              style={{
                gridTemplateColumns: `repeat(${onboardingSteps.length}, minmax(0, 1fr))`,
              }}
            >
              <div
                className="absolute top-4 h-0.5 bg-border"
                style={{ left: progressInset, right: progressInset }}
              />
              <div
                className="absolute top-4 h-0.5 bg-primary transition-[width] duration-500 ease-out"
                style={{
                  left: progressInset,
                  width: progressWidth,
                }}
              />
              {onboardingSteps.map((item, index) => {
                const completed = index < stepIndex;
                const current = index === stepIndex;

                return (
                  <div
                    key={item.id}
                    className="relative flex flex-col items-center gap-3 text-center"
                  >
                    <span
                      className={cn(
                        "z-10 flex size-8 items-center justify-center rounded-full border bg-card text-xs font-semibold transition-colors duration-200",
                        completed &&
                          "border-primary bg-primary text-primary-foreground",
                        current &&
                          "border-primary bg-primary text-primary-foreground shadow-[0_8px_18px_var(--primary-shadow)]",
                        !completed &&
                          !current &&
                          "border-border text-muted-foreground"
                      )}
                    >
                      {completed ? <CheckCircle2 className="size-4" /> : index + 1}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col py-4 sm:py-8">
          <div className="space-y-8">
            {renderStepContent()}
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

          </div>
        </div>
      </div>
    </div>
  );
}
