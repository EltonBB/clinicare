"use client";

import { createContext, useContext } from "react";

type WorkspaceLiveValue = {
  /** Live unread-conversation count, polled once by the app shell. */
  unreadCount: number;
  /**
   * False until the first notifications poll resolves. The shell seeds
   * `unreadCount` at 0, so consumers must keep their own server-rendered value
   * until this flips true — otherwise the count flashes a stale 0 on load.
   */
  initialized: boolean;
};

const WorkspaceLiveContext = createContext<WorkspaceLiveValue | null>(null);

export const WorkspaceLiveProvider = WorkspaceLiveContext.Provider;

/**
 * Reads the app shell's live unread count. Falls back to the server-rendered
 * value when used outside the provider (e.g. in isolation/tests) OR before the
 * first poll has resolved, so the count never renders a stale 0 on initial load
 * and callers never need their own poller.
 */
export function useWorkspaceUnreadCount(fallback: number) {
  const context = useContext(WorkspaceLiveContext);
  return context && context.initialized ? context.unreadCount : fallback;
}
