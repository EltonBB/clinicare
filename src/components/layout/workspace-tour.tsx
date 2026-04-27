"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  LayoutDashboard,
  MessageSquareText,
  Settings2,
  UserRoundCog,
  UsersRound,
  WandSparkles,
  X,
} from "lucide-react";

import { completeWorkspaceTourAction } from "@/app/(workspace)/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TOUR_STORAGE_KEY = "vela-workspace-tour-state-v9";
const ACTIVE_TARGET_CLASSES = [
  "relative",
  "z-[81]",
  "rounded-[1rem]",
  "ring-2",
  "ring-primary/85",
  "shadow-[0_0_0_8px_var(--primary-shadow),0_16px_34px_rgba(15,23,42,0.14)]",
  "transition-[box-shadow,ring-color]",
  "duration-300",
];

type Placement = "sidebar" | "header-action" | "content";

type TourStep = {
  id: string;
  path: string;
  target: string;
  kicker: string;
  title: string;
  description: string;
  points: string[];
  icon: ReactNode;
  actionLabel?: string;
  buttonLabel?: string;
  advanceMode: "button" | "click";
  placement: Placement;
};

type TourState = {
  active: boolean;
  currentStepIndex: number;
  completed: boolean;
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
  completed: false,
};

const tourSteps: TourStep[] = [
  {
    id: "dashboard-sidebar",
    path: "/dashboard",
    target: "sidebar-shell",
    kicker: "Workspace map",
    title: "Start with the sidebar",
    description:
      "This is the clinic's main navigation. Every major part of the workspace is one click away, so the team never has to hunt for core tools.",
    points: [
      "Dashboard gives the daily overview.",
      "Calendar, Clients, Staff, Inbox, Reports, and Settings each have their own workspace.",
      "The current plan and account menu stay at the bottom.",
    ],
    icon: <LayoutDashboard className="size-4" />,
    advanceMode: "button",
    placement: "sidebar",
  },
  {
    id: "dashboard-overview",
    path: "/dashboard",
    target: "dashboard-overview",
    kicker: "Today overview",
    title: "Read the clinic day from here",
    description:
      "The dashboard summarizes what matters right now so a clinic owner can understand the day before opening any detailed page.",
    points: [
      "Today's appointments show the active schedule.",
      "Recent clients and next staff appointment keep follow-up visible.",
      "Analytics gives quick performance signals for Pro workspaces.",
    ],
    icon: <LayoutDashboard className="size-4" />,
    buttonLabel: "Next",
    advanceMode: "button",
    placement: "content",
  },
  {
    id: "dashboard-actions",
    path: "/dashboard",
    target: "dashboard-quick-actions",
    kicker: "Quick actions",
    title: "Use the right-side actions for fast work",
    description:
      "The right panel keeps the most common actions visible without crowding the main dashboard.",
    points: [
      "Book an appointment from anywhere on the dashboard.",
      "Add a new client before scheduling if needed.",
      "Open Inbox when a WhatsApp conversation needs attention.",
    ],
    icon: <WandSparkles className="size-4" />,
    buttonLabel: "Next",
    advanceMode: "button",
    placement: "content",
  },
  {
    id: "dashboard-customize",
    path: "/dashboard",
    target: "dashboard-customize",
    kicker: "Personalize",
    title: "Customize what the dashboard shows",
    description:
      "Every clinic can choose the widgets that match how they work. This keeps the dashboard useful instead of overloaded.",
    points: [
      "Select appointment, client, staff, and analytics widgets.",
      "Changes apply to the dashboard layout.",
      "The right-side quick actions stay available for everyone.",
    ],
    icon: <Settings2 className="size-4" />,
    buttonLabel: "Next",
    advanceMode: "button",
    placement: "header-action",
  },
  {
    id: "calendar-nav",
    path: "/dashboard",
    target: "calendar-nav",
    kicker: "Calendar",
    title: "Calendar manages bookings",
    description:
      "Calendar is where appointments are created and reviewed. Use it to control the clinic schedule and avoid bookings outside operating hours.",
    points: [
      "Create appointments with client search and staff assignment.",
      "Booked visits appear in the weekly calendar.",
      "Completed visits move into client and staff records.",
    ],
    icon: <CalendarDays className="size-4" />,
    buttonLabel: "Go to Calendar",
    advanceMode: "button",
    placement: "sidebar",
  },
  {
    id: "calendar-create",
    path: "/calendar",
    target: "calendar-create",
    kicker: "Appointments",
    title: "Create appointments from here",
    description:
      "The booking drawer connects the client, staff member, service, date, time, status, and notes into one appointment record.",
    points: [
      "Search and select an existing client instead of scanning long dropdowns.",
      "Choose a staff member and time that fits operating hours.",
      "The appointment appears naturally in Dashboard, Calendar, Reports, Staff, and Client history.",
    ],
    icon: <CalendarDays className="size-4" />,
    buttonLabel: "Next",
    advanceMode: "button",
    placement: "header-action",
  },
  {
    id: "clients-nav",
    path: "/calendar",
    target: "clients-nav",
    kicker: "Clients",
    title: "Clients is the relationship hub",
    description:
      "Each client profile keeps the useful context together instead of spreading it across calendar notes and chat messages.",
    points: [
      "Profiles store contact details, status, notes, and preferred channel.",
      "History tracks completed and cancelled appointments.",
      "Gallery keeps uploaded client images and captions attached to the profile.",
    ],
    icon: <UsersRound className="size-4" />,
    buttonLabel: "Go to Clients",
    advanceMode: "button",
    placement: "sidebar",
  },
  {
    id: "clients-create",
    path: "/clients",
    target: "clients-create",
    kicker: "Clients",
    title: "Register clients when needed",
    description:
      "Use the client button when the clinic already knows the person. Unknown WhatsApp conversations can also be converted into clients later.",
    points: [
      "Add basic contact details and notes.",
      "Open the profile to view history, gallery, messages, and details.",
      "Client records can be used immediately when booking appointments.",
    ],
    icon: <UsersRound className="size-4" />,
    buttonLabel: "Next",
    advanceMode: "button",
    placement: "header-action",
  },
  {
    id: "staff-nav",
    path: "/clients",
    target: "staff-nav",
    kicker: "Staff",
    title: "Staff has its own workspace",
    description:
      "Staff should not be hidden inside settings. This page tracks the people doing the work and the appointment records tied to them.",
    points: [
      "Add, update, archive, and filter staff profiles.",
      "Check staff in and out to track weekly hours.",
      "Completed appointments count toward each staff member's monthly record.",
    ],
    icon: <UserRoundCog className="size-4" />,
    buttonLabel: "Go to Staff",
    advanceMode: "button",
    placement: "sidebar",
  },
  {
    id: "inbox-nav",
    path: "/staff",
    target: "inbox-nav",
    kicker: "Inbox",
    title: "Inbox handles WhatsApp conversations",
    description:
      "Inbox is where client messages arrive and where staff replies without leaving Vela.",
    points: [
      "Known client conversations stay linked to their profiles.",
      "Unknown numbers appear as unregistered contacts.",
      "Convert an unknown conversation into a client without losing message history.",
    ],
    icon: <MessageSquareText className="size-4" />,
    buttonLabel: "Go to Inbox",
    advanceMode: "button",
    placement: "sidebar",
  },
  {
    id: "reports-nav",
    path: "/inbox",
    target: "reports-nav",
    kicker: "Reports",
    title: "Reports explain clinic performance",
    description:
      "Reports turns appointments, clients, messages, and operating hours into daily, weekly, and monthly performance insight.",
    points: [
      "Track appointments, completion rate, lost slots, clients, repeat visits, messages, and utilization.",
      "Pro workspaces can refresh AI analysis for the selected period.",
      "Use recommendations to see what the clinic should improve next.",
    ],
    icon: <BarChart3 className="size-4" />,
    buttonLabel: "Go to Reports",
    advanceMode: "button",
    placement: "sidebar",
  },
  {
    id: "settings-nav",
    path: "/reports",
    target: "settings-nav",
    kicker: "Settings",
    title: "Settings controls clinic configuration",
    description:
      "Settings keeps the setup features out of the daily workflow but available when the clinic needs to change configuration.",
    points: [
      "Connect or refresh the clinic WhatsApp number.",
      "Set reminder timing and reminder template.",
      "Update branding, colors, logo, and plan information.",
    ],
    icon: <Settings2 className="size-4" />,
    buttonLabel: "Go to Settings",
    advanceMode: "button",
    placement: "sidebar",
  },
  {
    id: "tour-complete",
    path: "/settings",
    target: "settings-whatsapp",
    kicker: "Ready",
    title: "The workspace is ready to explore",
    description:
      "The main operating loop is now clear: create clients, book appointments, reply in Inbox, review Staff records, and use Reports to improve the clinic.",
    points: [
      "You can come back to Settings when WhatsApp, reminders, or branding need changes.",
      "The tour only appears for first-time users and is saved after completion.",
      "Use the sidebar and dashboard actions to move faster.",
    ],
    icon: <CheckCircle2 className="size-4" />,
    advanceMode: "button",
    placement: "sidebar",
  },
];

function readTourState(storageKey: string): TourState {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return initialTourState;
    }

    const parsed = JSON.parse(raw) as Partial<TourState>;

    return {
      active: parsed.active === true,
      currentStepIndex:
        typeof parsed.currentStepIndex === "number" ? parsed.currentStepIndex : 0,
      completed: parsed.completed === true,
    };
  } catch {
    return initialTourState;
  }
}

function writeTourState(storageKey: string, state: TourState) {
  window.localStorage.setItem(storageKey, JSON.stringify(state));
}

function clearTourState(storageKey: string) {
  writeTourState(storageKey, {
    active: false,
    currentStepIndex: 0,
    completed: true,
  });
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

export function WorkspaceTour({
  initialCompleted = false,
  scopeId = "default",
}: {
  initialCompleted?: boolean;
  scopeId?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const storageKey = `${TOUR_STORAGE_KEY}:${scopeId}`;
  const [tourState, setTourState] = useState<TourState>(initialTourState);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);

  const currentStep = tourSteps[tourState.currentStepIndex] ?? null;
  const isOpen = tourState.active && Boolean(currentStep);
  const isOnExpectedPath = Boolean(currentStep && pathname === currentStep.path);
  const shouldRender = isOpen && Boolean(currentStep) && isOnExpectedPath;
  const isLastStep = tourState.currentStepIndex === tourSteps.length - 1;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = readTourState(storageKey);

      if (initialCompleted) {
        if (!saved.completed) {
          clearTourState(storageKey);
        }
        setTourState({
          active: false,
          currentStepIndex: 0,
          completed: true,
        });
        return;
      }

      if (saved.completed) {
        setTourState(saved);
        return;
      }

      if (saved.active) {
        setTourState(saved);
        return;
      }

      if (pathname === "/dashboard") {
        const nextState = { active: true, currentStepIndex: 0, completed: false };
        writeTourState(storageKey, nextState);
        setTourState(nextState);
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [initialCompleted, pathname, storageKey]);

  useEffect(() => {
    if (!tourState.active || !currentStep || pathname === currentStep.path) {
      return;
    }

    const nextIndexFromCurrent = tourSteps.findIndex(
      (step, index) => index >= tourState.currentStepIndex && step.path === pathname
    );
    const nextIndex =
      nextIndexFromCurrent === -1
        ? tourSteps.findIndex((step) => step.path === pathname)
        : nextIndexFromCurrent;

    if (nextIndex === -1 || nextIndex === tourState.currentStepIndex) {
      return;
    }

    const nextState = {
      active: true,
      currentStepIndex: nextIndex,
      completed: false,
    };

    writeTourState(storageKey, nextState);

    const frame = window.requestAnimationFrame(() => {
      setTourState(nextState);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [currentStep, pathname, storageKey, tourState.active, tourState.currentStepIndex]);

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
              completed: false,
            };

            writeTourState(storageKey, nextState);
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
  }, [currentStep, isOpen, pathname, storageKey, tourState.currentStepIndex]);

  const coachmarkStyle = useMemo(() => {
    if (!currentStep || typeof window === "undefined") {
      return null;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const cardWidth = Math.min(420, viewportWidth - 32);
    const cardHeightGuess = 450;
    const gap = 20;
    const maxHeight = "calc(100vh - 2rem)";

    if (viewportWidth < 1024) {
      return {
        left: 16,
        right: 16,
        bottom: 16,
        width: "auto",
        maxHeight,
      };
    }

    const clampTop = (value: number) =>
      Math.max(24, Math.min(value, viewportHeight - cardHeightGuess - 24));
    const clampLeft = (value: number) =>
      Math.max(24, Math.min(value, viewportWidth - cardWidth - 24));
    const centeredTop = (rect: Rect) =>
      clampTop(rect.top + rect.height / 2 - cardHeightGuess / 2);
    const centeredLeft = (rect: Rect) =>
      clampLeft(rect.left + rect.width / 2 - cardWidth / 2);

    if (!targetRect) {
      if (currentStep.placement === "sidebar") {
        return {
          top: 124,
          left: Math.min(324, viewportWidth - cardWidth - 24),
          width: cardWidth,
          maxHeight,
        };
      }

      if (currentStep.placement === "header-action") {
        return {
          top: 132,
          left: Math.max(24, viewportWidth - cardWidth - 36),
          width: cardWidth,
          maxHeight,
        };
      }

      return {
        top: 132,
        left: Math.max(24, viewportWidth - cardWidth - 40),
        width: cardWidth,
        maxHeight,
      };
    }

    const targetRight = targetRect.left + targetRect.width;
    const targetBottom = targetRect.top + targetRect.height;
    const hasRightSpace = viewportWidth - targetRight >= cardWidth + gap + 24;
    const hasLeftSpace = targetRect.left >= cardWidth + gap + 24;
    const hasBelowSpace = viewportHeight - targetBottom >= cardHeightGuess + gap + 24;
    const hasAboveSpace = targetRect.top >= cardHeightGuess + gap + 24;

    if (currentStep.placement === "sidebar") {
      return {
        top: clampTop(targetRect.top + targetRect.height / 2 - 120),
        left: clampLeft(targetRect.left + targetRect.width + 28),
        width: cardWidth,
        maxHeight,
      };
    }

    if (hasRightSpace) {
      return {
        top: centeredTop(targetRect),
        left: clampLeft(targetRight + gap),
        width: cardWidth,
        maxHeight,
      };
    }

    if (hasLeftSpace) {
      return {
        top: centeredTop(targetRect),
        left: clampLeft(targetRect.left - cardWidth - gap),
        width: cardWidth,
        maxHeight,
      };
    }

    if (hasBelowSpace) {
      return {
        top: clampTop(targetBottom + gap),
        left: centeredLeft(targetRect),
        width: cardWidth,
        maxHeight,
      };
    }

    if (hasAboveSpace) {
      return {
        top: clampTop(targetRect.top - cardHeightGuess - gap),
        left: centeredLeft(targetRect),
        width: cardWidth,
        maxHeight,
      };
    }

    return {
      top: clampTop(viewportHeight - cardHeightGuess - 24),
      left: clampLeft(
        currentStep.placement === "header-action" ? targetRect.left - cardWidth - gap : 24
      ),
      width: cardWidth,
      maxHeight,
    };
  }, [currentStep, targetRect]);

  function finishTour() {
    clearTourState(storageKey);
    setTargetRect(null);
    setTourState({
      active: false,
      currentStepIndex: 0,
      completed: true,
    });
    void completeWorkspaceTourAction();
  }

  function setStep(stepIndex: number) {
    const nextStep = tourSteps[stepIndex];
    const nextState = {
      active: true,
      currentStepIndex: stepIndex,
      completed: false,
    };

    writeTourState(storageKey, nextState);
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
    <div className="pointer-events-none fixed inset-0 z-[90]">
      <div className="pointer-events-auto absolute" style={coachmarkStyle}>
        <div className="tour-coachmark dialog-scroll-body relative overflow-y-auto rounded-[1.45rem] border border-border/80 bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.14)] backdrop-blur-sm md:p-6">
          <div className="tour-orb pointer-events-none absolute -right-6 top-4 size-20 rounded-full bg-primary/10 blur-2xl" />
          <div className="tour-orb pointer-events-none absolute right-16 top-10 size-8 rounded-full bg-primary/10 blur-xl" />
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                {currentStep.icon}
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

          <div className="mt-5 grid gap-2">
            {currentStep.points.map((point) => (
              <div
                key={point}
                className="flex gap-3 rounded-[0.95rem] border border-border/70 bg-slate-50/80 px-3 py-2.5"
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-sm leading-6 text-muted-foreground">{point}</p>
              </div>
            ))}
          </div>

          {isLastStep ? (
            <div className="mt-5 rounded-[1rem] border border-primary/15 bg-primary/5 px-4 py-3">
              <p className="text-sm font-medium text-foreground">
                Congratulations. You have completed the tour and can now explore the workspace features freely.
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
                {isLastStep ? "Done" : currentStep.buttonLabel ?? "Next"}
                <ArrowRight data-icon="inline-end" />
              </Button>
            ) : (
              <Button
                type="button"
                className="h-11 rounded-[1rem] px-5"
                onClick={() => handleNext()}
              >
                {currentStep.buttonLabel ?? "Go to next step"}
                <ArrowRight data-icon="inline-end" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
