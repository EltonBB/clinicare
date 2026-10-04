import { describe, expect, it } from "vitest";

import { parseRecordId, recordIdSchema } from "@/lib/record-id";

describe("parseRecordId", () => {
  it("accepts a plain id string", () => {
    expect(parseRecordId("cmf1x2y3z0000abcd1234efgh")).toBe("cmf1x2y3z0000abcd1234efgh");
    expect(parseRecordId("a".repeat(100))).toBe("a".repeat(100));
  });

  it.each([
    ["a Prisma filter object", { not: "" }],
    ["an array", ["a"]],
    ["an empty string", ""],
    ["a whitespace-only string", "   "],
    ["a number", 42],
    ["null", null],
    ["undefined", undefined],
    ["an over-long string", "a".repeat(101)],
  ])("rejects %s", (_label, value) => {
    expect(parseRecordId(value)).toBeNull();
    expect(recordIdSchema.safeParse(value).success).toBe(false);
  });
});
