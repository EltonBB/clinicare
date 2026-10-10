import type { Prisma, StaffThread } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

export const seenMessageIdsSchema = z.array(z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/)).max(100);

export type ThreadReadResult =
  | { ok: true; unreadCount: number }
  | { ok: false; status: 400; error: string };

/** Call only after resolving the thread through its business/staff ownership gate. */
export async function acknowledgeThreadMessages(
  thread: StaffThread,
  audience: "staff" | "admin",
  seenMessageIds?: string[],
): Promise<ThreadReadResult> {
  if (seenMessageIds?.length === 0) {
    return { ok: true, unreadCount: audience === "staff" ? thread.unreadForStaff : thread.unreadForAdmin };
  }
  return prisma.$transaction(async (tx) => {
    const ids = seenMessageIds === undefined ? undefined : [...new Set(seenMessageIds)];
    if (ids) {
      const owned = await tx.staffThreadMessage.count({ where: { threadId: thread.id, id: { in: ids } } });
      if (owned !== ids.length) return { ok: false, status: 400, error: "Invalid message selection." };
    }
    // Lock the thread before touching receipts. Every sender increments this same
    // row in its transaction, so a concurrent send's increment survives the recount.
    await tx.staffThread.update({
      where: { id: thread.id },
      data: audience === "staff" ? { unreadForStaff: { increment: 0 } } : { unreadForAdmin: { increment: 0 } },
    });
    const inbound: Prisma.StaffThreadMessageWhereInput = {
      threadId: thread.id,
      sender: audience === "staff" ? "ADMIN" : { in: ["STAFF", "SYSTEM"] },
      readAt: null,
    };
    await tx.staffThreadMessage.updateMany({
      where: { ...inbound, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    const unreadCount = await tx.staffThreadMessage.count({ where: inbound });
    await tx.staffThread.update({
      where: { id: thread.id },
      data: audience === "staff" ? { unreadForStaff: unreadCount } : { unreadForAdmin: unreadCount },
    });
    return { ok: true, unreadCount };
  });
}
