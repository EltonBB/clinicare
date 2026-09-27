// Waiting-list copy shared by the server actions and their tests. Lives here, not
// in the "use server" actions file — Next.js only lets that file export async
// functions (a string export fails the build and throws when the module loads).

// Same phrasing convention as NO_SHOW_PLAN_ERROR (lib/appointments-shared.ts):
// "<feature> is part of the Pro plan."
export const WAITLIST_PLAN_ERROR = "Waiting list is part of the Pro plan.";
