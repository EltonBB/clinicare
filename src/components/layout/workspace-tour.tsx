"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TOUR_STORAGE_KEY = "vela-workspace-tour-complete-v1";
const ACTIVE_TARGET_CLASSES = [
  "relative",
  "z-[81]",
  "rounded-[1rem]",
  "ring-2",
  "ring-white",
  "shadow-[0_0_0_12px_rgba(255,255,255,0.08),0_22px_42px_rgba(15,23,42,0.22)]",
  "transition-[box-shadow,ring-color]",
  "duration-300",
];

type TourStep = {
  id: string;
  target: string;
  title: string;
  description: string;
  path?: string;
};

const tourSteps: TourStep[] = [
  {
    id: "dashboard",
    target: "dashboard-overview",
    title: "This is your clinic overview",
    description:
      "Use the dashboard to check today’s schedule, unread client activity, and what still needs attention.",
    path: "/dashboard",
  },
  {
    id: "quick-actions",
    target: "dashboard-quick-actions",
    title: "Start with the main actions",
    description:
      "These shortcuts are the fastest way to add a first client or create the first appointment once the clinic is ready.",
    path: "/dashboard",
  },
  {
    id: "clients",
    target: "clients-nav",
    title: "Clients live here",
    description:
      "Open Clients to add profiles, review history, and keep each phone number tied to the right record.",
  },
  {
    id: "calendar",
    target: "calendar-nav",
    title: "Calendar is where bookings happen",
    description:
      "Use Calendar to schedule appointments, assign staff, and keep the day organized.",
  },
  {
    id: "inbox",
    target: "inbox-nav",
    title: "Inbox handles messaging",
    description:
      "WhatsApp conversations appear here. This is where the clinic replies to clients and turns new chats into real profiles.",
  },
  {
    id: "settings",
    target: "settings-nav",
    title: "Settings controls the clinic setup",
    description:
      "Return to Settings anytime to update clinic details, staff, reminder behavior, and WhatsApp connection state.",
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
  const [isReady, setIsReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);

  const currentStep = tourSteps[currentStepIndex] ?? null;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const completed = window.localStorage.getItem(TOUR_STORAGE_KEY) === "1";
      setIsReady(true);
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
    const frame = window.requestAnimationFrame(() => {
      setTargetRect(toRect(target));
    });
    target.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });

    const updateRect = () => {
      if (!document.body.contains(target)) {
        setTargetRect(null);
        return;
      }

      setTargetRect(toRect(target));
    };

    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    return () => {
      window.cancelAnimationFrame(frame);
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

  const cardStyle = useMemo(() => {
    if (!targetRect) {
      return {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };
    }

    const viewportWidth =
      typeof window === "undefined" ? 1280 : window.innerWidth;
    const viewportHeight =
      typeof window === "undefined" ? 900 : window.innerHeight;
    const cardWidth = Math.min(380, viewportWidth - 32);
    const preferredLeft = targetRect.left + targetRect.width + 20;
    const fitsRight = preferredLeft + cardWidth <= viewportWidth - 16;
    const fitsBelow = targetRect.top + targetRect.height + 220 <= viewportHeight - 16;

    const left = fitsRight
      ? preferredLeft
      : Math.max(16, Math.min(targetRect.left, viewportWidth - cardWidth - 16));

    const top = fitsRight
      ? Math.max(16, Math.min(targetRect.top, viewportHeight - 220))
      : fitsBelow
        ? targetRect.top + targetRect.height + 18
        : Math.max(16, targetRect.top - 210);

    return {
      top,
      left,
      width: cardWidth,
    };
  }, [targetRect]);

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

  if (!isReady || !isOpen || !currentStep) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(17,24,39,0.45),rgba(15,23,42,0.72))]" />

      {targetRect ? (
        <div
          className="absolute rounded-[1.15rem] border border-white/80 bg-white/6 shadow-[0_0_0_9999px_rgba(15,23,42,0.58)] transition-all duration-300"
          style={{
            top: targetRect.top - 10,
            left: targetRect.left - 10,
            width: targetRect.width + 20,
            height: targetRect.height + 20,
          }}
        />
      ) : null}

      <div
        className={cn(
          "pointer-events-auto absolute rounded-[1.4rem] border border-white/18 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,250,252,0.94))] p-5 text-foreground shadow-[0_26px_60px_rgba(15,23,42,0.28)] backdrop-blur-xl",
          !targetRect && "max-w-[380px]"
        )}
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="size-3.5" />
              Quick tour
            </div>
            <div className="space-y-2">
              <p className="text-xl font-semibold tracking-tight text-foreground">
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
            className="inline-flex size-9 items-center justify-center rounded-full border border-border/80 bg-white/80 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close tour"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {tourSteps.map((tourStep, index) => (
              <span
                key={tourStep.id}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  index === currentStepIndex
                    ? "w-8 bg-primary"
                    : "w-2 bg-border"
                )}
              />
            ))}
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {currentStepIndex + 1}/{tourSteps.length}
          </p>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              className="rounded-[0.9rem] px-0 text-muted-foreground hover:bg-transparent"
              onClick={handleBack}
              disabled={currentStepIndex === 0}
            >
              <ArrowLeft data-icon="inline-start" />
              Back
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="rounded-[0.9rem] px-0 text-muted-foreground hover:bg-transparent"
              onClick={finishTour}
            >
              Skip
            </Button>
          </div>
          <Button
            type="button"
            className="h-11 rounded-[0.95rem] px-5"
            onClick={handleNext}
          >
            {currentStepIndex === tourSteps.length - 1 ? "Start using Vela" : "Next"}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </div>
    </div>
  );
}
