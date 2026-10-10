import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({ logger: { error: logError } }));

import { buildStaffPushPayload, sendStaffPush } from "@/lib/mobile/push";

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
    expect(
      buildStaffPushPayload({ kind: "message", linkType: "conversation" }).data,
    ).toBeUndefined();
    expect(buildStaffPushPayload({ kind: "message", linkId: "t1" }).data).toBeUndefined();
  });
});

describe("sendStaffPush", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("EXPO_ACCESS_TOKEN", "");
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const messages = JSON.parse(String(init.body)) as unknown[];
      return Response.json({ data: messages.map(() => ({ status: "ok", id: "fixture-ticket" })) });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends both token formats, deduplicates, and drops malformed tokens", async () => {
    await sendStaffPush(
      [
        "ExpoPushToken[current]",
        "ExponentPushToken[legacy]",
        "ExpoPushToken[current]",
        "ExponentPushTokenBAD",
        null,
      ],
      buildStaffPushPayload({ kind: "message" }),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    const messages = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(messages.map((message: { to: string }) => message.to)).toEqual([
      "ExpoPushToken[current]",
      "ExponentPushToken[legacy]",
    ]);
  });

  it("never sends more than 100 recipients in a provider request", async () => {
    const tokens = Array.from({ length: 205 }, (_, i) => `ExpoPushToken[fixture_${i}]`);
    await sendStaffPush(tokens, buildStaffPushPayload({ kind: "appointment" }));
    expect(fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).length)).toEqual([
      100, 100, 5,
    ]);
  });

  it("reports ticket errors even on HTTP 200 without logging provider text or tokens", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        data: [{ status: "error", message: "ExpoPushToken[sensitive-token] invalid" }],
      }),
    );
    await sendStaffPush(
      ["ExpoPushToken[sensitive-token]"],
      buildStaffPushPayload({ kind: "message" }),
    );
    expect(logError).toHaveBeenCalledWith(
      "Expo push tickets reported delivery errors.",
      undefined,
      { failed: 1, expected: 1, received: 1 },
    );
    expect(JSON.stringify(logError.mock.calls)).not.toContain("sensitive-token");
  });

  it("does not call the provider when all tokens are invalid", async () => {
    await sendStaffPush([null, "invalid"], buildStaffPushPayload({ kind: "system" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps a provider failure from failing the triggering action", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network fault"));
    await expect(
      sendStaffPush(["ExpoPushToken[fixture]"], buildStaffPushPayload({ kind: "system" })),
    ).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledOnce();
  });

  it("does not log token-bearing malformed provider JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("ExpoPushToken[sensitive-token]"));
    await sendStaffPush(["ExpoPushToken[fixture]"], buildStaffPushPayload({ kind: "system" }));
    expect(logError).toHaveBeenCalledOnce();
    expect(JSON.stringify(logError.mock.calls)).not.toContain("sensitive-token");
  });
});
