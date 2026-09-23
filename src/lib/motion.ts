import type { Variants } from "framer-motion";

// Vela workspace motion vocabulary — calm, sub-200ms, strong ease-out, no bounce.
// Marketing surfaces may use bolder variants; the workspace uses only these.

export const easeOutQuart = [0.23, 1, 0.32, 1] as const;

// Matches globals.css's --ease-out-expo / the .bar-grow entrance timing
// (--duration-entrance + 120ms = 600ms) — the app's one "load bar fills in"
// motion signature. A framer-motion bar (retarget-aware, e.g. Reports' staff
// list) and a CSS-only bar (no retarget to react to, e.g. the Staff
// directory) use different mechanisms for good reasons, but should still
// read as the same gesture rather than two different speeds/curves for the
// same visual metaphor.
export const easeOutExpo = [0.16, 1, 0.3, 1] as const;
export const durationEntrance = 0.6;

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.16, ease: "easeOut" } },
  exit: { opacity: 0, transition: { duration: 0.1, ease: "easeIn" } },
};

export const staggerChildren: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.16, ease: easeOutQuart } },
};
