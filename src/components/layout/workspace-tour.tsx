"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TOUR_STORAGE_KEY = "vela-workspace-tour-complete-v3";
const ACTIVE_TARGET_CLASSES = [
  "relative",
  "z-[81]",
  "rounded-[1rem]",
  "ring-2",
  "ring-primary/85",
  "shadow-[0_0_0_8px_rgba(38,137,135,0.10),0_16px_34px_rgba(15,23,42,0.14)]",
  "transition-[box-shadow,ring-color,transform]",
  "duration-300",
];

type TourStep = {
  id: string;
  target?: string;
  title: string;
  description: string;
  kicker: string;
  actionLabel?: string;
  advanceOnPath?: string;
  showNext?: boolean;
};

const tourSteps: TourStep[] = [
  {
    id: "dashboard",
    target: "dashboard-overview",
    kicker: "Dashboard",
    title: "This is your clinic overview",
    description:
      "Start here to check what is happening today, review unread activity, and get a fast picture of the clinic before you act.",
    showNext: true,
  },
  {
    id: "clients",
    target: "clients-nav",
    kicker: "Clients",
    title: "Click Clients to open your records",
    description:
      "This is where you add new clients, review details, and keep each phone number attached to the right profile.",
    actionLabel: "Click Clients in the sidebar",
    advanceOnPath: "/clients",
  },
  {
    id: "calendar",
    target: "calendar-nav",
    kicker: "Calendar",
    title: "Click Calendar to manage bookings",
    description:
      "Use Calendar to create appointments, assign staff, and keep the clinic schedule organized.",
    actionLabel: "Click Calendar in the sidebar",
    advanceOnPath: "/calendar",
  },
  {
    id: "inbox",
    target: "inbox-nav",
    kicker: "Inbox",
    title: "Click Inbox to handle messages",
    description:
      "WhatsApp conversations arrive here. Staff reply here, and new chats can be turned into real client records.",
    actionLabel: "Click Inbox in the sidebar",
    advanceOnPath: "/inbox",
  },
  {
    id: "settings",
    target: "settings-nav",
    kicker: "Settings",
    title: "Click Settings to update clinic setup",
    description:
      "This is where you change clinic details, staff, reminder behavior, and WhatsApp connection settings later.",
    actionLabel: "Click Settings in the sidebar",
    advanceOnPath: "/settings",
  },
  {
    id: "finish",
    kicker: "Ready",
    title: "You know where the essentials are",
    description:
      "The fastest next move is usually adding the first real client, then creating the first appointment from Calendar.",
    showNext: true,
  },
];

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

export function WorkspaceTour() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const currentStep = tourSteps[currentStepIndex] ?? null;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const completed = window.localStorage.getItem(TOUR_STORAGE_KEY) === "1";
      setIsOpen(!completed && pathname === "/dashboard");
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  useEffect(() => {
    if (!isOpen || !currentStep?.advanceOnPath) {
      return;
    }

    if (pathname !== currentStep.advanceOnPath) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setCurrentStepIndex((index) =>
        Math.min(index + 1, tourSteps.length - 1)
      );
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [currentStep?.advanceOnPath, isOpen, pathname]);

  useEffect(() => {
    if (!isOpen || !currentStep?.target) {
      return;
    }

    const target = findVisibleTarget(currentStep.target);

    if (!target) {
      return;
    }

    target.classList.add(...ACTIVE_TARGET_CLASSES);
    target.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });

    return () => {
      target.classList.remove(...ACTIVE_TARGET_CLASSES);
    };
  }, [currentStep?.target, isOpen, pathname]);

  function finishTour() {
    window.localStorage.setItem(TOUR_STORAGE_KEY, "1");
    setIsOpen(false);
  }

  function handleNext() {
    if (!currentStep) {
      return;
    }

    if (currentStepIndex === tourSteps.length - 1) {
      finishTour();
      return;
    }

    setCurrentStepIndex((index) => index + 1);
  }

  function handleBack() {
    setCurrentStepIndex((index) => Math.max(index - 1, 0));
  }

  if (!isOpen || !currentStep) {
    return null;
  }

  const isActionStep = Boolean(currentStep.advanceOnPath);

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]">
      <div className="pointer-events-auto absolute bottom-4 right-4 left-4 flex justify-center md:bottom-6 md:left-auto md:right-6 md:justify-end">
        <div className="w-full max-w-[430px] rounded-[1.55rem] border border-border/80 bg-white/96 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.16)] backdrop-blur-md md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
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

          <div className="mt-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {tourSteps.map((tourStep, index) => (
                <span
                  key={tourStep.id}
                  className={cn(
                    "h-2 rounded-full transition-all duration-300",
                    index === currentStepIndex
                      ? "w-9 bg-primary"
                      : "w-2 bg-slate-300"
                  )}
                />
              ))}
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {currentStepIndex + 1}/{tourSteps.length}
            </p>
          </div>

          <div className="mt-5 rounded-[1.05rem] border border-border/80 bg-slate-50/90 px-4 py-3">
            <p className="text-sm font-medium text-foreground">
              {isActionStep
                ? currentStep.actionLabel
                : "Continue when you are ready for the next part of the workspace."}
            </p>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                className="rounded-[0.95rem] px-0 text-muted-foreground hover:bg-transparent"
                onClick={handleBack}
                disabled={currentStepIndex === 0}
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
            {currentStep.showNext ? (
              <Button
                type="button"
                className="h-11 rounded-[1rem] px-5"
                onClick={handleNext}
              >
                {currentStepIndex === tourSteps.length - 1 ? "Finish tour" : "Continue"}
                {currentStepIndex === tourSteps.length - 1 ? (
                  <CheckCircle2 data-icon="inline-end" />
                ) : (
                  <ArrowRight data-icon="inline-end" />
                )}
              </Button>
            ) : (
              <div className="rounded-full bg-primary/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Waiting for click
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
