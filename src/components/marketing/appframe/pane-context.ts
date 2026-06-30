"use client";

import { createContext, useContext } from "react";

/**
 * Broadcast by <AppPane>: `active` fires once when the pane scrolls in (drives
 * count-ups / chart draws); `visible` tracks live visibility (gates infinite
 * loops so they pause offscreen). The animated atoms read this when they render
 * inside a pane, and fall back to their own scroll observer when standalone.
 */
export type PaneSignal = { active: boolean; visible: boolean };

export const PaneSignalContext = createContext<PaneSignal | null>(null);

/** Pane bodies use these to gate their own entrance/loop animations. They default
 *  to "on" when no provider is present (e.g. a body rendered without a pane). */
export function usePaneActive(): boolean {
  return useContext(PaneSignalContext)?.active ?? true;
}

export function usePaneVisible(): boolean {
  return useContext(PaneSignalContext)?.visible ?? true;
}
