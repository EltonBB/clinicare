import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  paddleConfig: vi.fn(),
  applySubscriptionSnapshot: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/paddle/paddle-config", () => ({ paddleConfig: mocks.paddleConfig }));
vi.mock("@/lib/paddle/subscription-sync", () => ({ applySubscriptionSnapshot: mocks.applySubscriptionSnapshot }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { POST } from "./route";

const SECRET = "pdl_ntfset_test";
const CONFIG = { webhookSecret: SECRET };

const SUBSCRIPTION = {
  id: "sub_1",
  status: "trialing",
  customer_id: "ctm_1",
  custom_data: { businessId: "biz_1" },
  current_billing_period: null,
  scheduled_change: null,
  canceled_at: null,
  items: [{ price: { id: "pri_bm_t" }, trial_dates: null }],
};

function signedRequest(event: unknown, secret = SECRET) {
  const body = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const h1 = createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex");
  return new Request("https://x.test/api/webhooks/paddle", {
    method: "POST",
    headers: { "paddle-signature": `ts=${ts};h1=${h1}`, "content-type": "application/json" },
    body,
  });
}

const EVENT = {
  event_id: "evt_1",
  event_type: "subscription.trialing",
  occurred_at: "2026-10-26T12:00:00.000Z",
  data: SUBSCRIPTION,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.paddleConfig.mockReturnValue(CONFIG);
  mocks.applySubscriptionSnapshot.mockResolvedValue("applied");
});

describe("Paddle webhook route", () => {
  it("is unavailable while billing isn't configured", async () => {
    mocks.paddleConfig.mockReturnValue(null);
    expect((await POST(signedRequest(EVENT))).status).toBe(503);
  });

  it("refuses a request signed with another secret", async () => {
    const response = await POST(signedRequest(EVENT, "wrong"));
    expect(response.status).toBe(401);
    expect(mocks.applySubscriptionSnapshot).not.toHaveBeenCalled();
  });

  it("applies a subscription event as a snapshot and refreshes the workspace", async () => {
    const response = await POST(signedRequest(EVENT));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, outcome: "applied" });
    expect(mocks.applySubscriptionSnapshot).toHaveBeenCalledWith(CONFIG, SUBSCRIPTION, new Date("2026-10-26T12:00:00.000Z"));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("answers 200 to a stale event without refreshing anything", async () => {
    mocks.applySubscriptionSnapshot.mockResolvedValue("stale");
    const response = await POST(signedRequest(EVENT));
    expect(response.status).toBe(200);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("ignores events it doesn't handle", async () => {
    const response = await POST(signedRequest({ ...EVENT, event_type: "transaction.completed" }));
    expect(await response.json()).toEqual({ ok: true, ignored: true });
    expect(mocks.applySubscriptionSnapshot).not.toHaveBeenCalled();
  });

  it("asks Paddle to retry when the write fails", async () => {
    mocks.applySubscriptionSnapshot.mockRejectedValue(new Error("db down"));
    expect((await POST(signedRequest(EVENT))).status).toBe(500);
  });
});
