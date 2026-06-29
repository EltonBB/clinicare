"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Branded page transition. Each marketing navigation replays a quick crossfade
 * on the incoming page (keyed on pathname so React remounts the wrapper and the
 * CSS animation re-runs).
 *
 * CSS-driven by design: the old framer-motion wrapper rendered `opacity: 0` into
 * the SSR HTML, so the entire page body stayed invisible until the marketing JS
 * bundle hydrated — the visible "page appears a beat after the header" lag. A CSS
 * animation starts the moment the HTML paints, with no JS dependency. Opacity
 * only — a transform here would sit on an ancestor of pinned ScrollTrigger
 * sections and throw off their measurements. Reduced motion is handled by the
 * `prefers-reduced-motion` rule in globals.css.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="marketing-page-enter">
      {children}
    </div>
  );
}
