"use client";

import { createContext, useContext } from "react";

type WorkspaceLiveValue = {
  /** Live unread-conversation count, polled once by the app shell. */
  unreadCount: number;
};

const WorkspaceLiveContext = createContext<WorkspaceLiveValue | null>(null);

export const WorkspaceLiveProvider = WorkspaceLiveContext.Provider;

/**
 * Reads the app shell's live unread count. Falls back to the server-rendered
 * value when used outside the provider (e.g. in isolation/tests), so callers
 * never need their own poller.
 */
export function useWorkspaceUnreadCount(fallback: number) {
  const context = useContext(WorkspaceLiveContext);
  return context ? context.unreadCount : fallback;
}
