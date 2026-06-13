"use client";

import { domAnimation, LazyMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Loads only framer-motion's DOM animation feature set (~half the full runtime)
 * and exposes it to descendant `m.*` components. Wrap any workspace subtree that
 * animates with `m` in this provider instead of importing the full `motion`.
 */
export function LazyMotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}
