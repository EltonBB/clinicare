import { prisma } from "@/lib/prisma";

// Matches services/whatsapp-worker/src/worker-lease.ts.
const LEASE_ID = "whatsapp-worker";

// The worker renews its lease every 10s with a 30s TTL. A redeploy hands it
// over within seconds, so a lease lapsed for longer than this means no worker
// is running and nothing can be sent or received.
export const WORKER_DOWN_AFTER_MS = 5 * 60_000;

/** True when no WhatsApp worker has held its lease for WORKER_DOWN_AFTER_MS. */
export async function isWhatsAppWorkerDown(now = new Date()): Promise<boolean> {
  const lease = await prisma.whatsAppWorkerLease.findUnique({
    where: { id: LEASE_ID },
    select: { expiresAt: true },
  });

  return !lease || lease.expiresAt.getTime() < now.getTime() - WORKER_DOWN_AFTER_MS;
}
