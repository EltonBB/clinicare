"use client";

import type { ReactNode } from "react";
import { AnimatePresence, m } from "framer-motion";

import { EASE } from "./ease";

/**
 * Crossfades children when `activeKey` changes. A CSS-grid overlap lets the
 * entering pane fade over the exiting one with no empty gap — `mode="wait"`
 * flashes blank, and `popLayout` needs layout features absent from our
 * LazyMotion `domAnimation` tier. Shared by the home and product showcases.
 */
export function CrossfadePane({
  activeKey,
  durationMs = 280,
  children,
}: {
  activeKey: string;
  durationMs?: number;
  children: ReactNode;
}) {
  return (
    <div className="grid">
      <AnimatePresence initial={false}>
        <m.div
          key={activeKey}
          className="col-start-1 row-start-1 min-w-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: durationMs / 1000, ease: EASE }}
        >
          {children}
        </m.div>
      </AnimatePresence>
    </div>
  );
}
