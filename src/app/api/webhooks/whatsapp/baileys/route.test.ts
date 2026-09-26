import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordInboundMessage: vi.fn(),
  recordDeliveryStatus: vi.fn(),
  recordConnectionState: vi.fn(),
  applyInboundReplyIntent: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn() },
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
    await POST(legacy());
    await POST(legacy());

    const warnings = mocks.logger.warn.mock.calls.filter(([message]) =>
      String(message).includes("BAILEYS_WEBHOOK_SECRET")
    );
    expect(warnings.length).toBeLessThanOrEqual(1);
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
});
