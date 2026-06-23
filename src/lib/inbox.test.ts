import { describe, expect, it } from "vitest";

import { normalizePhone, phoneLookupKey } from "@/lib/inbox";

describe("normalizePhone", () => {
  it("strips channel prefixes and formatting punctuation, keeping a leading +", () => {
    expect(normalizePhone("whatsapp:+1 (555) 123-4567")).toBe("+15551234567");
    expect(normalizePhone("+1 (555) 123-4567")).toBe("+15551234567");
    expect(normalizePhone("tel:+38344123456")).toBe("+38344123456");
  });

  it("keeps a local number without a country code as digits", () => {
    expect(normalizePhone("070 123 4567")).toBe("0701234567");
  });

  it("returns an empty string for empty input", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("   ")).toBe("");
  });
});

describe("phoneLookupKey", () => {
  it("drops the leading + so equivalently-formatted numbers match", () => {
    expect(phoneLookupKey("+15551234567")).toBe("15551234567");
    expect(phoneLookupKey("whatsapp:+1 555 123 4567")).toBe("15551234567");
    // Two different source formats of the same number share a lookup key.
    expect(phoneLookupKey("+1 (555) 123-4567")).toBe(phoneLookupKey("whatsapp:+15551234567"));
  });
});
