"use client";

import type { ReactNode } from "react";

import { LazyMotionProvider } from "@/components/layout/motion-provider";
import { SiteHeader } from "../site-header";
import { SmoothScrollProvider } from "../motion/smooth-scroll-provider";
import { PageTransition } from "../motion/page-transition";
import { MarketingFooter } from "./marketing-footer";

/**
 * The marketing chrome shared by every public page: smooth-scroll engine,
 * floating header, per-route page transition, and the dark footer. `overlay`
 * lets a dark-hero page (Home) start with a transparent header over a full-bleed
 * hero; light pages get the solid bar + top padding.
 *
 * Header and footer sit OUTSIDE the PageTransition so they persist across
 * navigations while only the page body crossfades.
 */
export function MarketingShell({
  children,
  overlay = false,
}: {
  children: ReactNode;
  overlay?: boolean;
}) {
  return (
    <main className="app-shell-bg min-h-screen overflow-x-clip text-foreground">
      <SmoothScrollProvider>
        <LazyMotionProvider>
          <SiteHeader overlay={overlay} />
          <PageTransition>
            <div className={overlay ? undefined : "pt-16"}>{children}</div>
          </PageTransition>
          <MarketingFooter />
        </LazyMotionProvider>
      </SmoothScrollProvider>
    </main>
  );
}
