"use client";

import { useEffect, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  Clock3,
  ImagePlus,
  Loader2,
  UsersRound,
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
  normalizeOnboardingState,
  onboardingSteps,
  weekdayOrder,
  type OnboardingStepId,
  type OnboardingState,
  type WeekdayKey,
} from "@/lib/onboarding";
import { isStorageReference } from "@/lib/media-storage";
import { createSignedImageUrl, uploadWorkspaceImage } from "@/lib/media-storage-client";
import { cn, getInitials } from "@/lib/utils";

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
  "07:00", "08:00", "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00",
];

const staffRoles = ["Specialist", "Manager", "Reception"];

const stepIcons: Record<OnboardingStepId, typeof Building2> = {
  clinic: Building2,
  hours: CalendarClock,
  team: UsersRound,
};

const onboardingDraftStorageKey = "vela:onboarding-draft";

const fieldInputClass =
  "h-11 rounded-(--radius-card) border-border bg-white px-3.5 text-[15px] shadow-none placeholder:text-muted-foreground/70";

const selectClass =
  "h-11 w-full appearance-none rounded-(--radius-card) border border-border bg-white px-3.5 pr-9 text-[15px] text-foreground shadow-none outline-none transition-colors focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const EASE = [0.23, 1, 0.32, 1] as const;

type OnboardingFlowProps = {
  initialState: OnboardingState;
  businessName: string;
  ownerName: string;
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-medium text-muted-foreground">{children}</label>;
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
        "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-(--duration-base)",
        checked ? "bg-primary" : "bg-border"
      )}
    >
      <span
        className={cn(
          "absolute top-1 size-4 rounded-full bg-white shadow-[0_1px_3px_rgba(20,21,47,0.18)] transition-transform duration-(--duration-base)",
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
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={selectClass}>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function getStepError(state: OnboardingState, solo: boolean): string | null {
  const step = onboardingSteps[Math.min(Math.max(state.currentStep, 1), onboardingSteps.length) - 1];

  if (step.id === "clinic") {
    if (!state.clinic.name.trim()) {
      return "Enter your clinic name before continuing.";
    }
    if (!businessTypes.includes(state.clinic.type as (typeof businessTypes)[number])) {
      return "Choose what kind of clinic this is.";
    }
    if (!state.owner.name.trim()) {
      return "Enter the clinic owner's name before continuing.";
    }
    if (state.clinic.accentColor === "custom" && !normalizeBrandHexColor(state.clinic.accentHex)) {
      return "Enter a valid brand color, for example #0A22FF.";
    }
    return null;
  }

  if (step.id === "team" && !solo && !state.staffMember.name.trim()) {
    return "Add your first team member, or choose “It's just me for now”.";
  }

  return null;
}

export function OnboardingFlow({
  initialState,
  businessName,
  ownerName,
}: OnboardingFlowProps) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [state, setState] = useState(() => {
    if (typeof window === "undefined") {
      return initialState;
    }
    const rawDraft = window.localStorage.getItem(onboardingDraftStorageKey);
    if (!rawDraft) {
      return initialState;
    }
    try {
      const parsedDraft = normalizeOnboardingState(JSON.parse(rawDraft));
      return parsedDraft.completed ? initialState : parsedDraft;
    } catch {
      window.localStorage.removeItem(onboardingDraftStorageKey);
      return initialState;
    }
  });
  const [showWelcome, setShowWelcome] = useState(() => state.currentStep <= 1 && !state.completed);
  const [solo, setSolo] = useState(() => !state.staffMember.name.trim());
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [isLogoUploading, setIsLogoUploading] = useState(false);
  const [isPending, startSaving] = useTransition();

  const selectedAccent = resolveBrandAccentPreset(
    state.clinic.accentColor === "custom" ? state.clinic.accentHex : state.clinic.accentColor
  );
  const normalizedCustomAccent = normalizeBrandHexColor(state.clinic.accentHex);
  const customAccentInvalid = state.clinic.accentColor === "custom" && !normalizedCustomAccent;
  const previewAccent = normalizedCustomAccent ?? selectedAccent.value;
  const visibleAccentPresets = brandAccentPresets.filter((preset) => preset.id !== "emerald");

  const stepIndex = Math.min(Math.max(state.currentStep, 1), onboardingSteps.length) - 1;
  const step = onboardingSteps[stepIndex];
  const StepIcon = stepIcons[step.id];
  const isLastStep = state.currentStep >= onboardingSteps.length;
  const ownerFirstName = (state.owner.name || ownerName).trim().split(/\s+/)[0] || "there";

  // Logo is upload-only, so the only display source is the signed URL resolved
  // from the stored storage reference — never a raw string that could be smuggled
  // into the CSS url() below via a tampered draft.
  const logoDisplayUrl = logoPreviewUrl;

  // Variants — swift, ease-out, reduced-motion aware (movement off, opacity kept).
  const stepVariants: Variants = {
    initial: { opacity: 0, y: reduce ? 0 : 14 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.26, ease: EASE, when: "beforeChildren", staggerChildren: reduce ? 0 : 0.05 },
    },
    exit: { opacity: 0, y: reduce ? 0 : -8, transition: { duration: 0.16, ease: EASE } },
  };
  const itemVariants: Variants = {
    initial: { opacity: 0, y: reduce ? 0 : 8 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE } },
  };

  useEffect(() => {
    let ignore = false;
    if (!isStorageReference(state.clinic.logoUrl) || logoPreviewUrl) {
      return;
    }
    createSignedImageUrl(state.clinic.logoUrl)
      .then((signedUrl) => {
        if (!ignore) setLogoPreviewUrl(signedUrl);
      })
      .catch(() => {
        if (!ignore) setLogoPreviewUrl("");
      });
    return () => {
      ignore = true;
    };
  }, [logoPreviewUrl, state.clinic.logoUrl]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (state.completed) {
      window.localStorage.removeItem(onboardingDraftStorageKey);
      return;
    }
    window.localStorage.setItem(onboardingDraftStorageKey, JSON.stringify(state));
  }, [state]);

  function persistState(nextState: OnboardingState, options?: { complete?: boolean; status?: string }) {
    startSaving(async () => {
      const result = await saveOnboardingStateAction(nextState);
      if (!result.ok || !result.state) {
        if (result.state) setState(result.state);
        setErrorMessage(result.error ?? "We couldn't save your progress.");
        setStatusMessage("");
        return;
      }
      setState(result.state);
      setErrorMessage("");
      setStatusMessage(options?.status ?? "Progress saved.");
      if (options?.complete) {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(onboardingDraftStorageKey);
        }
        router.push("/onboarding/complete");
      }
    });
  }

  function handleNext() {
    const validationError = getStepError(state, solo);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    const nextStaff = solo
      ? { name: "", role: state.staffMember.role || "Specialist" }
      : state.staffMember;

    if (isLastStep) {
      persistState(
        { ...state, staffMember: nextStaff, completed: true },
        { complete: true, status: "Onboarding complete." }
      );
      return;
    }
    persistState(
      { ...state, staffMember: nextStaff, currentStep: state.currentStep + 1 },
      { status: `Saved ${step.shortLabel.toLowerCase()}.` }
    );
  }

  function handleBack() {
    if (state.currentStep <= 1) {
      setShowWelcome(true);
      return;
    }
    setErrorMessage("");
    setStatusMessage("");
    setState((current) => ({ ...current, currentStep: current.currentStep - 1 }));
  }

  function handleSaveProgress() {
    const nextStaff = solo
      ? { name: "", role: state.staffMember.role || "Specialist" }
      : state.staffMember;
    persistState(
      { ...state, staffMember: nextStaff },
      { status: "Progress saved. You can finish anytime." }
    );
  }

  function updateDay(day: WeekdayKey, patch: Partial<(typeof state.workingHours)[WeekdayKey]>) {
    setState((current) => ({
      ...current,
      workingHours: { ...current.workingHours, [day]: { ...current.workingHours[day], ...patch } },
    }));
  }

  function updateClinic(patch: Partial<OnboardingState["clinic"]>) {
    setState((current) => ({ ...current, clinic: { ...current.clinic, ...patch } }));
  }

  async function handleLogoUpload(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrorMessage("Upload an image file for the clinic logo.");
      return;
    }
    if (file.size > 750_000) {
      setErrorMessage("Logo file is too large. Upload an image under 750 KB.");
      return;
    }
    setIsLogoUploading(true);
    try {
      const uploadedLogo = await uploadWorkspaceImage(file, { folder: "logos", maxBytes: 750_000 });
      updateClinic({ logoUrl: uploadedLogo.storageUrl });
      setLogoPreviewUrl(uploadedLogo.signedUrl);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "We couldn't upload this logo.");
    } finally {
      setIsLogoUploading(false);
    }
  }

  const weeklyHours = weekdayOrder.reduce((total, day) => {
    const current = state.workingHours[day];
    if (!current.enabled) return total;
    const [startHour] = current.start.split(":").map(Number);
    const [endHour] = current.end.split(":").map(Number);
    return total + Math.max(endHour - startHour, 0);
  }, 0);
  const openDays = weekdayOrder.filter((day) => state.workingHours[day].enabled).length;

  return (
    <div
      className="app-shell-bg relative min-h-screen overflow-hidden"
      style={
        {
          "--primary": selectedAccent.value,
          "--primary-hover": selectedAccent.hover,
          "--primary-soft": selectedAccent.soft,
          "--primary-shadow": selectedAccent.shadow,
          "--ring": selectedAccent.shadow,
          "--accent": selectedAccent.soft,
          "--accent-foreground": selectedAccent.value,
        } as CSSProperties
      }
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[22rem] bg-[radial-gradient(58%_100%_at_50%_0%,var(--primary-soft),transparent_72%)] opacity-80 transition-colors duration-(--duration-slow)"
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-7 sm:px-8">
        {/* header */}
        <div className="flex items-center justify-between gap-4">
          <BrandMark href="/dashboard" includeSubtitle={false} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-(--radius-field) text-muted-foreground"
            onClick={handleSaveProgress}
            disabled={isPending}
          >
            Save &amp; finish later
          </Button>
        </div>

        {/* stepper */}
        <AnimatePresence initial={false}>
          {!showWelcome ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.24, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="mx-auto flex w-full max-w-2xl items-center pt-8">
                {onboardingSteps.map((item, index) => {
                  const done = index < stepIndex;
                  const active = index === stepIndex;
                  return (
                    <div key={item.id} className="flex flex-1 items-center last:flex-none">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            "flex size-8 items-center justify-center rounded-(--radius-tile) border text-xs font-semibold transition-colors duration-(--duration-base)",
                            done
                              ? "border-primary bg-primary text-primary-foreground"
                              : active
                                ? "border-primary bg-white text-primary"
                                : "border-border bg-white text-muted-foreground"
                          )}
                        >
                          {done ? <Check className="size-4" /> : index + 1}
                        </span>
                        <span
                          className={cn(
                            "hidden text-sm font-medium transition-colors duration-(--duration-base) sm:block",
                            active ? "text-foreground" : "text-muted-foreground"
                          )}
                        >
                          {item.shortLabel}
                        </span>
                      </div>
                      {index < onboardingSteps.length - 1 ? (
                        <div className="mx-3 h-0.5 flex-1 overflow-hidden rounded-full bg-border">
                          <motion.div
                            className="h-full rounded-full bg-primary"
                            initial={false}
                            animate={{ width: done ? "100%" : "0%" }}
                            transition={{ duration: 0.3, ease: EASE }}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* body */}
        <div className="flex flex-1 flex-col justify-center py-8">
          <div className="mx-auto w-full max-w-xl">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={showWelcome ? "welcome" : step.id}
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {showWelcome ? (
                <div className="text-center">
                  <motion.p variants={itemVariants} className="text-sm font-semibold text-primary">
                    Welcome to Vela
                  </motion.p>
                  <motion.h1
                    variants={itemVariants}
                    className="mx-auto mt-3 max-w-md text-[2.1rem] font-semibold leading-[1.1] tracking-tight text-foreground"
                  >
                    Let&apos;s set up your clinic, {ownerFirstName}.
                  </motion.h1>
                  <motion.p
                    variants={itemVariants}
                    className="mx-auto mt-4 max-w-sm text-[15px] leading-7 text-muted-foreground"
                  >
                    Three quick steps and your workspace is ready. We&apos;ll only ask for what Vela
                    needs to run your day.
                  </motion.p>

                  <div className="mx-auto mt-9 max-w-sm space-y-2.5 text-left">
                    {onboardingSteps.map((item, index) => {
                      const Icon = stepIcons[item.id];
                      return (
                        <motion.div
                          key={item.id}
                          variants={itemVariants}
                          className="flex items-center gap-3.5 rounded-(--radius-field) border border-border bg-white/70 px-4 py-3"
                        >
                          <span className="flex size-9 items-center justify-center rounded-(--radius-tile) border border-border bg-white text-primary">
                            <Icon className="size-4" />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{item.shortLabel}</p>
                            <p className="text-sm text-muted-foreground">
                              {item.id === "clinic"
                                ? "Name, logo and brand color"
                                : item.id === "hours"
                                  ? "When patients can book"
                                  : "Who works day one"}
                            </p>
                          </div>
                          <span className="ml-auto text-xs font-medium text-muted-foreground">
                            {index + 1}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>

                  <motion.p
                    variants={itemVariants}
                    className="mt-7 inline-flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <Clock3 className="size-4" />
                    About 3 minutes
                  </motion.p>

                  <motion.div variants={itemVariants} className="mt-9">
                    <Button
                      type="button"
                      size="lg"
                      className="h-12 rounded-(--radius-field) px-8"
                      onClick={() => {
                        setErrorMessage("");
                        setShowWelcome(false);
                      }}
                    >
                      Set up my clinic
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                  </motion.div>
                </div>
              ) : (
                <div className="surface-card rounded-(--radius-panel) p-6 shadow-[0_24px_60px_rgba(20,21,47,0.07)] sm:p-8">
                  <motion.div variants={itemVariants} className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-(--radius-tile) border border-border bg-white text-primary">
                      <StepIcon className="size-5" />
                    </span>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Step {stepIndex + 1} of {onboardingSteps.length}
                    </p>
                  </motion.div>

                  <motion.h1
                    variants={itemVariants}
                    className="mt-5 text-[1.6rem] font-semibold leading-tight tracking-tight text-foreground"
                  >
                    {step.title}
                  </motion.h1>
                  <motion.p variants={itemVariants} className="mt-2 text-[15px] leading-7 text-muted-foreground">
                    {step.why}
                  </motion.p>

                  <div className="mt-7 space-y-6">
                    {step.id === "clinic" ? (
                      <>
                        <motion.div variants={itemVariants} className="space-y-2">
                          <FieldLabel>Clinic name</FieldLabel>
                          <Input
                            value={state.clinic.name}
                            onChange={(event) => updateClinic({ name: event.target.value })}
                            placeholder={businessName || "Aldent Dental"}
                            className={fieldInputClass}
                          />
                        </motion.div>

                        <motion.div variants={itemVariants} className="space-y-2">
                          <FieldLabel>Clinic type</FieldLabel>
                          <div className="flex flex-wrap gap-2">
                            {businessTypes.map((type) => {
                              const active = state.clinic.type === type;
                              return (
                                <button
                                  key={type}
                                  type="button"
                                  onClick={() => updateClinic({ type })}
                                  className={cn(
                                    "h-9 rounded-full border px-3.5 text-sm font-medium transition-colors duration-(--duration-base) focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.97]",
                                    active
                                      ? "border-primary/55 bg-primary-soft text-primary"
                                      : "border-border bg-white text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  {type}
                                </button>
                              );
                            })}
                          </div>
                        </motion.div>

                        <motion.div variants={itemVariants} className="space-y-2">
                          <FieldLabel>Logo</FieldLabel>
                          <div className="flex items-center gap-3.5">
                            <input
                              id="clinic-logo-upload"
                              type="file"
                              accept="image/*"
                              disabled={isLogoUploading}
                              onChange={(event) => handleLogoUpload(event.currentTarget.files?.[0] ?? null)}
                              className="sr-only"
                            />
                            <label
                              htmlFor="clinic-logo-upload"
                              className="flex size-14 cursor-pointer items-center justify-center overflow-hidden rounded-(--radius-tile) border border-border bg-white text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                            >
                              {isLogoUploading ? (
                                <Loader2 className="size-5 animate-spin" />
                              ) : logoDisplayUrl ? (
                                <span
                                  aria-hidden
                                  className="size-full bg-cover bg-center"
                                  style={{ backgroundImage: `url("${logoDisplayUrl}")` }}
                                />
                              ) : (
                                <ImagePlus className="size-5" />
                              )}
                            </label>
                            <div className="text-sm text-muted-foreground">
                              <p>A square mark looks best.</p>
                              <p>
                                {state.clinic.logoUrl ? (
                                  <button
                                    type="button"
                                    className="font-medium text-primary hover:underline"
                                    onClick={() => {
                                      setLogoPreviewUrl("");
                                      updateClinic({ logoUrl: "" });
                                    }}
                                  >
                                    Remove logo
                                  </button>
                                ) : (
                                  "No logo yet? We'll use your clinic's initial."
                                )}
                              </p>
                            </div>
                          </div>
                        </motion.div>

                        <motion.div variants={itemVariants} className="space-y-2">
                          <FieldLabel>Brand color</FieldLabel>
                          <div className="flex flex-wrap items-center gap-2.5">
                            {visibleAccentPresets.map((preset) => {
                              const active = state.clinic.accentColor === preset.id;
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  aria-label={preset.name}
                                  onClick={() =>
                                    updateClinic({ accentColor: preset.id, accentHex: preset.value })
                                  }
                                  className={cn(
                                    "flex size-8 items-center justify-center rounded-full transition-transform duration-(--duration-base) hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95",
                                    active && "ring-2 ring-offset-2 ring-offset-background"
                                  )}
                                  style={
                                    {
                                      backgroundColor: preset.value,
                                      "--tw-ring-color": preset.value,
                                    } as CSSProperties
                                  }
                                >
                                  {active ? <Check className="size-4 text-white" /> : null}
                                </button>
                              );
                            })}
                            <label
                              className={cn(
                                "flex h-8 items-center gap-2 rounded-full border px-2.5 text-xs font-medium text-muted-foreground",
                                state.clinic.accentColor === "custom"
                                  ? "border-primary/55"
                                  : "border-border",
                                customAccentInvalid && "border-destructive/50"
                              )}
                            >
                              <input
                                type="color"
                                value={normalizedCustomAccent ?? previewAccent}
                                onChange={(event) =>
                                  updateClinic({ accentColor: "custom", accentHex: event.target.value })
                                }
                                className="size-4 cursor-pointer rounded-full border-0 bg-transparent p-0"
                              />
                              <input
                                value={state.clinic.accentHex}
                                onFocus={() => updateClinic({ accentColor: "custom" })}
                                onChange={(event) =>
                                  updateClinic({ accentColor: "custom", accentHex: event.target.value })
                                }
                                placeholder="#0A22FF"
                                className="w-16 bg-transparent font-mono uppercase outline-none"
                              />
                            </label>
                          </div>
                        </motion.div>

                        <motion.div variants={itemVariants} className="space-y-2">
                          <FieldLabel>Owner name</FieldLabel>
                          <Input
                            value={state.owner.name}
                            onChange={(event) =>
                              setState((current) => ({ ...current, owner: { name: event.target.value } }))
                            }
                            placeholder="Owner name"
                            className={fieldInputClass}
                          />
                        </motion.div>
                      </>
                    ) : null}

                    {step.id === "hours" ? (
                      <motion.div variants={itemVariants} className="space-y-2.5">
                        {weekdayOrder.map((day) => {
                          const item = state.workingHours[day];
                          return (
                            <div
                              key={day}
                              className="flex items-center justify-between gap-3 rounded-(--radius-field) border border-border bg-white px-3.5 py-2.5"
                            >
                              <div className="flex items-center gap-3">
                                <Toggle
                                  checked={item.enabled}
                                  onPressedChange={(checked) => updateDay(day, { enabled: checked })}
                                />
                                <span className="text-sm font-medium text-foreground">
                                  {weekdayLabels[day]}
                                </span>
                              </div>
                              {item.enabled ? (
                                <div className="flex items-center gap-2">
                                  <NativeSelect
                                    value={item.start}
                                    onChange={(value) => updateDay(day, { start: value })}
                                    options={timeOptions}
                                  />
                                  <span className="text-muted-foreground">–</span>
                                  <NativeSelect
                                    value={item.end}
                                    onChange={(value) => updateDay(day, { end: value })}
                                    options={timeOptions}
                                  />
                                </div>
                              ) : (
                                <span className="text-sm font-medium text-muted-foreground">Closed</span>
                              )}
                            </div>
                          );
                        })}
                        <div className="flex items-center gap-2 rounded-(--radius-field) bg-primary-soft px-3.5 py-2.5 text-sm font-medium text-primary">
                          <Clock3 className="size-4" />
                          {weeklyHours} hours open per week · {openDays} days
                        </div>
                      </motion.div>
                    ) : null}

                    {step.id === "team" ? (
                      <>
                        <motion.button
                          variants={itemVariants}
                          type="button"
                          onClick={() => {
                            setSolo(true);
                            setState((current) => ({
                              ...current,
                              staffMember: { ...current.staffMember, name: "" },
                            }));
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-(--radius-field) border bg-white px-3.5 py-3 text-left transition-colors active:scale-[0.99]",
                            solo ? "border-primary/55 ring-2 ring-primary/15" : "border-border"
                          )}
                        >
                          <span className="flex size-9 items-center justify-center rounded-(--radius-tile) border border-border bg-white text-sm font-semibold text-primary">
                            {getInitials(state.owner.name || ownerName || "Me")}
                          </span>
                          <span className="flex-1">
                            <span className="block text-sm font-semibold text-foreground">
                              It&apos;s just me for now
                            </span>
                            <span className="block text-sm text-muted-foreground">
                              {(state.owner.name || ownerName || "You").split(/\s+/)[0]} runs the day solo
                            </span>
                          </span>
                          <span
                            className={cn(
                              "flex size-5 items-center justify-center rounded-full border transition-colors",
                              solo ? "border-primary bg-primary text-white" : "border-border"
                            )}
                          >
                            {solo ? <Check className="size-3" /> : null}
                          </span>
                        </motion.button>

                        <motion.div variants={itemVariants} className="space-y-3">
                          <p className="text-sm font-medium text-muted-foreground">First team member</p>
                          <div className="flex gap-2.5">
                            <Input
                              value={state.staffMember.name}
                              onChange={(event) => {
                                setSolo(false);
                                setState((current) => ({
                                  ...current,
                                  staffMember: { ...current.staffMember, name: event.target.value },
                                }));
                              }}
                              placeholder="Full name"
                              className={cn(fieldInputClass, "flex-1")}
                            />
                            <div className="w-40">
                              <NativeSelect
                                value={state.staffMember.role}
                                onChange={(value) =>
                                  setState((current) => ({
                                    ...current,
                                    staffMember: { ...current.staffMember, role: value },
                                  }))
                                }
                                options={staffRoles}
                              />
                            </div>
                          </div>
                          <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                            <UsersRound className="size-3.5" />
                            You can add the rest of your team anytime in Staff.
                          </p>
                        </motion.div>
                      </>
                    ) : null}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          </div>
        </div>

        {/* footer */}
        <div className="mx-auto w-full max-w-xl space-y-4">
          <AnimatePresence mode="wait">
            {errorMessage ? (
              <motion.div
                key={`err-${errorMessage}`}
                initial={{ opacity: 0, y: reduce ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: EASE }}
                className="rounded-(--radius-field) border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              >
                {errorMessage}
              </motion.div>
            ) : !errorMessage && statusMessage ? (
              <motion.div
                key={`ok-${statusMessage}`}
                initial={{ opacity: 0, y: reduce ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: EASE }}
                className="rounded-(--radius-field) border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary"
              >
                {statusMessage}
              </motion.div>
            ) : null}
          </AnimatePresence>

          {!showWelcome ? (
            <div className="flex items-center justify-between gap-4">
              <Button
                type="button"
                variant="ghost"
                className="rounded-(--radius-field) px-3 text-muted-foreground hover:bg-transparent"
                onClick={handleBack}
                disabled={isPending}
              >
                <ArrowLeft data-icon="inline-start" />
                Back
              </Button>
              <Button
                type="button"
                size="lg"
                className="h-12 rounded-(--radius-field) px-5"
                onClick={handleNext}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
                {isLastStep ? "Finish setup" : "Continue"}
                {!isPending ? <ArrowRight data-icon="inline-end" /> : null}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
