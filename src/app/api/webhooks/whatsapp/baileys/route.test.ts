import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordDeliveryStatus: vi.fn(),
  recordConnectionState: vi.fn(),
  recordInboundMessage: vi.fn(),
  applyInboundReplyIntent: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/messaging/inbound", () => ({
  recordDeliveryStatus: mocks.recordDeliveryStatus,
  recordConnectionState: mocks.recordConnectionState,
  recordInboundMessage: mocks.recordInboundMessage,
  applyInboundReplyIntent: mocks.applyInboundReplyIntent,
}));
vi.mock("@/lib/logger", () => ({ logger: mocks.logger }));

import { POST } from "./route";

const BRIDGE_SECRET = "test-bridge-secret";

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://app.test/api/webhooks/whatsapp/baileys", {
    method: "POST",
    headers: { "content-type": "application/json", "x-vela-bridge-secret": BRIDGE_SECRET, ...headers },
    body: JSON.stringify(body),
  });
}

const MESSAGE_EVENT = {
  type: "message" as const,
  businessId: "biz_1",
  from: "38344000000",
  body: "1",
  providerMessageId: "wamid.1",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BAILEYS_BRIDGE_SECRET = BRIDGE_SECRET;
});

describe("POST /api/webhooks/whatsapp/baileys — message events", () => {
  it("attempts the reply intent on a first-time recording", async () => {
    mocks.recordInboundMessage.mockResolvedValue({ recorded: true, conversationId: "conv_1", clientId: "client_1", messageId: "msg_1" });
    mocks.applyInboundReplyIntent.mockResolvedValue({ applied: true, intent: "confirm", appointmentId: "appt_1" });

    const response = await POST(request(MESSAGE_EVENT));

    expect(response.status).toBe(200);
    expect(mocks.applyInboundReplyIntent).toHaveBeenCalledWith({
      businessId: "biz_1",
      clientId: "client_1",
      body: "1",
      messageId: "msg_1",
    });
  });

  // Codex #130: a transient failure here used to be swallowed to ok:true —
  // the message was already durably recorded, but the worker never got a
  // chance to retry the (separately idempotent) reply-intent step, since a
  // retried delivery is detected as a duplicate and the old code only ever
  // attempted the reply intent on a first-time recording.
  it("returns a 5xx (not ok:true) when the reply intent throws, so the worker retries the delivery", async () => {
    mocks.recordInboundMessage.mockResolvedValue({ recorded: true, conversationId: "conv_1", clientId: "client_1", messageId: "msg_1" });
    mocks.applyInboundReplyIntent.mockRejectedValue(new Error("transient database failure"));

    const response = await POST(request(MESSAGE_EVENT));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Processing failed." });
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Baileys inbound webhook failed.",
      expect.any(Error),
      expect.objectContaining({ businessId: "biz_1", type: "message" })
    );
  });

  it("retries the reply intent on a worker-retried duplicate, using the client resolved on the duplicate path", async () => {
    mocks.recordInboundMessage.mockResolvedValue({ recorded: false, reason: "duplicate", clientId: "client_1", messageId: "msg_1" });
    mocks.applyInboundReplyIntent.mockResolvedValue({ applied: true, intent: "confirm", appointmentId: "appt_1" });

    const response = await POST(request(MESSAGE_EVENT));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, recorded: false });
    expect(mocks.applyInboundReplyIntent).toHaveBeenCalledWith({
      businessId: "biz_1",
      clientId: "client_1",
      body: "1",
      messageId: "msg_1",
    });
  });

  it("does not run the reply intent when a raced duplicate's winning row could not be found again (nothing to claim)", async () => {
    mocks.recordInboundMessage.mockResolvedValue({ recorded: false, reason: "duplicate", clientId: "client_1", messageId: null });

    const response = await POST(request(MESSAGE_EVENT));

    expect(response.status).toBe(200);
    expect(mocks.applyInboundReplyIntent).not.toHaveBeenCalled();
  });

  it("does not attempt a reply intent for a duplicate with no resolvable client — nothing to retry", async () => {
    mocks.recordInboundMessage.mockResolvedValue({ recorded: false, reason: "duplicate", clientId: null, messageId: "msg_1" });

    const response = await POST(request(MESSAGE_EVENT));

    expect(response.status).toBe(200);
    expect(mocks.applyInboundReplyIntent).not.toHaveBeenCalled();
  });

  it("does not attempt a reply intent for an invalid-phone/empty-body non-recording", async () => {
    mocks.recordInboundMessage.mockResolvedValue({ recorded: false, reason: "invalid_phone" });

    const response = await POST(request(MESSAGE_EVENT));

    expect(response.status).toBe(200);
    expect(mocks.applyInboundReplyIntent).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/whatsapp/baileys — auth and payload", () => {
  it("refuses a request without the bridge secret", async () => {
    const response = await POST(
      new Request("http://app.test/api/webhooks/whatsapp/baileys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(MESSAGE_EVENT),
      })
    );
    expect(response.status).toBe(401);
    expect(mocks.recordInboundMessage).not.toHaveBeenCalled();
  });

  it("refuses a malformed payload", async () => {
    const response = await POST(request({ type: "message" }));
    expect(response.status).toBe(400);
  });
});
