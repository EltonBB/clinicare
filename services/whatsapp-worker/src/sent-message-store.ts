import { proto } from "baileys";
import type { PrismaClient } from "@prisma/client";

/** Expired copies are swept at most this often (each remember may trigger it). */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

export type SentMessageStore = {
  remember(businessId: string, messageId: string, message: proto.IMessage): Promise<void>;
  get(businessId: string, messageId: string): Promise<proto.IMessage | undefined>;
};

/**
 * A copy of each message this worker sent, for Baileys' `getMessage`. When the
 * recipient's phone can't decrypt a message (a fresh link, keys that moved on)
 * it asks the sender to send it again; without the original to hand Baileys
 * ignores the request and the patient sees "Waiting for this message" for good.
 * Copies live in WhatsAppSentMessage (the app's migration creates it) so a
 * worker restart — a deploy is exactly when keys get out of step — doesn't
 * lose them, and are swept once they pass `ttlMs`.
 */
export function createPrismaSentMessageStore(
  prisma: Pick<PrismaClient, "whatsAppSentMessage">,
  { ttlMs, onSweepError = () => {}, now = () => new Date() }: {
    ttlMs: number;
    onSweepError?: (error: unknown) => void;
    now?: () => Date;
  }
): SentMessageStore {
  let lastSweep = 0;

  function sweepExpired(at: Date): void {
    if (at.getTime() - lastSweep < SWEEP_INTERVAL_MS) return;
    lastSweep = at.getTime();
    void prisma.whatsAppSentMessage.deleteMany({ where: { expiresAt: { lte: at } } }).catch(onSweepError);
  }

  return {
    async remember(businessId, messageId, message) {
      const at = now();
      sweepExpired(at);
      await prisma.whatsAppSentMessage.createMany({
        data: [
          {
            businessId,
            messageId,
            content: new Uint8Array(proto.Message.encode(message).finish()),
            expiresAt: new Date(at.getTime() + ttlMs),
          },
        ],
        skipDuplicates: true,
      });
    },

    async get(businessId, messageId) {
      const row = await prisma.whatsAppSentMessage.findUnique({
        where: { businessId_messageId: { businessId, messageId } },
        select: { content: true },
      });
      return row ? proto.Message.decode(row.content) : undefined;
    },
  };
}
