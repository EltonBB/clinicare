import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordInboundMessage: vi.fn(),
  recordDeliveryStatus: vi.fn(),
  recordConnectionState: vi.fn(),
  applyInboundReplyIntent: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/logger", () => ({ logger: mocks.logger }));
vi.mock("@/lib/messaging/inbound", () => ({
  recordInboundMessage: mocks.recordInboundMessage,
  recordDeliveryStatus: mocks.recordDeliveryStatus,
  recordConnectionState: mocks.recordConnectionState,
  applyInboundReplyIntent: mocks.applyInboundReplyIntent,
}));

import { BAILEYS_BRIDGE_HEADER } from "@/lib/messaging/baileys-contract";
import {
  signWebhookBody,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  WEBHOOK_TOLERANCE_SECONDS,
} from "@/lib/messaging/webhook-signature";
import { POST } from "./route";

const BRIDGE_SECRET = "bridge-secret-not-real";
const WEBHOOK_SECRET = "webhook-secret-not-real";
const URL = "http://localhost/api/webhooks/whatsapp/baileys";

const MESSAGE = {
  type: "message",
  businessId: "biz_1",
  from: "38344123456",
  body: "1",
  providerMessageId: "wamid_1",
};
const BODY = JSON.stringify(MESSAGE);

const nowSeconds = () => Math.floor(Date.now() / 1000);

function signed(body = BODY, opts: { secret?: string; timestamp?: number } = {}) {
  const timestamp = opts.timestamp ?? nowSeconds();
  return new Request(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [WEBHOOK_TIMESTAMP_HEADER]: String(timestamp),
      [WEBHOOK_SIGNATURE_HEADER]: signWebhookBody(opts.secret ?? WEBHOOK_SECRET, timestamp, body),
    },
    body,
  });
}

// The shared-secret fallback path (no BAILEYS_WEBHOOK_SECRET configured) —
// also what the reply-intent retry tests below use, since they're testing
// message-processing behavior that doesn't depend on which auth mode let
// the request through.
function legacy(body = BODY, secret: string | null = BRIDGE_SECRET) {
  return new Request(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret === null ? {} : { [BAILEYS_BRIDGE_HEADER]: secret }),
    },
    body,
  });
}

/**
 * A request whose body arrives as a stream. highWaterMark 0 means the source is
 * only pulled when something actually reads, so `pulled` shows whether (and how
 * much of) the body was consumed.
 */
function streamed(
  source: UnderlyingDefaultSource<Uint8Array>,
  headers: Record<string, string>
) {
  return new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: new ReadableStream<Uint8Array>(source, { highWaterMark: 0 }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

const signedHeaders = (signedText: string, timestamp = nowSeconds()) => ({
  [WEBHOOK_TIMESTAMP_HEADER]: String(timestamp),
  [WEBHOOK_SIGNATURE_HEADER]: signWebhookBody(WEBHOOK_SECRET, timestamp, signedText),
});

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BAILEYS_BRIDGE_SECRET = BRIDGE_SECRET;
  delete process.env.BAILEYS_WEBHOOK_SECRET;
  mocks.recordInboundMessage.mockResolvedValue({ recorded: true, conversationId: "conv_1", clientId: "client_1" });
  mocks.applyInboundReplyIntent.mockResolvedValue(undefined);
  mocks.recordDeliveryStatus.mockResolvedValue(undefined);
  mocks.recordConnectionState.mockResolvedValue(undefined);
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("POST /api/webhooks/whatsapp/baileys — message events: reply-intent retry", () => {
  it("attempts the reply intent on a first-time recording", async () => {
    mocks.recordInboundMessage.mockResolvedValue({ recorded: true, conversationId: "conv_1", clientId: "client_1", messageId: "msg_1" });
    mocks.applyInboundReplyIntent.mockResolvedValue({ applied: true, intent: "confirm", appointmentId: "appt_1" });

    const response = await POST(legacy());

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

    const response = await POST(legacy());

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

    const response = await POST(legacy());

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

    const response = await POST(legacy());

    expect(response.status).toBe(200);
    expect(mocks.applyInboundReplyIntent).not.toHaveBeenCalled();
  });

  it("does not attempt a reply intent for a duplicate with no resolvable client — nothing to retry", async () => {
    mocks.recordInboundMessage.mockResolvedValue({ recorded: false, reason: "duplicate", clientId: null, messageId: "msg_1" });

    const response = await POST(legacy());

    expect(response.status).toBe(200);
    expect(mocks.applyInboundReplyIntent).not.toHaveBeenCalled();
  });

  it("does not attempt a reply intent for an invalid-phone/empty-body non-recording", async () => {
    mocks.recordInboundMessage.mockResolvedValue({ recorded: false, reason: "invalid_phone" });

    const response = await POST(legacy());

    expect(response.status).toBe(200);
    expect(mocks.applyInboundReplyIntent).not.toHaveBeenCalled();
  });
});

describe("inbound WhatsApp webhook — signed requests (BAILEYS_WEBHOOK_SECRET set)", () => {
  beforeEach(() => {
    process.env.BAILEYS_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  it("accepts a correctly signed request and processes it", async () => {
    const response = await POST(signed());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, recorded: true });
    expect(mocks.recordInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "biz_1", fromPhone: "38344123456", providerMessageId: "wamid_1" })
    );
    expect(mocks.applyInboundReplyIntent).toHaveBeenCalledTimes(1);
  });

  it("rejects the shared bridge secret on its own — a leak of it can no longer forge a patient reply", async () => {
    const response = await POST(legacy());

    expect(response.status).toBe(401);
    expect(mocks.recordInboundMessage).not.toHaveBeenCalled();
    expect(mocks.applyInboundReplyIntent).not.toHaveBeenCalled();
  });

  it("rejects a request signed with the bridge secret instead of the webhook secret", async () => {
    const response = await POST(signed(BODY, { secret: BRIDGE_SECRET }));

    expect(response.status).toBe(401);
    expect(mocks.recordInboundMessage).not.toHaveBeenCalled();
  });

  it("rejects a request with no signature headers", async () => {
    const response = await POST(legacy(BODY, null));

    expect(response.status).toBe(401);
    expect(mocks.recordInboundMessage).not.toHaveBeenCalled();
  });

  it("rejects a valid-looking signature over a different body (tampering)", async () => {
    const good = signed();
    const tampered = new Request(URL, {
      method: "POST",
      headers: good.headers,
      body: JSON.stringify({ ...MESSAGE, businessId: "biz_other" }),
    });

    const response = await POST(tampered);

    expect(response.status).toBe(401);
    expect(mocks.recordInboundMessage).not.toHaveBeenCalled();
  });

  it("rejects a replay outside the tolerance window", async () => {
    const stale = nowSeconds() - WEBHOOK_TOLERANCE_SECONDS - 60;

    const response = await POST(signed(BODY, { timestamp: stale }));

    expect(response.status).toBe(401);
    expect(mocks.recordInboundMessage).not.toHaveBeenCalled();
  });

  it("never echoes why it refused, and never logs the secret or the body", async () => {
    const response = await POST(signed(BODY, { secret: "wrong" }));

    expect(await response.json()).toEqual({ error: "Unauthorized." });
    const logged = JSON.stringify(mocks.logger.warn.mock.calls);
    expect(logged).not.toContain(WEBHOOK_SECRET);
    expect(logged).not.toContain(BRIDGE_SECRET);
    expect(logged).not.toContain("wamid_1");
    expect(logged).not.toContain("38344123456");
  });

  it("refuses an oversized body before hashing it", async () => {
    const big = JSON.stringify({ ...MESSAGE, body: "x".repeat(70_000) });

    const response = await POST(signed(big));

    expect(response.status).toBe(413);
    expect(mocks.recordInboundMessage).not.toHaveBeenCalled();
  });

  it("stops reading a streamed body at the cap even with no Content-Length, instead of buffering it", async () => {
    let pulled = 0;
    const chunk = new TextEncoder().encode("x".repeat(16 * 1024));
    // An endless body from a caller with plausible-looking (but unverifiable) signature headers.
    const request = streamed(
      {
        pull(controller) {
          pulled += 1;
          controller.enqueue(chunk);
        },
      },
      signedHeaders("irrelevant")
    );

    const response = await POST(request);

    expect(response.status).toBe(413);
    // 64 KiB is four 16 KiB chunks; the fifth read trips the cap and cancels the stream.
    expect(pulled).toBeLessThanOrEqual(6);
    expect(mocks.recordInboundMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["a stale timestamp", () => signedHeaders("x", nowSeconds() - WEBHOOK_TOLERANCE_SECONDS - 60)],
    ["a non-numeric timestamp", () => ({ [WEBHOOK_TIMESTAMP_HEADER]: "soon", [WEBHOOK_SIGNATURE_HEADER]: `v1=${"a".repeat(64)}` })],
    ["a malformed signature", () => ({ [WEBHOOK_TIMESTAMP_HEADER]: String(nowSeconds()), [WEBHOOK_SIGNATURE_HEADER]: "v1=short" })],
  ])("refuses %s without reading any of the body", async (_label, headers) => {
    let pulled = 0;
    const request = streamed(
      {
        pull(controller) {
          pulled += 1;
          controller.enqueue(new TextEncoder().encode(BODY));
          controller.close();
        },
      },
      headers()
    );

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(pulled).toBe(0);
  });

  it("reads a valid body that arrives in several chunks, even with a character split across them, and verifies it", async () => {
    const text = JSON.stringify({ ...MESSAGE, body: "Hi 👋 šđ ok" });
    const bytes = new TextEncoder().encode(text);
    const emoji = bytes.indexOf(0xf0); // first byte of the 4-byte emoji
    const parts = [bytes.slice(0, emoji + 1), bytes.slice(emoji + 1, emoji + 3), bytes.slice(emoji + 3)];
    const request = streamed(
      {
        start(controller) {
          parts.forEach((part) => controller.enqueue(part));
          controller.close();
        },
      },
      signedHeaders(text)
    );

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.recordInboundMessage).toHaveBeenCalledWith(expect.objectContaining({ body: "Hi 👋 šđ ok" }));
  });

  it("still returns 400 for a validly signed but malformed payload (so the worker doesn't retry-loop)", async () => {
    const response = await POST(signed(JSON.stringify({ type: "message", businessId: "" })));

    expect(response.status).toBe(400);
    expect(mocks.recordInboundMessage).not.toHaveBeenCalled();
  });

  it("still returns 400 for a validly signed non-JSON body", async () => {
    const response = await POST(signed("not json"));

    expect(response.status).toBe(400);
  });

  it("processes signed status and connection events", async () => {
    const status = await POST(
      signed(JSON.stringify({ type: "status", businessId: "biz_1", providerMessageId: "wamid_1", status: "DELIVERED" }))
    );
    const connection = await POST(
      signed(JSON.stringify({ type: "connection", businessId: "biz_1", status: "connected" }))
    );

    expect(status.status).toBe(200);
    expect(connection.status).toBe(200);
    expect(mocks.recordDeliveryStatus).toHaveBeenCalledTimes(1);
    expect(mocks.recordConnectionState).toHaveBeenCalledWith({ businessId: "biz_1", status: "connected" });
  });

  it("does not treat a blank webhook secret as configured", async () => {
    process.env.BAILEYS_WEBHOOK_SECRET = "   ";

    // Falls back to the shared bridge secret rather than accepting anything.
    expect((await POST(legacy())).status).toBe(200);
    expect((await POST(legacy(BODY, "wrong"))).status).toBe(401);
  });
});

describe("inbound WhatsApp webhook — shared-secret fallback (no BAILEYS_WEBHOOK_SECRET)", () => {
  it("accepts the shared bridge secret so an existing deployment keeps working during rollout", async () => {
    const response = await POST(legacy());

    expect(response.status).toBe(200);
    expect(mocks.recordInboundMessage).toHaveBeenCalledTimes(1);
  });

  it("warns once per process that the signed mode isn't configured", async () => {
    // The warning's "already told them" flag lives in the route module, so earlier
    // tests in this file have usually spent it already — a fresh module instance
    // is what lets this test require exactly one (and fail on none or on repeats).
    vi.resetModules();
    const { POST: freshPOST } = await import("./route");

    await freshPOST(legacy());
    await freshPOST(legacy());

    const warnings = mocks.logger.warn.mock.calls.filter(([message]) =>
      String(message).includes("BAILEYS_WEBHOOK_SECRET")
    );
    expect(warnings).toHaveLength(1);
  });

  it("rejects a wrong shared secret", async () => {
    expect((await POST(legacy(BODY, "wrong"))).status).toBe(401);
    expect(mocks.recordInboundMessage).not.toHaveBeenCalled();
  });

  it("rejects a missing shared secret header", async () => {
    expect((await POST(legacy(BODY, null))).status).toBe(401);
  });

  it("rejects everything when no secret is configured at all", async () => {
    delete process.env.BAILEYS_BRIDGE_SECRET;

    expect((await POST(legacy())).status).toBe(401);
    expect((await POST(signed())).status).toBe(401);
  });

  it("ignores signature headers when signed mode isn't configured (no partial trust)", async () => {
    // A request that only carries a signature, made with a guessed secret, must not pass.
    expect((await POST(signed())).status).toBe(401);
  });

  it("refuses a malformed payload", async () => {
    const response = await POST(legacy(JSON.stringify({ type: "message" })));
    expect(response.status).toBe(400);
  });
});
