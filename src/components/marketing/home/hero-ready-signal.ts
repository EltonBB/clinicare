/**
 * Race-safe handshake between the hero visual and the landing splash.
 *
 * The 3D hero mounts from a lazy chunk *after* hydration, so the splash may
 * subscribe before or after the hero settles — a fire-and-forget event could be
 * missed in either order. A module-level latch fixes that: `whenHeroReady`
 * resolves immediately if the hero has already settled, otherwise it waits.
 *
 * "Settled" means the hero is visually final: either the 3D mark drew its first
 * frame, or the capability check decided the static brand mesh is the hero
 * (reduced-motion / coarse pointer / no WebGL). Either way the splash can lift
 * without a logo popping in behind it.
 */

let settled = false;
const waiters = new Set<() => void>();

/** Mark the hero visual as final. Idempotent — only the first call has effect. */
export function markHeroReady() {
  if (settled) return;
  settled = true;
  for (const notify of waiters) notify();
  waiters.clear();
}

/**
 * Run `notify` once the hero is settled — synchronously if it already is.
 * Returns an unsubscribe so a still-waiting caller can detach on unmount.
 */
export function whenHeroReady(notify: () => void) {
  if (settled) {
    notify();
    return () => {};
  }
  waiters.add(notify);
  return () => {
    waiters.delete(notify);
  };
}
