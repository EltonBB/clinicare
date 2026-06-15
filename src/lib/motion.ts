import type { Variants } from "framer-motion";

// Vela workspace motion vocabulary — calm, sub-200ms, strong ease-out, no bounce.
// Marketing surfaces may use bolder variants; the workspace uses only these.

export const easeOutQuart = [0.23, 1, 0.32, 1] as const;

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
