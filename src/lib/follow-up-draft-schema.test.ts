import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

// The hand-written SQL files are what actually reach the shared database, so pin
// them to the schema: an index or RLS line added on one side must exist on the other.
describe("FollowUpDraft schema and migrations agree", () => {
  const model = /model FollowUpDraft \{[\s\S]*?\n\}/.exec(read("prisma/schema.prisma"))?.[0] ?? "";

  it("indexes the client and appointment foreign keys in both the schema and the SQL", () => {
    expect(model).toContain("@@index([clientId])");
    expect(model).toContain("@@index([appointmentId])");

    const sql = read("prisma/follow-up-draft-indexes-migration.sql");
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "FollowUpDraft_clientId_idx" ON "FollowUpDraft"("clientId")');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "FollowUpDraft_appointmentId_idx" ON "FollowUpDraft"("appointmentId")');
  });

  it("enables row-level security with no public policy in the creating migration", () => {
    const sql = read("prisma/follow-up-draft-migration.sql");
    expect(sql).toContain('ALTER TABLE "FollowUpDraft" ENABLE ROW LEVEL SECURITY;');
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });
});
