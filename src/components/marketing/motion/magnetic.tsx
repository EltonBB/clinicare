"use client";

import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { m, useMotionValue, useReducedMotion, useSpring } from "framer-motion";

import { useMarketingScroll } from "./scroll-context";

/**
 * Magnetic wrapper: the element leans toward the cursor while hovered, then
 * springs back on leave. Only this visual wrapper translates a few px — the
 * child (the actual link/button) keeps its real hit area, so clicks stay
 * accurate. Disabled on touch + reduced-motion (renders a plain inline span).
 */
export function Magnetic({
  children,
  className,
  strength = 0.3,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const reduce = useReducedMotion();
  const { coarse } = useMarketingScroll();
  const ref = useRef<HTMLSpanElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 18, mass: 0.4 });

  if (reduce || coarse) {
    return <span className={className}>{children}</span>;
  }

  function handleMove(event: ReactPointerEvent<HTMLSpanElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    x.set((event.clientX - (rect.left + rect.width / 2)) * strength);
    y.set((event.clientY - (rect.top + rect.height / 2)) * strength);
  }

  function handleLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <m.span
      ref={ref}
      className={className}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      style={{ x: sx, y: sy, display: "inline-flex" }}
    >
      {children}
    </m.span>
  );
}
