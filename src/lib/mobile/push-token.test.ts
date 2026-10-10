import { describe, expect, it } from "vitest";

import { isExpoPushToken } from "./push-token";

describe("isExpoPushToken", () => {
  it("accepts current and legacy bracketed Expo tokens", () => {
    expect(isExpoPushToken("ExpoPushToken[fixture-current_123]")).toBe(true);
    expect(isExpoPushToken("ExponentPushToken[fixture-legacy_123]")).toBe(true);
  });

  it("rejects an empty token, missing brackets, embedded whitespace, and arbitrary text", () => {
    for (const value of [
      null,
      "",
      "ExpoPushToken[]",
      "ExponentPushTokenBAD",
      "ExpoPushToken[bad value]",
      "https://example.test",
    ])
      expect(isExpoPushToken(value)).toBe(false);
  });
});
