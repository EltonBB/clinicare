"use client";

import { domAnimation, LazyMotion, MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Loads only framer-motion's DOM animation feature set (~half the full runtime)
 * and exposes it to descendant `m.*` components. Wrap any workspace subtree that
 * animates with `m` in this provider instead of importing the full `motion`.
 *
 * `reducedMotion="user"` respects the OS-level prefers-reduced-motion setting
 * for every `m.*` consumer of this provider (DESIGN.md: "every animation has
 * a prefers-reduced-motion fallback... non-negotiable") — the CSS-class-based
 * fallbacks elsewhere in the app don't cover these JS-driven variants.
 */
export function LazyMotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation}>{children}</LazyMotion>
    </MotionConfig>
  );
}
