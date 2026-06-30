"use client";

import { useSyncExternalStore } from "react";

/**
 * SSR-safe media-query subscription: returns `false` on the server and on the
 * first client render (so hydration matches), then updates after mount and on
 * every change. Shared by the smooth-scroll provider and the product showcase.
 */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
