"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

import { saveOnboardingStateAction } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { businessTypes } from "@/lib/constants";
import { normalizeBrandHexColor, resolveBrandAccentPreset } from "@/lib/branding";
import {
  hoursBetweenTimes,
  normalizeOnboardingState,
  onboardingSteps,
  weekdayOrder,
  type DaySchedule,
  type OnboardingState,
  type WeekdayKey,
} from "@/lib/onboarding";
import { isStorageReference } from "@/lib/media-storage";
import {
  createSignedImageUrl,
  safeUploadErrorMessage,
  uploadWorkspaceImage,
} from "@/lib/media-storage-client";
import { cn, firstDisplayName } from "@/lib/utils";
import { useI18n, useServerText } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";

import { ClinicPreview } from "./clinic-preview";
import { inkButtonClassName } from "./form-parts";
import { OnboardingShell } from "./onboarding-shell";
import { ClinicStep, HoursStep, TeamStep, WelcomeStep } from "./steps";

// The draft is keyed by user, so a different account signing in on the same
// browser never restores (or saves into) someone else's setup. The old shared
// key is cleared on sight.
const legacyDraftStorageKey = "vela:onboarding-draft";

const EASE = [0.23, 1, 0.32, 1] as const;

type OnboardingFlowProps = {
  initialState: OnboardingState;
  businessName: string;
  ownerName: string;
  /** The signed-in user's id, which scopes the local draft. */
  userId: string;
};

type Errors = Messages["onboarding"]["errors"];

function getStepError(state: OnboardingState, solo: boolean, t: Errors): string | null {
  const step = onboardingSteps[Math.min(Math.max(state.currentStep, 1), onboardingSteps.length) - 1];

  if (step.id === "clinic") {
    if (!state.clinic.name.trim()) {
      return t.clinicName;
    }
    if (!state.owner.name.trim()) {
      return t.ownerName;
    }
    if (!businessTypes.includes(state.clinic.type as (typeof businessTypes)[number])) {
      return t.type;
    }
    if (state.clinic.accentColor === "custom" && !normalizeBrandHexColor(state.clinic.accentHex)) {
      return t.color;
    }
    return null;
  }

  if (step.id === "hours") {
    if (!weekdayOrder.some((day) => state.workingHours[day].enabled)) {
      return t.openDay;
    }
    if (weekdayOrder.some((day) => state.workingHours[day].enabled && hoursBetweenTimes(state.workingHours[day].start, state.workingHours[day].end) <= 0)) {
      return t.closingTime;
    }
    return null;
  }

  if (step.id === "team" && !solo && !state.staffMember.name.trim()) {
    return t.team;
  }

  return null;
}

/**
 * The three-step setup a new owner walks after confirming their email. The
 * form sits on the left; the ink panel on the right is their own clinic,
 * built live from what they enter. Saving goes through
 * saveOnboardingStateAction exactly as before (each Continue saves, Finish
 * bootstraps the workspace), and a local draft survives a reload.
 */
export function OnboardingFlow({ initialState, businessName, ownerName, userId }: OnboardingFlowProps) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const { m } = useI18n();
  const t = m.onboarding;
  const serverText = useServerText();
  const draftKey = `${legacyDraftStorageKey}:${userId}`;

  // Seed from initialState only, so the server render and the first client render
  // agree. A saved localStorage draft is restored after mount (effect below) to
  // avoid a hydration mismatch.
  const [state, setState] = useState(initialState);
  const [showWelcome, setShowWelcome] = useState(initialState.currentStep <= 1 && !initialState.completed);
  const [solo, setSolo] = useState(!initialState.staffMember.name.trim());
  const [errorMessage, setErrorMessage] = useState("");
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [isLogoUploading, setIsLogoUploading] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [isPending, startSaving] = useTransition();

  const accent = resolveBrandAccentPreset(
    state.clinic.accentColor === "custom" ? state.clinic.accentHex : state.clinic.accentColor
  ).value;

  const stepIndex = Math.min(Math.max(state.currentStep, 1), onboardingSteps.length) - 1;
  const step = onboardingSteps[stepIndex];
  const isLastStep = state.currentStep >= onboardingSteps.length;
  const ownerFirstName = firstDisplayName(state.owner.name || ownerName) || t.welcome.fallbackName;

  const stepVariants: Variants = {
    initial: { opacity: 0, y: reduce ? 0 : 12 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE } },
    exit: { opacity: 0, y: reduce ? 0 : -6, transition: { duration: 0.16, ease: EASE } },
  };

  // Logo is upload-only, so the only display source is the signed URL resolved
  // from the stored storage reference, never a raw string that could be smuggled
  // into a CSS url() via a tampered draft.
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

  // Restore a saved draft after mount, kept out of the useState initializer so
  // the server render and the first client render agree (no hydration mismatch).
  useEffect(() => {
    window.localStorage.removeItem(legacyDraftStorageKey);
    const rawDraft = window.localStorage.getItem(draftKey);
    try {
      const draft = rawDraft ? normalizeOnboardingState(JSON.parse(rawDraft)) : null;
      if (draft && !draft.completed) {
        setState(draft);
        setShowWelcome(draft.currentStep <= 1);
        setSolo(!draft.staffMember.name.trim());
      }
    } catch {
      window.localStorage.removeItem(draftKey);
    }
    setDraftRestored(true);
  }, [draftKey]);

  // Persist the draft on change, but only once the restore above has applied:
  // saving earlier would overwrite the stored draft with the initial state
  // (a skip-the-first-run ref isn't enough, since dev runs effects twice).
  useEffect(() => {
    if (!draftRestored) {
      return;
    }
    if (state.completed) {
      window.localStorage.removeItem(draftKey);
      return;
    }
    window.localStorage.setItem(draftKey, JSON.stringify(state));
  }, [draftKey, draftRestored, state]);

  function persistState(nextState: OnboardingState, options?: { complete?: boolean }) {
    startSaving(async () => {
      const result = await saveOnboardingStateAction(nextState);
      if (!result.ok || !result.state) {
        if (result.state) setState(result.state);
        setErrorMessage(result.error ?? t.errors.save);
        return;
      }
      setState(result.state);
      setErrorMessage("");
      if (options?.complete) {
        window.localStorage.removeItem(draftKey);
        router.push("/onboarding/complete");
      }
    });
  }

  function handleNext() {
    const validationError = getStepError(state, solo, t.errors);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    const nextStaff = solo ? { name: "", role: state.staffMember.role || "Specialist" } : state.staffMember;

    if (isLastStep) {
      persistState({ ...state, staffMember: nextStaff, completed: true }, { complete: true });
      return;
    }
    persistState({ ...state, staffMember: nextStaff, currentStep: state.currentStep + 1 });
  }

  function handleBack() {
    setErrorMessage("");
    if (state.currentStep <= 1) {
      setShowWelcome(true);
      return;
    }
    setState((current) => ({ ...current, currentStep: current.currentStep - 1 }));
  }

  function updateDay(day: WeekdayKey, patch: Partial<DaySchedule>) {
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
      setErrorMessage(t.errors.logoType);
      return;
    }
    if (file.size > 750_000) {
      setErrorMessage(t.errors.logoSize);
      return;
    }
    setIsLogoUploading(true);
    try {
      const uploadedLogo = await uploadWorkspaceImage(file, { folder: "logos", maxBytes: 750_000 });
      updateClinic({ logoUrl: uploadedLogo.storageUrl });
      setLogoPreviewUrl(uploadedLogo.signedUrl);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(safeUploadErrorMessage(error, t.errors.logoUpload));
    } finally {
      setIsLogoUploading(false);
    }
  }

  // Mirrors what finishing creates: the named team member, or the owner
  // themself when it's just them.
  const team = [
    solo
      ? { name: state.owner.name.trim(), role: state.staffMember.role || "Specialist" }
      : { name: state.staffMember.name.trim(), role: state.staffMember.role },
  ];

  const panel = (
    <ClinicPreview
      name={state.clinic.name}
      type={state.clinic.type}
      logoUrl={logoPreviewUrl}
      logoRef={state.clinic.logoUrl}
      announceChanges={draftRestored}
      accent={accent}
      hours={state.workingHours}
      team={team}
      focus={showWelcome ? "intro" : step.id}
    />
  );

  return (
    <OnboardingShell
      panel={panel}
      panelLead={showWelcome ? t.panel.welcome[0] : t.panel[step.id][0]}
      panelTail={showWelcome ? t.panel.welcome[1] : t.panel[step.id][1]}
    >
      {!showWelcome ? (
        <div className="mb-8">
          <div className="flex gap-1.5" aria-hidden>
            {onboardingSteps.map((item, index) => (
              <span key={item.id} className="h-1 flex-1 overflow-hidden rounded-full bg-border">
                <span
                  className={cn(
                    "block h-full rounded-full bg-[var(--brand-ink)] transition-[width] duration-(--duration-slow) ease-out-quint motion-reduce:transition-none",
                    index <= stepIndex ? "w-full" : "w-0"
                  )}
                />
              </span>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {fmt(t.stepOf, { step: stepIndex + 1, total: onboardingSteps.length, label: t.steps[step.id].short })}
          </p>
        </div>
      ) : null}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={showWelcome ? "welcome" : step.id}
          variants={stepVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {showWelcome ? (
            <WelcomeStep firstName={ownerFirstName} />
          ) : (
            <>
              <h1 className="text-[2rem] font-semibold leading-[1.08] tracking-[-0.03em] text-[var(--brand-ink)]">
                {t.steps[step.id].title}
              </h1>
              <p className="mt-2 text-[15px] leading-7 text-muted-foreground">{t.steps[step.id].why}</p>
              <div className="mt-7">
                {step.id === "clinic" ? (
                  <ClinicStep
                    state={state}
                    placeholderName={businessName && businessName !== "Vela Workspace" ? businessName : "Aldent Dental"}
                    logoDisplayUrl={logoPreviewUrl}
                    isLogoUploading={isLogoUploading}
                    onClinicChange={updateClinic}
                    onOwnerChange={(name) => setState((current) => ({ ...current, owner: { name } }))}
                    onLogoUpload={handleLogoUpload}
                    onLogoRemove={() => {
                      setLogoPreviewUrl("");
                      updateClinic({ logoUrl: "" });
                    }}
                  />
                ) : step.id === "hours" ? (
                  <HoursStep workingHours={state.workingHours} onDayChange={updateDay} />
                ) : (
                  <TeamStep
                    ownerName={state.owner.name || ownerName}
                    solo={solo}
                    staffMember={state.staffMember}
                    onChooseSolo={() => {
                      setSolo(true);
                      setState((current) => ({ ...current, staffMember: { ...current.staffMember, name: "" } }));
                    }}
                    onStaffChange={(patch) => {
                      if (patch.name !== undefined) setSolo(false);
                      setState((current) => ({ ...current, staffMember: { ...current.staffMember, ...patch } }));
                    }}
                  />
                )}
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="mt-8 space-y-4">
        {errorMessage ? (
          <p
            role="alert"
            className="state-pop rounded-(--radius-field) border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {serverText(errorMessage)}
          </p>
        ) : null}

        {showWelcome ? (
          <Button
            type="button"
            size="lg"
            className={cn(inkButtonClassName, "w-full")}
            onClick={() => {
              setErrorMessage("");
              setShowWelcome(false);
            }}
          >
            {t.buttons.start}
            <ArrowRight className="size-4 transition-transform duration-(--duration-base) ease-out-quint group-hover/next:translate-x-0.5" data-icon="inline-end" />
          </Button>
        ) : (
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-12 rounded-(--radius-field) px-3 text-muted-foreground hover:bg-transparent hover:text-[var(--brand-ink)]"
              onClick={handleBack}
              disabled={isPending}
            >
              <ArrowLeft data-icon="inline-start" />
              {t.buttons.back}
            </Button>
            <Button
              type="button"
              size="lg"
              className={cn(inkButtonClassName, "flex-1")}
              onClick={handleNext}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                  {isLastStep ? t.buttons.creating : t.buttons.saving}
                </>
              ) : (
                <>
                  {isLastStep ? t.buttons.finish : t.buttons.continue}
                  <ArrowRight className="size-4 transition-transform duration-(--duration-base) ease-out-quint group-hover/next:translate-x-0.5" data-icon="inline-end" />
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </OnboardingShell>
  );
}
