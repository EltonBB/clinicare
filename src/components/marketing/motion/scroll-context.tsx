"use client";

import { createContext, useContext, type RefObject } from "react";
import type Lenis from "lenis";

export type MarketingScrollValue = {
  /** Ref to the live Lenis instance (null under reduced-motion / touch). Read it
   *  inside handlers/effects — e.g. `lenisRef.current?.stop()`. */
  lenisRef: RefObject<Lenis | null>;
  /** prefers-reduced-motion is on — skip all motion. */
  reduced: boolean;
  /** Coarse pointer (touch) — skip cursor-driven effects + Lenis. */
  coarse: boolean;
};

export const MarketingScrollContext = createContext<MarketingScrollValue>({
  lenisRef: { current: null },
  reduced: false,
  coarse: false,
});

/**
 * Read the marketing scroll context: the Lenis ref (for `.stop()/.start()` and
 * `.scrollTo()`) plus the reduced-motion / touch flags every motion piece
 * branches on. Safe to call anywhere inside the marketing shell.
 */
export function useMarketingScroll() {
  return useContext(MarketingScrollContext);
}
