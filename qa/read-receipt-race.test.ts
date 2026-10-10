// Receipt regression tests: actual helpers with a deterministic in-memory Prisma seam.
// This does not claim real database concurrency or real authentication coverage.
import type { StaffContext } from '@/lib/staff-auth';
import { beforeEach, expect, it, vi } from 'vitest';

const model = vi.hoisted(() => ({
  thread: { id: 'thread-a', businessId: 'business-a', staffMemberId: 'staff-a', subtitle: null as string | null, unreadForStaff: 1, unreadForAdmin: 0, lastMessageAt: new Date('2026-10-09T12:00:00Z') },
  messages: [] as Array<{ id: string; threadId: string; sender: 'ADMIN' | 'STAFF' | 'SYSTEM'; body: string; createdAt: Date; readAt: Date | null }>,
}));
vi.mock('@/lib/prisma', () => {
  type Where = { threadId?: string; sender?: string | { in: string[] }; readAt?: null; id?: { in: string[] } };
  const matches = (m: typeof model.messages[number], w: Where) =>
    (!w.threadId || m.threadId === w.threadId) &&
    (!w.sender || (typeof w.sender === 'string' ? m.sender === w.sender : w.sender.in.includes(m.sender))) &&
    (w.readAt !== null || m.readAt === null) && (!w.id || w.id.in.includes(m.id));
  const tx = {
    staffThread: { update: vi.fn(async ({ data }: { data: { unreadForStaff?: number | { increment: number }; unreadForAdmin?: number | { increment: number } } }) => {
      if (typeof data.unreadForStaff === 'number') model.thread.unreadForStaff = data.unreadForStaff;
      if (typeof data.unreadForAdmin === 'number') model.thread.unreadForAdmin = data.unreadForAdmin;
      return model.thread;
    }) },
    staffThreadMessage: {
      count: vi.fn(async ({ where }: { where: Where }) => model.messages.filter(m => matches(m, where)).length),
      updateMany: vi.fn(async ({ where, data }: { where: Where; data: { readAt: Date } }) => {
        const rows = model.messages.filter(m => matches(m, where));
        rows.forEach(m => { m.readAt = data.readAt; });
        return { count: rows.length };
      }),
    },
  };
  return { prisma: {
    staffThread: {
      findFirst: vi.fn(async ({ where }: { where: { businessId: string; staffMemberId: string; id?: string } }) => where.businessId === model.thread.businessId && where.staffMemberId === model.thread.staffMemberId && (!where.id || where.id === model.thread.id) ? model.thread : null),
      findUnique: vi.fn(async () => structuredClone({ ...model.thread, messages: model.messages })),
    },
    $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
  } };
});
import { getConversation, markConversationRead } from '@/lib/mobile/inbox';

const ctx = { business: { id: 'business-a' }, staffMember: { id: 'staff-a' } } as StaffContext;
beforeEach(() => {
  model.thread.unreadForStaff = 1;
  model.messages = [{ id: 'visible-a', threadId: model.thread.id, sender: 'ADMIN', body: 'Fictional visible message', createdAt: new Date('2026-10-09T12:00:00Z'), readAt: null }];
});
async function snapshotThenNewArrival() {
  const fetched = await getConversation(ctx, 'admin');
  expect(fetched?.messages.map(m => m.id)).toEqual(['visible-a']);
  // The admin commits another message after the GET snapshot and before the read POST.
  model.messages.push({ id: 'unseen-b', threadId: model.thread.id, sender: 'ADMIN', body: 'Fictional unseen arrival', createdAt: new Date('2026-10-09T12:00:01Z'), readAt: null });
  model.thread.unreadForStaff += 1;
  expect(await markConversationRead(ctx, 'admin', fetched!.messages.map(m => m.id))).toEqual({ ok: true, unreadCount: 1 });
}
it('keeps a post-snapshot ADMIN arrival unread', async () => {
  await snapshotThenNewArrival();
  expect(model.messages.find(m => m.id === 'visible-a')?.readAt).toBeInstanceOf(Date);
  expect(model.messages.find(m => m.id === 'unseen-b')?.readAt).toBeNull();
  expect(model.thread.unreadForStaff).toBe(1);
});
it('empty selection is a no-op and legacy absent selection explicitly marks all', async () => {
  expect(await markConversationRead(ctx, 'admin', [])).toEqual({ ok: true, unreadCount: 1 });
  expect(model.messages[0].readAt).toBeNull();
  expect(await markConversationRead(ctx, 'admin')).toEqual({ ok: true, unreadCount: 0 });
});
it('rejects mixed owned/unknown selections without marking the owned message', async () => {
  expect(await markConversationRead(ctx, 'admin', ['visible-a', 'foreign-b'])).toMatchObject({ ok: false, status: 400 });
  expect(model.messages[0].readAt).toBeNull();
  expect(model.thread.unreadForStaff).toBe(1);
});
it('duplicate and repeated acknowledgments are idempotent', async () => {
  expect(await markConversationRead(ctx, 'admin', ['visible-a', 'visible-a'])).toEqual({ ok: true, unreadCount: 0 });
  expect(await markConversationRead(ctx, 'admin', ['visible-a'])).toEqual({ ok: true, unreadCount: 0 });
});
it('does not accept an unowned thread id', async () => {
  expect(await markConversationRead(ctx, 'foreign-thread', ['visible-a'])).toMatchObject({ ok: false, status: 404 });
  expect(model.messages[0].readAt).toBeNull();
});
