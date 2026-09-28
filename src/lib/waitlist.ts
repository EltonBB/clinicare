// Waiting-list copy shared by the server actions and the client panel. Lives
// here, not in the "use server" actions file — Next.js only lets that file
// export async functions (a string export throws when the module loads).

// Same phrasing convention as NO_SHOW_PLAN_ERROR (lib/appointments-shared.ts):
// "<feature> is part of the Pro plan."
export const WAITLIST_PLAN_ERROR = "Waiting list is part of the Pro plan.";

export const WAITLIST_TIME_RANGE_ERROR = "Choose a From time earlier than the To time.";

export const WAITLIST_ENTRY_REMOVED_ERROR = "This waiting-list entry was already removed.";

// Also what a client id from another workspace gets — the check is one query.
export const WAITLIST_CLIENT_ERROR = "Choose an active client. Archived and inactive clients can't join the waiting list.";

// Every cancellation reads a clinic's whole waiting list, and the Calendar
// panel renders it, so the list is bounded. Far above what a clinic works
// through; a soft cap (two adds racing can overshoot it by a few).
export const MAX_ACTIVE_WAITLIST_ENTRIES = 500;

export const WAITLIST_FULL_ERROR = "The waiting list is full. Remove an entry before adding another.";

/** Both preferred times set, and From not before To — HH:mm strings compare in time order. */
export function isInvalidPreferredWindow(from?: string | null, to?: string | null) {
  return Boolean(from && to && from >= to);
}
