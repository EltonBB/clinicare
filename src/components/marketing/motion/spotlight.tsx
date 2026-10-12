"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { m, useMotionTemplate, useMotionValue, useSpring } from "framer-motion";

import { cn } from "@/lib/utils";
import { useMarketingScroll } from "./scroll-context";

/**
 * Card surface with a soft cobalt glow that trails the cursor while hovered
 * (spring-smoothed). The glow sits at z -1 inside an isolated stacking
 * context, so it paints over the card's background but under its content.
 * Decorative only: skipped on touch and under reduced motion.
 */
export function Spotlight({ children, className }: { children: ReactNode; className?: string }) {
  const { reduced, coarse } = useMarketingScroll();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 170, damping: 26 });
  const sy = useSpring(y, { stiffness: 170, damping: 26 });
  const glow = useSpring(0, { stiffness: 220, damping: 32 });
  const background = useMotionTemplate`radial-gradient(440px circle at ${sx}px ${sy}px, rgba(10, 34, 255, 0.34), transparent 70%)`;
  const interactive = !reduced && !coarse;

  function track(event: ReactPointerEvent<HTMLDivElement>, jump: boolean) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    x.set(px);
    y.set(py);
    // Start the glow under the cursor instead of springing in from a corner.
    if (jump) {
      sx.jump(px);
      sy.jump(py);
    }
  }

  return (
    <div
      className={cn("relative isolate overflow-hidden", className)}
      onPointerEnter={
        interactive
          ? (event) => {
              track(event, true);
              glow.set(1);
            }
          : undefined
      }
      onPointerMove={interactive ? (event) => track(event, false) : undefined}
      onPointerLeave={interactive ? () => glow.set(0) : undefined}
    >
      {interactive ? <m.div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={{ background, opacity: glow }} /> : null}
      {children}
    </div>
  );
}
