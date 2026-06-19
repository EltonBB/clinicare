"use client";

import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * Branded page transition. Each marketing navigation replays a quick crossfade
 * on the incoming page (keyed on pathname). React's <ViewTransition> isn't in
 * this React build, so this framer enter-transition is the robust equivalent.
 *
 * Opacity-only by design: a transform on this wrapper would sit on an ancestor
 * of pinned ScrollTrigger sections and throw off their measurements. Section
 * reveals handle the y-rise; the page itself just fades. No-op under reduced
 * motion.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  if (reduce) return <>{children}</>;

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
