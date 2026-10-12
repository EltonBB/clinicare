import { describe, expect, it } from "vitest";
import { classifyReplyIntent } from "@/lib/reply-intent";

describe("classifyReplyIntent", () => {
  it.each(["1", "yes", "confirm", " Yes ", "CONFIRM"])("reads %j as confirm", (input) => {
    expect(classifyReplyIntent(input)).toBe("confirm");
  });

  it.each(["2", "cancel", " Cancel "])("reads %j as cancel", (input) => {
    expect(classifyReplyIntent(input)).toBe("cancel");
  });

  it.each(["", "1 please cancel", "maybe", "yes, but what time", "12", "yess"])(
    "treats %j as no intent — only an exact token counts",
    (input) => {
      expect(classifyReplyIntent(input)).toBeNull();
    }
  );
});
