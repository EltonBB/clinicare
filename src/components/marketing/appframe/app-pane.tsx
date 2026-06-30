"use client";

import { useRef } from "react";
import { useInView, useReducedMotion } from "framer-motion";

import { AppFrame, type AppFrameProps } from "./app-frame";
import { PaneSignalContext } from "./pane-context";

/**
 * Wraps <AppFrame> and owns the reveal trigger: one `useInView` fires `active`
 * (count-ups / chart draws, once) and one tracks `visible` (loops pause
 * offscreen). Children read this via PaneSignalContext so the whole pane animates
 * in sync. Under reduced motion everything renders in its final state.
 */
export function AppPane(props: AppFrameProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const active = useInView(ref, { once: true, amount: 0.35 });
  const visible = useInView(ref, { amount: 0.2 });
  const signal = reduce ? { active: true, visible: false } : { active, visible };

  return (
    <div ref={ref}>
      <PaneSignalContext.Provider value={signal}>
        <AppFrame {...props} />
      </PaneSignalContext.Provider>
    </div>
  );
}
