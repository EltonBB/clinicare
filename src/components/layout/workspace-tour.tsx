"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TOUR_STORAGE_KEY = "vela-workspace-tour-state-v6";
const ACTIVE_TARGET_CLASSES = [
  "relative",
  "z-[81]",
  "rounded-[1rem]",
  "ring-2",
  "ring-primary/85",
  "shadow-[0_0_0_8px_rgba(38,137,135,0.10),0_16px_34px_rgba(15,23,42,0.14)]",
  "transition-[box-shadow,ring-color]",
  "duration-300",
];

type Placement = "sidebar" | "header-action" | "drawer" | "content";

type TourStep = {
  id: string;
  path: string;
  target: string;
  kicker: string;
  title: string;
  description: string;
  actionLabel?: string;
  advanceMode: "button" | "click";
  placement: Placement;
};

type TourState = {
  active: boolean;
  currentStepIndex: number;
};

type Rect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const initialTourState: TourState = {
  active: false,
  currentStepIndex: 0,
};

const tourSteps: TourStep[] = [
  {
    id: "dashboard-sidebar",
    path: "/dashboard",
    target: "sidebar-shell",
    kicker: "Navigation",
    title: "This sidebar is the clinic's main map",
    description:
      "Use this left sidebar to move between the clinic overview, clients, calendar, inbox, and settings. Everything important starts here.",
    advanceMode: "button",
    placement: "sidebar",
  },
  {
    id: "clients-nav",
    path: "/dashboard",
    target: "clients-nav",
    kicker: "Clients",
    title: "Open Clients next",
    description:
      "Clients is where the clinic stores profiles, notes, and contact details. Open it now from the sidebar.",
    actionLabel: "Next: click Clients in the sidebar",
    advanceMode: "click",
    placement: "sidebar",
  },
  {
    id: "clients-create",
    path: "/clients",
    target: "clients-create",
    kicker: "Register client",
    title: "This button adds a new client",
    description:
      "Whenever the clinic needs to register a patient or customer, this is where the workflow starts.",
    actionLabel: "Next: click New client",
    advanceMode: "click",
    placement: "header-action",
  },
  {
    id: "clients-form",
    path: "/clients",
    target: "clients-form",
    kicker: "Client form",
    title: "Register the client details here",
    description:
      "This panel is where the clinic fills in the client name, phone number, notes, and contact preferences before saving.",
    advanceMode: "button",
    placement: "drawer",
  },
  {
    id: "calendar-nav",
    path: "/clients",
    target: "calendar-nav",
    kicker: "Calendar",
    title: "Now move to Calendar",
    description:
      "Calendar is the booking workspace. This is where the clinic creates appointments and manages the daily schedule.",
    actionLabel: "Next: click Calendar in the sidebar",
    advanceMode: "click",
    placement: "sidebar",
  },
  {
    id: "calendar-create",
    path: "/calendar",
    target: "calendar-create",
    kicker: "Book appointment",
    title: "This button creates a new appointment",
    description:
      "Use this action whenever the clinic needs to book a visit, consultation, or follow-up into the schedule.",
    actionLabel: "Next: click New appointment",
    advanceMode: "click",
    placement: "header-action",
  },
  {
    id: "calendar-form",
    path: "/calendar",
    target: "calendar-form",
    kicker: "Booking form",
    title: "This panel is where bookings are created",
    description:
      "Select the client, choose the staff member, set the date and time, then save the booking from this panel.",
    advanceMode: "button",
    placement: "drawer",
  },
  {
    id: "settings-nav",
    path: "/calendar",
    target: "settings-nav",
    kicker: "Settings",
    title: "Open Settings next",
    description:
      "Settings is where clinic details, staff, reminders, and WhatsApp configuration are managed.",
    actionLabel: "Next: click Settings in the sidebar",
    advanceMode: "click",
    placement: "sidebar",
  },
  {
    id: "settings-whatsapp",
    path: "/settings",
    target: "settings-whatsapp",
    kicker: "Configuration",
    title: "This is where clinic settings are changed",
    description:
      "Use this section to manage the clinic's WhatsApp connection and return later whenever staff, reminder, or clinic settings need to be updated.",
    advanceMode: "button",
    placement: "content",
  },
];

function readTourState(): TourState {
  try {
    const raw = window.localStorage.getItem(TOUR_STORAGE_KEY);
    if (!raw) {
      return initialTourState;
    }

    const parsed = JSON.parse(raw) as Partial<TourState>;

    return {
      active: parsed.active === true,
      currentStepIndex:
        typeof parsed.currentStepIndex === "number" ? parsed.currentStepIndex : 0,
    };
  } catch {
    return initialTourState;
  }
}

function writeTourState(state: TourState) {
  window.localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(state));
}

function clearTourState() {
  writeTourState(initialTourState);
}

function findVisibleTarget(target: string) {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)
  );

  return (
    nodes.find((node) => {
      const styles = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();

      return (
        styles.display !== "none" &&
        styles.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    }) ?? null
  );
}

function toRect(element: HTMLElement): Rect {
  const rect = element.getBoundingClientRect();

  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

export function WorkspaceTour() {
  const pathname = usePathname();
  const router = useRouter();
  const [tourState, setTourState] = useState<TourState>(initialTourState);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);

  const currentStep = tourSteps[tourState.currentStepIndex] ?? null;
  const isOpen = tourState.active && Boolean(currentStep);
  const isOnExpectedPath = Boolean(currentStep && pathname === currentStep.path);
  const shouldRender = isOpen && Boolean(currentStep) && isOnExpectedPath;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = readTourState();

      if (saved.active) {
        setTourState(saved);
        return;
      }

      if (pathname === "/dashboard") {
        const nextState = { active: true, currentStepIndex: 0 };
        writeTourState(nextState);
        setTourState(nextState);
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  useEffect(() => {
    if (!isOpen || !currentStep) {
      return;
    }

    let activeTarget: HTMLElement | null = null;
    let clickHandler: (() => void) | null = null;

    const removeTargetEnhancements = () => {
      if (!activeTarget) {
        return;
      }

      activeTarget.classList.remove(...ACTIVE_TARGET_CLASSES);

      if (clickHandler) {
        activeTarget.removeEventListener("click", clickHandler);
      }

      clickHandler = null;
      activeTarget = null;
    };

    const applyTargetEnhancements = (target: HTMLElement) => {
      activeTarget = target;
      activeTarget.classList.add(...ACTIVE_TARGET_CLASSES);

      if (currentStep.advanceMode === "click") {
        clickHandler = () => {
          window.requestAnimationFrame(() => {
            const nextState = {
              active: true,
              currentStepIndex: Math.min(
                tourState.currentStepIndex + 1,
                tourSteps.length - 1
              ),
            };

            writeTourState(nextState);
            setTourState(nextState);
          });
        };

        activeTarget.addEventListener("click", clickHandler);
      }
    };

    const syncTarget = () => {
      if (pathname !== currentStep.path) {
        removeTargetEnhancements();
        setTargetRect(null);
        return;
      }

      const nextTarget = findVisibleTarget(currentStep.target);

      if (nextTarget !== activeTarget) {
        removeTargetEnhancements();

        if (nextTarget) {
          applyTargetEnhancements(nextTarget);
          nextTarget.scrollIntoView({
            block: "center",
            inline: "nearest",
            behavior: "smooth",
          });
        }
      }

      setTargetRect(nextTarget ? toRect(nextTarget) : null);
    };

    const updateRect = () => {
      if (!activeTarget) {
        setTargetRect(null);
        return;
      }

      setTargetRect(toRect(activeTarget));
    };

    const observer = new MutationObserver(syncTarget);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-state"],
    });

    syncTarget();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    return () => {
      observer.disconnect();
      removeTargetEnhancements();
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [currentStep, isOpen, pathname, tourState.currentStepIndex]);

  const coachmarkStyle = useMemo(() => {
    if (!currentStep || typeof window === "undefined") {
      return null;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const cardWidth = Math.min(420, viewportWidth - 32);
    const cardHeightGuess = 290;

    if (viewportWidth < 1024) {
      return {
        left: 16,
        right: 16,
        bottom: 16,
        width: "auto",
      };
    }

    const clampTop = (value: number) =>
      Math.max(88, Math.min(value, viewportHeight - cardHeightGuess - 24));
    const clampLeft = (value: number) =>
      Math.max(24, Math.min(value, viewportWidth - cardWidth - 24));

    if (!targetRect) {
      if (currentStep.placement === "sidebar") {
        return {
          top: 124,
          left: Math.min(324, viewportWidth - cardWidth - 24),
          width: cardWidth,
        };
      }

      if (currentStep.placement === "header-action") {
        return {
          top: 132,
          left: Math.max(24, viewportWidth - cardWidth - 36),
          width: cardWidth,
        };
      }

      if (currentStep.placement === "drawer") {
        return {
          top: 116,
          left: Math.max(24, Math.min(viewportWidth - cardWidth - 500, viewportWidth - cardWidth - 24)),
          width: cardWidth,
        };
      }

      return {
        top: 132,
        left: Math.max(24, viewportWidth - cardWidth - 40),
        width: cardWidth,
      };
    }

    if (currentStep.placement === "sidebar") {
      return {
        top: clampTop(targetRect.top + targetRect.height / 2 - 120),
        left: clampLeft(targetRect.left + targetRect.width + 28),
        width: cardWidth,
      };
    }

    if (currentStep.placement === "header-action") {
      return {
        top: clampTop(targetRect.top + targetRect.height + 20),
        left: clampLeft(targetRect.left + targetRect.width - cardWidth),
        width: cardWidth,
      };
    }

    if (currentStep.placement === "drawer") {
      const shouldPlaceLeft = targetRect.left > viewportWidth / 2;

      return {
        top: clampTop(targetRect.top + 12),
        left: shouldPlaceLeft
          ? clampLeft(targetRect.left - cardWidth - 22)
          : clampLeft(targetRect.left + targetRect.width + 22),
        width: cardWidth,
      };
    }

    return {
      top: clampTop(targetRect.top + 18),
      left: clampLeft(targetRect.left + Math.min(32, targetRect.width * 0.08)),
      width: cardWidth,
    };
  }, [currentStep, targetRect]);

  function finishTour() {
    clearTourState();
    setTargetRect(null);
    setTourState(initialTourState);
  }

  function setStep(stepIndex: number) {
    const nextStep = tourSteps[stepIndex];
    const nextState = {
      active: true,
      currentStepIndex: stepIndex,
    };

    writeTourState(nextState);
    setTourState(nextState);

    if (nextStep && pathname !== nextStep.path) {
      router.push(nextStep.path);
    }
  }

  function handleNext() {
    if (!currentStep) {
      return;
    }

    if (tourState.currentStepIndex === tourSteps.length - 1) {
      finishTour();
      return;
    }

    setStep(tourState.currentStepIndex + 1);
  }

  function handleBack() {
    if (tourState.currentStepIndex === 0) {
      return;
    }

    setStep(tourState.currentStepIndex - 1);
  }

  if (!shouldRender || !currentStep || !coachmarkStyle) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]">
      <div className="pointer-events-auto absolute" style={coachmarkStyle}>
        <div className="rounded-[1.45rem] border border-border/80 bg-white/98 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.14)] backdrop-blur-sm md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                <Sparkles className="size-3.5" />
                {currentStep.kicker}
              </div>
              <div className="space-y-2">
                <p className="text-[1.35rem] font-semibold tracking-tight text-foreground">
                  {currentStep.title}
                </p>
                <p className="text-sm leading-7 text-muted-foreground">
                  {currentStep.description}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={finishTour}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border/80 bg-white text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Close tour"
            >
              <X className="size-4" />
            </button>
          </div>

          {currentStep.actionLabel ? (
            <div className="mt-5 rounded-[1rem] border border-border/80 bg-slate-50 px-4 py-3">
              <p className="text-sm font-medium text-foreground">
                {currentStep.actionLabel}
              </p>
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {tourSteps.map((tourStep, index) => (
                <span
                  key={tourStep.id}
                  className={cn(
                    "h-2 rounded-full transition-all duration-300",
                    index === tourState.currentStepIndex
                      ? "w-9 bg-primary"
                      : "w-2 bg-slate-300"
                  )}
                />
              ))}
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {tourState.currentStepIndex + 1}/{tourSteps.length}
            </p>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                className="rounded-[0.95rem] px-0 text-muted-foreground hover:bg-transparent"
                onClick={handleBack}
                disabled={tourState.currentStepIndex === 0}
              >
                <ArrowLeft data-icon="inline-start" />
                Back
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-[0.95rem] px-0 text-muted-foreground hover:bg-transparent"
                onClick={finishTour}
              >
                Skip
              </Button>
            </div>

            {currentStep.advanceMode === "button" ? (
              <Button
                type="button"
                className="h-11 rounded-[1rem] px-5"
                onClick={handleNext}
              >
                {tourState.currentStepIndex === tourSteps.length - 1
                  ? "Finish tour"
                  : "Next"}
                {tourState.currentStepIndex === tourSteps.length - 1 ? (
                  <CheckCircle2 data-icon="inline-end" />
                ) : (
                  <ArrowRight data-icon="inline-end" />
                )}
              </Button>
            ) : (
              <p className="text-sm font-medium text-muted-foreground">Next</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
