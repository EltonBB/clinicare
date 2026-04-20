"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TOUR_STORAGE_KEY = "vela-workspace-tour-complete-v2";
const ACTIVE_TARGET_CLASSES = [
  "relative",
  "z-[81]",
  "rounded-[1rem]",
  "ring-2",
  "ring-white/90",
  "shadow-[0_0_0_10px_rgba(255,255,255,0.08),0_24px_44px_rgba(15,23,42,0.22)]",
  "transition-[box-shadow,ring-color,transform]",
  "duration-300",
];

type TourStep = {
  id: string;
  target: string;
  title: string;
  description: string;
  kicker: string;
  path?: string;
};

const tourSteps: TourStep[] = [
  {
    id: "dashboard",
    target: "dashboard-overview",
    kicker: "Overview",
    title: "This is your clinic overview",
    description:
      "Start here to check today’s schedule, unread client activity, and anything that still needs attention.",
    path: "/dashboard",
  },
  {
    id: "quick-actions",
    target: "dashboard-quick-actions",
    kicker: "Shortcuts",
    title: "These are the fastest actions",
    description:
      "Use these shortcuts to add a first client, create an appointment, or move into the next task without hunting through the app.",
    path: "/dashboard",
  },
  {
    id: "clients",
    target: "clients-nav",
    kicker: "Clients",
    title: "Clients live here",
    description:
      "Open Clients to create profiles, track notes, and keep each phone number attached to the right person.",
  },
  {
    id: "calendar",
    target: "calendar-nav",
    kicker: "Calendar",
    title: "Bookings happen in Calendar",
    description:
      "Use Calendar to create appointments, assign staff, and keep the day structured.",
  },
  {
    id: "inbox",
    target: "inbox-nav",
    kicker: "Inbox",
    title: "Messages appear in Inbox",
    description:
      "This is where WhatsApp conversations arrive, where staff reply, and where new chats turn into real client records.",
  },
  {
    id: "settings",
    target: "settings-nav",
    kicker: "Settings",
    title: "Settings controls the clinic setup",
    description:
      "Return here anytime to update clinic details, staff, reminder behavior, and WhatsApp connection state.",
  },
];

type Rect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function isVisible(element: HTMLElement) {
  const styles = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  return (
    styles.display !== "none" &&
    styles.visibility !== "hidden" &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function findVisibleTarget(target: string) {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)
  );

  return nodes.find((node) => isVisible(node)) ?? null;
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
  const [isOpen, setIsOpen] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);

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
    if (!isOpen || !currentStep) {
      return;
    }

    if (currentStep.path && pathname !== currentStep.path) {
      router.push(currentStep.path);
      return;
    }

    const target = findVisibleTarget(currentStep.target);

    if (!target) {
      const frame = window.requestAnimationFrame(() => {
        setTargetRect(null);
      });

      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    target.classList.add(...ACTIVE_TARGET_CLASSES);

    const updateRect = () => {
      if (!document.body.contains(target)) {
        setTargetRect(null);
        return;
      }

      setTargetRect(toRect(target));
    };

    updateRect();
    target.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });

    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    return () => {
      target.classList.remove(...ACTIVE_TARGET_CLASSES);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [currentStep, isOpen, pathname, router]);

  useEffect(() => {
    if (!isOpen) {
      document.body.style.removeProperty("overflow");
      return;
    }

    document.body.style.setProperty("overflow", "hidden");

    return () => {
      document.body.style.removeProperty("overflow");
    };
  }, [isOpen]);

  function finishTour() {
    window.localStorage.setItem(TOUR_STORAGE_KEY, "1");
    setIsOpen(false);
  }

  function handleNext() {
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

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,18,31,0.54),rgba(12,18,31,0.68))]" />

      {targetRect ? (
        <>
          <div
            className="absolute rounded-[1.2rem] border border-white/85 bg-white/5 shadow-[0_0_0_9999px_rgba(12,18,31,0.55)] transition-all duration-300"
            style={{
              top: targetRect.top - 10,
              left: targetRect.left - 10,
              width: targetRect.width + 20,
              height: targetRect.height + 20,
            }}
          />
          <div
            className="pointer-events-none absolute hidden rounded-full border border-white/20 bg-[rgba(255,255,255,0.12)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/92 shadow-[0_12px_24px_rgba(15,23,42,0.16)] md:block"
            style={{
              top: Math.max(18, targetRect.top - 46),
              left: targetRect.left,
            }}
          >
            {currentStep.kicker}
          </div>
        </>
      ) : null}

      <div className="pointer-events-auto absolute inset-x-4 bottom-4 flex justify-center md:inset-x-auto md:bottom-6 md:right-6 md:justify-end">
        <div className="w-full max-w-[420px] rounded-[1.55rem] border border-white/18 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,250,252,0.95))] p-5 shadow-[0_30px_70px_rgba(15,23,42,0.3)] backdrop-blur-xl md:p-6">
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
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border/80 bg-white/78 text-muted-foreground transition-colors hover:bg-white hover:text-foreground"
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
            <Button
              type="button"
              className="h-11 rounded-[1rem] px-5"
              onClick={handleNext}
            >
              {currentStepIndex === tourSteps.length - 1 ? "Finish tour" : "Next"}
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
