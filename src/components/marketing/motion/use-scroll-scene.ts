"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { useMarketingScroll } from "./scroll-context";

type SceneApi = {
  root: HTMLElement;
  gsap: typeof gsap;
  ScrollTrigger: typeof ScrollTrigger;
};

/**
 * Run scroll-driven GSAP animations scoped to one section. Every tween/trigger
 * created inside `setup` lives in a gsap.context bound to the returned ref and
 * is reverted on unmount — so pins never leak across marketing route changes
 * (the shell persists, but each section unmounts). Skipped entirely under
 * reduced-motion or coarse pointer, where content stays fully visible/static.
 *
 * Attach the returned ref to the section's root element. Selectors used inside
 * `setup` (e.g. gsap.to(".item", ...)) are automatically scoped to that root.
 */
export function useScrollScene<T extends HTMLElement = HTMLDivElement>(
  setup: (api: SceneApi) => void,
  deps: unknown[] = [],
) {
  const ref = useRef<T>(null);
  const { reduced, coarse } = useMarketingScroll();

  useEffect(() => {
    const root = ref.current;
    if (!root || reduced || coarse) return;

    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => setup({ root, gsap, ScrollTrigger }), root);
    return () => ctx.revert();
    // setup is intentionally excluded; callers pass `deps` to re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, coarse, ...deps]);

  return ref;
}
