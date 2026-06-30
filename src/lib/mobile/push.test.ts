import { describe, expect, it } from "vitest";

import { buildStaffPushPayload } from "@/lib/mobile/push";

describe("buildStaffPushPayload", () => {
  it("uses fixed, generic copy per kind (no PHI can enter)", () => {
    expect(buildStaffPushPayload({ kind: "message" })).toMatchObject({
      title: "New message",
      body: "You have a new message from your clinic.",
    });
    expect(buildStaffPushPayload({ kind: "appointment" }).title).toBe("Schedule updated");
    expect(buildStaffPushPayload({ kind: "reminder" }).title).toBe("Reminder");
    expect(buildStaffPushPayload({ kind: "system" }).title).toBe("Vela Staff");
  });

  it("only carries a deep link in data — never free text", () => {
    const withLink = buildStaffPushPayload({
      kind: "message",
      linkType: "conversation",
      linkId: "t1",
    });
    expect(withLink.data).toEqual({ linkType: "conversation", linkId: "t1" });
    // data keys are restricted to the deep link; no name/body fields ride along.
    expect(Object.keys(withLink.data ?? {}).sort()).toEqual(["linkId", "linkType"]);
  });

  it("omits data when the link is incomplete", () => {
    expect(buildStaffPushPayload({ kind: "message", linkType: "conversation" }).data).toBeUndefined();
    expect(buildStaffPushPayload({ kind: "message", linkId: "t1" }).data).toBeUndefined();
  });
});
