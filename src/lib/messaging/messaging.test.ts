import { describe, expect, it } from "vitest";

import {
  ChannelRegistry,
  EchoAdapter,
  renderReminder,
  sendMessage,
  type AdapterSendResult,
  type ChannelAdapter,
} from "./index";

function registryWith(...adapters: ChannelAdapter[]): ChannelRegistry {
  const registry = new ChannelRegistry();
  for (const adapter of adapters) {
    registry.register(adapter);
  }
  return registry;
}

describe("renderReminder (minimum-necessary)", () => {
  it("fills only name, date, time, and staff", () => {
    const body = renderReminder({
      kind: "appointment_reminder",
      recipientName: "Mira",
      appointmentDate: "Mon, Jun 24",
      appointmentTime: "3:00 PM",
      staffName: "Dr. Leka",
      template: "Hi {client_name}, see {staff_name} at {time} on {date}.",
    });
    expect(body).toBe("Hi Mira, see Dr. Leka at 3:00 PM on Mon, Jun 24.");
  });

  it("renders any clinical token empty — a diagnosis can never ride out", () => {
    const body = renderReminder({
      kind: "appointment_reminder",
      recipientName: "Mira",
      appointmentDate: "Mon, Jun 24",
      appointmentTime: "3:00 PM",
      template: "Hi {client_name}, {service} {diagnosis} at {time}.",
    });
    expect(body).toBe("Hi Mira,   at 3:00 PM.");
    expect(body).not.toContain("service");
    expect(body).not.toContain("diagnosis");
  });

  it("falls back to the default min-necessary template", () => {
    const body = renderReminder({
      kind: "appointment_reminder",
      recipientName: "Mira",
      appointmentDate: "Jun 24",
      appointmentTime: "3 PM",
    });
    expect(body).toContain("Mira");
    expect(body).toContain("3 PM");
    expect(body).toContain("Jun 24");
  });
});

describe("sendMessage dispatch", () => {
  it("routes to the registered adapter and returns a neutral result", async () => {
    const echo = new EchoAdapter("WHATSAPP");
    const result = await sendMessage(
      {
        channel: "WHATSAPP",
        businessId: "biz_1",
        to: "+1 (415) 555-0100",
        message: { kind: "freeform", body: "  Hello there  " },
      },
      registryWith(echo)
    );

    expect(result).toEqual({
      ok: true,
      providerMessageId: "echo_1",
      status: "SENT",
      body: "Hello there",
    });
    // Recipient canonicalized (E.164 + kept) and body trimmed before the adapter.
    expect(echo.sent[0]?.to).toBe("+14155550100");
    expect(echo.sent[0]?.body).toBe("Hello there");
  });

  it("renders an appointment reminder to a min-necessary body", async () => {
    const echo = new EchoAdapter("WHATSAPP");
    await sendMessage(
      {
        channel: "WHATSAPP",
        businessId: "biz_1",
        to: "+14155550100",
        message: {
          kind: "appointment_reminder",
          recipientName: "Mira",
          appointmentDate: "Jun 24",
          appointmentTime: "3 PM",
        },
      },
      registryWith(echo)
    );
    expect(echo.sent[0]?.body).toContain("Mira");
    expect(echo.sent[0]?.template).toBeUndefined();
  });

  it("passes templates through without a rendered body", async () => {
    const echo = new EchoAdapter("WHATSAPP");
    await sendMessage(
      {
        channel: "WHATSAPP",
        businessId: "biz_1",
        to: "+14155550100",
        message: {
          kind: "template",
          templateId: "HX123",
          variables: { "1": "Mira" },
        },
      },
      registryWith(echo)
    );
    expect(echo.sent[0]?.body).toBe("");
    expect(echo.sent[0]?.template).toEqual({
      id: "HX123",
      variables: { "1": "Mira" },
    });
  });

  it("fails closed when the channel has no adapter", async () => {
    const result = await sendMessage(
      {
        channel: "SMS",
        businessId: "biz_1",
        to: "+14155550100",
        message: { kind: "freeform", body: "hi" },
      },
      registryWith(new EchoAdapter("WHATSAPP"))
    );
    expect(result).toEqual({
      ok: false,
      reason: "channel_unconfigured",
      error: expect.any(String),
    });
  });

  it("classifies an empty-rendered reminder template as empty_message", async () => {
    const echo = new EchoAdapter("WHATSAPP");
    const result = await sendMessage(
      {
        channel: "WHATSAPP",
        businessId: "biz_1",
        to: "+14155550100",
        message: {
          kind: "appointment_reminder",
          recipientName: "Mira",
          appointmentDate: "Jun 24",
          appointmentTime: "3 PM",
          // Only unfilled (clinical) tokens — renders to empty.
          template: "{service}{diagnosis}",
        },
      },
      registryWith(echo)
    );
    expect(result.ok).toBe(false);
    // Caught at the seam, not surfaced as a generic provider_error.
    if (!result.ok) expect(result.reason).toBe("empty_message");
    expect(echo.sent).toHaveLength(0);
  });

  it("rejects an empty freeform message", async () => {
    const echo = new EchoAdapter("WHATSAPP");
    const result = await sendMessage(
      {
        channel: "WHATSAPP",
        businessId: "biz_1",
        to: "+14155550100",
        message: { kind: "freeform", body: "   " },
      },
      registryWith(echo)
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty_message");
    expect(echo.sent).toHaveLength(0);
  });

  it("rejects an over-limit body before sending (stored == sent invariant)", async () => {
    const echo = new EchoAdapter("WHATSAPP");
    const result = await sendMessage(
      {
        channel: "WHATSAPP",
        businessId: "biz_1",
        to: "+14155550100",
        message: { kind: "freeform", body: "x".repeat(8001) },
      },
      registryWith(echo)
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("message_too_long");
    // Never handed to the adapter — so nothing truncated is recorded as full.
    expect(echo.sent).toHaveLength(0);
  });

  it("rejects an unusable phone recipient", async () => {
    const result = await sendMessage(
      {
        channel: "WHATSAPP",
        businessId: "biz_1",
        to: "abc",
        message: { kind: "freeform", body: "hi" },
      },
      registryWith(new EchoAdapter("WHATSAPP"))
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_recipient");
  });

  it("rejects an over-long phone (>15 digits) as invalid, not provider_error", async () => {
    const echo = new EchoAdapter("WHATSAPP");
    const result = await sendMessage(
      {
        channel: "WHATSAPP",
        businessId: "biz_1",
        to: "+1234567890123456", // 16 digits — past the worker's ^\d{6,15}$
        message: { kind: "freeform", body: "hi" },
      },
      registryWith(echo)
    );
    expect(result.ok).toBe(false);
    // invalid_recipient (not provider_error) so a bad number can't ERROR the link.
    if (!result.ok) expect(result.reason).toBe("invalid_recipient");
    expect(echo.sent).toHaveLength(0);
  });

  it("canonicalizes and validates email recipients", async () => {
    const echo = new EchoAdapter("EMAIL");
    const ok = await sendMessage(
      {
        channel: "EMAIL",
        businessId: "biz_1",
        to: "  Mira@Clinic.CO  ",
        message: { kind: "freeform", body: "hi" },
      },
      registryWith(echo)
    );
    expect(ok.ok).toBe(true);
    expect(echo.sent[0]?.to).toBe("mira@clinic.co");

    const bad = await sendMessage(
      {
        channel: "EMAIL",
        businessId: "biz_1",
        to: "not-an-email",
        message: { kind: "freeform", body: "hi" },
      },
      registryWith(echo)
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe("invalid_recipient");
  });

  it("translates an adapter failure into a generic result without throwing", async () => {
    const throwing: ChannelAdapter = {
      channel: "WHATSAPP",
      async send(): Promise<AdapterSendResult> {
        throw new Error("provider exploded with +14155550100 in the message");
      },
    };
    const result = await sendMessage(
      {
        channel: "WHATSAPP",
        businessId: "biz_1",
        to: "+14155550100",
        message: { kind: "freeform", body: "hi" },
      },
      registryWith(throwing)
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("provider_error");
      // Customer-safe copy: no provider name, no leaked recipient digits.
      expect(result.error).not.toContain("provider exploded");
      expect(result.error).not.toContain("14155550100");
    }
  });
});
