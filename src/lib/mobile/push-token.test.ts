import { describe, expect, it } from "vitest";

import { isExpoPushToken } from "./push-token";

describe("isExpoPushToken", () => {
  it("accepts current and legacy bracketed Expo tokens", () => {
    expect(isExpoPushToken("ExpoPushToken[fixture-current_123]")).toBe(true);
    expect(isExpoPushToken("ExponentPushToken[fixture-legacy_123]")).toBe(true);
  });

  it.each([
    "12345678-1234-1234-1234-123456789abc",
    "ABCDEF12-ABCD-ABCD-ABCD-ABCDEF123456",
    "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz",
  ])("accepts Expo's supported UUID-style token %s", (token) => {
    expect(isExpoPushToken(token)).toBe(true);
  });

  it("rejects an empty token, missing brackets, embedded whitespace, and arbitrary text", () => {
    for (const value of [
      null,
      "",
      "ExpoPushToken[]",
      "ExponentPushTokenBAD",
      "ExpoPushToken[bad value]",
      "ExpoPushToken[fixture]\n",
      "https://example.test",
      "12345678-1234-1234-1234-123456789ab",
      "123456781234-1234-1234-123456789abc",
      "12345678-1234-1234-1234-123456789ab!",
      " 12345678-1234-1234-1234-123456789abc",
      "12345678-1234-1234-1234-123456789abc\n",
    ])
      expect(isExpoPushToken(value)).toBe(false);
  });
});
