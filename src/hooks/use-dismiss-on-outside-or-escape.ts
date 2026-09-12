"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Closes an anchored popover/combobox on an outside pointerdown or Escape.
 * Keeps `onDismiss` reachable from the DOM listeners without putting an
 * unstable inline callback in the effect's own dependency array (which would
 * tear down and re-attach the listeners on every render).
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

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        onDismissRef.current();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismissRef.current();
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
    };
  }, [active, containerRef, dismissOnScroll]);
}
