"use client";

import { createContext, useContext } from "react";

import type { DashboardConversationPreview } from "@/lib/dashboard";

type WorkspaceLiveValue = {
  /** Live unread-conversation count, polled once by the app shell. */
  unreadCount: number;
  /**
   * Recent conversation previews from the same poll, so the dashboard Messages
   * card refreshes incoming replies live instead of waiting for a reload.
   */
  conversationPreviews: DashboardConversationPreview[];
  /**
   * False until the first notifications poll resolves. The shell seeds the live
   * values empty, so consumers must keep their own server-rendered values until
   * this flips true — otherwise the count flashes a stale 0 / empty list on load.
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

/**
 * Reads the app shell's live conversation previews. Falls back to the
 * server-rendered list outside the provider or before the first poll resolves,
 * so the dashboard Messages card never flashes an empty list on initial load.
 */
export function useWorkspaceConversationPreviews(
  fallback: DashboardConversationPreview[],
) {
  const context = useContext(WorkspaceLiveContext);
  return context && context.initialized ? context.conversationPreviews : fallback;
}
