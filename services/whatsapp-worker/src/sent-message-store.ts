import { proto } from "baileys";
import type { PrismaClient } from "@prisma/client";

/** How often expired copies are deleted, whether or not anything is sent. */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
/** The newest copies also kept in memory, for a request that beats the write. */
const RECENT_LIMIT = 500;

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
 * lose them. The newest are also kept in memory from the moment `remember` is
 * called, so a request that arrives while the write is still running is
 * answered too (Codex #134).
 *
 * A copy is patient-facing text, so `ttlMs` is a hard limit (Codex #134): an
 * expired copy is never handed back, and an hourly timer deletes expired ones
 * from memory and the table whether or not anything is being sent.
 */
export function createPrismaSentMessageStore(
  prisma: Pick<PrismaClient, "whatsAppSentMessage">,
  { ttlMs, onSweepError = () => {}, now = () => new Date() }: {
    ttlMs: number;
    onSweepError?: (error: unknown) => void;
    now?: () => Date;
  }
): SentMessageStore {
  const recent = new Map<string, { message: proto.IMessage; expiresAt: number }>();

  setInterval(() => {
    const at = now();
    for (const [key, kept] of recent) {
      if (kept.expiresAt <= at.getTime()) recent.delete(key);
    }
    prisma.whatsAppSentMessage.deleteMany({ where: { expiresAt: { lte: at } } }).catch(onSweepError);
  }, SWEEP_INTERVAL_MS).unref();

  return {
    async remember(businessId, messageId, message) {
      const expiresAt = new Date(now().getTime() + ttlMs);
      recent.set(`${businessId}:${messageId}`, { message, expiresAt: expiresAt.getTime() });
      if (recent.size > RECENT_LIMIT) recent.delete(recent.keys().next().value!);
      await prisma.whatsAppSentMessage.createMany({
        data: [
          {
            businessId,
            messageId,
            content: new Uint8Array(proto.Message.encode(message).finish()),
            expiresAt,
          },
        ],
        skipDuplicates: true,
      });
    },

    async get(businessId, messageId) {
      const at = now();
      const kept = recent.get(`${businessId}:${messageId}`);
      if (kept) return kept.expiresAt > at.getTime() ? kept.message : undefined;
      const row = await prisma.whatsAppSentMessage.findUnique({
        where: { businessId_messageId: { businessId, messageId } },
        select: { content: true, expiresAt: true },
      });
      return row && row.expiresAt > at ? proto.Message.decode(row.content) : undefined;
    },
  };
}
