import type { PrismaClient } from "@prisma/client";

export type LeaseStore = {
  /** Takes or renews the lease for `holder`; false while another holds it. */
  claim(args: { holder: string; expiresAt: Date; now: Date }): Promise<boolean>;
  release(holder: string): Promise<void>;
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

    async release(holder) {
      await prisma.whatsAppWorkerLease.deleteMany({ where: { id, holder } });
    },
  };
}

/**
 * Lets one worker instance at a time hold the clinics' WhatsApp connections.
 * A deploy starts the new instance while the old one still runs; two sockets
 * on one account knock each other off (WhatsApp's 440, "replaced") and both
 * move its encryption keys on, so the patient's phone can't decrypt what
 * either sends. The new instance waits in {@link acquire} until the old one
 * releases on shutdown (or its lease runs out), then keeps renewing. `onLost`
 * fires `safetyMs` before the lease could run out unless a renewal has moved it
 * on — on a timer of its own, so a database call that stalls can't keep this
 * instance connected past its lease (Codex #134) — or as soon as another
 * instance is found holding it.
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
}): { acquire(): Promise<void>; release(): Promise<void> } {
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

  function stop(): void {
    stopped = true;
    clearTimeout(renewTimer);
    clearTimeout(deadlineTimer);
  }

  function lose(): void {
    stop();
    onLost();
  }

  function armDeadline(): void {
    clearTimeout(deadlineTimer);
    deadlineTimer = setTimeout(lose, heldUntil - safetyMs - now().getTime());
  }

  function scheduleRenew(): void {
    renewTimer = setTimeout(async () => {
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
        try {
          // A claim that came back too late to be worth anything is retried.
          if ((await claim()) && heldUntil - safetyMs > now().getTime()) break;
        } catch (error) {
          onError(error);
        }
        await new Promise((resolve) => setTimeout(resolve, retryEveryMs));
      }
      armDeadline();
      scheduleRenew();
    },

    async release() {
      stop();
      await store.release(holder);
    },
  };
}
