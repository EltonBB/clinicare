import type { PrismaClient } from "@prisma/client";

import type { SendKeyRecord, SendKeyStore } from "./send-dedupe";

/** Expired records are swept at most this often (each reserve may trigger it). */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * The durable side of send-dedupe: one WhatsAppSendKey row per keyed send
 * (created by the app's migration, prisma/whatsapp-reliability-migration.sql).
 * Prisma Client only — no raw SQL — so timestamps are written and compared the
 * same way everywhere.
 */
export function createPrismaSendKeyStore(
  prisma: Pick<PrismaClient, "whatsAppSendKey">,
  onSweepError: (error: unknown) => void = () => {}
): SendKeyStore {
  let lastSweep = 0;

  function sweepExpired(now: Date): void {
    if (now.getTime() - lastSweep < SWEEP_INTERVAL_MS) return;
    lastSweep = now.getTime();
    void prisma.whatsAppSendKey.deleteMany({ where: { expiresAt: { lte: now } } }).catch(onSweepError);
  }

  return {
    async reserve({ businessId, key, fingerprint, expiresAt, now }) {
      sweepExpired(now);
      const fresh = { fingerprint, state: "SENDING", providerMessageId: null, expiresAt };

      // A new key: inserted, or skipped if a record already holds it.
      const created = await prisma.whatsAppSendKey.createMany({
        data: [{ businessId, key, ...fresh }],
        skipDuplicates: true,
      });
      if (created.count === 1) return null;

      // An expired record is taken over in place (one statement, so two
      // concurrent takeovers can't both win).
      const takenOver = await prisma.whatsAppSendKey.updateMany({
        where: { businessId, key, expiresAt: { lte: now } },
        data: fresh,
      });
      if (takenOver.count === 1) return null;

      const existing = await prisma.whatsAppSendKey.findUnique({
        where: { businessId_key: { businessId, key } },
        select: { fingerprint: true, state: true, providerMessageId: true },
      });
      if (!existing) {
        // Released between the two reads: the attempt it belonged to sent
        // nothing. Refuse this one too; a retry then claims it cleanly.
        throw new Error("Send key record changed while it was being claimed.");
      }
      return existing as SendKeyRecord;
    },

    async settle({ businessId, key, state, providerMessageId }) {
      await prisma.whatsAppSendKey.update({
        where: { businessId_key: { businessId, key } },
        data: { state, providerMessageId },
      });
    },

    async release({ businessId, key }) {
      await prisma.whatsAppSendKey.deleteMany({ where: { businessId, key } });
    },
  };
}
