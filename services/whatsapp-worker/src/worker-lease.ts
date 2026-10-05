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
 * releases on shutdown (or its lease runs out), then keeps renewing; if it
 * can't show it still holds the lease before it would run out, `onLost` fires
 * so it stops before anyone else can take over.
 */
export function createWorkerLease({
  store,
  holder,
  ttlMs,
  renewEveryMs,
  retryEveryMs,
  onLost,
  onError = () => {},
  now = () => new Date(),
}: {
  store: LeaseStore;
  holder: string;
  ttlMs: number;
  renewEveryMs: number;
  retryEveryMs: number;
  onLost: () => void;
  onError?: (error: unknown) => void;
  now?: () => Date;
}): { acquire(): Promise<void>; release(): Promise<void> } {
  let heldUntil = 0;
  let renewTimer: ReturnType<typeof setTimeout> | undefined;
  let released = false;

  async function claim(): Promise<boolean> {
    const at = now();
    const expiresAt = new Date(at.getTime() + ttlMs);
    if (!(await store.claim({ holder, expiresAt, now: at }))) return false;
    heldUntil = expiresAt.getTime();
    return true;
  }

  function scheduleRenew(): void {
    renewTimer = setTimeout(async () => {
      if (released) return;
      let held: boolean;
      try {
        held = await claim();
      } catch (error) {
        onError(error);
        // Can't tell whether it was renewed. Keep trying only while the next
        // attempt still lands before the lease could run out.
        held = now().getTime() + renewEveryMs < heldUntil;
      }
      if (released) return;
      if (held) {
        scheduleRenew();
      } else {
        onLost();
      }
    }, renewEveryMs);
  }

  return {
    async acquire() {
      for (;;) {
        try {
          if (await claim()) break;
        } catch (error) {
          onError(error);
        }
        await new Promise((resolve) => setTimeout(resolve, retryEveryMs));
      }
      scheduleRenew();
    },

    async release() {
      released = true;
      clearTimeout(renewTimer);
      await store.release(holder);
    },
  };
}
