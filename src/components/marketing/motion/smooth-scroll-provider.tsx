"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

import { MarketingScrollContext } from "./scroll-context";
import { useMediaQuery } from "./use-media-query";

/**
 * Marketing-only smooth-scroll + GSAP engine.
 *
 * Owns a single Lenis instance and drives ScrollTrigger from one gsap.ticker
 * loop, so scrubbed scroll animations stay in sync with the smoothed scroll
 * position. Exposes the instance (ref) + motion flags via context so sections
 * can pause scroll (mobile menu) or skip work. Disabled entirely under
 * prefers-reduced-motion or coarse pointer (touch keeps native momentum).
 *
 * The marketing shell does NOT unmount between marketing routes, so Lenis is a
 * true singleton for the visit; per-route re-measuring happens in the pathname
 * effect, and per-section pins clean themselves up via useScrollScene.
 */
export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);
  const pathname = usePathname();
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const coarse = useMediaQuery("(pointer: coarse)");

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    // Native scroll for reduced-motion or touch — no Lenis, no scrub.
    if (reduced || coarse) return;

    const lenis = new Lenis({ duration: 1.1, smoothWheel: true, syncTouch: false });
    lenisRef.current = lenis;

    lenis.on("scroll", ScrollTrigger.update);
    const onTick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(onTick);
    gsap.ticker.lagSmoothing(0);

    // Triggers compute pixel offsets at creation; re-measure after first paint
    // and once the brand font swaps, so pins line up.
    const raf = requestAnimationFrame(() => ScrollTrigger.refresh());
    const onFonts = () => ScrollTrigger.refresh();
    document.fonts?.ready?.then(onFonts).catch(() => {});

    return () => {
      cancelAnimationFrame(raf);
      gsap.ticker.remove(onTick);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [reduced, coarse]);

  // Intra-marketing navigation: reset to top + re-measure the new page.
  useEffect(() => {
    const lenis = lenisRef.current;
    const raf = requestAnimationFrame(() => {
      lenis?.scrollTo(0, { immediate: true });
      lenis?.resize();
      ScrollTrigger.refresh();
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  const value = useMemo(() => ({ lenisRef, reduced, coarse }), [reduced, coarse]);

  return <MarketingScrollContext.Provider value={value}>{children}</MarketingScrollContext.Provider>;
}
