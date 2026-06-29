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

/** Most-recent activity (epoch ms) across a preview list; 0 when empty. */
function latestActivity(previews: DashboardConversationPreview[]) {
  let latest = 0;
  for (const preview of previews) {
    if (preview.lastActivityAt > latest) {
      latest = preview.lastActivityAt;
    }
  }
  return latest;
}

/**
 * Reads the app shell's live conversation previews. Before the provider exists
 * or the first poll resolves, it returns the server-rendered list (no empty
 * flash on load). Afterwards it returns whichever of the poll snapshot vs the
 * fresh server `fallback` reflects more recent activity — the `fallback` is
 * re-rendered on every navigation, so a newly arrived reply carried by the
 * server payload isn't masked by an up-to-one-interval-old poll.
 */
export function useWorkspaceConversationPreviews(
  fallback: DashboardConversationPreview[],
) {
  const context = useContext(WorkspaceLiveContext);
  if (!context || !context.initialized) {
    return fallback;
  }
  return latestActivity(context.conversationPreviews) >= latestActivity(fallback)
    ? context.conversationPreviews
    : fallback;
}
