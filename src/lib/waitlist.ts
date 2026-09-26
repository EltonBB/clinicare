// Waiting-list copy shared by the server actions and the client panel. Lives
// here, not in the "use server" actions file — Next.js only lets that file
// export async functions (a string export throws when the module loads).

// Same phrasing convention as NO_SHOW_PLAN_ERROR (lib/appointments-shared.ts):
// "<feature> is part of the Pro plan."
export const WAITLIST_PLAN_ERROR = "Waiting list is part of the Pro plan.";

export const WAITLIST_TIME_RANGE_ERROR = "Choose a From time earlier than the To time.";

/** Both preferred times set, and From not before To — HH:mm strings compare in time order. */
export function isInvalidPreferredWindow(from?: string | null, to?: string | null) {
  return Boolean(from && to && from >= to);
}
