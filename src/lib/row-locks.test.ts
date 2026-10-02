import { describe, expect, it, vi } from "vitest";

import type { Prisma } from "@prisma/client";

import { lockClientShared, lockStaffMemberExclusive, lockStaffMemberShared } from "@/lib/row-locks";

function fakeTx() {
  const $executeRaw = vi.fn().mockResolvedValue(1);
  return { tx: { $executeRaw } as unknown as Prisma.TransactionClient, $executeRaw };
}

// The tagged template reaches Prisma as (strings, ...values): the id must travel as a bound
// value, never be spliced into the SQL text.
const sqlOf = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

describe("row locks", () => {
  it("share-locks one client row by bound id", async () => {
    const { tx, $executeRaw } = fakeTx();

    await lockClientShared(tx, "client_1");

    expect($executeRaw).toHaveBeenCalledTimes(1);
    expect(sqlOf($executeRaw.mock.calls[0])).toBe('SELECT 1 FROM "Client" WHERE "id" = ? FOR SHARE');
    expect($executeRaw.mock.calls[0].slice(1)).toEqual(["client_1"]);
  });

  it("share-locks one staff member row by bound id", async () => {
    const { tx, $executeRaw } = fakeTx();

    await lockStaffMemberShared(tx, "staff_1");

    expect(sqlOf($executeRaw.mock.calls[0])).toBe('SELECT 1 FROM "StaffMember" WHERE "id" = ? FOR SHARE');
    expect($executeRaw.mock.calls[0].slice(1)).toEqual(["staff_1"]);
  });

  it("locks a staff member row exclusively for a delete, by bound id", async () => {
    const { tx, $executeRaw } = fakeTx();

    await lockStaffMemberExclusive(tx, "staff_1");

    expect(sqlOf($executeRaw.mock.calls[0])).toBe('SELECT 1 FROM "StaffMember" WHERE "id" = ? FOR UPDATE');
    expect($executeRaw.mock.calls[0].slice(1)).toEqual(["staff_1"]);
  });

  it("does not swallow a failure: a serialization failure must reach retryOnWriteConflict", async () => {
    const { tx, $executeRaw } = fakeTx();
    const failure = new Error("could not serialize access due to concurrent update");
    $executeRaw.mockRejectedValueOnce(failure);

    await expect(lockClientShared(tx, "client_1")).rejects.toBe(failure);
  });

  // The table names are hand-written SQL, so pin them to the Prisma models they stand for: a
  // renamed model or an @@map would otherwise only fail at runtime, inside a transaction.
  it("names tables that exist in the Prisma schema (no @@map renames them)", async () => {
    const { readFileSync } = await import("node:fs");
    const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");

    expect(schema).toMatch(/^model Client \{/m);
    expect(schema).toMatch(/^model StaffMember \{/m);
    expect(schema).not.toMatch(/@@map\(/);
  });
});
