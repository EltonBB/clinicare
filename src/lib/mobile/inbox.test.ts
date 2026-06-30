import { describe, expect, it } from "vitest";

import type { StaffNotification, StaffThread, StaffThreadMessage } from "@prisma/client";

import {
  serializeConversation,
  serializeMessage,
  serializeNotification,
} from "@/lib/mobile/inbox";
import { dayLabel, relativeLabel } from "@/lib/mobile/relative-time";

const NOW = new Date("2026-06-25T12:00:00.000Z");
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

function message(overrides: Partial<StaffThreadMessage> = {}): StaffThreadMessage {
  return {
    id: "m1",
    threadId: "t1",
    sender: "STAFF",
    body: "Hello",
    readAt: null,
    createdAt: minsAgo(5),
    ...overrides,
  } as StaffThreadMessage;
}

describe("relativeLabel", () => {
  it("buckets by recency", () => {
    expect(relativeLabel(minsAgo(0), NOW)).toBe("now");
    expect(relativeLabel(minsAgo(5), NOW)).toBe("5m ago");
    expect(relativeLabel(minsAgo(120), NOW)).toBe("2h ago");
    expect(relativeLabel(minsAgo(60 * 24 * 2), NOW)).toBe("2d ago");
    // older than a week falls back to a date label, not "Nd ago"
    expect(relativeLabel(minsAgo(60 * 24 * 30), NOW)).not.toMatch(/ago$/);
  });
});

describe("dayLabel", () => {
  it("labels today and yesterday", () => {
    expect(dayLabel(NOW, NOW)).toBe("Today");
    expect(dayLabel(new Date(NOW.getTime() - 24 * 60 * 60 * 1000), NOW)).toBe("Yesterday");
    expect(dayLabel(new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000), NOW)).not.toMatch(
      /Today|Yesterday/
    );
  });
});

describe("serializeMessage", () => {
  it("maps STAFF → me with a delivery state", () => {
    expect(serializeMessage(message({ sender: "STAFF", readAt: null }), NOW)).toMatchObject({
      sender: "me",
      delivery: "sent",
    });
    expect(serializeMessage(message({ sender: "STAFF", readAt: NOW }), NOW).delivery).toBe("read");
  });
  it("maps ADMIN → them and SYSTEM → system, with no delivery", () => {
    expect(serializeMessage(message({ sender: "ADMIN" }), NOW)).toMatchObject({
      sender: "them",
      delivery: undefined,
    });
    expect(serializeMessage(message({ sender: "SYSTEM" }), NOW).sender).toBe("system");
  });
});

describe("serializeConversation", () => {
  it("uses the admin label, latest message as preview, and sorts ascending", () => {
    const thread = {
      id: "t1",
      businessId: "b1",
      staffMemberId: "s1",
      subtitle: "Front desk",
      unreadForStaff: 2,
      unreadForAdmin: 0,
      lastMessageAt: minsAgo(1),
      createdAt: minsAgo(100),
      messages: [
        message({ id: "m2", body: "second", createdAt: minsAgo(1) }),
        message({ id: "m1", body: "first", createdAt: minsAgo(50) }),
      ],
    } as StaffThread & { messages: StaffThreadMessage[] };

    const convo = serializeConversation(thread, NOW);
    expect(convo.contactName).toBe("Clinic admin");
    expect(convo.subtitle).toBe("Front desk");
    expect(convo.unreadCount).toBe(2);
    expect(convo.preview).toBe("second");
    expect(convo.messages.map((m) => m.id)).toEqual(["m1", "m2"]); // ascending
  });
});

describe("serializeNotification", () => {
  function notif(overrides: Partial<StaffNotification> = {}): StaffNotification {
    return {
      id: "n1",
      businessId: "b1",
      staffMemberId: "s1",
      kind: "MESSAGE",
      title: "New message",
      body: "Tap to view",
      linkType: "conversation",
      linkId: "t1",
      readAt: null,
      createdAt: minsAgo(2),
      ...overrides,
    } as StaffNotification;
  }

  it("lowercases kind, maps read→Earlier, and builds the link", () => {
    expect(serializeNotification(notif(), NOW)).toMatchObject({
      kind: "message",
      group: "New",
      read: false,
      link: { type: "conversation", id: "t1" },
    });
    expect(serializeNotification(notif({ readAt: NOW }), NOW).group).toBe("Earlier");
  });

  it("omits the link when linkType is unknown or linkId is missing", () => {
    expect(serializeNotification(notif({ linkType: "other", linkId: "x" }), NOW).link).toBeUndefined();
    expect(serializeNotification(notif({ linkType: "appointment", linkId: null }), NOW).link).toBeUndefined();
  });
});
