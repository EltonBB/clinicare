"use client";

import type { ReactNode } from "react";

import { LazyMotionProvider } from "@/components/layout/motion-provider";
import { SiteHeader } from "../site-header";
import { SmoothScrollProvider } from "../motion/smooth-scroll-provider";
import { PageTransition } from "../motion/page-transition";
import { MarketingFooter, type FooterCta } from "./marketing-footer";

/**
 * The marketing chrome shared by every public page: smooth-scroll engine,
 * floating header, per-route page transition, and the footer.
 *
 * Header and footer sit OUTSIDE the PageTransition so they persist across
 * navigations while only the page body crossfades. Pages that close on a call
 * to action pass `footerCta` (or their own closing line) so the ask opens the
 * footer; there is never a separate CTA band.
 */
export function MarketingShell({ children, footerCta = false }: { children: ReactNode; footerCta?: FooterCta }) {
  return (
    <main className="app-shell-bg min-h-screen overflow-x-clip text-foreground">
      <SmoothScrollProvider>
        <LazyMotionProvider>
          <SiteHeader />
          <PageTransition>
            <div className="pt-16">{children}</div>
          </PageTransition>
          <MarketingFooter cta={footerCta} />
        </LazyMotionProvider>
      </SmoothScrollProvider>
    </main>
  );
}
