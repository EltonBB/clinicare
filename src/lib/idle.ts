/** Signed out after this long with no activity in any open workspace tab. */
export const IDLE_SIGN_OUT_MS = 30 * 60_000;
/** How long before that the "Still there?" warning shows. */
export const IDLE_WARNING_MS = 60_000;
/** Last activity, shared by every open tab (localStorage). */
export const LAST_ACTIVITY_KEY = "vela_last_activity";

export type IdleState = "active" | "warning" | "expired";

export function idleState(now: number, lastActivity: number): IdleState {
  const idle = now - lastActivity;
  if (idle >= IDLE_SIGN_OUT_MS) return "expired";
  if (idle >= IDLE_SIGN_OUT_MS - IDLE_WARNING_MS) return "warning";
  return "active";
}

/**
 * Where a newly opened tab starts the clock. Activity recorded after this
 * session signed in that has since run out means an abandoned session was
 * reopened, so it keeps that deadline; anything else (a fresh login, a first
 * visit, activity from before this sign-in) starts now.
 */
export function startingActivity(now: number, shared: number, signedInAt: number): number {
  return shared > signedInAt && idleState(now, shared) === "expired" ? shared : now;
}

/** Whole seconds until sign-out, never below zero. */
export function secondsLeft(now: number, lastActivity: number): number {
  return Math.max(0, Math.ceil((lastActivity + IDLE_SIGN_OUT_MS - now) / 1000));
}
