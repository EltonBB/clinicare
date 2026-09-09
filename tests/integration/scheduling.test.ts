import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { requireTestDatabaseUrl, requireTestSchema } from './database-safety.mjs';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/mobile/push', () => ({ buildStaffPushPayload: vi.fn(), sendStaffPush: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { acquireSchedulingLock, hasSchedulingConflict } from '@/lib/appointments-shared';

const connectionString = requireTestDatabaseUrl(process.env.VELA_TEST_DATABASE_URL);
const schema = requireTestSchema(process.env.VELA_TEST_SCHEMA);
const pool = new Pool({ connectionString, ssl: false, max: 4, connectionTimeoutMillis: 5000 });
const db = new PrismaClient({ adapter: new PrismaPg(pool, { schema, disposeExternalPool: false }) });
const startAt = new Date('2030-01-15T10:00:00Z');
const endAt = new Date('2030-01-15T10:30:00Z');
let businessId: string;
let clientId: string;
let staffMemberId: string;

beforeEach(async () => {
  const business = await db.business.create({
    data: { ownerId: `synthetic-${randomUUID()}`, name: 'Synthetic Clinic', businessType: 'Clinic' },
  });
  businessId = business.id;
  const client = await db.client.create({ data: { businessId, name: 'Synthetic Patient', phone: '15550000001' } });
  clientId = client.id;
  const staff = await db.staffMember.create({ data: { businessId, name: 'Synthetic Staff', role: 'Doctor' } });
  staffMemberId = staff.id;
});

afterAll(async () => {
  await db.$disconnect();
  await pool.end();
});

describe('real PostgreSQL scheduling concurrency', () => {
  it('serializes competing overlapping bookings so only the first is created', async () => {
    const held = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const contenderPid = Promise.withResolvers<number>();
    const window = { businessId, staffMemberId, startAt, endAt };
    const first = db.$transaction(async (tx) => {
      await acquireSchedulingLock(tx, staffMemberId);
      expect(await hasSchedulingConflict(tx, window)).toBe(false);
      held.resolve(undefined);
      await release.promise;
      await tx.appointment.create({ data: { ...window, clientId, title: 'First booking' } });
      return 'saved';
    }, { timeout: 10_000 });
    // A startup failure must reject the test instead of stranding the barrier.
    await Promise.race([held.promise, first]);

    const second = db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      contenderPid.resolve(row.pid);
      await acquireSchedulingLock(tx, staffMemberId);
      if (await hasSchedulingConflict(tx, window)) return 'conflict';
      await tx.appointment.create({ data: { ...window, clientId, title: 'Second booking' } });
      return 'saved';
    }, { timeout: 10_000 });
    const outcomes = Promise.allSettled([first, second]);

    try {
      const pid = await Promise.race([
        contenderPid.promise,
        second.then(() => { throw new Error('Contender finished before reporting its connection.'); }),
      ]);
      await vi.waitFor(async () => {
        const result = await pool.query(
          "SELECT 1 FROM pg_locks WHERE pid = $1 AND locktype = 'advisory' AND NOT granted", [pid]
        );
        expect(result.rowCount).toBe(1);
      }, { timeout: 5000, interval: 20 });
    } finally {
      release.resolve(undefined);
      await outcomes;
    }
    expect(await outcomes).toEqual([
      { status: 'fulfilled', value: 'saved' },
      { status: 'fulfilled', value: 'conflict' },
    ]);
    expect(await db.appointment.count({ where: { businessId, staffMemberId } })).toBe(1);
  });

  it('releases the advisory lock on transaction rollback', async () => {
    await db.appointment.create({ data: { businessId, staffMemberId, clientId, startAt, endAt, title: 'Synthetic booking' } });
    await expect(db.$transaction(async (tx) => {
      await acquireSchedulingLock(tx, staffMemberId);
      throw new Error('Synthetic rollback');
    })).rejects.toThrow('Synthetic rollback');
    await db.$transaction(async (tx) => {
      await acquireSchedulingLock(tx, staffMemberId);
      expect(await hasSchedulingConflict(tx, { businessId, staffMemberId, startAt, endAt })).toBe(true);
    });
  });

  it('allows adjacent appointments and excludes cancelled bookings', async () => {
    await db.appointment.create({ data: { businessId, staffMemberId, clientId, startAt, endAt, title: 'Synthetic booking' } });
    const adjacentEnd = new Date('2030-01-15T11:00:00Z');
    expect(await hasSchedulingConflict(db, { businessId, staffMemberId, startAt: endAt, endAt: adjacentEnd })).toBe(false);
    await db.appointment.updateMany({ where: { businessId }, data: { status: 'CANCELLED' } });
    expect(await hasSchedulingConflict(db, { businessId, staffMemberId, startAt, endAt })).toBe(false);
  });
});
