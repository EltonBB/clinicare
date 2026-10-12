"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Closes an anchored popover/combobox on an outside pointerdown or Escape,
 * traps Tab focus inside it while open, and restores focus to whatever was
 * focused before it opened (typically its trigger button) once it closes —
 * the same baseline a modal Dialog gets for free, needed here because these
 * hand-rolled popovers don't render through Dialog/DialogContent (Codex).
 */
export function useDismissOnOutsideOrEscape(
  containerRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  options?: { active?: boolean; dismissOnScroll?: boolean }
) {
  const { active = true, dismissOnScroll = false } = options ?? {};
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (!active) {
      return;
    }

    // Captured once at setup, not re-read as containerRef.current in the
    // pointerdown/keydown handlers or cleanup below — this popover's
    // container doesn't change identity while it's open, and reading the
    // ref live in the cleanup specifically risks it already being null by
    // then if the container unmounts in the same pass as this effect's
    // teardown (react-hooks/exhaustive-deps).
    const container = containerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const onPointerDown = (event: PointerEvent) => {
      if (!container?.contains(event.target as Node)) {
        onDismissRef.current();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismissRef.current();
        return;
      }

      if (event.key === "Tab") {
        if (!container) return;
        const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
          (element) => element.offsetParent !== null
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const activeElement = document.activeElement as HTMLElement | null;
        const activeIsInside = Boolean(activeElement && container.contains(activeElement));

        if (!activeIsInside) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const onScroll = () => onDismissRef.current();

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    if (dismissOnScroll) {
      window.addEventListener("scroll", onScroll, true);
    }

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      if (dismissOnScroll) {
        window.removeEventListener("scroll", onScroll, true);
      }
      // Only reclaim focus if it's still where this popover left it — a
      // dismiss triggered by clicking a different focusable element (e.g.
      // another trigger) already moved focus somewhere intentional, and
      // yanking it back to the old trigger would fight that.
      if (
        previouslyFocused &&
        document.activeElement &&
        container?.contains(document.activeElement)
      ) {
        previouslyFocused.focus?.();
      }
    };
  }, [active, containerRef, dismissOnScroll]);
}
