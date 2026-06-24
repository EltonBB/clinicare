import { prisma } from "@/lib/prisma";

/**
 * Returns a workspace's WhatsApp connection record (or null).
 *
 * WhatsApp runs entirely on Baileys now: the pairing/connection state is owned
 * by the QR pairing flow (Settings) and the inbound webhook, so this is a plain
 * read with no provider-side sync to perform.
 */
export async function syncWhatsAppConnectionForBusiness(businessId: string) {
  return prisma.whatsAppConnection.findUnique({
    where: {
      businessId,
    },
  });
}
