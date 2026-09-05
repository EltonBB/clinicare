import { describe, expect, it } from "vitest";

import { buildInboxViewFromWorkspace, normalizePhone, phoneLookupKey } from "@/lib/inbox";

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

describe("buildInboxViewFromWorkspace", () => {
  it("passes totalUnreadCount straight through, independent of the loaded conversations", () => {
    // The caller's aggregate is the business-wide total; the conversations
    // array here (a capped page) legitimately sums to something smaller —
    // this builder must never recompute the total from it.
    const view = buildInboxViewFromWorkspace({
      conversations: [
        {
          id: "c1",
          phoneNumber: "+15551234567",
          contactName: "Mira",
          unreadCount: 2,
          updatedAt: new Date("2026-06-23T10:00:00.000Z"),
          messages: [],
        },
      ],
      clients: [],
      totalUnreadCount: 9,
    });

    expect(view.totalUnreadCount).toBe(9);
  });

  it("defaults hasFullHistory to true when the record omits it", () => {
    // hydrateConversation (inbox/actions.ts) always fetches the standard
    // window and never sets this field — only fetchInboxConversations's
    // "extra unread" rows set it explicitly to false.
    const view = buildInboxViewFromWorkspace({
      conversations: [
        {
          id: "c1",
          phoneNumber: "+15551234567",
          contactName: "Mira",
          unreadCount: 0,
          updatedAt: new Date("2026-06-23T10:00:00.000Z"),
          messages: [],
        },
      ],
      clients: [],
      totalUnreadCount: 0,
    });

    expect(view.conversations[0]?.hasFullHistory).toBe(true);
  });
});
