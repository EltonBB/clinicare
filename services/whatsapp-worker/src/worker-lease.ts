import type { PrismaClient } from "@prisma/client";

export type LeaseStore = {
  /** Takes or renews the lease for `holder`; false while another holds it. */
  claim(args: { holder: string; expiresAt: Date; now: Date }): Promise<boolean>;
};

/** The one WhatsAppWorkerLease row (the app's migration creates the table). */
const LEASE_ID = "whatsapp-worker";

export function createPrismaLeaseStore(prisma: Pick<PrismaClient, "whatsAppWorkerLease">): LeaseStore {
  const id = LEASE_ID;
  return {
    async claim({ holder, expiresAt, now }) {
      const created = await prisma.whatsAppWorkerLease.createMany({
        data: [{ id, holder, expiresAt }],
        skipDuplicates: true,
      });
      if (created.count === 1) return true;
      // Ours to renew, or someone else's that ran out (one statement, so two
      // instances can't both take an expired lease).
      const taken = await prisma.whatsAppWorkerLease.updateMany({
        where: { id, OR: [{ holder }, { expiresAt: { lte: now } }] },
        data: { holder, expiresAt },
      });
      return taken.count === 1;
    },
  };
}

/**
 * Lets one worker instance at a time hold the clinics' WhatsApp connections.
 * A deploy starts the new instance while the old one still runs; two sockets
 * on one account knock each other off (WhatsApp's 440, "replaced") and both
 * move its encryption keys on, so the patient's phone can't decrypt what
 * either sends.
 *
 * The lease is never handed over, only left to run out: on shutdown the holder
 * just stops renewing (`stop`), and the process is gone before the lease
 * expires — by its own force-exit (see index.ts), or by `onLost`, whose
 * deadline stays armed after `stop` for exactly that. So the next instance, waiting in {@link acquire},
 * can only connect once nothing of the old one is left running — no list of
 * in-flight work to get exactly right (Codex #134, after several rounds of
 * draining sends, pairings and key writes each turned up another).
 *
 * While running, `onLost` fires `safetyMs` before the lease could run out
 * unless a renewal has moved it on — on a timer of its own, so a database call
 * that stalls can't keep this instance connected past its lease — or as soon
 * as another instance is found holding it. The caller must stop at once.
 */
export function createWorkerLease({
  store,
  holder,
  ttlMs,
  renewEveryMs,
  retryEveryMs,
  safetyMs,
  onLost,
  onError = () => {},
  now = () => new Date(),
}: {
  store: LeaseStore;
  holder: string;
  ttlMs: number;
  renewEveryMs: number;
  retryEveryMs: number;
  safetyMs: number;
  onLost: () => void;
  onError?: (error: unknown) => void;
  now?: () => Date;
}): { acquire(): Promise<void>; /** Stops renewing; the deadline stays armed. */ stop(): void } {
  // Counted from before each claim's call, so a slow call only shortens it.
  let heldUntil = 0;
  let renewTimer: ReturnType<typeof setTimeout> | undefined;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  async function claim(): Promise<boolean> {
    const at = now();
    const expiresAt = new Date(at.getTime() + ttlMs);
    if (!(await store.claim({ holder, expiresAt, now: at }))) return false;
    heldUntil = expiresAt.getTime();
    return true;
  }

  function stopRenewing(): void {
    stopped = true;
    clearTimeout(renewTimer);
  }

  function lose(): void {
    stopRenewing();
    clearTimeout(deadlineTimer);
    onLost();
  }

  function armDeadline(): void {
    clearTimeout(deadlineTimer);
    deadlineTimer = setTimeout(lose, heldUntil - safetyMs - now().getTime());
  }

  function scheduleRenew(): void {
    renewTimer = setTimeout(async () => {
      if (stopped) return;
      let held: boolean | undefined;
      try {
        held = await claim();
      } catch (error) {
        // Unknown whether it was renewed: the deadline stays where it was.
        onError(error);
      }
      if (stopped) return;
      if (held === false) {
        lose();
        return;
      }
      if (held) armDeadline();
      scheduleRenew();
    }, renewEveryMs);
  }

  return {
    async acquire() {
      for (;;) {
        if (stopped) return;
        try {
          // A claim that came back too late to be worth anything is retried.
          if ((await claim()) && heldUntil - safetyMs > now().getTime()) break;
        } catch (error) {
          onError(error);
        }
        await new Promise((resolve) => setTimeout(resolve, retryEveryMs));
      }
      if (stopped) return;
      armDeadline();
      scheduleRenew();
    },

    stop: stopRenewing,
  };
}
