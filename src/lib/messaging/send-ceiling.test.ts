import { beforeEach, describe, expect, it, vi } from "vitest";

const clinicSendRefusal = vi.hoisted(() => vi.fn());
vi.mock("./send-limits", () => ({ clinicSendRefusal }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { ChannelRegistry, EchoAdapter, sendMessage } from "./index";

const WAIT = "You've sent a lot of messages in a short time. Wait a minute, then send again.";

function whatsapp() {
  const echo = new EchoAdapter("WHATSAPP");
  const send = vi.spyOn(echo, "send");
  const registry = new ChannelRegistry();
  registry.register(echo);
  return { registry, send };
}

const INPUT = {
  channel: "WHATSAPP" as const,
  businessId: "biz_1",
  to: "+38344123456",
  message: { kind: "freeform" as const, body: "Hello" },
};

beforeEach(() => {
  vi.clearAllMocks();
  clinicSendRefusal.mockResolvedValue(null);
});

// Codex #136: every WhatsApp send from a clinic's number shares one ceiling.
describe("sendMessage clinic ceiling", () => {
  it("checks the clinic's ceiling and sends while it's within it", async () => {
    const { registry, send } = whatsapp();

    await expect(sendMessage(INPUT, registry)).resolves.toMatchObject({ ok: true });
    expect(clinicSendRefusal).toHaveBeenCalledWith("biz_1");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("holds the send back, sending nothing, once the clinic is at its ceiling", async () => {
    const { registry, send } = whatsapp();
    clinicSendRefusal.mockResolvedValue(WAIT);

    await expect(sendMessage(INPUT, registry)).resolves.toEqual({ ok: false, reason: "rate_limited", error: WAIT });
    expect(send).not.toHaveBeenCalled();
  });

  it("spends no budget on a send that fails validation first", async () => {
    const { registry } = whatsapp();

    await sendMessage({ ...INPUT, message: { kind: "freeform", body: "   " } }, registry);
    expect(clinicSendRefusal).not.toHaveBeenCalled();
  });
});
