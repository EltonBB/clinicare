"use client";

import { m } from "framer-motion";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

// Reduced motion is handled in CSS, not by rendering a plain div: the server
// can't know the setting, so a JS branch rendered different markup in the
// browser (a hydration mismatch). The starting state is overridden instead,
// so the content shows at once, even before the page hydrates.
const STILL = "motion-reduce:opacity-100! motion-reduce:transform-none!";

/** Fade + rise into view once. Shown at once under reduced motion. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  return (
    <m.div
      className={cn(className, STILL)}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </m.div>
  );
}

/** Parent that staggers any RevealItem descendants as the group scrolls in. */
export function RevealGroup({
  children,
  className,
  stagger = 0.08,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
}) {
  return (
    <m.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </m.div>
  );
}

export function RevealItem({
  children,
  className,
  y = 24,
}: {
  children: ReactNode;
  className?: string;
  y?: number;
}) {
  return (
    <m.div
      className={cn(className, STILL)}
      variants={{ hidden: { opacity: 0, y }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } }}
    >
      {children}
    </m.div>
  );
}
